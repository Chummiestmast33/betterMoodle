import { Hono } from 'hono';
import { FileProxyQuerySchema } from '@better-moodle/shared';
import type { Env } from '../types';

export const proxyRouter = new Hono<{ Bindings: Env }>();

const SAFE_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'content-length',
  'etag',
  'last-modified',
  'cache-control',
  'accept-ranges',
  'content-range',
] as const;

// RF-04: Proxy seguro de archivos de Moodle (mitiga SSRF e inyecta MOODLE_TOKEN solo en servidor)
proxyRouter.get('/proxy', async (c) => {
  const queryParam = c.req.query('url');
  const validation = FileProxyQuerySchema.safeParse({ url: queryParam });

  if (!validation.success) {
    return c.json(
      {
        error: validation.error.errors[0]?.message ?? 'URL inválida o faltante',
        code: 'INVALID_URL',
      },
      400
    );
  }

  const moodleToken = c.env.MOODLE_TOKEN;
  if (!moodleToken) {
    return c.json(
      {
        error: 'Token de servicio no configurado en el servidor',
        code: 'MISSING_TOKEN',
      },
      500
    );
  }

  // Construir URL saliente eliminando cualquier token forjado por el cliente
  const upstreamUrl = new URL(validation.data.url);
  if (
    upstreamUrl.protocol !== 'https:' ||
    upstreamUrl.hostname.toLowerCase() !== 'catedig.itlalaguna.edu.mx' ||
    (upstreamUrl.pathname !== '/webservice/pluginfile.php' &&
      !upstreamUrl.pathname.startsWith('/webservice/pluginfile.php/'))
  ) {
    return c.json({ error: 'URL no permitida', code: 'FORBIDDEN_URL' }, 403);
  }

  upstreamUrl.searchParams.delete('token');
  upstreamUrl.searchParams.delete('wstoken');
  upstreamUrl.searchParams.set('token', moodleToken);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return c.json(
      {
        error: 'Error de conexión al recuperar el archivo desde Moodle',
        code: 'UPSTREAM_UNREACHABLE',
      },
      502
    );
  }

  // Rechazar redirecciones (3xx) y errores (4xx/5xx) del servidor origen sin filtrar detalles
  if (upstreamRes.status < 200 || upstreamRes.status >= 300) {
    await upstreamRes.body?.cancel().catch(() => {});
    return c.json(
      {
        error: 'No se pudo obtener el recurso solicitado desde Moodle',
        code: 'UPSTREAM_ERROR',
      },
      502
    );
  }

  const headers = new Headers();
  for (const name of SAFE_RESPONSE_HEADERS) {
    const val = upstreamRes.headers.get(name);
    if (val && !val.includes(moodleToken)) {
      headers.set(name, val);
    }
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/octet-stream');
  }
  headers.set('x-content-type-options', 'nosniff');

  return new Response(upstreamRes.body, {
    status: 200,
    headers,
  });
});
