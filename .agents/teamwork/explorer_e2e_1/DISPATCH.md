# Dispatch: Explorer 1 (E2E Test Infrastructure & D1 Mocks)

**Task**: Investigate existing test setups, runners, libraries, and mock D1 mechanisms in `apps/worker`:
- How tests are currently structured in `apps/worker/test/`
- How Cloudflare D1 database is mocked or instantiated for `bun test`
- How environment variables (like `MOODLE_TOKEN`) and upstream `fetch` are mocked or handled in `bun test`
- Best practices and layout for adding opaque-box E2E test suites in `apps/worker/test/`

**Inputs to Read**:
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md`
- `c:\Users\corte\Downloads\betterMoodle\apps\worker\package.json`
- `c:\Users\corte\Downloads\betterMoodle\apps\worker\test\` (existing test files)

**Output Requirements**:
Write your findings and recommended test harness architecture to `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_1\handoff.md`.
Do NOT implement code.
Notify your parent when complete.


## 2026-11-12T20:37:35Z
You are Explorer 1 for the E2E Testing Track of BetterMoodle Phase 3.
Working directory: c:\Users\corte\Downloads\betterMoodle
State folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_1

Authoritative inputs to read:
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY: read first)
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_1\DISPATCH.md
- c:\Users\corte\Downloads\betterMoodle\apps\worker\package.json
- c:\Users\corte\Downloads\betterMoodle\apps\worker\test\

Your task:
Investigate existing test infrastructure in apps/worker:
1. Examine existing tests in apps/worker/test/ (how tests are currently written, runner used: bun test).
2. Examine how Cloudflare D1 is mocked or set up in existing tests.
3. Determine how to instantiate the Hono app for opaque-box E2E testing using app.request() / app.fetch().
4. Determine how to mock or assert outbound fetch calls (to ensure read endpoints NEVER call Moodle, and proxy calls catedig.itlalaguna.edu.mx with injected MOODLE_TOKEN).
5. Recommend the ideal test helper / fixture harness architecture for E2E tests.

Write your findings and recommendations to c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_1\handoff.md.
Do NOT write code or modify files outside your state folder.
Send a message to your parent (conv ID: 633791a2-7779-4c0d-82f1-cfb32407190b) when done.
