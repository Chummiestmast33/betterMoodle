# Task Assignment: Explorer 1 (Survey - Schemas, Types, and D1 Database)

**Original Request Path**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md` (Read this first!)

## Objective
Investigate the existing repository to map:
1. `packages/shared`: Existing exports, TypeScript types, Zod schemas, package.json dependencies, and how it is consumed by `apps/worker` and `apps/web`.
2. D1 Database Migrations: Review `apps/worker/migrations/`, schema structures for `courses`, `synced_items`, `sync_state`, `sync_runs`, and check how course contents, assignments, announcements, and grades are represented in tables and `payload_json`.
3. Gap analysis for Phase 3: What schemas and types need to be added to `packages/shared` for:
   - `GET /api/dashboard` (courses, upcoming assignments, recent activity, current grades)
   - `GET /api/courses/:id/contents` (course content resources)
   - `GET /api/courses/:id/grades` (normalized grade items)
   - `GET /api/health` (system status, recent `sync_runs`, failure rate, subrequests)
   - `GET /api/files/proxy` (query params and error responses)
4. Monorepo conventions in `AGENTS.md` and `plan.md`.

## Output Requirements
Write your detailed report and handoff to:
`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_1\handoff.md`
Notify when complete with a message.


## 2026-11-12T20:26:03Z
[Message from dafd4987-d9e1-4c9b-b5a2-cf6be1636891]
You are Explorer 1 on the BetterMoodle survey team.
Working Directory: c:\Users\corte\Downloads\betterMoodle
State Folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_1
Authoritative Request: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md
Dispatch details: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_1\DISPATCH.md

Investigate packages/shared, D1 migrations (apps/worker/migrations/), existing schema structures, and data representation. Identify what schemas and types must be defined in packages/shared for Phase 3 endpoints.
Write your complete handoff report to:
c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_1\handoff.md
When finished, send a message to the orchestrator with a summary and link to your handoff report.
