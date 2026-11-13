import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { runSync } from './sync/engine';
import { dashboardRouter } from './routes/dashboard';
import { coursesRouter } from './routes/courses';
import { healthRouter } from './routes/health';
import { itemsRouter } from './routes/items';
import { syncRouter } from './routes/sync';
import { proxyRouter } from './routes/proxy';
import { pushRouter } from './routes/push';
import type { Env } from './types';

export type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Middleware global de seguridad y CORS
app.use(secureHeaders());
app.use('/api/*', cors());

// Montaje de sub-routers modulares
app.route('/api/dashboard', dashboardRouter);
app.route('/api/courses', coursesRouter);
app.route('/api/health', healthRouter);
app.route('/api/items', itemsRouter);
app.route('/api/sync', syncRouter);
app.route('/api/files', proxyRouter);
app.route('/api/push', pushRouter);

// Manejo centralizado de errores globales
app.onError((err, c) => {
  console.error('[Worker Error]', err);
  return c.json(
    {
      error: err.message || 'Error interno del servidor',
      status: 'error',
      code: 'INTERNAL_ERROR',
    },
    500
  );
});

// Manejo centralizado de 404 con fallback a SPA Static Assets
app.notFound(async (c) => {
  if (c.env.ASSETS && !c.req.path.startsWith('/api/')) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json(
    {
      error: 'Ruta no encontrada',
      code: 'NOT_FOUND',
    },
    404
  );
});

// Manejador del Cron Trigger (RF-07)
async function scheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  console.log(`[CRON] Sync disparado a las: ${new Date(controller.scheduledTime).toISOString()}`);
  ctx.waitUntil(
    runSync(env, { isScheduled: true }).then((res) => {
      console.log('[CRON] Resultado:', JSON.stringify(res));
    })
  );
}

// Exportación nombrada para tests e in-process harnesses
export { app };

// Export default para runtime de Cloudflare Workers
export default {
  fetch: app.fetch,
  scheduled,
};
