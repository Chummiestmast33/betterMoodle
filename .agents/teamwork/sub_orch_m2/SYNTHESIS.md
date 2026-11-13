# Synthesis & Implementation Blueprint — Milestone M2

## Consensus
All three Explorers agree on the precise architecture, contracts, and files required for Milestone M2:

1. **D1 Migration (`apps/worker/migrations/0003_phase3_course_contents.sql`)**:
   ```sql
   -- 0003_phase3_course_contents.sql
   -- Almacenamiento de secciones y recursos del curso para Fase 3 (BFF Read API)

   CREATE TABLE IF NOT EXISTS course_contents (
     course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
     sections_json TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   ```

2. **Types (`apps/worker/src/types.ts`)**:
   Define `Env` extending `SyncEnv` with optional `ASSETS?: Fetcher;`.

3. **Sub-Routers in `apps/worker/src/routes/`**:
   - `dashboard.ts`: mounted at `/api/dashboard`
     - Queries: `courses`, `synced_items` (upcoming assignments `due_date >= now AND deleted_at IS NULL`), recent activity (`deleted_at IS NULL ORDER BY timemodified DESC LIMIT 15`), current grades (`item_type = 'grade' AND deleted_at IS NULL`).
     - Uses `Promise.all` instead of `c.env.DB.batch` to ensure compatibility with `d1-mock.ts`.
     - Validates / conforms to `DashboardResponseSchema`.
   - `courses.ts`: mounted at `/api/courses`
     - `GET /`: returns `{ courses }`.
     - `GET /:id/contents`: validates `:id` via `CourseContentsParamsSchema.safeParse`. Checks if course exists in `courses` table (returns 404 if not found). Queries `course_contents`; falls back to `{ course_id: id, sections: [], synced_at: null }` if no row. Safely parses `sections_json` inside `try/catch`. Conforms to `CourseContentsResponseSchema`.
     - `GET /:id/grades`: validates `:id` via `CourseGradesParamsSchema.safeParse`. Checks if course exists in `courses` table (returns 404 if not found). Queries `synced_items` where `course_id = ? AND item_type = 'grade' AND deleted_at IS NULL`. Safely parses `payload_json` to extract `grademin`, `grademax`, `feedback`, `grade_formatted`. Conforms to `CourseGradesResponseSchema`.
   - `health.ts`: mounted at `/api/health`
     - Queries `sync_state` and `sync_runs` (LIMIT 15).
     - Computes `failure_rate` (ratio of error runs) and `subrequests` (`max_budget: 45`, `last_used`, `avg_recent`, `max_recent`).
     - Computes status: `'circuit_open'` if open, `'degraded'` if null or baseline not seeded or failures, `'ok'` otherwise.
     - Conforms to `EnhancedHealthResponseSchema` with `syncState` and `lastRun` aliases.
   - `items.ts`: mounted at `/api/items`
     - Preserves existing items query.
   - `sync.ts`: mounted at `/api/sync`
     - `POST /manual`: preserves existing manual sync with 30s rate limit.
   - `proxy.ts`: mounted at `/api/files`
     - `GET /proxy`: placeholder for Milestone M3 (returns 501 Not Implemented or stub).

4. **Worker Entry Point Refactor (`apps/worker/src/index.ts`)**:
   - Initializes Hono app `const app = new Hono<{ Bindings: Env }>()`.
   - Mounts sub-routers via `app.route(...)`.
   - Configures global `app.onError` (returns 500 JSON) and `app.notFound` (delegates to `ASSETS` if non-API, else 404 JSON).
   - Exports named `export { app };` and default `export default { fetch: app.fetch, scheduled }`.
   - Re-exports `export type { Env } from './types';`.

5. **Unit & Verification Testing**:
   - Create comprehensive unit tests in `apps/worker/test/read-routes.test.ts` (or integration with existing test suite) testing:
     - All 4 read endpoints with genuine D1 data.
     - 400 validation on invalid/decimal/negative course IDs.
     - 404 on non-existent course IDs.
     - Fallback on un-synced course contents.
     - RNF-02 zero network calls assertion.
     - Health endpoint failure rate and subrequests calculation.
   - Commands to verify:
     - `bunx tsc --noEmit -p apps/worker/tsconfig.json` (0 errors)
     - `bun run build:web` (0 errors)
     - `bun test`
