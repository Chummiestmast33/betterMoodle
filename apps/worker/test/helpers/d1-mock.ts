import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface TestD1Database extends D1Database {
  sqlite: Database;
  reset(): void;
}

/**
 * Creates an in-memory SQLite database simulating Cloudflare D1 with full migration support.
 */
export function createTestD1(migrationsDir?: string): TestD1Database {
  const dir = migrationsDir ?? join(import.meta.dir, '../../migrations');
  let sqlite = new Database(':memory:');

  const applyMigrations = () => {
    if (existsSync(dir)) {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const file of files) {
        sqlite.exec(readFileSync(join(dir, file), 'utf8'));
      }
    }

    // Fallback: Ensure course_contents exists if 0003 migration has not yet been committed
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS course_contents (
        course_id INTEGER PRIMARY KEY,
        sections_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  };

  applyMigrations();

  const makeStmt = (sql: string, bound: unknown[] = []): D1PreparedStatement => {
    const stmt: any = {
      bind: (...params: unknown[]) => makeStmt(sql, params),
      first: async <T>(colName?: string): Promise<T | null> => {
        try {
          const row = sqlite.query(sql).get(...(bound as any[])) as Record<string, unknown> | null;
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as T;
        } catch (err) {
          throw err;
        }
      },
      all: async <T>(): Promise<D1Result<T>> => {
        try {
          const results = sqlite.query(sql).all(...(bound as any[])) as T[];
          return {
            results,
            success: true,
            meta: {
              served_by: 'bun:sqlite',
              duration: 0,
              changes: 0,
              last_row_id: 0,
              changed_db: false,
              size_after: 0,
              rows_read: results.length,
              rows_written: 0,
            },
          };
        } catch (err) {
          throw err;
        }
      },
      run: async (): Promise<D1Response> => {
        try {
          const res = sqlite.query(sql).run(...(bound as any[]));
          return {
            success: true,
            meta: {
              last_row_id: Number(res.lastInsertRowid),
              changes: res.changes,
              duration: 0,
              served_by: 'bun:sqlite',
              changed_db: res.changes > 0,
              size_after: 0,
              rows_read: 0,
              rows_written: res.changes,
            },
          };
        } catch (err) {
          throw err;
        }
      },
      raw: async () => {
        return sqlite.query(sql).values(...(bound as any[]));
      },
    };
    return stmt;
  };

  const db: any = {
    get sqlite() {
      return sqlite;
    },
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
    reset: () => {
      sqlite.close();
      sqlite = new Database(':memory:');
      applyMigrations();
    },
  };

  return db as TestD1Database;
}
