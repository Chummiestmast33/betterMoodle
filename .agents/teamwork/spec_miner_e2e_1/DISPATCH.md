# Dispatch: Spec Miner (E2E Testing Track)

**Task**: Extract complete opaque-box requirements and test matrices for Phase 3 endpoints:
- `GET /api/dashboard`
- `GET /api/courses/:id/contents`
- `GET /api/courses/:id/grades`
- `GET /api/health`
- `GET /api/files/proxy`

**Inputs to Read**:
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md`
- `c:\Users\corte\Downloads\betterMoodle\docs\fases\fase-3.md`

**Output Requirements**:
Write your findings to `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\spec_miner_e2e_1\handoff.md`.
Enumerate exact test expectations, status codes, response shapes, error responses, and required test partitions for Tiers 1-4.
Do NOT implement code.
Notify your parent when complete.


## 2026-11-12T20:37:34Z
You are the Spec Miner for the E2E Testing Track of BetterMoodle Phase 3.
Working directory: c:\Users\corte\Downloads\betterMoodle
State folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\spec_miner_e2e_1

Authoritative inputs to read:
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY: read first)
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md
- c:\Users\corte\Downloads\betterMoodle\docs\fases\fase-3.md
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\spec_miner_e2e_1\DISPATCH.md

Your task:
Extract the full requirement specifications and test expectations for Phase 3 endpoints:
1. GET /api/dashboard
2. GET /api/courses/:id/contents
3. GET /api/courses/:id/grades
4. GET /api/health
5. GET /api/files/proxy

Specify:
- Exact request shapes, headers, query params
- Exact expected response status codes and schema shapes for success and error
- Allowlist rules and error codes for file proxy
- D1 isolation rules (zero outbound fetch calls to Moodle on read endpoints)
- Test equivalence partitions and boundary conditions for Tiers 1-4

Write your comprehensive report to c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\spec_miner_e2e_1\handoff.md.
Do NOT write code or modify files outside your state folder.
Send a message to your parent (conv ID: 633791a2-7779-4c0d-82f1-cfb32407190b) when done.
