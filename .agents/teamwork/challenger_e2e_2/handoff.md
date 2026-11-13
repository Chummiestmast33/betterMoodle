# Empirical Verification & Defect Sensitivity Challenge Report (Challenger 2)

**Track**: Phase 3 BFF Read API & Secure Proxy E2E Testing  
**Auditor/Challenger**: Challenger 2 (Critic / Specialist)  
**Date**: 2026-11-12T22:36:00Z  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

### Obs 1: Total Absence of Zod Schema Validation Across All 72 Test Cases
- In `TEST_INFRA.md` (§1.1, line 9):
  > "Tests assert on HTTP status codes, headers (sanitization, MIME types, security policies), and parsed response payloads validated against shared Zod schemas (`packages/shared`)."
- In `TEST_INFRA.md` (§6, line 126):
  > "- **Schema Conformance**: 100% validation pass against shared Zod schemas."
- In `TEST_READY.md` (§3, line 43):
  > "R3: Shared Schemas and Documentation: Schemas verified across all endpoint responses."
- **Direct Code Inspection**: A global search across `apps/worker/test/e2e/` reveals **0 occurrences** of importing or invoking `DashboardResponseSchema`, `CourseContentsResponseSchema`, `CourseGradesResponseSchema`, `EnhancedHealthResponseSchema`, or `ApiErrorResponseSchema`.
- Instead, every single response body is cast via `const body = (await res.json()) as any;` (e.g. `tier1-features.test.ts:79, 141, 199, 225, 262, 310, 327, 444, 605, 632, 650, 667, 692, 709`).
- **Empirical Execution Result (`scripts/challenger-assertiveness-test.ts:20-65`)**:
  Running `bun test ./scripts/challenger-assertiveness-test.ts` (Experiment 1) proves that an invalid dashboard payload with missing required fields (`due_date`, `timemodified`, `refreshed_at`), corrupted types (`id: "10"` string instead of number), and extra properties passes the current test assertions in `T1-DASH-01` (`looseAssertionsPassed = true`), whereas `DashboardResponseSchema.safeParse()` correctly flags the payload as invalid (`schemaResult.success = false`).

### Obs 2: Tautological False-Positive in `T2-GRAD-04` on Unimplemented Route
- In `apps/worker/test/e2e/tier2-boundaries.test.ts` (lines 242–247):
  ```ts
  test('T2-GRAD-04: Non-Existent Course ID returns 404 Not Found', async () => {
    const res = await client.request('/api/courses/88888/grades');
    expect(res.status).toBe(404);

    fetchGuard.assertZeroCalls();
  });
  ```
- **Direct Execution Output**: Running `bun test apps/worker/test/e2e/tier2-boundaries.test.ts -t "T2-GRAD-04"`:
  ```
  (pass) Tier 2: Boundary & Corner Cases (30 Tests) > Feature 3: GET /api/courses/:id/grades Boundaries > T2-GRAD-04: Non-Existent Course ID returns 404 Not Found [56.06ms]
  1 pass, 0 fail
  ```
- **Factual Discrepancy**: The endpoint `/api/courses/:id/grades` is **not implemented yet** in `apps/worker/src/index.ts`. Hono's default unmounted route handler returns HTTP 404 with plain text `404 Not Found`. Because `T2-GRAD-04` only asserts `expect(res.status).toBe(404)` without verifying JSON content-type or `body.error`, it passes unconditionally before any code is written. In contrast, `T2-CONT-04` (line 180) checks `const body = (await res.json()) as any; expect(body.error).toBeDefined();`, failing with `SyntaxError: Failed to parse JSON` as expected in a true TDD suite.

### Obs 3: Mutant Survival on Empty Recent Activity Array in `T1-DASH-05`
- In `apps/worker/test/e2e/tier1-features.test.ts` (lines 222–234):
  ```ts
  const res = await client.request('/api/dashboard');
  expect(res.status).toBe(200);

  const body = (await res.json()) as any;
  expect(body.recent_activity.length).toBeLessThanOrEqual(15);

  for (let i = 0; i < body.recent_activity.length - 1; i++) {
    expect(body.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
      body.recent_activity[i + 1].timemodified
    );
  }
  ```
- **Direct Code Context**: The test explicitly seeds 20 active announcement items into D1 (lines 212–220).
- **Empirical Execution Result (`scripts/challenger-assertiveness-test.ts:71-98`)**:
  Experiment 2 injected a mutant backend returning `{ recent_activity: [] }`. Because `0 <= 15` evaluates to `true`, and the loop `for (let i = 0; i < 0 - 1; i++)` does not execute, the test passes unconditionally on an empty array. The test should strictly assert `expect(body.recent_activity.length).toBe(15);`.

### Obs 4: Ineffective `Number.isNaN()` Check in `T2-HLTH-05`
- In `apps/worker/test/e2e/tier2-boundaries.test.ts` (line 373):
  ```ts
  expect(Number.isNaN(body.subrequests.avg_recent)).toBe(false);
  ```
- **Empirical Execution Result (`scripts/challenger-assertiveness-test.ts:104-124`)**:
  In JavaScript / Bun runtime, `Number.isNaN(undefined)` returns `false`, and `Number.isNaN(null)` returns `false`.
  Experiment 3 proves that if a backend implementation completely omits `avg_recent` (i.e. `undefined`), `Number.isNaN(undefined)` evaluates to `false`, and the test passes unconditionally. The test fails to assert `typeof body.subrequests.avg_recent === 'number'`.

### Obs 5: Permissive Crash / Error Status Acceptance in `T2-HLTH-01` and `T2-CONT-05`
- In `apps/worker/test/e2e/tier2-boundaries.test.ts` (line 303 & line 198):
  - `T2-HLTH-01`: `expect([200, 500]).toContain(res.status);`
  - `T2-CONT-05`: `expect([200, 500]).toContain(res.status);`
- **Empirical Execution Result (`scripts/challenger-assertiveness-test.ts:130-147`)**:
  If either endpoint encounters an unhandled runtime exception and crashes with an internal 500 error, `[200, 500].includes(500)` returns `true`, and the test marks the crash as a pass.

### Obs 6: Missing Baseline Precondition in `T3-XFEAT-05` (Tombstone Cascade)
- In `apps/worker/test/e2e/tier3-combinations.test.ts` (lines 193–212):
  The test verifies that `grade_arch_quiz` is present in `/api/courses/103/grades` before tombstoning, but **never queries `/api/dashboard` beforehand**. After soft-deleting the item in D1, it checks:
  ```ts
  expect(dashData.current_grades.some((g: any) => g.item_key === 'grade_arch_quiz')).toBe(false);
  ```
- **Empirical Execution Result (`scripts/challenger-assertiveness-test.ts:153-172`)**:
  Experiment 5 proves that if `/api/dashboard` contains a bug that completely fails to return course 103 grades in the first place, `dashData.current_grades.some(...)` is `false` initially and remains `false` after deletion, passing the test despite the feature never working.

### Obs 7: Flaky Wall-Clock Assertion in `T2-DASH-04`
- In `apps/worker/test/e2e/tier2-boundaries.test.ts` (line 105):
  ```ts
  expect(elapsed).toBeLessThan(100); // Must be under 100ms in-memory
  ```
- A hardcoded wall-clock threshold of 100ms on Windows CI or shared execution environments risks nondeterministic test failures due to GC pauses or CPU throttling, independent of functional correctness.

---

## 2. Logic Chain

1. **Premise 1 (Interface Contract & Specification)**:
   `TEST_INFRA.md` (§1.1, §6) and `TEST_READY.md` explicitly mandate 100% schema validation using `packages/shared` Zod schemas to ensure endpoint responses conform to strict typing contracts.
2. **Step 1 (Observation → Defect Identification)**:
   By Obs 1, not a single test among the 72 test cases imports or executes Zod schema validation. Every response payload is cast as `any`.
3. **Step 2 (Empirical Proof of Escape)**:
   By Experiment 1 (Obs 1), malformed and missing data payloads pass the current tests undetected. Therefore, the test suite is currently incapable of catching schema regressions or contract violations in Phase 3 implementations.
4. **Step 3 (False-Positive & Tautology Identification)**:
   By Obs 2, `T2-GRAD-04` already passes against the Phase 2 baseline worker where `/api/courses/:id/grades` does not even exist. This confirms the test assertion `expect(res.status).toBe(404)` is tautological without verifying JSON body / error schemas.
5. **Step 4 (Mutation Testing Proof)**:
   By Obs 3 and Experiment 2, mutating `recent_activity` to an empty array survives `T1-DASH-05` due to using `toBeLessThanOrEqual(15)` instead of `toBe(15)`.
6. **Step 5 (Permissive Status Proof)**:
   By Obs 4, Obs 5, and Experiments 3 & 4, unhandled crashes (500) and undefined metric properties pass unconditionally due to `[200, 500]` status sets and `Number.isNaN(undefined) === false`.
7. **Deduction (Conclusion)**:
   Because the test suite allows malformed schemas, unhandled 500 crashes, missing properties, and unmounted routes to pass, it does NOT yet meet the high defect sensitivity required for Phase 3 gate sign-off. Changes are strictly required.

---

## 3. Caveats

- **No Production Implementation Modified**: Consistent with the review-only constraint and role archetype, no production code in `apps/worker/src/` was modified.
- **Verification Script Added**: An independent test harness `scripts/challenger-assertiveness-test.ts` was added solely to provide verifiable, executable proof of each defect.
- **TDD Context Considered**: The 68 initial failing tests across the 72-test suite correctly reflect that Phase 3 endpoints have not yet been developed. The findings in this report strictly address the *assertiveness and sensitivity* of the test cases when those endpoints are implemented.

---

## 4. Conclusion & Actionable Recommendations

**Verdict**: **`REQUEST_CHANGES`**

### Required Action Items for E2E Test Writers / Implementers:

1. **Enforce Shared Zod Schema Validation**:
   - In `apps/worker/test/e2e/tier1-features.test.ts`, `tier3-combinations.test.ts`, and `tier4-scenarios.test.ts`:
   - Import `DashboardResponseSchema`, `CourseContentsResponseSchema`, `CourseGradesResponseSchema`, `EnhancedHealthResponseSchema`, `ApiErrorResponseSchema` from `@better-moodle/shared`.
   - Validate response bodies using `.parse()` (e.g. `const body = DashboardResponseSchema.parse(await res.json());`).
2. **Fix Tautological `T2-GRAD-04`**:
   - Add JSON error structure assertions:
     ```ts
     expect(res.headers.get('content-type')).toContain('application/json');
     const body = (await res.json()) as any;
     expect(body.error).toBeDefined();
     ```
3. **Fix Mutation Survival in `T1-DASH-05`**:
   - Change `expect(body.recent_activity.length).toBeLessThanOrEqual(15);` to `expect(body.recent_activity.length).toBe(15);`.
4. **Fix `Number.isNaN()` Check in `T2-HLTH-05`**:
   - Change `expect(Number.isNaN(body.subrequests.avg_recent)).toBe(false);` to:
     ```ts
     expect(typeof body.subrequests.avg_recent).toBe('number');
     expect(body.subrequests.avg_recent).toBe(0);
     ```
5. **Tighten Permissive Status Sets in `T2-HLTH-01` and `T2-CONT-05`**:
   - Require exact expected behavior (e.g. 200 with fallback data or explicit RFC 7807 / standard JSON error with proper status), not `[200, 500]`.
6. **Add Precondition in `T3-XFEAT-05`**:
   - Query `/api/dashboard` before deletion and assert `grade_arch_quiz` is present in `current_grades` prior to applying the tombstone.
7. **Remove Wall-Clock Timing Assertion in `T2-DASH-04`**:
   - Remove `expect(elapsed).toBeLessThan(100)` from functional E2E tests to prevent flaky CI failures.

---

## 5. Verification Method

To independently verify all observations and empirical claims in this report, execute:

1. **Run the Challenger Empirical Test Harness**:
   ```powershell
   bun test ./scripts/challenger-assertiveness-test.ts
   ```
   *Expected Result*: 5 passed, 0 failed. Conclusively proves all 5 defect scenarios.

2. **Verify `T2-GRAD-04` False Positive Pass on Unmounted Route**:
   ```powershell
   bun test apps/worker/test/e2e/tier2-boundaries.test.ts -t "T2-GRAD-04"
   ```
   *Expected Result*: 1 pass, 0 fail (passes despite route not existing).

3. **Verify Absence of Zod Schema Imports in Test Files**:
   ```powershell
   powershell -Command "Get-ChildItem -Path apps/worker/test -Recurse -Filter *.ts | Select-String -Pattern 'DashboardResponseSchema|CourseContentsResponseSchema|CourseGradesResponseSchema|EnhancedHealthResponseSchema'"
   ```
   *Expected Result*: 0 matches across all test files.

4. **Monorepo Build and Typecheck Verification**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   bun run build:web
   ```
   *Expected Result*: Both commands exit with code 0.
