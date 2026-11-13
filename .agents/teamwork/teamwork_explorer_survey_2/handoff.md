# Handoff Report: Worker Architecture & Hono Routes (Phase 3 Survey)

**Author**: Explorer 2 (`teamwork_explorer_survey_2`)  
**Date**: 2026-11-12T20:32:00Z  
**Target Milestone**: Phase 3 (BFF Read API & Secure Proxy)  
**Status**: Investigation Complete

---

## 1. Observation

### 1.1 Existing Layout & Entry Points
- **Entry point**: `apps/worker/src/index.ts` (lines 1–99).
  - Instantiates `const app = new Hono<{ Bindings: Env }>()`.
  - Defines `export interface Env extends SyncEnv {}`.
  - Exports `{ fetch: app.fetch, async scheduled(controller, env, ctx) }`.
  - All existing routes are declared inline directly on `app`:
    - `app.get('/api/health', ...)` (lines 9–26): returns `{ status: 'ok', timestamp, syncState, lastRun }`.
    - `app.get('/api/courses', ...)` (lines 29–38): queries `SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC`.
    - `app.get('/api/items', ...)` (lines 41–60): queries `SELECT * FROM synced_items WHERE deleted_at IS NULL` with optional `?type=` filter.
    - `app.post('/api/sync/manual', ...)` (lines 63–84): checks `last_attempt_at < 30s` rate limit, then executes `runSync(c.env, { force })`.
  - No sub-routers (`routes/`), route grouping, or error middleware (`app.onError`, `app.notFound`) currently exist in `apps/worker`.

### 1.2 Configuration & Bindings
- **`apps/worker/wrangler.jsonc`**:
  - `name`: `"better-moodle-worker"`
  - `main`: `"src/index.ts"`
  - `compatibility_date`: `"2026-11-12"`, `compatibility_flags`: `["nodejs_compat"]`
  - `assets`: `{ "directory": "../web/dist", "binding": "ASSETS", "not_found_handling": "single-page-application" }` (fulfills RNF-09 same-origin requirement).
  - `d1_databases`: binding `"DB"`, `database_name`: `"catedig-db"`, `database_id`: `"catedig-db-local"`, `migrations_dir`: `"migrations"`.
  - `triggers`: `crons: ["*/5 * * * *"]`.
- **`apps/worker/.dev.vars.example`**:
  - `MOODLE_TOKEN`: WebService token.
  - `MOODLE_URL`: defaults to `https://catedig.itlalaguna.edu.mx`.
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`: Telegram alerts.
- **`apps/worker/package.json`**:
  - Dependencies: `"hono": "^4.7.0"`, `"@better-moodle/shared": "workspace:*"`.
  - DevDependencies: `"@cloudflare/workers-types": "^4.20250214.0"`, `"wrangler": "^4.161.0"`.

### 1.3 Database Schema & Migrations
- `apps/worker/migrations/0001_initial_schema.sql`:
  - `courses`: `id INTEGER PRIMARY KEY`, `shortname TEXT`, `fullname TEXT`, `progress REAL`, `payload_json TEXT`, `refreshed_at INTEGER`.
  - `synced_items`: `item_key TEXT PRIMARY KEY`, `course_id INTEGER`, `item_type TEXT`, `title TEXT`, `url TEXT`, `due_date INTEGER`, `grade_num REAL`, `timemodified INTEGER`, `payload_json TEXT`, `first_seen_at INTEGER`, `updated_at INTEGER`, `deleted_at INTEGER`.
  - `sync_state`: `id = 1`, `baseline_seeded`, `last_success_at`, `last_attempt_at`, `consecutive_failures`.
  - `sync_runs`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `started_at`, `finished_at`, `status`, `subrequests_used`, `items_changed`, `error`.
  - `push_subscriptions`: `id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`.
- `apps/worker/migrations/0002_phase2_sync_metadata.sql`:
  - `courses`: adds `grades_synced_at INTEGER`, `forums_synced_at INTEGER`.
  - `synced_items`: adds `submission_status TEXT`, `status_synced_at INTEGER`.
  - `sync_state`: adds `moodle_user_id INTEGER`, `courses_refreshed_at INTEGER`, `grades_seeded INTEGER`, `forums_seeded INTEGER`, `circuit_open_until INTEGER`, `dead_man_alerted INTEGER`.
- Observations on course contents storage:
  - There is currently no `course_contents` table or contents cache column in `courses`.
  - `courses.payload_json` currently holds the `MoodleCourse` object returned by `core_enrol_get_users_courses`.

### 1.4 Sync Engine & Subrequest Budget
- `apps/worker/src/sync/engine.ts`:
  - Enforces `MAX_SUBREQUESTS = 45` (safe margin under Cloudflare's 50 limit, RNF-05).
  - Uses `client.subrequestsUsed` and `client.remainingBudget`.
  - Batches writes using `env.DB.batch(...)`.
  - Staggers `syncGrades` and `syncForums` every 30 minutes (`STAGGER_INTERVAL_SEC = 1800`).
  - Scheduled handler calls `runSync(env, { isScheduled: true })` inside `ctx.waitUntil(...)`.

### 1.5 Existing Tests & Build Pipeline
- `apps/worker/src/sync/phase2.test.ts`:
  - Implements an in-memory SQLite fixture `createTestD1()` using `bun:sqlite` with `0001_initial_schema.sql` and `0002_phase2_sync_metadata.sql`.
  - Emulates `D1Database` interface (`prepare`, `bind`, `first`, `all`, `run`, `batch`).
- Current commands and verification:
  - `bun test`: 4 passed, 0 failed (81 ms).
  - `bunx tsc --noEmit -p apps/worker/tsconfig.json`: 0 errors.
  - `bun run build:web`: 0 errors, built in 6.00s.

---

## 2. Logic Chain

### 2.1 Router Modularization Architecture
1. **Observation**: Currently all 4 routes are defined directly in `src/index.ts`. Adding 5 new/upgraded endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, `/api/files/proxy`) with validation, query building, and SSRF handling inside `src/index.ts` would result in a monolithic, brittle file.
2. **Inference**: Creating a modular `src/routes/` directory allows each route domain to be encapsulated, independently testable, and cleanly typed with `Hono<{ Bindings: Env }>`.
3. **Proposed Structure**:
   ```
   apps/worker/src/
   ├── index.ts                      # Entrypoint: mounts routes, middleware, scheduled handler
   ├── routes/
   │   ├── dashboard.ts              # GET /api/dashboard
   │   ├── courses.ts                # GET /api/courses, GET /api/courses/:id/contents, GET /api/courses/:id/grades
   │   ├── health.ts                 # GET /api/health (enhanced)
   │   ├── proxy.ts                  # GET /api/files/proxy (SSRF protected)
   │   ├── items.ts                  # GET /api/items (existing endpoint preserved)
   │   └── sync.ts                   # POST /api/sync/manual (existing endpoint preserved)
   ```
4. **Mounting Pattern in `src/index.ts`**:
   ```ts
   import { Hono } from 'hono';
   import { dashboardRoute } from './routes/dashboard';
   import { coursesRoute } from './routes/courses';
   import { healthRoute } from './routes/health';
   import { proxyRoute } from './routes/proxy';
   import { itemsRoute } from './routes/items';
   import { syncRoute } from './routes/sync';

   const app = new Hono<{ Bindings: Env }>();

   app.onError((err, c) => {
     console.error('[API Error]', err);
     return c.json({ error: err.message || 'Error interno del servidor' }, 500);
   });

   app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

   app.route('/api/dashboard', dashboardRoute);
   app.route('/api/courses', coursesRoute);
   app.route('/api/health', healthRoute);
   app.route('/api/files/proxy', proxyRoute);
   app.route('/api/items', itemsRoute);
   app.route('/api/sync', syncRoute);
   ```

### 2.2 Endpoint Detailed Design

#### A. `GET /api/dashboard` (RNF-02 Compliant)
- **Objective**: Consolidated view returning enrolled courses, upcoming assignments, recent activity, and current grades in a single roundtrip.
- **D1 Execution**: Executed in a single roundtrip using `c.env.DB.batch([...])`:
  1. Courses: `SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC`
  2. Upcoming Assignments: `SELECT item_key, course_id, item_type, title, url, due_date, grade_num, submission_status, timemodified FROM synced_items WHERE item_type = 'assignment' AND deleted_at IS NULL AND due_date IS NOT NULL AND due_date >= ? ORDER BY due_date ASC LIMIT 15` (bound to `nowSec`).
  3. Recent Activity: `SELECT item_key, course_id, item_type, title, url, due_date, grade_num, submission_status, timemodified FROM synced_items WHERE deleted_at IS NULL ORDER BY timemodified DESC LIMIT 15`.
  4. Current Grades: `SELECT item_key, course_id, item_type, title, url, grade_num, timemodified, payload_json FROM synced_items WHERE item_type = 'grade' AND deleted_at IS NULL ORDER BY course_id ASC, timemodified DESC`.
- **Response**: Status 200 with `{ courses, upcomingAssignments, recentActivity, grades, timestamp }`.
- **Moodle Fetch**: Exactly 0 outbound network requests. Reads 100% from D1.

#### B. `GET /api/courses/:id/contents` (RNF-02 Compliant)
- **Objective**: Course contents and resources read strictly from D1.
- **Database Schema Requirement**:
  Add migration `0003_course_contents.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS course_contents (
    course_id INTEGER PRIMARY KEY,
    sections_json TEXT NOT NULL,
    refreshed_at INTEGER NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );
  ```
- **Execution Flow**:
  1. Parse `:id` parameter: must be positive integer (`/^\d+$/`). If invalid, return 400 (`{ error: 'ID de curso inválido' }`).
  2. Check course existence: `SELECT id, fullname, shortname FROM courses WHERE id = ?`. If missing, return 404 (`{ error: 'Curso no encontrado' }`).
  3. Query `course_contents`: `SELECT sections_json, refreshed_at FROM course_contents WHERE course_id = ?`.
  4. If no cached contents yet: return 200 with `{ course_id: id, course_name: fullname, sections: [], refreshed_at: null }`.
  5. If cached: return 200 with `{ course_id: id, course_name: fullname, sections: JSON.parse(sections_json), refreshed_at }`.
- **Moodle Fetch**: Exactly 0 outbound network requests during the interactive request. Population occurs exclusively via background/scheduled sync.

#### C. `GET /api/courses/:id/grades` (RNF-02 Compliant)
- **Objective**: Normalized grade items for the specified course from D1.
- **Execution Flow**:
  1. Validate `:id` param is integer. If not, return 400.
  2. Verify course in `courses`: if missing, return 404.
  3. Query: `SELECT item_key, course_id, item_type, title, url, grade_num, timemodified, payload_json, updated_at FROM synced_items WHERE course_id = ? AND item_type = 'grade' AND deleted_at IS NULL ORDER BY timemodified DESC, item_key ASC`.
  4. Deserialize `payload_json` to extract `grademin`, `grademax`, `feedback`, `gradeformatted`.
  5. Return 200 with `{ course_id, course_name, grades: [...] }`.
- **Moodle Fetch**: Exactly 0 outbound requests.

#### D. `GET /api/health` (Enhanced Observability)
- **Objective**: System status, recent `sync_runs` history, failure rate, and subrequest metrics.
- **D1 Execution**:
  1. `sync_state`: `SELECT * FROM sync_state WHERE id = 1`.
  2. Recent runs: `SELECT id, started_at, finished_at, status, subrequests_used, items_changed, error FROM sync_runs ORDER BY id DESC LIMIT 15`.
  3. Aggregated metrics: Query last 50 runs to calculate:
     - `totalRuns`: count of recent runs.
     - `failedRuns`: count where `status = 'error'`.
     - `partialRuns`: count where `status = 'partial'`.
     - `failureRate`: `failedRuns / totalRuns` (0.0 to 1.0).
     - `subrequests`: `{ lastUsed, avgUsed, maxUsed, budgetCeiling: 45, maxHardLimit: 50 }`.
  4. System status:
     - If `circuit_open_until > nowSec`: `'circuit_open'` (503 or 200 with status flag).
     - Else if `consecutive_failures >= 3`: `'degraded'`.
     - Else if `baseline_seeded === 0`: `'initializing'`.
     - Else: `'ok'`.
- **Response**: 200 OK with full health and telemetry snapshot.

#### E. `GET /api/files/proxy` (RF-04 & RNF-01 Secure Proxy)
- **Objective**: Stream Moodle files without exposing `MOODLE_TOKEN` to client.
- **SSRF Defense Rules**:
  1. Input parameter: `c.req.query('url')`. If missing, return 400 (`{ error: 'Parámetro url es requerido' }`).
  2. Parse URL with `new URL(rawUrl)`. If invalid URL syntax, return 400 (`{ error: 'URL inválida' }`).
  3. Protocol check: `parsed.protocol === 'https:'`. Reject `http:`, `ftp:`, `file:`, `javascript:`, etc. Return 400.
  4. User credentials check: `parsed.username !== '' || parsed.password !== ''`. Return 400 if present.
  5. Strict Host Allowlist:
     - Canonical hostname: `parsed.hostname.toLowerCase() === 'catedig.itlalaguna.edu.mx'`.
     - Reject subdomains, IP addresses (`127.0.0.1`, `169.254.169.254`), spoofing (`catedig.itlalaguna.edu.mx.attacker.com`).
     - Port check: `parsed.port === '' || parsed.port === '443'`.
     - If host check fails: return 403 Forbidden (`{ error: 'Host no autorizado' }`).
  6. Strict Path Prefix Allowlist:
     - `parsed.pathname.startsWith('/webservice/pluginfile.php')`.
     - If path check fails: return 403 Forbidden (`{ error: 'Ruta no autorizada' }`).
  7. Token Injection:
     - Check `c.env.MOODLE_TOKEN`: if missing, return 500 (`{ error: 'Servicio de archivos no configurado' }`).
     - Remove any existing `token` or `wstoken` param from incoming client URL.
     - Set upstream param: `parsed.searchParams.set('token', c.env.MOODLE_TOKEN)`.
  8. Upstream Streaming & Header Hygiene:
     - `fetch(parsed.toString(), { method: 'GET', headers: { 'User-Agent': 'BetterMoodle-Proxy/1.0' } })`.
     - If upstream is not ok (`res.status !== 200`): return `c.json({ error: 'Recurso no disponible en Moodle' }, res.status as any)`. NEVER leak upstream URL with token or upstream exception body.
     - Response headers sanitized:
       - Forward: `Content-Type`, `Content-Length`, `Content-Disposition`, `Last-Modified`.
       - Add: `Cache-Control: private, max-age=3600`, `X-Content-Type-Options: nosniff`.
       - Strip: `Set-Cookie`, `Location`, any internal headers.
     - Return `new Response(upstream.body, { status: upstream.status, headers })`.

---

## 3. Caveats

1. **Course Contents Population**:
   - The read endpoint `/api/courses/:id/contents` reads strictly from D1.
   - For contents to be present in D1, the background sync engine will need a companion sync function (e.g. `syncContents` calling `core_course_get_contents` in `MoodleClient`) or initial population. If a course has not had its contents synced yet, `/api/courses/:id/contents` safely returns an empty array `sections: []` with 200 OK without failing.
2. **Static Assets vs API Routing in Dev vs Production**:
   - In production and `wrangler dev`, `wrangler.jsonc` handles static assets through `assets.directory: "../web/dist"`.
   - When unit testing Hono via `app.fetch(request, env)`, only `/api/*` routes are targeted, which does not require building `web/dist`.
3. **No Auth Middleware in Phase 3**:
   - Phase 3 is single-user (Phase 6 introduces multi-user JWT auth according to `plan.md` §1.4). Therefore, user isolation by JWT is not applicable in Phase 3. However, all endpoints are designed with same-origin discipline.

---

## 4. Conclusion

1. **Architecture Ready**: The proposed router architecture in `apps/worker/src/routes/` cleanly modularizes Phase 3 endpoints without breaking existing routes or the scheduled cron trigger.
2. **Strict RNF-02 Compliance**: All 4 read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`) operate 100% on Cloudflare D1 with zero outbound calls to Moodle.
3. **Robust SSRF Defense**: `/api/files/proxy` enforces HTTPS, exact host `catedig.itlalaguna.edu.mx`, path prefix `/webservice/pluginfile.php`, port 443/default, credentials strip, and server-side token injection with zero token leakage.
4. **Schema Harmonization**: Adding migration `0003_course_contents.sql` gives D1 a clean relational home for course contents and resources.
5. **Testing & Mutation Strategy**: Leveraging the `bun:sqlite` memory fixture enables rapid end-to-end Hono integration tests and deterministic mutation testing directly in `bun test`.

---

## 5. Verification Method

To independently verify all findings and architectural assertions:

1. **Verify TypeScript compilation**:
   ```bash
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected output*: 0 errors.

2. **Verify Existing Tests**:
   ```bash
   bun test
   ```
   *Expected output*: 4 pass, 0 fail.

3. **Verify Web Build (RNF-09 Asset compatibility)**:
   ```bash
   bun run build:web
   ```
   *Expected output*: Vite build completes with code 0, emitting to `apps/web/dist`.

4. **Inspect Files & Schemas**:
   - `apps/worker/src/index.ts`: review inline routes to be extracted.
   - `apps/worker/wrangler.jsonc`: confirm asset binding and D1 database configuration.
   - `apps/worker/src/sync/phase2.test.ts`: inspect `createTestD1()` fixture to reuse for Phase 3 route testing.
   - `apps/worker/migrations/`: inspect `0001_initial_schema.sql` and `0002_phase2_sync_metadata.sql`.
