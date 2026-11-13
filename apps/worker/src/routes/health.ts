import { Hono } from 'hono';
import { EnhancedHealthResponseSchema } from '@better-moodle/shared';
import type { Env } from '../types';

export const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get('/', async (c) => {
  try {
    const now = Math.floor(Date.now() / 1000);

    const [syncStateRes, runsRes] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM sync_state WHERE id = 1').first<any>(),
      c.env.DB.prepare(`
        SELECT id, started_at, finished_at, status, subrequests_used, items_changed, error
        FROM sync_runs
        ORDER BY id DESC
        LIMIT 15
      `).all<any>(),
    ]);

    const syncState = syncStateRes ?? null;
    const recentRuns = runsRes.results ?? [];

    // Calculate failure rate
    const failureRate =
      recentRuns.length === 0
        ? 0.0
        : Number((recentRuns.filter((r: any) => r.status === 'error').length / recentRuns.length).toFixed(4));

    // Calculate subrequest telemetry safely
    const subreqs = recentRuns
      .map((r: any) => r.subrequests_used)
      .filter((s: any): s is number => typeof s === 'number' && !Number.isNaN(s));

    const lastUsed = typeof recentRuns[0]?.subrequests_used === 'number' ? recentRuns[0].subrequests_used : 0;
    const maxBudget = 45;
    const maxRecent = subreqs.length > 0 ? Math.max(...subreqs) : 0;
    const avgRecent = subreqs.length > 0 ? Number((subreqs.reduce((a: number, b: number) => a + b, 0) / subreqs.length).toFixed(2)) : 0;

    // Determine status: circuit_open | degraded | error | ok
    let status: 'ok' | 'degraded' | 'error' | 'circuit_open' = 'ok';
    if (syncState && syncState.circuit_open_until && syncState.circuit_open_until > now) {
      status = 'circuit_open';
    } else if (!syncState || syncState.baseline_seeded === 0) {
      status = 'degraded';
    } else if (syncState.consecutive_failures > 0) {
      status = 'degraded';
    } else if (recentRuns.length > 0 && recentRuns[0]?.status === 'error') {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    const payload = {
      status,
      timestamp: Date.now(),
      sync_state: syncState,
      syncState: syncState, // Retrocompatibility alias for apps/web and existing callers
      recent_runs: recentRuns,
      lastRun: recentRuns[0] ?? null, // Retrocompatibility alias
      failure_rate: failureRate,
      subrequests: {
        last_used: lastUsed,
        max_budget: maxBudget,
        avg_recent: avgRecent,
        max_recent: maxRecent,
      },
    };

    const validated = EnhancedHealthResponseSchema.parse(payload);
    return c.json(validated, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en consulta de base de datos';
    return c.json({ error: message, status: 'error' }, 500);
  }
});
