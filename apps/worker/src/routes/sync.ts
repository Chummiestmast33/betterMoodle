import { Hono } from 'hono';
import { runSync } from '../sync/engine';
import type { Env } from '../types';

export const syncRouter = new Hono<{ Bindings: Env }>();

// Sincronización manual con rate limit de 30 s
syncRouter.post('/manual', async (c) => {
  try {
    const state = await c.env.DB.prepare(
      'SELECT last_attempt_at FROM sync_state WHERE id = 1'
    ).first<{ last_attempt_at: number }>();

    const now = Math.floor(Date.now() / 1000);
    if (state && now - state.last_attempt_at < 30) {
      return c.json(
        { error: 'Espera al menos 30 segundos entre sincronizaciones manuales.' },
        429
      );
    }

    const force = c.req.query('force') === '1';
    const result = await runSync(c.env, { force });
    return c.json(result, result.status === 'error' ? 500 : 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en sync manual';
    return c.json({ error: message, status: 'error' }, 500);
  }
});
