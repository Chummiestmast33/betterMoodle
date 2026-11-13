# Handoff Report: Routing & Entry Point Architecture (Milestone M2)

## 1. Observation

### 1.1 Existing Entry Point (`apps/worker/src/index.ts`)
Inspection of `apps/worker/src/index.ts` (lines 1–99) revealed:
- A monolithic entry point defining an instance `const app = new Hono<{ Bindings: Env }>()`.
- Inline handlers for 4 endpoints:
  - `GET /api/health` (lines 9–26): returns basic `{ status: 'ok', timestamp, syncState, lastRun }`, missing enhanced metrics (`failure_rate`, `subrequests`, `recent_runs`).
  - `GET /api/courses` (lines 29–38): queries `courses` table and returns `{ courses: results }`.
  - `GET /api/items` (lines 41–60): queries `synced_items` with optional `?type=` filter and `deleted_at IS NULL`.
  - `POST /api/sync/manual` (lines 63–84): checks 30-second rate limit using `sync_state.last_attempt_at` and triggers `runSync`.
- Default export on lines 87–99:
  ```ts
  export default {
    fetch: app.fetch,
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
      ...
    }
  };
  ```
- Missing named export `export { app }`.
- Missing endpoints required by Milestone M2:
  - `GET /api/dashboard`
  - `GET /api/courses/:id/contents`
  - `GET /api/courses/:id/grades`
  - Placeholder mount for `GET /api/files/proxy` (Milestone M3)
- Global error handling (`app.onError`) and not-found handling (`app.notFound`) are entirely absent.

### 1.2 Type Definitions and Worker Environment
- There is currently no `apps/worker/src/types.ts`.
- In `apps/worker/src/index.ts` (line 4):
  `export interface Env extends SyncEnv {}`
- In `apps/worker/src/sync/engine.ts` (lines 11–17):
  ```ts
  export interface SyncEnv {
    DB: D1Database;
    MOODLE_TOKEN?: string;
    MOODLE_URL?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
  }
  ```
- In `apps/worker/wrangler.jsonc` (lines 9–13):
  ```json
  "assets": {
    "directory": "../web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
  ```
  The runtime injects an `ASSETS` Fetcher binding for static assets.

### 1.3 Test Harness Dependency on Entry Point
Inspection of `apps/worker/test/helpers/test-client.ts` showed:
- Line 1: `import worker, { type Env } from '../../src/index';`
- Line 32: `return worker.fetch(req, env);`
Therefore:
1. `apps/worker/src/index.ts` must maintain `export default { fetch: app.fetch, scheduled }`.
2. `apps/worker/src/index.ts` must continue exporting `type Env` (either defined directly or re-exported from `./types`).
3. Providing named export `export { app };` satisfies both the existing `worker.fetch` caller and any direct Hono app testing via `app.request`.

### 1.4 Test Suite State and Verbatim Failures
Execution of `bun test` in `apps/worker` resulted in:
`Ran 314 tests across 10 files: 244 pass, 70 fail.`
Key verbatim failure messages:
- `T1-DASH-01: Standard Dashboard Retrieval returns consolidated data with 0 outbound fetch calls`: `Expected: 200, Received: 404` at `client.request('/api/dashboard')`.
- `T1-CONT-01: Full Course Section & Resource Tree returns complete cached contents`: `Expected: 200, Received: 404` at `client.request('/api/courses/101/contents')`.
- `T1-GRAD-01: Standard Course Grades Retrieval returns normalized items`: `Expected: 200, Received: 404` at `client.request('/api/courses/201/grades')`.
- `T2-CONT-01: Non-Numeric Course ID Parameter rejects with 400 Bad Request`: `Expected: 400, Received: 404` at `client.request('/api/courses/notanumber/contents')`.
- `T2-HLTH-01: Missing sync_state Row handled gracefully`: `Expected: 200, Received: 404` or schema mismatch against `EnhancedHealthResponseSchema`.

### 1.5 Frontend Consumption (`apps/web/src/App.tsx`)
In `apps/web/src/App.tsx`:
- Line 8: `fetch('/api/health')` reading `health?.syncState?.baseline_seeded` and `health?.syncState?.last_success_at`.
- Line 17: `fetch('/api/courses')` expecting `{ courses: Course[] }`.
- Line 26: `fetch('/api/items')` expecting `{ items: SyncedItem[] }`.
To preserve backward compatibility with the frontend, the enhanced health response must include alias keys `syncState` (mirroring `sync_state`) and `lastRun` (mirroring `recent_runs[0]`).

---

## 2. Logic Chain

### Step 1: Separation of Concerns into Sub-Routers
- **Premise**: `index.ts` is responsible for application initialization, middleware wiring, sub-router mounting, error handling, and Cloudflare Worker lifecycle hooks (`fetch`, `scheduled`). Business logic and SQL queries belong to dedicated route modules.
- **Deduction**: Create modular route files under `apps/worker/src/routes/`:
  1. `dashboard.ts`: `GET /api/dashboard`
  2. `courses.ts`: `GET /api/courses`, `GET /api/courses/:id/contents`, `GET /api/courses/:id/grades`
  3. `health.ts`: `GET /api/health`
  4. `items.ts`: `GET /api/items`
  5. `sync.ts`: `POST /api/sync/manual`
  6. `proxy.ts`: Placeholder for `GET /api/files/proxy` (Milestone M3)

### Step 2: Shared Worker Environment and Type Integrity (`apps/worker/src/types.ts`)
- **Premise**: Sub-routers need typed access to `c.env.DB`, `c.env.MOODLE_TOKEN`, `c.env.ASSETS`, etc., via `Hono<{ Bindings: Env }>`.
- **Deduction**: Create `apps/worker/src/types.ts` defining:
  ```ts
  import type { SyncEnv } from './sync/engine';

  export interface Env extends SyncEnv {
    ASSETS?: Fetcher;
  }
  ```
  And re-export `export type { Env } from './types';` in `index.ts` so `apps/worker/test/helpers/test-client.ts` compiles without changes.

### Step 3: Sub-Router Mounting Strategy in `apps/worker/src/index.ts`
- **Premise**: We verified with Bun and Hono v4 that mounting `app.route('/api/courses', coursesRouter)` correctly handles:
  - `coursesRouter.get('/', ...)` -> matches `GET /api/courses`
  - `coursesRouter.get('/:id/contents', ...)` -> matches `GET /api/courses/:id/contents`
  - `coursesRouter.get('/:id/grades', ...)` -> matches `GET /api/courses/:id/grades`
- **Deduction**: The root application will mount sub-routers as follows:
  ```ts
  app.route('/api/dashboard', dashboardRouter);
  app.route('/api/courses', coursesRouter);
  app.route('/api/health', healthRouter);
  app.route('/api/items', itemsRouter);
  app.route('/api/sync', syncRouter);
  app.route('/api/files', proxyRouter);
  ```

### Step 4: Global Middleware & Error Handling
- **Premise**: E2E tests (`T2-DASH-05`, `T2-HLTH-02`) require 500 errors to return an `ApiErrorResponse` (`{ error: string, status?: string }`), while `T2-CONT-01` and `T2-GRAD-01` expect 400 errors with structured JSON. Non-API requests should delegate to Cloudflare static assets if present.
- **Deduction**:
  1. **Security Headers**: Mount `secureHeaders()` to set `x-content-type-options: nosniff`.
  2. **CORS**: Mount `cors()` on `/api/*` for dev/PWA compatibility.
  3. **Global Error Handler (`app.onError`)**:
     ```ts
     app.onError((err, c) => {
       console.error('[Worker Error]', err);
       return c.json({
         error: err.message || 'Internal Server Error',
         status: 'error'
       }, 500);
     });
     ```
  4. **Not Found Handler (`app.notFound`)**:
     ```ts
     app.notFound(async (c) => {
       if (c.env.ASSETS && !c.req.path.startsWith('/api/')) {
         return c.env.ASSETS.fetch(c.req.raw);
       }
       return c.json({
         error: 'Not Found',
         code: 'NOT_FOUND'
       }, 404);
     });
     ```

### Step 5: Route Contract Blueprint

#### A. `apps/worker/src/routes/dashboard.ts`
- **Route**: `dashboardRouter.get('/', async (c) => { ... })`
- **Data Gathering (All from D1, Zero fetch to Moodle - RNF-02)**:
  1. **Courses**: `SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC`
  2. **Upcoming Assignments**:
     `now = Math.floor(Date.now() / 1000)`
     ```sql
     SELECT 
       s.item_key, s.course_id, c.fullname AS course_name,
       s.title, s.url, s.due_date, s.submission_status, s.timemodified
     FROM synced_items s
     LEFT JOIN courses c ON s.course_id = c.id
     WHERE s.item_type = 'assignment'
       AND s.deleted_at IS NULL
       AND s.due_date >= ?
     ORDER BY s.due_date ASC, s.timemodified DESC
     ```
  3. **Recent Activity** (ordered DESC, limit 15 per `T1-DASH-05`):
     ```sql
     SELECT 
       s.item_key, s.course_id, c.fullname AS course_name,
       s.item_type, s.title, s.url, s.timemodified, s.updated_at
     FROM synced_items s
     LEFT JOIN courses c ON s.course_id = c.id
     WHERE s.deleted_at IS NULL
     ORDER BY s.timemodified DESC
     LIMIT 15
     ```
  4. **Current Grades**:
     ```sql
     SELECT 
       s.item_key, s.course_id, c.fullname AS course_name,
       s.title, s.grade_num, s.timemodified, s.url, s.payload_json
     FROM synced_items s
     LEFT JOIN courses c ON s.course_id = c.id
     WHERE s.item_type = 'grade'
       AND s.deleted_at IS NULL
     ORDER BY s.timemodified DESC
     ```
     Grade formatting extracted safely from `payload_json` if present.
  5. Validate output with `DashboardResponseSchema.parse(...)` and return 200.

#### B. `apps/worker/src/routes/courses.ts`
- **Route 1**: `coursesRouter.get('/', async (c) => { ... })`
  Preserves existing `SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC`. Returns `{ courses: results }`.
- **Route 2**: `coursesRouter.get('/:id/contents', async (c) => { ... })`
  1. Validate `:id` with `CourseContentsParamsSchema.safeParse({ id: c.req.param('id') })`. If invalid, return 400 `{ error: ..., code: 'INVALID_PARAMS' }`.
  2. Check course existence: `SELECT id FROM courses WHERE id = ?`. If missing, return 404 `{ error: 'Curso no encontrado', code: 'NOT_FOUND' }`.
  3. Query `course_contents`: `SELECT sections_json, updated_at FROM course_contents WHERE course_id = ?`.
  4. If found, safely parse `sections_json`. On malformed JSON fallback to `sections: []`.
  5. Return 200 `{ course_id: id, sections, synced_at: row ? row.updated_at : null }`.
- **Route 3**: `coursesRouter.get('/:id/grades', async (c) => { ... })`
  1. Validate `:id` with `CourseGradesParamsSchema.safeParse({ id: c.req.param('id') })`. If invalid, return 400 `{ error: ..., code: 'INVALID_PARAMS' }`.
  2. Check course existence: `SELECT id FROM courses WHERE id = ?`. If missing, return 404 `{ error: 'Curso no encontrado', code: 'NOT_FOUND' }`.
  3. Query `synced_items`:
     ```sql
     SELECT item_key, course_id, title, grade_num, timemodified, url, payload_json
     FROM synced_items
     WHERE course_id = ?
       AND item_type = 'grade'
       AND deleted_at IS NULL
     ORDER BY timemodified DESC
     ```
  4. Extract metadata fields (`grademin`, `grademax`, `feedback`, `weight_formatted`, etc.) from `payload_json` if available.
  5. Return 200 `{ course_id: id, grades }`.

#### C. `apps/worker/src/routes/health.ts`
- **Route**: `healthRouter.get('/', async (c) => { ... })`
  1. Query `sync_state`: `SELECT * FROM sync_state WHERE id = 1`.
  2. Query `sync_runs`: `SELECT * FROM sync_runs ORDER BY id DESC LIMIT 15`.
  3. Compute telemetry:
     - `failure_rate`: error count / total recent runs (0.0 if empty).
     - `subrequests`:
       `max_budget: 45`
       `last_used: recent_runs[0]?.subrequests_used ?? 0`
       `avg_recent`: average of non-null `subrequests_used` rounded to 2 decimals (0 if empty).
       `max_recent`: max of `subrequests_used` (0 if empty).
  4. Compute status:
     - `'circuit_open'` if `syncState?.circuit_open_until > now`.
     - `'degraded'` if `syncState == null`, or `syncState.baseline_seeded === 0`, or `syncState.consecutive_failures >= 3`, or `failure_rate >= 0.5`.
     - `'ok'` otherwise.
  5. Return 200 adhering to `EnhancedHealthResponseSchema` with `syncState` and `lastRun` compatibility aliases.

#### D. `apps/worker/src/routes/items.ts`
- **Route**: `itemsRouter.get('/', async (c) => { ... })`
  Preserves existing query with `?type=` filter and `deleted_at IS NULL`.

#### E. `apps/worker/src/routes/sync.ts`
- **Route**: `syncRouter.post('/manual', async (c) => { ... })`
  Preserves existing 30-second rate limit check and `runSync` invocation.

#### F. `apps/worker/src/routes/proxy.ts` (Placeholder)
- **Route**: `proxyRouter.get('/proxy', async (c) => { ... })`
  Returns 501 Not Implemented or placeholder response until implemented in Milestone M3.

---

## 3. Caveats
1. **SSRF Proxy Scope**: The proxy endpoint `/api/files/proxy` is in Milestone M3 scope. M2 should only provide the router mounting and placeholder in `src/routes/proxy.ts` so the routing structure is complete.
2. **Migration Dependency**: The table `course_contents` is required in D1. Although `apps/worker/test/helpers/d1-mock.ts` creates it as a fallback in tests, `apps/worker/migrations/0003_phase3_course_contents.sql` must be committed for local and production D1 instances.
3. **Database Null Handling**: In `synced_items`, `grade_num` can be `null` for ungraded submissions. The endpoint must explicitly serialize `null` instead of converting to `0` or omitting the field (`T1-GRAD-05`).

---

## 4. Conclusion
The routing architecture can be cleanly, modularly refactored without breaking any existing contract:
1. Create `apps/worker/src/types.ts` declaring `Env extends SyncEnv { ASSETS?: Fetcher }`.
2. Extract endpoints into modular Hono sub-routers in `apps/worker/src/routes/` (`dashboard.ts`, `courses.ts`, `health.ts`, `items.ts`, `sync.ts`, `proxy.ts`).
3. Refactor `apps/worker/src/index.ts` to:
   - Mount all sub-routers under `/api/*`.
   - Wire `cors()` and `secureHeaders()` middleware.
   - Attach centralized `app.onError` and `app.notFound` handlers.
   - Export `app` named export (`export { app }`) alongside default export `{ fetch: app.fetch, scheduled }`.
   - Re-export `export type { Env } from './types'`.
4. Create migration `apps/worker/migrations/0003_phase3_course_contents.sql`.

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Type Checking**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected outcome*: 0 errors.

2. **Test Suite Execution**:
   ```powershell
   bun test
   ```
   *Expected outcome*: 314 tests executed. Tests in Tier 1, Tier 2, Tier 3, and Tier 4 covering `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, and `/api/health` must pass (only the 12 proxy tests in Tier 1/2 will remain pending until Milestone M3).

3. **Web Build Validation**:
   ```powershell
   bun run build:web
   ```
   *Expected outcome*: Build succeeds without TypeScript or bundling errors.

### 5.2 Files to Inspect
- `apps/worker/src/index.ts`
- `apps/worker/src/types.ts`
- `apps/worker/src/routes/dashboard.ts`
- `apps/worker/src/routes/courses.ts`
- `apps/worker/src/routes/health.ts`
- `apps/worker/src/routes/items.ts`
- `apps/worker/src/routes/sync.ts`
- `apps/worker/src/routes/proxy.ts`
- `apps/worker/migrations/0003_phase3_course_contents.sql`

### 5.3 Invalidation Conditions
- Any outbound `fetch` call initiated from read routes (`/api/dashboard`, `/api/courses/*`, `/api/health`), triggering `[RNF-02 VIOLATION]`.
- Missing `export { app }` causing import errors in route testing.
- Missing `export type { Env }` in `index.ts` breaking `apps/worker/test/helpers/test-client.ts`.
- Non-numeric or negative IDs in `/api/courses/:id/*` returning 200 or 500 instead of 400.
