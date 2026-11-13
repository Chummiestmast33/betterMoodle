import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeGrade } from './grades';
import { formatAggregatedAlert } from '../notify/telegram';
import { MoodleClient, MoodleError } from '../moodle/client';
import { runSync } from './engine';

function createTestD1(): D1Database {
  const sqlite = new Database(':memory:');
  const migrationsDir = join(import.meta.dir, '../../migrations');
  sqlite.exec(readFileSync(join(migrationsDir, '0001_initial_schema.sql'), 'utf8'));
  sqlite.exec(readFileSync(join(migrationsDir, '0002_phase2_sync_metadata.sql'), 'utf8'));

  const makeStmt = (sql: string, bound: unknown[] = []): D1PreparedStatement => {
    const stmt: any = {
      bind: (...params: unknown[]) => makeStmt(sql, params),
      first: async <T>() => {
        const row = sqlite.query(sql).get(...(bound as any[])) as T | null;
        return row ?? null;
      },
      all: async <T>() => {
        const results = sqlite.query(sql).all(...(bound as any[])) as T[];
        return { results, success: true, meta: {} };
      },
      run: async () => {
        const res = sqlite.query(sql).run(...(bound as any[]));
        return {
          success: true,
          meta: { last_row_id: Number(res.lastInsertRowid), changes: res.changes },
        };
      },
    };
    return stmt;
  };

  return {
    prepare: (sql: string) => makeStmt(sql),
    batch: async (stmts: D1PreparedStatement[]) => {
      const out: any[] = [];
      for (const s of stmts) {
        out.push(await s.run());
      }
      return out;
    },
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0),
    withSession: () => {
      throw new Error('Not implemented');
    },
  } as unknown as D1Database;
}

describe('Fase 2 — Normalización y formato', () => {
  test('normalizeGrade normaliza valores numéricos sin falsos positivos de formato', () => {
    expect(normalizeGrade(85.00000)).toBe(85);
    expect(normalizeGrade(85)).toBe(85);
    expect(normalizeGrade(92.345678)).toBe(92.3457);
    expect(normalizeGrade(null)).toBeNull();
    expect(normalizeGrade(undefined)).toBeNull();
    expect(normalizeGrade(Number.NaN)).toBeNull();
  });

  test('formatAggregatedAlert agrupa tareas, calificaciones y avisos con escape HTML', () => {
    const msg = formatAggregatedAlert([
      {
        kind: 'new',
        itemType: 'assignment',
        courseName: 'Programación <Web>',
        title: 'Práctica 1 & 2',
        dueDate: 1794513600,
        url: 'https://catedig.itlalaguna.edu.mx/mod/assign/view.php?id=101',
      },
      {
        kind: 'new',
        itemType: 'grade',
        courseName: 'Redes',
        title: 'Examen Unidad 1',
        gradeNum: 95,
        url: null,
      },
      {
        kind: 'new',
        itemType: 'announcement',
        courseName: 'Cálculo',
        title: 'Suspensión de clase',
        url: 'https://catedig.itlalaguna.edu.mx/mod/forum/discuss.php?d=55',
      },
    ]);

    expect(msg).toContain('3 novedades');
    expect(msg).toContain('Programación &lt;Web&gt;');
    expect(msg).toContain('Práctica 1 &amp; 2');
    expect(msg).toContain('Calificación: <b>95</b>');
    expect(msg).toContain('Nuevo aviso');
  });

  test('MoodleClient detiene llamadas al alcanzar presupuesto máximo de subpeticiones', async () => {
    const client = new MoodleClient('https://example.edu', 'fake-token', 0);
    expect(client.hasBudget).toBe(false);
    expect(client.remainingBudget).toBe(0);

    await expect(client.getSiteInfo()).rejects.toBeInstanceOf(MoodleError);
  });
});

describe('Fase 2 — Circuit Breaker y Dead Man Switch (RF-10)', () => {
  test('Abre circuit breaker tras 3 fallos y envía alerta dead man switch tras >30 min sin sync exitoso', async () => {
    const db = createTestD1();
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare('UPDATE sync_state SET baseline_seeded = 1, last_success_at = ?, consecutive_failures = 2 WHERE id = 1')
      .bind(now - 2000) // > 30 minutos
      .run();

    const telegramCalls: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('api.telegram.org')) {
        telegramCalls.push(String(init?.body ?? ''));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ exception: 'moodle_exception', errorcode: 'servicedown', message: 'Moodle down' }),
        { status: 200 }
      );
    }) as typeof fetch;

    try {
      // Fallo #3: abre circuit breaker Y dispara dead man's switch (>30 min sin éxito)
      const res3 = await runSync({
        DB: db,
        MOODLE_TOKEN: 'test-token',
        MOODLE_URL: 'https://catedig.itlalaguna.edu.mx',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: '12345',
      });

      expect(res3.status).toBe('error');
      expect(telegramCalls.length).toBe(1);
      expect(telegramCalls[0]).toContain('Alerta de salud del sync');

      const stateAfter3 = await db
        .prepare('SELECT consecutive_failures, circuit_open_until, dead_man_alerted FROM sync_state WHERE id = 1')
        .first<{ consecutive_failures: number; circuit_open_until: number; dead_man_alerted: number }>();

      expect(stateAfter3?.consecutive_failures).toBe(3);
      expect(stateAfter3?.circuit_open_until).toBeGreaterThan(now);
      expect(stateAfter3?.dead_man_alerted).toBe(1);

      // Siguiente intento sin force debe ser bloqueado por circuit breaker sin repetir alerta Telegram
      const res4 = await runSync({
        DB: db,
        MOODLE_TOKEN: 'test-token',
        MOODLE_URL: 'https://catedig.itlalaguna.edu.mx',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: '12345',
      });
      expect(res4.status).toBe('circuit_open');
      expect(telegramCalls.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
