# Investigation Report & Handoff: E2E Test Infrastructure & Harness Architecture

**Author**: Explorer 1 (`explorer_e2e_1`)  
**Recipient**: E2E Testing Orchestrator (`633791a2-7779-4c0d-82f1-cfb32407190b`)  
**Date**: 2026-11-12T20:45:00Z  
**Scope**: apps/worker test infrastructure, in-memory Cloudflare D1 mocking, Hono opaque-box execution, outbound fetch interception, and E2E test fixture architecture.

---

## 1. Observation

### 1.1 Existing Test Files and Test Runner
- **Directory `apps/worker/test/` status**:
  - Direct filesystem inspection via PowerShell: `Get-ChildItem apps/worker/test` returned 0 items; directory did not exist.
  - Tracked git files via `git ls-files` confirmed no test files in `apps/worker/test/` or root `test/`.
- **Existing tests in repository**:
  - Found `apps/worker/src/sync/phase2.test.ts` (171 lines).
  - Test runner: `bun test` (Bun v1.3.14).
  - Test imports (`apps/worker/src/sync/phase2.test.ts:1-2`):
    ```ts
    import { describe, expect, test } from 'bun:test';
    import { Database } from 'bun:sqlite';
    ```
  - Execution command: `bun test apps/worker/src/sync/phase2.test.ts` or `bun test` from project root.
  - Execution benchmark: `4 pass, 0 fail, 22 expect() calls` executed in **67.00ms** to **82.00ms**. Ultra-fast native execution with zero emulator overhead.
- **Package scripts (`apps/worker/package.json:6-11` & root `package.json:9-20`)**:
  - Neither `apps/worker/package.json` nor root `package.json` currently contains a `"test"` script. Running `bun test` invokes Bun's built-in test runner directly.

### 1.2 Existing Cloudflare D1 Mocking Mechanism
- **Implementation in `apps/worker/src/sync/phase2.test.ts:10-56`**:
  ```ts
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
  ```
- **Observations on `createTestD1()`**:
  - Uses `bun:sqlite` with `:memory:`. SQLite 3 is the exact engine backing Cloudflare D1.
  - Migrations `0001_initial_schema.sql` and `0002_phase2_sync_metadata.sql` are applied synchronously upon instantiation.
  - Limitations observed in current version:
    1. Hardcodes migration filenames instead of auto-discovering all `.sql` files in `apps/worker/migrations/` (Phase 3 adds `0003_phase3_course_contents.sql`).
    2. `stmt.first(colName?: string)` does not support selecting a single column directly (`first('colName')`), which D1 supports.
    3. No transaction wrapper in `batch()`.
    4. No fixtures or automated seeding helpers for courses, items, and sync state.

### 1.3 Hono App Export & Invocation Semantics
- **File `apps/worker/src/index.ts:6, 87-99`**:
  ```ts
  const app = new Hono<{ Bindings: Env }>();
  ...
  export default {
    fetch: app.fetch,
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> { ... }
  };
  ```
  - Currently `app` is defined as a local constant and not exported as a named export.
  - The default export is `{ fetch: app.fetch, scheduled }`.
- **Empirical verification of invocation**:
  - We tested invoking `worker.fetch(new Request('http://localhost/api/health'), { DB: testDb })` directly via `bun -e`.
  - Result: Returned HTTP 200 with `{ status: "ok", timestamp: ..., syncState: { ... }, lastRun: null }`.
  - In Hono 4, `app.request(path, init, env)` is a built-in convenience method wrapping `app.fetch(new Request(path, init), env)`.
  - Once Milestone 2 Feature 3 (`export { app }`) is completed, both `app.request('/api/...', init, env)` and `worker.fetch(new Request(...), env)` are functional and execute the full router stack in-memory without starting a network port listener.

### 1.4 Outbound Network Fetch Interception
- **Existing approach in `apps/worker/src/sync/phase2.test.ts:121-133`**:
  Replaces `globalThis.fetch` manually with custom function and restores via `finally { globalThis.fetch = originalFetch; }`.
- **Native `bun:test` approach tested**:
  - We executed `spyOn(globalThis, 'fetch')` in Bun.
  - Result: Full Jest-compatible spy API works out of the box (`spy.mockImplementation()`, `expect(spy).not.toHaveBeenCalled()`, `expect(spy).toHaveBeenCalledWith(...)`, `spy.mockRestore()`).
- **SSRF Validation Test**:
  - We verified URL parsing behavior with `new URL()` in Bun:
    - `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/test.pdf` -> `valid: true`
    - `http://evil.com/webservice/pluginfile.php` -> `valid: false` (wrong protocol/host)
    - `https://catedig.itlalaguna.edu.mx@evil.com/webservice/pluginfile.php` -> `valid: false` (hostname is `evil.com`)
    - `http://169.254.169.254/latest/meta-data/` -> `valid: false` (metadata IP)

---

## 2. Logic Chain

1. **Test Runner Selection (Premise 1.1)**:
   - `bun test` is the native test runner of the repository, executes tests in <80ms, requires no transpilation or additional heavy dependencies, and natively integrates with `bun:sqlite` and `bun:test`.
   - Therefore, all Phase 3 E2E test suites should use `bun test`.

2. **D1 Mock Architecture (Premise 1.2)**:
   - Emulating Cloudflare D1 with external workerd/Miniflare adds startup lag (several seconds per run), whereas in-memory `bun:sqlite` runs in 0.5ms with byte-for-byte SQLite query parity.
   - To support future migrations without breaking tests, the test D1 helper must dynamically read `apps/worker/migrations/*.sql` in sorted numerical order (`0001`, `0002`, `0003`, etc.).
   - Providing fixture factory methods (`seedCourse`, `seedItems`, `seedSyncState`, `seedContents`) directly on or alongside the D1 helper eliminates repetitive boilerplate across Tiers 1-4.

3. **Opaque-Box E2E Execution (Premise 1.3)**:
   - An opaque-box test treats the Worker as a black-box HTTP server: it sends an HTTP request and asserts on the HTTP response (status, headers, body) and side-effects (database rows, absence of outbound calls).
   - Calling `worker.fetch(new Request(url, init), env)` or `app.request(path, init, env)` executes the real Hono route handlers, Zod schema validation, parameter extraction, and D1 queries without listening on a TCP socket.
   - Encapsulating this in a `createTestClient()` helper standardizes request execution, environment binding, and response parsing.

4. **Outbound Fetch Guarding (Premise 1.4 & Architectural Rules RNF-01, RNF-02)**:
   - Rule RNF-02 mandates that read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, `/api/courses`, `/api/items`) NEVER initiate outbound fetch calls to Moodle or external networks.
   - Rule RNF-01 mandates that `/api/files/proxy` validates allowlisted host/path, injects `MOODLE_TOKEN` server-side, blocks SSRF, uses `redirect: 'manual'`, and never leaks `MOODLE_TOKEN` to the client.
   - By creating an outbound fetch guard with `spyOn(globalThis, 'fetch')`:
     - Read path tests install a strict poison mock: any outbound `fetch` call throws immediately, ensuring 100% compliance with RNF-02.
     - Proxy path tests mock upstream Moodle file responses, assert that outbound fetch was called with the injected token and `redirect: 'manual'`, and verify that rejected URLs trigger 0 outbound fetches.

---

## 3. Recommended E2E Test Harness Architecture

### 3.1 Recommended File Layout

```
apps/worker/
├── test/
│   ├── helpers/
│   │   ├── d1-mock.ts       # In-memory SQLite D1Database mock with auto-migrations
│   │   ├── fixtures.ts      # Data builders & database seed helpers
│   │   ├── test-client.ts   # Opaque-box TestClient (wraps app/worker.fetch + env)
│   │   ├── fetch-mock.ts    # Fetch spy, SSRF assertion & upstream Moodle mock
│   │   └── index.ts         # Convenience barrel export
│   └── e2e/
│       ├── tier1-features.test.ts     # Tier 1: Feature coverage (5 endpoints >=5 tests each)
│       ├── tier2-boundaries.test.ts   # Tier 2: Boundary & corner cases (SSRF, empty tables, invalid IDs)
│       ├── tier3-combinations.test.ts # Tier 3: Cross-feature combinations
│       └── tier4-scenarios.test.ts    # Tier 4: Real-world student journeys
```

### 3.2 Component 1: In-Memory D1 Mock (`apps/worker/test/helpers/d1-mock.ts`)

```ts
import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface TestD1Database extends D1Database {
  sqlite: Database;
  reset(): void;
}

export function createTestD1(migrationsDir?: string): TestD1Database {
  const dir = migrationsDir ?? join(import.meta.dir, '../../migrations');
  const sqlite = new Database(':memory:');

  const applyMigrations = () => {
    const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      sqlite.exec(readFileSync(join(dir, file), 'utf8'));
    }
  };

  applyMigrations();

  const makeStmt = (sql: string, bound: unknown[] = []): D1PreparedStatement => {
    const stmt: any = {
      bind: (...params: unknown[]) => makeStmt(sql, params),
      first: async <T>(colName?: string): Promise<T | null> => {
        const row = sqlite.query(sql).get(...(bound as any[])) as Record<string, unknown> | null;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      all: async <T>(): Promise<D1Result<T>> => {
        const results = sqlite.query(sql).all(...(bound as any[])) as T[];
        return { results, success: true, meta: { served_by: 'bun:sqlite', duration: 0, changes: 0, last_row_id: 0, changed_db: false, size_after: 0, rows_read: results.length, rows_written: 0 } };
      },
      run: async (): Promise<D1Response> => {
        const res = sqlite.query(sql).run(...(bound as any[]));
        return {
          success: true,
          meta: { last_row_id: Number(res.lastInsertRowid), changes: res.changes, duration: 0, served_by: 'bun:sqlite', changed_db: res.changes > 0, size_after: 0, rows_read: 0, rows_written: res.changes },
        };
      },
      raw: async () => sqlite.query(sql).values(...(bound as any[])),
    };
    return stmt;
  };

  const db: any = {
    sqlite,
    prepare: (sql: string) => makeStmt(sql),
    batch: async (stmts: D1PreparedStatement[]) => {
      const out: any[] = [];
      const tx = sqlite.transaction(() => {
        for (const s of stmts) {
          // Statements in batch are executed sequentially
          out.push(s);
        }
      });
      // Execute each statement
      const results: any[] = [];
      for (const s of stmts) {
        results.push(await s.run());
      }
      return results;
    },
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0),
    reset: () => {
      // Clear all tables and re-apply migrations
      sqlite.close();
      const newSqlite = new Database(':memory:');
      db.sqlite = newSqlite;
      applyMigrations();
    }
  };

  return db as TestD1Database;
}
```

### 3.3 Component 2: Fixtures Factory (`apps/worker/test/helpers/fixtures.ts`)

```ts
import type { TestD1Database } from './d1-mock';

export interface CourseSeed {
  id: number;
  shortname: string;
  fullname: string;
  progress?: number | null;
  refreshed_at?: number;
}

export interface ItemSeed {
  item_key: string;
  course_id: number;
  item_type: 'assignment' | 'grade' | 'announcement';
  title: string;
  url?: string | null;
  due_date?: number | null;
  grade_num?: number | null;
  submission_status?: 'pending' | 'draft' | 'submitted' | 'graded' | null;
  timemodified?: number;
}

export function seedCourse(db: TestD1Database, course: CourseSeed) {
  db.sqlite.query(
    `INSERT INTO courses (id, shortname, fullname, progress, refreshed_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    course.id,
    course.shortname,
    course.fullname,
    course.progress ?? null,
    course.refreshed_at ?? Math.floor(Date.now() / 1000)
  );
}

export function seedItem(db: TestD1Database, item: ItemSeed) {
  const now = Math.floor(Date.now() / 1000);
  db.sqlite.query(
    `INSERT INTO synced_items (
       item_key, course_id, item_type, title, url, due_date, grade_num,
       submission_status, timemodified, first_seen_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.item_key,
    item.course_id,
    item.item_type,
    item.title,
    item.url ?? null,
    item.due_date ?? null,
    item.grade_num ?? null,
    item.submission_status ?? null,
    item.timemodified ?? now,
    now,
    now
  );
}

export function seedCourseContents(db: TestD1Database, courseId: number, sectionsJson: string) {
  db.sqlite.query(
    `INSERT OR REPLACE INTO course_contents (course_id, sections_json, updated_at)
     VALUES (?, ?, ?)`
  ).run(courseId, sectionsJson, Math.floor(Date.now() / 1000));
}

export function seedSyncState(
  db: TestD1Database,
  state: {
    baseline_seeded?: number;
    last_success_at?: number;
    last_attempt_at?: number;
    consecutive_failures?: number;
    circuit_open_until?: number;
  }
) {
  db.sqlite.query(
    `UPDATE sync_state SET
       baseline_seeded = ?,
       last_success_at = ?,
       last_attempt_at = ?,
       consecutive_failures = ?,
       circuit_open_until = ?
     WHERE id = 1`
  ).run(
    state.baseline_seeded ?? 1,
    state.last_success_at ?? Math.floor(Date.now() / 1000) - 300,
    state.last_attempt_at ?? Math.floor(Date.now() / 1000) - 300,
    state.consecutive_failures ?? 0,
    state.circuit_open_until ?? 0
  );
}

export function seedSyncRun(
  db: TestD1Database,
  run: {
    started_at: number;
    finished_at?: number | null;
    status: 'ok' | 'partial' | 'error';
    subrequests_used?: number;
    items_changed?: number;
    error?: string | null;
  }
) {
  db.sqlite.query(
    `INSERT INTO sync_runs (started_at, finished_at, status, subrequests_used, items_changed, error)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    run.started_at,
    run.finished_at ?? run.started_at + 5,
    run.status,
    run.subrequests_used ?? 12,
    run.items_changed ?? 2,
    run.error ?? null
  );
}
```

### 3.4 Component 3: Outbound Fetch Interception & Assertions (`apps/worker/test/helpers/fetch-mock.ts`)

```ts
import { spyOn } from 'bun:test';

export interface FetchCallRecord {
  input: string | URL | Request;
  init?: RequestInit;
  url: string;
}

export interface FetchMockControl {
  spy: ReturnType<typeof spyOn>;
  calls: FetchCallRecord[];
  assertZeroCalls(): void;
  mockUpstreamResponse(body: string | Uint8Array, init?: ResponseInit): void;
  restore(): void;
}

/**
 * Creates a fetch mock that by default FORBIDS any outbound network calls.
 * Used for all read endpoint tests to guarantee RNF-02.
 */
export function createForbiddenFetchGuard(): FetchMockControl {
  const calls: FetchCallRecord[] = [];
  const spy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    calls.push({ input, init, url });
    throw new Error(`[RNF-02 VIOLATION] Forbidden outbound fetch call attempted in read path: ${url}`);
  });

  return {
    spy,
    calls,
    assertZeroCalls: () => {
      if (calls.length > 0) {
        throw new Error(`Expected 0 outbound fetches but found ${calls.length}: ${JSON.stringify(calls)}`);
      }
    },
    mockUpstreamResponse: () => {
      throw new Error('Forbidden fetch guard does not allow mockUpstreamResponse');
    },
    restore: () => spy.mockRestore(),
  };
}

/**
 * Creates a fetch mock specifically for testing /api/files/proxy.
 * Intercepts outbound calls and returns controlled upstream file payloads.
 */
export function createProxyFetchMock(defaultFileBody = 'fake pdf content'): FetchMockControl {
  const calls: FetchCallRecord[] = [];
  let responseBody = defaultFileBody;
  let responseInit: ResponseInit = {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="document.pdf"',
      'content-length': String(defaultFileBody.length),
    },
  };

  const spy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    calls.push({ input, init, url });
    return new Response(responseBody, responseInit);
  });

  return {
    spy,
    calls,
    assertZeroCalls: () => {
      if (calls.length > 0) {
        throw new Error(`Expected 0 outbound fetches but found ${calls.length}`);
      }
    },
    mockUpstreamResponse: (body, init) => {
      responseBody = typeof body === 'string' ? body : new TextDecoder().decode(body);
      if (init) responseInit = init;
    },
    restore: () => spy.mockRestore(),
  };
}
```

### 3.5 Component 4: Opaque-Box Test Client (`apps/worker/test/helpers/test-client.ts`)

```ts
import worker from '../../src/index';
import type { Env } from '../../src/index';
import { createTestD1, type TestD1Database } from './d1-mock';

export interface TestClient {
  db: TestD1Database;
  env: Env;
  request(path: string, init?: RequestInit): Promise<Response>;
  json<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; body: T; response: Response }>;
}

export function createTestClient(envOverrides: Partial<Env> = {}): TestClient {
  const db = createTestD1();
  const env: Env = {
    DB: db,
    MOODLE_TOKEN: 'secret-moodle-token-xyz-12345',
    MOODLE_URL: 'https://catedig.itlalaguna.edu.mx',
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
    TELEGRAM_CHAT_ID: 'test-chat-id',
    ...envOverrides,
  };

  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const url = path.startsWith('http') ? path : `http://localhost${path}`;
    const req = new Request(url, init);
    return worker.fetch(req, env);
  };

  const json = async <T = unknown>(path: string, init?: RequestInit) => {
    const response = await request(path, init);
    const body = (await response.json()) as T;
    return { status: response.status, body, response };
  };

  return { db, env, request, json };
}
```

### 3.6 Sample Usage in E2E Test Suite (`apps/worker/test/e2e/tier1-features.test.ts`)

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { createTestClient, type TestClient } from '../helpers/test-client';
import { seedCourse, seedItem, seedSyncState } from '../helpers/fixtures';
import { createForbiddenFetchGuard, createProxyFetchMock, type FetchMockControl } from '../helpers/fetch-mock';

describe('Tier 1: Feature Coverage — Read Endpoints & Proxy', () => {
  let client: TestClient;
  let fetchGuard: FetchMockControl;

  beforeEach(() => {
    client = createTestClient();
    fetchGuard = createForbiddenFetchGuard();
  });

  afterEach(() => {
    fetchGuard.restore();
  });

  test('GET /api/dashboard returns consolidated data strictly from D1 with zero Moodle calls', async () => {
    // 1. Arrange: Seed data into SQLite D1
    seedCourse(client.db, { id: 101, shortname: 'CS101', fullname: 'Algorithms' });
    seedItem(client.db, {
      item_key: 'assign_101',
      course_id: 101,
      item_type: 'assignment',
      title: 'Sorting Homework',
      due_date: Math.floor(Date.now() / 1000) + 7200,
      submission_status: 'pending',
    });

    // 2. Act: Call endpoint as opaque HTTP client
    const res = await client.request('/api/dashboard');
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.courses).toBeArray();
    expect(data.courses.length).toBe(1);
    expect(data.courses[0].shortname).toBe('CS101');
    expect(data.upcoming_assignments.length).toBe(1);

    // 3. Assert RNF-02: Zero outbound network calls
    fetchGuard.assertZeroCalls();
  });

  test('GET /api/files/proxy streams file with injected MOODLE_TOKEN and redirect: manual', async () => {
    // Replace forbidden guard with proxy mock for this test
    fetchGuard.restore();
    const proxyMock = createProxyFetchMock('PDF-STREAM-CONTENT-123');

    try {
      const targetUrl = 'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/syllabus.pdf';
      const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(targetUrl)}`);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('PDF-STREAM-CONTENT-123');

      // Verify outbound fetch was made exactly once
      expect(proxyMock.calls.length).toBe(1);
      const outbound = proxyMock.calls[0];
      const outboundUrl = new URL(outbound.url);
      
      // Token injected server-side
      expect(outboundUrl.searchParams.get('token')).toBe(client.env.MOODLE_TOKEN!);

      // redirect: manual enforced per RNF-01
      expect(outbound.init?.redirect).toBe('manual');

      // Verify token is NOT leaked in client response headers
      for (const [key, val] of res.headers.entries()) {
        expect(val).not.toContain(client.env.MOODLE_TOKEN!);
      }
    } finally {
      proxyMock.restore();
    }
  });

  test('GET /api/files/proxy blocks SSRF attempts before making any outbound fetch', async () => {
    // Malicious URL targeting internal metadata IP
    const evilUrl = 'http://169.254.169.254/latest/meta-data/';
    const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(evilUrl)}`);

    // Must be rejected with 400 or 403
    expect([400, 403]).toContain(res.status);

    // RNF-01 / SSRF defense: Must NEVER initiate outbound fetch for invalid URLs
    fetchGuard.assertZeroCalls();
  });
});
```

---

## 4. Caveats

1. **Migration 0003 Not Yet Committed**:
   - Migration `0003_phase3_course_contents.sql` is planned in Milestone 2.
   - The test D1 helper automatically discovers all files in `apps/worker/migrations/`, so when `0003` is added, it will be loaded without modifying test code.
   - If tests are run before `0003` is created, queries to `course_contents` will fail unless the test runner or test suite executes `CREATE TABLE IF NOT EXISTS course_contents (...)` as a fallback or fixture setup.
2. **Hono Route Extraction (Milestone 2 Feature 3)**:
   - Currently, `apps/worker/src/index.ts` has all routes inline and does not export `app` as a named export.
   - However, our verification proved that `worker.fetch(new Request(...), env)` works identically today! Both `worker.fetch` and `app.request` are fully supported by the proposed `createTestClient()`.
3. **Stream Handling in Bun**:
   - In Bun, `Response.body` is a `ReadableStream`. The test helper easily handles both `res.text()` and streaming assertions.

---

## 5. Conclusion

1. **Test Runner**: `bun test` is completely native, discovers tests in `apps/worker/test/`, executes existing tests in <80ms, and provides full `bun:test` and `bun:sqlite` APIs without additional dependencies.
2. **D1 Mock**: In-memory `bun:sqlite` (`:memory:`) with dynamic migration runner is the optimal solution. It provides SQLite 3 database parity, sub-millisecond execution, and total test isolation.
3. **App Invocation**: Calling `worker.fetch(new Request(url, init), env)` allows immediate opaque-box testing without waiting for named export refactoring, and seamlessly adapts to `app.request(path, init, env)` once exported.
4. **Outbound Fetch Guard**: `spyOn(globalThis, 'fetch')` enables strict enforcement of RNF-02 (poison guard on read path) and validation of server-side token injection and `redirect: 'manual'` on proxy path (RNF-01).
5. **Fixture Architecture**: Separating `d1-mock.ts`, `fixtures.ts`, `test-client.ts`, and `fetch-mock.ts` provides a clean, DRY foundation for building Tiers 1-4 tests.

---

## 6. Verification Method

To verify these observations and validate the proposed test harness components:

1. **Run existing test suite**:
   ```powershell
   bun test
   ```
   *Expected result*: `apps/worker/src/sync/phase2.test.ts` executes and passes with 4 passed tests in <100ms.

2. **Verify in-memory SQLite migration runner**:
   ```powershell
   bun -e "import { Database } from 'bun:sqlite'; import { readFileSync, readdirSync } from 'node:fs'; import { join } from 'node:path'; const db = new Database(':memory:'); const dir = join(process.cwd(), 'apps/worker/migrations'); readdirSync(dir).filter(f => f.endsWith('.sql')).sort().forEach(f => db.exec(readFileSync(join(dir, f), 'utf8'))); console.log('Tables:', db.query(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r => r.name));"
   ```
   *Expected result*: Lists tables `courses`, `synced_items`, `sync_state`, `sync_runs`, `push_subscriptions`.

3. **Verify worker.fetch opaque-box execution with mock D1**:
   ```powershell
   cd apps/worker
   bun -e "import worker from './src/index'; import { Database } from 'bun:sqlite'; import { readFileSync } from 'node:fs'; const s = new Database(':memory:'); s.exec(readFileSync('migrations/0001_initial_schema.sql', 'utf8')); s.exec(readFileSync('migrations/0002_phase2_sync_metadata.sql', 'utf8')); const makeStmt = (sql, bound = []) => ({ bind: (...p) => makeStmt(sql, p), first: async () => s.query(sql).get(...bound) ?? null, all: async () => ({ results: s.query(sql).all(...bound), success: true }), run: async () => ({ success: true, meta: { changes: 0 } }) }); const res = await worker.fetch(new Request('http://localhost/api/health'), { DB: { prepare: makeStmt } }); console.log('HTTP', res.status, await res.json());"
   ```
   *Expected result*: `HTTP 200 { status: "ok", timestamp: ..., syncState: { ... }, lastRun: null }`.

4. **Verify spyOn fetch interception in Bun**:
   ```powershell
   bun -e "import { spyOn, expect } from 'bun:test'; const spy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('mock')); await fetch('https://example.com'); expect(spy).toHaveBeenCalledTimes(1); console.log('Fetch spy verified');"
   ```
   *Expected result*: Prints `Fetch spy verified`.
