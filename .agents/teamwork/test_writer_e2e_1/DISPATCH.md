# Dispatch: Test Writer (E2E Testing Track)

**Task**: Implement the comprehensive opaque-box E2E test suite (Tiers 1-4), test harness, `TEST_INFRA.md`, and `TEST_READY.md` at project root.

**Mandatory Inputs to Read First**:
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md` (MANDATORY: Authoritative request)
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SYNTHESIS.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\spec_miner_e2e_1\handoff.md` (Specification matrix)
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_1\handoff.md` (Harness architecture & code)
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_2\handoff.md` (72-test catalog design)

**File Write Ownership**:
You have exclusive write ownership over:
- `c:\Users\corte\Downloads\betterMoodle\TEST_INFRA.md`
- `c:\Users\corte\Downloads\betterMoodle\TEST_READY.md`
- All files in `c:\Users\corte\Downloads\betterMoodle\apps\worker\test\`:
  - `apps/worker/test/helpers/d1-mock.ts`
  - `apps/worker/test/helpers/fixtures.ts`
  - `apps/worker/test/helpers/fetch-mock.ts`
  - `apps/worker/test/helpers/test-client.ts`
  - `apps/worker/test/helpers/index.ts`
  - `apps/worker/test/e2e/tier1-features.test.ts`
  - `apps/worker/test/e2e/tier2-boundaries.test.ts`
  - `apps/worker/test/e2e/tier3-combinations.test.ts`
  - `apps/worker/test/e2e/tier4-scenarios.test.ts`
  - `apps/worker/test/e2e.test.ts`
DO NOT modify `apps/worker/src/` or any other files outside your ownership.

**Deliverables**:
1. `TEST_INFRA.md` at project root following the structure in `explorer_e2e_2/handoff.md §4.6`.
2. Test harness helpers in `apps/worker/test/helpers/` implementing in-memory SQLite D1 with dynamic migration loader, fixtures, fetch guards, and opaque test client.
3. Master test suite implementing all 72 tests across Tiers 1-4:
   - Tier 1: 30 Feature Coverage tests (6 per endpoint across Dashboard, Contents, Grades, Health, Proxy)
   - Tier 2: 30 Boundary & Corner tests (6 per endpoint including comprehensive SSRF vectors)
   - Tier 3: 6 Cross-Feature Combination tests
   - Tier 4: 6 Real-World Application Scenario tests
4. `TEST_READY.md` at project root following the structure in `explorer_e2e_2/handoff.md §4.7`.
5. Execute `bun test` in `apps/worker` to verify all test files parse, load, and execute properly with the harness.
6. Write full completion report to `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\test_writer_e2e_1\handoff.md` and notify parent.

**MANDATORY INTEGRITY WARNING**:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-11-12T20:46:11Z
Received dispatch from parent (633791a2-7779-4c0d-82f1-cfb32407190b):
Role: E2E Test Writer for BetterMoodle Phase 3.
Working directory: c:\Users\corte\Downloads\betterMoodle
State folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\test_writer_e2e_1
Task: Implement the complete opaque-box E2E test infrastructure and 72-test catalog for Phase 3 (TEST_INFRA.md, test harness in apps/worker/test/helpers/, 4-tier test suites in apps/worker/test/e2e/, e2e.test.ts, TEST_READY.md, bun test verification, handoff report).
