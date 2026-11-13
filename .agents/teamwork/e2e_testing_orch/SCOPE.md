# Scope: E2E Testing Track Orchestrator

## Objective
Design and implement an opaque-box, requirement-driven end-to-end test suite for Phase 3:
1. Create `TEST_INFRA.md` defining test philosophy, feature inventory, test runner (`bun test`), and test case directory layout.
2. Implement Tiers 1-4 test cases covering all 5 endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, `/api/files/proxy`):
   - Tier 1: Feature Coverage (>=5 test cases per feature)
   - Tier 2: Boundary & Corner Cases (>=5 per feature: invalid IDs, missing params, empty DB, malicious URLs, invalid protocols)
   - Tier 3: Cross-Feature Combinations (dashboard + grades, contents + proxy, sync runs + health metrics)
   - Tier 4: Real-World Scenarios (student daily routine checking dashboard, opening course materials, proxying assignments, checking system health)
3. Implement test cases in `apps/worker/test/e2e/`.
4. Publish `TEST_READY.md` at project root (`c:\Users\corte\Downloads\betterMoodle\TEST_READY.md`) once the test suite is complete and ready for the implementation track.

## Architecture
- **Approach**: Opaque-box testing exercising the Hono application (`worker.fetch()`) as an external HTTP client.
- **Isolation**: In-memory Cloudflare D1 simulation via `bun:sqlite` with dynamic migration loader (`0001`, `0002`, `0003`) and poison fetch guard (`createForbiddenFetchGuard()`) ensuring 0 network calls on read paths.
- **Proxy Security**: Upstream Moodle streaming simulator (`createProxyFetchMock()`) validating server-side `MOODLE_TOKEN` injection, `redirect: 'manual'`, and zero token leakage.
- **Schema Enforcement**: 100% runtime validation of response payloads via `@better-moodle/shared` Zod schemas without `as any` casting.
- **Directory Layout**:
  - `TEST_INFRA.md` at project root.
  - `apps/worker/test/helpers/`: `d1-mock.ts`, `fixtures.ts`, `fetch-mock.ts`, `test-client.ts`, `index.ts`.
  - `apps/worker/test/e2e/`: `tier1-features.test.ts`, `tier2-boundaries.test.ts`, `tier3-combinations.test.ts`, `tier4-scenarios.test.ts`.
  - `apps/worker/test/e2e.test.ts`: Master test runner aggregating all 72 tests.
  - `TEST_READY.md` at project root.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Dashboard BFF Endpoint (`GET /api/dashboard`) | Consolidated courses, assignments, items, grades strictly from D1 | E2E-M1 | ORIGINAL_REQUEST §R1 |
| 2 | Course Contents Endpoint (`GET /api/courses/:id/contents`) | Course section contents strictly from D1 | E2E-M1 | ORIGINAL_REQUEST §R1 |
| 3 | Course Grades Endpoint (`GET /api/courses/:id/grades`) | Normalized grade items strictly from D1 | E2E-M1 | ORIGINAL_REQUEST §R1 |
| 4 | Enhanced Health Endpoint (`GET /api/health`) | Enhanced health status, sync run history, failure rate, subrequests from D1 | E2E-M1 | ORIGINAL_REQUEST §R1 |
| 5 | Secure File Proxy (`GET /api/files/proxy`) | SSRF defense, host/path allowlist, server token injection, token leak protection | E2E-M1 | ORIGINAL_REQUEST §R2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E-M1 | E2E Test Suite (Tiers 1-4) & Publication | Create TEST_INFRA.md, write Tiers 1-4 tests, verify execution, publish TEST_READY.md | none | DONE |

## Interface Contracts
- **Test Command**: `bun test apps/worker/test/e2e.test.ts` or `bun test` in `apps/worker`.
- **Pass Semantics**: All test cases pass with exit code 0.
- **Ownership Deliverables**:
  - `TEST_INFRA.md` at project root.
  - `TEST_READY.md` at project root.
  - `apps/worker/test/helpers/` (harness helpers).
  - `apps/worker/test/e2e/` (72 tests across Tiers 1-4).
  - `apps/worker/test/e2e.test.ts` (master test runner).
