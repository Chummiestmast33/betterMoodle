# Scope: Milestone M2 — D1 Migration and BFF Read Endpoints

## Objective
Implement all Phase 3 read endpoints in Hono (`apps/worker`), strictly backed by Cloudflare D1 with ZERO network calls to Moodle (RNF-02):
1. **D1 Migration**: Create `apps/worker/migrations/0003_phase3_course_contents.sql` defining:
   ```sql
   CREATE TABLE IF NOT EXISTS course_contents (
     course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
     sections_json TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   ```
2. **Modular Router Architecture in `apps/worker/src/routes/`**:
   - `dashboard.ts`: `GET /api/dashboard` returning consolidated enrolled courses, upcoming assignments (`due_date >= now AND deleted_at IS NULL`), recent activity, and latest grades strictly from D1. Validates and adheres to `DashboardResponseSchema` from `@better-moodle/shared`.
   - `courses.ts`:
     - `GET /api/courses`: preserves existing courses list.
     - `GET /api/courses/:id/contents`: reads course contents from `course_contents` in D1. If none yet, returns `{ course_id: id, sections: [], synced_at: null }`. Validates `:id` using `CourseContentsParamsSchema`.
     - `GET /api/courses/:id/grades`: reads normalized grade items for `course_id` from `synced_items` (`item_type = 'grade' AND deleted_at IS NULL`). Validates `:id` using `CourseGradesParamsSchema`.
   - `health.ts`: `GET /api/health` enhanced with `sync_state`, recent history from `sync_runs`, `failure_rate`, and `subrequests` metrics. Validates and adheres to `EnhancedHealthResponseSchema`.
   - `items.ts`: `GET /api/items` (preserves existing items query).
   - `sync.ts`: `POST /api/sync/manual` (preserves existing manual sync with 30s rate limit).
3. **Worker Entry Point Refactor (`apps/worker/src/index.ts`)**:
   - Mount all modular routes.
   - Configure global error handling `app.onError` and `app.notFound`.
   - Export `app` as named export (`export { app };`) for testing and default `{ fetch: app.fetch, scheduled }`.
   - Provide route placeholder / mount for `proxy.ts`.

## Strict Architectural Rules (AGENTS.md & plan.md)
- **RNF-02**: Read endpoints NEVER call `fetch` or contact `catedig.itlalaguna.edu.mx`. They read strictly from `c.env.DB`.
- **Type Safety**: Import and use types and schemas from `@better-moodle/shared`.
- **Build Cleanliness**: `bunx tsc --noEmit -p apps/worker/tsconfig.json` must pass with 0 errors. `bun run build:web` must succeed.
- **Unit Verification**: Run existing and new route unit tests via `bun test` in `apps/worker`.

## File Ownership
- `apps/worker/migrations/0003_phase3_course_contents.sql`
- `apps/worker/src/routes/dashboard.ts`
- `apps/worker/src/routes/courses.ts`
- `apps/worker/src/routes/health.ts`
- `apps/worker/src/routes/items.ts`
- `apps/worker/src/routes/sync.ts`
- `apps/worker/src/index.ts`
- `apps/worker/test/` (unit tests for read routes)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
