# Task Assignment: Explorer 3 (Survey - Secure Proxy, Testing & Mutation Testing)

**Original Request Path**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md` (Read this first!)

## Objective
Investigate the existing repository to map:
1. Secure Proxy (`GET /api/files/proxy`) design:
   - Target URL parsing and strict allowlist validation (host `catedig.itlalaguna.edu.mx`, path prefix `/webservice/pluginfile.php`).
   - Mitigating SSRF (preventing open redirect, URL parsing bypasses, internal IP resolution, etc.).
   - Secure server-side `MOODLE_TOKEN` injection (append `token` query param to the upstream Moodle request only, stream response back to client, ensure token is never leaked in headers, client URLs, error bodies, or logs).
   - Appropriate headers (Content-Type, Content-Disposition, Cache-Control, etc.).
2. Test Architecture in `apps/worker`:
   - Existing test files in `apps/worker` or monorepo (`bun test`).
   - How D1 database can be mocked or created in memory / Miniflare / SQLite for testing Hono endpoints.
   - How `fetch` to Moodle is tested/mocked for the proxy endpoint.
3. Mutation Testing Architecture:
   - How mutation testing can be implemented in `apps/worker` to satisfy requirement R4 ("Add mutation testing to the test suite to verify test robustness and kill induced mutations in endpoint logic and proxy validation").
   - Investigate lightweight, reliable mutation testing mechanisms (e.g. mutation test harness / runner or Stryker) that run under `bun test` or `bun run ...` and verify that mutations are killed.
4. `docs/fases/fase-3.md`: Review current checklist and note expectations.

## Output Requirements
Write your detailed report and handoff to:
`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_3\handoff.md`
Notify when complete with a message.


## 2026-11-12T20:26:15Z
You are Explorer 3 on the BetterMoodle survey team.
Working Directory: c:\Users\corte\Downloads\betterMoodle
State Folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_3
Authoritative Request: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md
Dispatch details: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_3\DISPATCH.md

Investigate Secure Proxy (/api/files/proxy) SSRF mitigation, token injection mechanics, apps/worker test architecture with bun test, mutation testing approaches, and docs/fases/fase-3.md.
Write your complete handoff report to:
c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_3\handoff.md
When finished, send a message to the orchestrator with a summary and link to your handoff report.
