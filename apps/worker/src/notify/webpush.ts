import { buildPushHTTPRequest } from '@pushforge/builder';
import type { SyncChange } from './telegram';

export interface WebPushEnv {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function buildAggregatedPushPayload(changes: SyncChange[]): WebPushPayload {
  const assignments = changes.filter((c) => c.itemType === 'assignment').length;
  const grades = changes.filter((c) => c.itemType === 'grade').length;
  const announcements = changes.filter((c) => c.itemType === 'announcement').length;

  const parts: string[] = [];
  if (assignments > 0) parts.push(`${assignments} ${assignments === 1 ? 'tarea' : 'tareas'}`);
  if (grades > 0) parts.push(`${grades} ${grades === 1 ? 'calificación' : 'calificaciones'}`);
  if (announcements > 0) parts.push(`${announcements} ${announcements === 1 ? 'aviso' : 'avisos'}`);

  const summary = parts.length > 0 ? parts.join(', ') : `${changes.length} novedades`;
  const first = changes[0];
  const body =
    changes.length === 1 && first
      ? `${first.courseName}: ${first.title}`
      : `${summary} en Moodle`;

  return {
    title: `BetterMoodle: ${summary}`,
    body,
    url: assignments > 0 ? '/?view=tasks' : '/',
    tag: 'bettermoodle-sync',
  };
}

async function dispatchToSubscription(
  db: D1Database,
  privateJwk: string,
  adminContact: string,
  sub: PushSubscriptionRow,
  payload: WebPushPayload
): Promise<'sent' | 'purged' | 'failed'> {
  try {
    const req = await buildPushHTTPRequest({
      privateJWK: privateJwk,
      subscription: {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      message: {
        payload: JSON.stringify(payload),
        adminContact,
        options: {
          ttl: 3600,
          urgency: 'normal',
        },
      },
    });

    const res = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(8000),
    });

    // Purga automática de suscripciones expiradas o revocadas (RF-08)
    if (res.status === 410 || res.status === 404) {
      await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
      return 'purged';
    }

    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function sendWebPushNotifications(
  env: WebPushEnv,
  changes: SyncChange[]
): Promise<{ sent: number; purged: number; failed: number }> {
  if (changes.length === 0 || !env.VAPID_PRIVATE_JWK) {
    return { sent: 0, purged: 0, failed: 0 };
  }

  const { results } = await env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions'
  ).all<PushSubscriptionRow>();

  if (!results || results.length === 0) {
    return { sent: 0, purged: 0, failed: 0 };
  }

  const adminContact = env.VAPID_SUBJECT || 'mailto:soporte@catedig.itlalaguna.edu.mx';
  const payload = buildAggregatedPushPayload(changes);

  const outcomes = await Promise.all(
    results.map((sub) =>
      dispatchToSubscription(env.DB, env.VAPID_PRIVATE_JWK!, adminContact, sub, payload)
    )
  );

  return {
    sent: outcomes.filter((o) => o === 'sent').length,
    purged: outcomes.filter((o) => o === 'purged').length,
    failed: outcomes.filter((o) => o === 'failed').length,
  };
}

export async function sendTestWebPush(
  env: WebPushEnv,
  endpoint?: string
): Promise<{ sent: number; purged: number; failed: number }> {
  if (!env.VAPID_PRIVATE_JWK) {
    throw new Error('VAPID_PRIVATE_JWK no configurada');
  }

  const query = endpoint
    ? env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ?').bind(endpoint)
    : env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');

  const { results } = await query.all<PushSubscriptionRow>();
  if (!results || results.length === 0) {
    return { sent: 0, purged: 0, failed: 0 };
  }

  const adminContact = env.VAPID_SUBJECT || 'mailto:soporte@catedig.itlalaguna.edu.mx';
  const payload: WebPushPayload = {
    title: 'BetterMoodle: Prueba de notificación',
    body: 'Las alertas Web Push están activas y funcionando en este dispositivo.',
    url: '/?view=settings',
    tag: 'bettermoodle-test',
  };

  const outcomes = await Promise.all(
    results.map((sub) =>
      dispatchToSubscription(env.DB, env.VAPID_PRIVATE_JWK!, adminContact, sub, payload)
    )
  );

  return {
    sent: outcomes.filter((o) => o === 'sent').length,
    purged: outcomes.filter((o) => o === 'purged').length,
    failed: outcomes.filter((o) => o === 'failed').length,
  };
}
