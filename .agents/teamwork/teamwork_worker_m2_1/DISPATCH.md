## 2026-11-12T23:10:09Z
You are Worker 1 for Milestone M2 (D1 Read BFF Endpoints).
Working Directory: c:\Users\corte\Downloads\betterMoodle
State Folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_worker_m2_1
Scope Document: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\sub_orch_m2\SCOPE.md
Authoritative Request: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md
Global Architecture: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md
Synthesis Blueprint: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\sub_orch_m2\SYNTHESIS.md
Explorer 1 Report: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_1\handoff.md
Explorer 2 Report: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_2\handoff.md
Explorer 3 Report: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_3\handoff.md

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## File Ownership
You have exclusive write ownership of the following files:
- `apps/worker/migrations/0003_phase3_course_contents.sql`
- `apps/worker/src/types.ts`
- `apps/worker/src/routes/dashboard.ts`
- `apps/worker/src/routes/courses.ts`
- `apps/worker/src/routes/health.ts`
- `apps/worker/src/routes/items.ts`
- `apps/worker/src/routes/sync.ts`
- `apps/worker/src/routes/proxy.ts`
- `apps/worker/src/index.ts`
- `apps/worker/test/read-routes.test.ts`
- `docs/fases/fase-3.md` (update checkboxes for completed BFF read routes and add notes per AGENTS.md)

## Objective & Implementation Requirements
Read the Explorer reports and `SYNTHESIS.md` carefully, then implement:
1. **D1 Migration**: Create `apps/worker/migrations/0003_phase3_course_contents.sql`.
2. **Worker Types**: Create `apps/worker/src/types.ts` exporting `Env` extending `SyncEnv` with optional `ASSETS?: Fetcher;`.
3. **Modular Hono Routes (`apps/worker/src/routes/`)**:
   - `dashboard.ts`: `GET /api/dashboard` (queries enrolled courses, upcoming assignments, recent activity bounded to 15, current grades with `grade_num: row.grade_num ?? null`. Use `Promise.all` instead of `batch`. Validate against `DashboardResponseSchema`).
   - `courses.ts`:
     - `GET /api/courses` (preserves existing query).
     - `GET /api/courses/:id/contents` (validates `:id` via `CourseContentsParamsSchema.safeParse`. Checks if course exists in `courses` -> 404 if not found. Queries `course_contents`; falls back to `{ course_id: id, sections: [], synced_at: null }` if not yet synced. Safely parses `sections_json` inside `try/catch`. Conforms to `CourseContentsResponseSchema`).
     - `GET /api/courses/:id/grades` (validates `:id` via `CourseGradesParamsSchema.safeParse`. Checks if course exists in `courses` -> 404 if not found. Queries `synced_items` where `course_id = ? AND item_type = 'grade' AND deleted_at IS NULL`. Parses `payload_json` for feedback and grade formatting. Conforms to `CourseGradesResponseSchema`).
   - `health.ts`: `GET /api/health` (queries `sync_state` and `sync_runs LIMIT 15`. Computes `failure_rate` and `subrequests` metrics with `max_budget: 45`. Sets status `ok | degraded | error | circuit_open`. Includes `syncState` and `lastRun` aliases. Conforms to `EnhancedHealthResponseSchema`).
   - `items.ts`: `GET /api/items` (preserves existing items query).
   - `sync.ts`: `POST /api/sync/manual` (preserves existing 30s rate limit and `runSync`).
   - `proxy.ts`: `GET /api/files/proxy` (placeholder returning 501 Not Implemented or stub for Milestone M3).
4. **Refactor Entry Point (`apps/worker/src/index.ts`)**:
   - Mount all sub-routers with `app.route(...)`.
   - Setup `app.onError` (returns 500 JSON) and `app.notFound` (delegates to `c.env.ASSETS` if non-API, else 404 JSON).
   - Export named `export { app };` for testing and default `{ fetch: app.fetch, scheduled }`.
   - Re-export `export type { Env } from './types';`.
5. **Unit Tests**:
   - Add/update unit tests in `apps/worker/test/read-routes.test.ts` to comprehensively test all read routes.
6. **Strict Architectural Constraint**:
   - RNF-02: Zero outbound network calls or fetches to Moodle on read endpoints.
7. **Verification**:
   - Run `bunx tsc --noEmit -p apps/worker/tsconfig.json` (must pass with 0 errors).
   - Run `bun run build:web` (must pass with 0 errors).
   - Run `bun test` in `apps/worker` and report detailed results.
8. **Phase Documentation**:
   - Update `docs/fases/fase-3.md` marking completed tasks and recording notes.

Write your complete handoff report to:
`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_worker_m2_1\handoff.md`
Then notify the parent sub-orchestrator.


## 2026-11-12T23:11:22Z
**Context**: Milestone M2 Implementation
**Content**: Note that the E2E test suite has published `c:\Users\corte\Downloads\betterMoodle\TEST_READY.md` and `apps/worker/test/e2e.test.ts`. While proxy tests belong to Milestone M3, all read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`) are tested in Tiers 1-4. You can run `bun test apps/worker/test/e2e.test.ts` to verify the read endpoints.
**Action**: Incorporate into your test verification and continue implementation.
