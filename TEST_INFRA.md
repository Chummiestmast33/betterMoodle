# Test Infrastructure Specification: Phase 3 BFF Read API & Secure Proxy

## 1. Test Architecture & Philosophy

The Phase 3 end-to-end test infrastructure is engineered around four core tenets:

1. **Opaque-Box Testing**:
   - The Cloudflare Worker / Hono application is tested strictly from the outside as an HTTP service via `worker.fetch(new Request(url, init), env)`.
   - Tests assert on HTTP status codes, headers (sanitization, MIME types, security policies), and parsed response payloads validated against shared Zod schemas (`packages/shared`).
   - Implementation internal variables and private state are never accessed directly.

2. **Strict Zero-Moodle-Touch Invariant (RNF-02 & AGENTS.md §2.1)**:
   - All read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`) query Cloudflare D1 exclusively.
   - For all read endpoint tests, the test harness installs an active `createForbiddenFetchGuard()` that traps global `fetch`.
   - Any outbound network call attempted during a read request immediately throws an exception (`[RNF-02 VIOLATION]`), failing the test deterministically.

3. **Strict SSRF & Token Confidentiality (RF-04, RNF-01)**:
   - The file proxy (`/api/files/proxy`) is the only interactive endpoint permitted to execute outbound fetches.
   - Tests enforce strict allowlist validation requiring HTTPS protocol, exact host `catedig.itlalaguna.edu.mx`, default port 443, and path prefix `/webservice/pluginfile.php`.
   - Tests assert server-side token injection (`token=...`), `redirect: 'manual'`, and verify zero token leakage across response headers, status lines, and body streams.

4. **In-Memory SQLite D1 Simulation with Dynamic Migration Discovery**:
   - `bun:sqlite` with `:memory:` provides 100% SQLite 3 query syntax parity with Cloudflare D1 with sub-millisecond execution.
   - The harness dynamically discovers and applies all `.sql` migration files in `apps/worker/migrations/` in sorted numerical order (`0001`, `0002`, `0003`).
   - A fallback ensures `course_contents` table creation even prior to committing migration `0003`.

---

## 2. Directory & File Organization

```
apps/worker/
├── migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_phase2_sync_metadata.sql
│   └── 0003_phase3_course_contents.sql (planned)
└── test/
    ├── helpers/
    │   ├── d1-mock.ts       # In-memory SQLite D1 simulator matching Cloudflare D1Database API
    │   ├── fixtures.ts      # Seed factories for courses, synced_items, sync_state, sync_runs, course_contents
    │   ├── fetch-mock.ts    # Outbound fetch spy, poison guard, and upstream Moodle proxy mock
    │   ├── test-client.ts   # Opaque-box TestClient wrapper around worker.fetch + mock env
    │   └── index.ts         # Convenience barrel export
    ├── e2e/
    │   ├── tier1-features.test.ts     # Tier 1: 30 Feature coverage tests (6 per endpoint)
    │   ├── tier2-boundaries.test.ts   # Tier 2: 30 Boundary & SSRF corner tests (6 per endpoint)
    │   ├── tier3-combinations.test.ts # Tier 3: 6 Cross-feature interaction tests
    │   └── tier4-scenarios.test.ts    # Tier 4: 6 Real-world student journey scenarios
    └── e2e.test.ts                    # Master runner executing all 72 tests across Tiers 1–4
```

---

## 3. Test Runner & Execution Commands

- **Test Runner**: Native `bun test` (Bun v1.3+).
- **Execution Commands**:
  - Run the entire master suite (all 72 tests):
    ```powershell
    bun test apps/worker/test/e2e.test.ts
    ```
  - Run all E2E tier suites directly:
    ```powershell
    bun test apps/worker/test/e2e/
    ```
  - Run individual tiers:
    ```powershell
    bun test apps/worker/test/e2e/tier1-features.test.ts
    bun test apps/worker/test/e2e/tier2-boundaries.test.ts
    bun test apps/worker/test/e2e/tier3-combinations.test.ts
    bun test apps/worker/test/e2e/tier4-scenarios.test.ts
    ```
  - Run all worker tests (including Phase 2 unit tests):
    ```powershell
    cd apps/worker
    bun test
    ```

---

## 4. Test Harness Components & Fixtures

### 4.1 In-Memory D1 Mock (`d1-mock.ts`)
- Implements `D1Database` interface with `prepare(sql)`, `batch(stmts)`, `exec(sql)`, `dump()`, and `reset()`.
- Statement binding via `bind(...params)` returns a statement with:
  - `first<T>(colName?)`: Returns matching row or specific column value.
  - `all<T>()`: Returns `{ results: T[], success: true, meta: { ... } }`.
  - `run()`: Returns `{ success: true, meta: { changes, last_row_id } }`.
  - `raw()`: Returns 2D value matrix.

### 4.2 Fixture Helpers (`fixtures.ts`)
- `seedCourse(db, course)`: Seeds courses into `courses` table with ID, shortname, fullname, progress, refreshed_at.
- `seedItem(db, item)`: Seeds items into `synced_items` table with item_key, course_id, item_type, title, due_date, grade_num, submission_status, deleted_at.
- `seedCourseContents(db, courseId, sectionsJson, updatedAt?)`: Seeds cached course sections into `course_contents`.
- `seedSyncState(db, state)`: Configures baseline_seeded, last_success_at, consecutive_failures, circuit_open_until.
- `seedSyncRun(db, run)`: Inserts execution logs into `sync_runs` with status, subrequests_used, items_changed, error.
- `clearAllData(db)`: Truncates user tables for clean test isolation.

### 4.3 Network Guards (`fetch-mock.ts`)
- `createForbiddenFetchGuard()`: Throws on any outbound `fetch()` call, tracking calls and asserting zero network requests.
- `createProxyFetchMock(defaultBody?, defaultInit?)`: Mock upstream Moodle file response, asserts injected `MOODLE_TOKEN` and `redirect: 'manual'`.

### 4.4 Opaque-Box Client (`test-client.ts`)
- `createTestClient(envOverrides?)`: Returns `TestClient` with in-memory D1, test environment secrets (`MOODLE_TOKEN`, `TELEGRAM_BOT_TOKEN`), and request helpers (`request`, `json`, `text`).

---

## 5. Comprehensive 72-Test Catalog Inventory

| Tier | File | Test Count | Scope / Endpoints Covered |
|---|---|---|---|
| **Tier 1: Feature Coverage** | `tier1-features.test.ts` | 30 tests | 6 tests each for Dashboard, Contents, Grades, Health, Proxy |
| **Tier 2: Boundary & Corner Cases** | `tier2-boundaries.test.ts` | 30 tests | 6 tests each for adverse inputs, SQL injection, empty tables, and exhaustive SSRF attack vectors |
| **Tier 3: Cross-Feature Combinations** | `tier3-combinations.test.ts` | 6 tests | Cross-endpoint data consistency, lifecycle transitions, tombstone propagation, quota tracking |
| **Tier 4: Real-World Scenarios** | `tier4-scenarios.test.ts` | 6 tests | Morning routine, grade audit, high-volume download, upstream outage survivability, attacker SSRF defense, sync self-healing |
| **Total Master Catalog** | `e2e.test.ts` | **72 tests** | **100% Phase 3 Capabilities** |

---

## 6. Pass Criteria & Exit Semantics

- **Status Code Accuracy**: Exact HTTP status codes (200, 400, 403, 404, 500, 502).
- **Zero-Moodle-Touch Compliance**: Zero outbound `fetch` calls for all read requests.
- **SSRF Defense**: 100% rejection rate of malicious protocols, domains, IP literals, ports, and path traversals with 0 outbound calls.
- **Confidentiality**: Zero instances of `MOODLE_TOKEN` in client responses, headers, or error logs.
- **Schema Conformance**: 100% validation pass against shared Zod schemas.
