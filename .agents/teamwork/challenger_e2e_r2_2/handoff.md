# Empirical Verification & Defect Remediation Challenge Report (Challenger 2 — Iteration 2)

**Track**: Phase 3 BFF Read API & Secure Proxy E2E Testing  
**Auditor/Challenger**: Challenger 2 (Critic / Specialist)  
**Date**: 2026-11-12T23:06:00Z  
**Verdict**: **`APPROVE`**

---

## 1. Observation

All 7 empirical defect observations raised in Iteration 1 (`.agents/teamwork/challenger_e2e_2/handoff.md`) were systematically evaluated against the revised test suite.

### Obs 1: 100% Shared Zod Schema Validation Enforced Across All Test Suites
- **Direct Search for `as any`**:
  ```powershell
  Get-ChildItem -Path apps\worker\test\e2e\*.ts | Select-String -Pattern "as any"
  ```
  Result: **0 occurrences** across `tier1-features.test.ts`, `tier2-boundaries.test.ts`, `tier3-combinations.test.ts`, and `tier4-scenarios.test.ts`.
- **Direct Search for Schema Validation**:
  ```powershell
  Get-ChildItem -Path apps\worker\test\e2e\*.ts | Select-String -Pattern "Schema"
  ```
  Result: Every test asserting on an endpoint response body now parses the payload directly with Zod schemas imported from `@better-moodle/shared`:
  - `DashboardResponseSchema`: e.g. `tier1-features.test.ts:85, 147, 184, 205, 231, 269`, `tier2-boundaries.test.ts:43, 63, 85, 110`, `tier3-combinations.test.ts:49, 170, 211, 224`, `tier4-scenarios.test.ts:93, 227`.
  - `CourseContentsResponseSchema`: e.g. `tier1-features.test.ts:317, 334, 348, 387, 409`, `tier2-boundaries.test.ts:203`, `tier3-combinations.test.ts:101`, `tier4-scenarios.test.ts:100, 231`.
  - `CourseGradesResponseSchema`: e.g. `tier1-features.test.ts:452, 467, 496, 527, 548, 581`, `tier2-boundaries.test.ts:288`, `tier3-combinations.test.ts:59, 205, 231`, `tier4-scenarios.test.ts:162, 169, 176, 235`.
  - `EnhancedHealthResponseSchema`: e.g. `tier1-features.test.ts:613, 640, 658, 675, 700, 717`, `tier2-boundaries.test.ts:317, 349, 366, 388, 406`, `tier3-combinations.test.ts:132, 142, 149, 248`, `tier4-scenarios.test.ts:88, 239, 337, 351`.
  - `ApiErrorResponseSchema`: e.g. `tier2-boundaries.test.ts:126, 152, 183, 226, 254, 333, 421`.
  - `SyncedItemSchema.array()`: `tier3-combinations.test.ts:181`.
- **Empirical Execution Result (`apps/worker/test/e2e.test.ts`)**:
  Running the master E2E test suite against the Phase 2 baseline `/api/health` route causes `T4-SCEN-01` and `T4-SCEN-06` to immediately fail with descriptive `ZodError` violations highlighting missing Phase 3 fields:
  ```
  ZodError: [
    { "code": "invalid_type", "expected": "array", "received": "undefined", "path": ["recent_runs"] },
    { "code": "invalid_type", "expected": "number", "received": "undefined", "path": ["failure_rate"] },
    { "code": "invalid_type", "expected": "object", "received": "undefined", "path": ["subrequests"] }
  ]
  ```
  Malformed and non-compliant payloads are now strictly caught and rejected.

### Obs 2: Elimination of Tautological Pass in `T2-GRAD-04` Against Unmounted Route
- **Code Inspection (`apps/worker/test/e2e/tier2-boundaries.test.ts:249-258`)**:
  ```ts
  test('T2-GRAD-04: Non-Existent Course ID returns 404 Not Found', async () => {
    const res = await client.request('/api/courses/88888/grades');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = ApiErrorResponseSchema.parse(await res.json());
    expect(body.error).toBeDefined();

    fetchGuard.assertZeroCalls();
  });
  ```
- **Direct Execution Output**:
  ```powershell
  bun test apps/worker/test/e2e/tier2-boundaries.test.ts -t "T2-GRAD-04"
  ```
  Result:
  ```
  (fail) Tier 2: Boundary & Corner Cases > Feature 3 > T2-GRAD-04: Non-Existent Course ID returns 404 Not Found
  error: expect(received).toContain(expected)
  Expected to contain: "application/json"
  Received: "text/plain; charset=UTF-8"
  0 pass, 1 fail
  ```
- **Factual Assessment**: The test no longer passes unconditionally on Hono's default text/plain 404. It strictly enforces JSON content type and `ApiErrorResponseSchema` payload structure.

### Obs 3: Mutation Killed in `T1-DASH-05` (Empty Array & Recency Ordering)
- **Code Inspection (`apps/worker/test/e2e/tier1-features.test.ts:231-234`)**:
  ```ts
  const body = DashboardResponseSchema.parse(await res.json());
  expect(body.recent_activity.length).toBe(15);
  expect(body.recent_activity[0].item_key).toBe('item_20');
  ```
- **Factual Assessment**:
  The permissive `toBeLessThanOrEqual(15)` was replaced with exact `expect(body.recent_activity.length).toBe(15)` and explicit verification that the first item is `item_20`. An empty array mutant returns length 0, triggering an immediate failure (`0 !== 15`).

### Obs 4: Fix of `Number.isNaN()` Check in `T2-HLTH-05`
- **Code Inspection (`apps/worker/test/e2e/tier2-boundaries.test.ts:388-392`)**:
  ```ts
  const body = EnhancedHealthResponseSchema.parse(await res.json());
  expect(typeof body.subrequests.avg_recent).toBe('number');
  expect(Number.isNaN(body.subrequests.avg_recent)).toBe(false);
  expect(body.subrequests.avg_recent).toBe(0);
  ```
- **Factual Assessment**:
  The check is now immune to the `Number.isNaN(undefined) === false` bypass. `typeof === 'number'`, schema validation, and exact value `0` guarantee that missing or uncalculated metrics are caught.

### Obs 5: 500 Crashes Rejected in `T2-HLTH-01` and `T2-CONT-05`
- **Code Inspection (`apps/worker/test/e2e/tier2-boundaries.test.ts:200-205, 314-319`)**:
  - `T2-CONT-05`:
    ```ts
    const res = await client.request('/api/courses/301/contents');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = CourseContentsResponseSchema.parse(await res.json());
    expect(body.course_id).toBe(301);
    expect(body.sections).toEqual([]);
    ```
  - `T2-HLTH-01`:
    ```ts
    const res = await client.request('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = EnhancedHealthResponseSchema.parse(await res.json());
    expect(['degraded', 'error']).toContain(body.status);
    expect(body.sync_state == null).toBe(true);
    ```
- **Factual Assessment**:
  The permissive `[200, 500]` array has been completely eliminated. Both tests require deterministic HTTP 200 responses and schema conformance, rejecting unhandled 500 runtime exceptions.

### Obs 6: Dashboard Baseline Verified Before Tombstone Cascade in `T3-XFEAT-05`
- **Code Inspection (`apps/worker/test/e2e/tier3-combinations.test.ts:203-228`)**:
  ```ts
  // Verify item is initially visible across both read views
  const resBefore = await client.request('/api/courses/103/grades');
  expect(resBefore.status).toBe(200);
  const dataBefore = CourseGradesResponseSchema.parse(await resBefore.json());
  expect(dataBefore.grades.length).toBe(1);
  expect(dataBefore.grades[0].item_key).toBe('grade_arch_quiz');

  const dashResBefore = await client.request('/api/dashboard');
  expect(dashResBefore.status).toBe(200);
  const dashDataBefore = DashboardResponseSchema.parse(await dashResBefore.json());
  expect(
    dashDataBefore.current_grades.some((g) => g.item_key === 'grade_arch_quiz')
  ).toBe(true);

  // Apply tombstone
  ...
  // Query /dashboard and /courses/103/grades post-tombstone
  ...
  expect(
    dashData.current_grades.some((g) => g.item_key === 'grade_arch_quiz')
  ).toBe(false);
  ```
- **Factual Assessment**:
  `T3-XFEAT-05` now queries `/api/dashboard` and confirms the presence of `grade_arch_quiz` before applying the tombstone. Post-tombstone verification now accurately tests record removal rather than initial absence.

### Obs 7: Flaky Wall-Clock Check Removed from `T2-DASH-04`
- **Code Inspection (`apps/worker/test/e2e/tier2-boundaries.test.ts:92-114`)**:
  - `performance.now()` and `expect(elapsed).toBeLessThan(100)` have been completely removed.
  - Replaced with functional data verification: `expect(body.recent_activity.length).toBe(15);`.
- **Factual Assessment**:
  Eliminates potential non-deterministic failures on CI/loaded runners while retaining functional assertion against high-volume dataset handling.

### Obs 8: Test Execution and Typecheck Results
1. **Challenger Assertiveness Verification (`scripts/challenger-assertiveness-test.ts`)**:
   ```
   5 pass, 0 fail (18 expect calls, 130ms)
   ```
2. **Master E2E Suite Discovery and Baseline (`apps/worker/test/e2e.test.ts`)**:
   ```
   72 tests discovered: 2 passed (unsupported method & D1 failure on Phase 2 baseline), 70 failed awaiting Phase 3 endpoint implementation.
   ```
3. **TypeScript Typecheck (`apps/worker`)**:
   ```
   bunx tsc --noEmit -p apps/worker/tsconfig.json -> 0 errors.
   ```
4. **Web Build (`apps/web`)**:
   ```
   bun run build:web -> 0 errors (built in 7.22s).
   ```
5. **Shared Schemas Test Suite (`packages/shared/test`)**:
   ```
   201 pass, 0 fail (280 expect calls, 206ms).
   ```

---

## 2. Logic Chain

1. **Premise 1 (Contract & Sensitivity Standard)**:
   Per `ORIGINAL_REQUEST.md` (R3, Acceptance Criteria) and Challenger 2's Iteration 1 report, the Phase 3 E2E test suite must enforce 100% schema validation using shared Zod schemas, eliminate all permissive assertion shortcuts (`as any`, `[200, 500]`, `toBeLessThanOrEqual(15)`, `Number.isNaN(undefined)`), and prevent false-positive passes on unmounted routes.
2. **Step 1 (Schema Validation Verification)**:
   By Obs 1, 0 instances of `as any` exist in `apps/worker/test/e2e/*.ts`. Every response body is parsed with the corresponding Zod schema. Non-enhanced payloads against the health route immediately fail with `ZodError`, proving schema validation is actively defending contract boundaries.
3. **Step 2 (Tautology Elimination)**:
   By Obs 2, `T2-GRAD-04` fails when executed against the unmounted `/api/courses/:id/grades` route because the default handler returns `text/plain` rather than `application/json` conforming to `ApiErrorResponseSchema`. The tautology is completely eliminated.
4. **Step 3 (Mutation Sensitivity Verification)**:
   By Obs 3, `T1-DASH-05` asserts `length === 15` and `item_20`, preventing empty array mutation survival.
5. **Step 4 (Type & Value Guard Verification)**:
   By Obs 4, `T2-HLTH-05` enforces `typeof === 'number'`, not NaN, and exact `0`, closing the undefined metric escape.
6. **Step 5 (Crash Rejection Verification)**:
   By Obs 5, `T2-HLTH-01` and `T2-CONT-05` strictly require HTTP 200 and schema validation, rejecting unhandled 500 crashes.
7. **Step 6 (Precondition Integrity Verification)**:
   By Obs 6, `T3-XFEAT-05` validates that `grade_arch_quiz` is present in `/api/dashboard` before tombstoning, ensuring the cascade assertion is valid.
8. **Step 7 (Determinism Verification)**:
   By Obs 7, all wall-clock timing checks have been removed from functional E2E tests, ensuring deterministic CI execution.
9. **Deduction (Conclusion)**:
   All 7 findings identified in Iteration 1 have been completely and empirically resolved. The test suite is now robust, defect-sensitive, and approved for Phase 3 implementation.

---

## 3. Caveats

- **No Implementation Code Modified**: As required by the challenger/review-only archetype, no production code in `apps/worker/src/` was modified.
- **TDD Test Suite State**: The 70 failing tests in `apps/worker/test/e2e.test.ts` correctly represent unimplemented Phase 3 routes. This is the expected and intended TDD state prior to the implementation track.

---

## 4. Conclusion

**Verdict**: **`APPROVE`**

The E2E test suite across Tiers 1–4 meets all architectural, type, schema, and defect sensitivity standards. The test suite is fully prepared to serve as the regression and acceptance gate for Phase 3 development.

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. **Verify Complete Absence of `as any` in E2E Tests**:
   ```powershell
   Get-ChildItem -Path apps\worker\test\e2e\*.ts | Select-String -Pattern "as any"
   ```
   *Expected Result*: 0 matches.

2. **Verify `T2-GRAD-04` Fails on Unmounted Route**:
   ```powershell
   bun test apps/worker/test/e2e/tier2-boundaries.test.ts -t "T2-GRAD-04"
   ```
   *Expected Result*: 0 pass, 1 fail (Expected "application/json", received "text/plain; charset=UTF-8").

3. **Run Challenger Assertiveness Test Harness**:
   ```powershell
   bun test ./scripts/challenger-assertiveness-test.ts
   ```
   *Expected Result*: 5 pass, 0 fail.

4. **Verify TypeScript Compilation**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected Result*: Exit code 0, 0 errors.

5. **Verify Web App Build**:
   ```powershell
   bun run build:web
   ```
   *Expected Result*: Exit code 0, build succeeds.

6. **Run Master E2E Suite**:
   ```powershell
   bun test apps/worker/test/e2e.test.ts
   ```
   *Expected Result*: 72 tests discovered, 2 pass baseline, 70 fail cleanly with descriptive HTTP status / Zod schema errors.
