# Task Assignment: Explorer 2 (Survey - Worker Architecture & Hono Routes)

**Original Request Path**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md` (Read this first!)

## Objective
Investigate the existing repository to map:
1. `apps/worker`: Codebase layout, `src/index.ts`, existing routes (`/api/*`), middleware, environment bindings in `Env` (e.g. `DB: D1Database`, `MOODLE_TOKEN`, `TELEGRAM_BOT_TOKEN`, etc.), and `wrangler.jsonc`.
2. Existing sync implementation: How the scheduled handler works, what queries it performs, how it writes to D1, and how D1 is accessed.
3. Architecture of Hono endpoints: How new routes (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, `/api/files/proxy`) should be structured, routed, and mounted in `apps/worker`.
4. RNF-02 and RNF-09 compliance: Verify that all read routes will read strictly from D1 without any outbound fetch to Moodle, and how static assets / same-origin are configured.
5. Error handling patterns and response status codes.

## Output Requirements
Write your detailed report and handoff to:
`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_2\handoff.md`
Notify when complete with a message.


## 2026-11-12T20:26:10Z
You are Explorer 2 on the BetterMoodle survey team.
Working Directory: c:\Users\corte\Downloads\betterMoodle
State Folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_2
Authoritative Request: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md
Dispatch details: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_2\DISPATCH.md

Investigate apps/worker codebase layout, src/index.ts, existing Hono routes and middleware, D1 database interactions, sync logic, and determine how the new Phase 3 endpoints (/api/dashboard, /api/courses/:id/contents, /api/courses/:id/grades, /api/health, /api/files/proxy) should be organized.
Write your complete handoff report to:
c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_2\handoff.md
When finished, send a message to the orchestrator with a summary and link to your handoff report.
