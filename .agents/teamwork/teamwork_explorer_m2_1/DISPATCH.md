# DISPATCH for Explorer 1 (Routing & Entry Point Architecture)


## 2026-11-12T23:02:02Z

You are Explorer 1 for Milestone M2 (D1 Read BFF Endpoints).
Working Directory: c:\Users\corte\Downloads\betterMoodle
State Folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_1
Scope Document: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\sub_orch_m2\SCOPE.md
Authoritative Request: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md
Global Architecture: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md

Your mission:
Investigate the existing routing architecture and entry point in `apps/worker/src/index.ts`, `apps/worker/src/types.ts`, and related worker files.
Analyze how to cleanly refactor `index.ts` into modular Hono sub-routers under `apps/worker/src/routes/`:
- `dashboard.ts` (GET /api/dashboard)
- `courses.ts` (GET /api/courses, GET /api/courses/:id/contents, GET /api/courses/:id/grades)
- `health.ts` (GET /api/health)
- `items.ts` (GET /api/items)
- `sync.ts` (POST /api/sync/manual)
Also examine how global error handling (`app.onError`, `app.notFound`), CORS / headers, static asset handling, and `scheduled` cron handler are structured.
Ensure named export `export { app }` is provided for testing alongside default export `{ fetch: app.fetch, scheduled }`.
Provide a complete architectural blueprint, route signatures, and integration plan.
Do NOT modify any code. Write your comprehensive analysis and recommendations to:
`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_1\handoff.md`
Then send a completion message to the parent sub-orchestrator.
