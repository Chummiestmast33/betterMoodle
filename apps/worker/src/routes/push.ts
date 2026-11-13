import { Hono } from 'hono';
import {
  PushSubscribeBodySchema,
  PushUnsubscribeBodySchema,
  PushStatusResponseSchema,
} from '@better-moodle/shared';
import { sendTestWebPush } from '../notify/webpush';
import type { Env } from '../types';

export const pushRouter = new Hono<{ Bindings: Env }>();

pushRouter.get('/status', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM push_subscriptions'
    ).first<{ cnt: number }>();

    const configured = Boolean(c.env.VAPID_PUBLIC_KEY && c.env.VAPID_PRIVATE_JWK);
    const payload = {
      configured,
      public_key: c.env.VAPID_PUBLIC_KEY ?? null,
      subscription_count: row?.cnt ?? 0,
    };

    return c.json(PushStatusResponseSchema.parse(payload), 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error consultando suscripciones';
    return c.json({ error: message, code: 'PUSH_STATUS_ERROR' }, 500);
  }
});

pushRouter.post('/subscribe', async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido', code: 'INVALID_JSON' }, 400);
  }

  const parsed = PushSubscribeBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        error: parsed.error.errors[0]?.message ?? 'Suscripción inválida',
        code: 'INVALID_SUBSCRIPTION',
      },
      400
    );
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const { endpoint, keys, userAgent } = parsed.data;
    const ua = userAgent ?? c.req.header('user-agent') ?? null;

    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent`
    )
      .bind(id, endpoint, keys.p256dh, keys.auth, ua, now)
      .run();

    return c.json({ ok: true, endpoint }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error guardando suscripción';
    return c.json({ error: message, code: 'PUSH_SUBSCRIBE_ERROR' }, 500);
  }
});

pushRouter.delete('/unsubscribe', async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido', code: 'INVALID_JSON' }, 400);
  }

  const parsed = PushUnsubscribeBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        error: parsed.error.errors[0]?.message ?? 'Endpoint inválido',
        code: 'INVALID_ENDPOINT',
      },
      400
    );
  }

  try {
    await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
      .bind(parsed.data.endpoint)
      .run();

    return c.json({ ok: true }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error eliminando suscripción';
    return c.json({ error: message, code: 'PUSH_UNSUBSCRIBE_ERROR' }, 500);
  }
});

pushRouter.post('/test', async (c) => {
  try {
    let endpoint: string | undefined;
    try {
      const body = (await c.req.json()) as { endpoint?: string };
      endpoint = body?.endpoint;
    } catch {
      // Cuerpo opcional
    }

    const result = await sendTestWebPush(c.env, endpoint);
    return c.json(result, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error enviando notificación de prueba';
    return c.json({ error: message, code: 'PUSH_TEST_ERROR' }, 500);
  }
});
