# Handoff Report: Zod Schema Integration for E2E Test Suite (Iteration 2)

**Track**: Phase 3 BFF Read API & Secure Proxy E2E Testing  
**Agent**: Explorer 1 (Iteration 2) — Investigator / Synthesizer  
**State Folder**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_r2_1`  
**Date**: 2026-11-12T22:50:00Z  

---

## 1. Observation

### Obs 1: Schema Availability and Resolution from Workspace
- **File**: `packages/shared/src/index.ts`
- **Schemas Exported**:
  - `DashboardResponseSchema` (lines 130–135)
  - `CourseContentsResponseSchema` (lines 181–185)
  - `CourseGradesResponseSchema` (lines 215–218)
  - `EnhancedHealthResponseSchema` (lines 233–242)
  - `FileProxyQuerySchema` (lines 249–282)
  - `ApiErrorResponseSchema` (lines 289–294)
  - `SyncedItemSchema` (lines 25–40)
- **Import Resolution**:
  Running Bun resolution from `apps/worker/test/e2e/tier1-features.test.ts`:
  ```powershell
  bun -e "import { resolveSync } from 'bun'; console.log(resolveSync('@better-moodle/shared', 'C:/Users/corte/Downloads/betterMoodle/apps/worker/test/e2e/tier1-features.test.ts'));"
  ```
  Result:
  ```
  C:\Users\corte\Downloads\betterMoodle\packages\shared\src\index.ts
  ```
  Direct bare import `import { ... } from '@better-moodle/shared';` works seamlessly in all test files inside `apps/worker/test/e2e/`.

### Obs 2: Inventory of `as any` Across Target E2E Test Files
A PowerShell regex scan `Select-String -Path "apps/worker/test/e2e/*.ts" -Pattern "as any"` identified 42 instances of `as any` across the primary test files (and 15 in Tier 2):

| File | Count | Line Numbers | Target Route / Context |
|---|---|---|---|
| `tier1-features.test.ts` | **23** | 79, 141, 178, 199, 225, 262, 310, 327, 341, 380, 401, 444, 459, 488, 519, 540, 573, 605, 632, 650, 667, 692, 709 | `GET /api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health` |
| `tier3-combinations.test.ts` | **12** | 42, 52, 94, 124, 134, 141, 162, 172, 195, 205, 211, 228 | Cross-endpoint integration flows & tombstone cascades |
| `tier4-scenarios.test.ts` | **7** | 86, 93, 154, 161, 168, 324, 337 | End-to-end student scenarios & resilience lifecycle |
| *(Bonus)* `tier2-boundaries.test.ts` | **15** | 36, 56, 78, 107, 123, 149, 180, 219, 277, 317, 333, 350, 372, 388, 403 | Boundaries, errors, and empty/edge state payloads |

### Obs 3: Verification of Zod Validation Sensitivity
Executing empirical schema tests against valid and invalid payloads:
```powershell
bun -e "
import { DashboardResponseSchema, CourseContentsResponseSchema, CourseGradesResponseSchema, EnhancedHealthResponseSchema, ApiErrorResponseSchema } from '@better-moodle/shared';
// Valid mock passes
DashboardResponseSchema.parse({
  courses: [{ id: 10, shortname: 'CS101', fullname: 'Prog', refreshed_at: 100 }],
  upcoming_assignments: [{ item_key: 'a1', course_id: 10, title: 'T1', due_date: 200, timemodified: 100 }],
  recent_activity: [{ item_key: 'r1', course_id: 10, item_type: 'announcement', title: 'A1', timemodified: 100 }],
  current_grades: [{ item_key: 'g1', course_id: 10, title: 'G1', grade_num: 100, timemodified: 100 }]
});
// Corrupted payload throws ZodError
DashboardResponseSchema.parse({ courses: [{ id: '10' }] });
" --cwd apps/worker
```
- Valid payload: `true` (parses without throwing, returns fully typed TypeScript object).
- Malformed payload: throws `ZodError` immediately, preventing schema defects from escaping undetected.

### Obs 4: Monorepo Typecheck & Build Baseline
- `bunx tsc --noEmit -p apps/worker/tsconfig.json` exits with code 0.
- `bun run build:web` succeeds in 6.89s with code 0.

---

## 2. Logic Chain

1. **Premise 1 (Contract Requirement)**: `TEST_INFRA.md` (§1.1, §6) and `ORIGINAL_REQUEST.md` (R3, Criteria) mandate that response payloads for all Phase 3 endpoints are typed and validated with Zod schemas in `@better-moodle/shared`.
2. **Step 1 (Root Cause of Defect Escape)**: By Obs 2, every response in `tier1-features.test.ts`, `tier3-combinations.test.ts`, and `tier4-scenarios.test.ts` currently casts `(await res.json()) as any`. In JavaScript/TypeScript runtime, `as any` performs zero validation, allowing payloads with missing fields, wrong types, or malformed structures to pass test suites undetected (as proven by Challenger 2's empirical harness).
3. **Step 2 (Import Feasibility)**: By Obs 1, `@better-moodle/shared` is a workspace package linked in `apps/worker/node_modules/@better-moodle/shared`. Bun resolves `@better-moodle/shared` cleanly without relative path hacks.
4. **Step 3 (Schema Match & Type Inference)**: By Obs 3, parsing responses with `Schema.parse(...)` replaces arbitrary unchecked object shapes with validated, type-safe structures. In addition, when parsed with Zod schemas, helper variables such as `(a: any) => a.item_key` automatically become `(a) => a.item_key` with full TypeScript intellisense.
5. **Deduction (Action Plan)**:
   Replacing all `as any` with `Schema.parse(await res.json())` and addressing Challenger 2's assertion tightness observations (e.g. `toBe(15)` in `T1-DASH-05`, baseline check in `T3-XFEAT-05`, and error schema validation in `T2-GRAD-04`) will achieve 100% schema enforcement and kill all identified mutant escapes.

---

## 3. Caveats

- **Read-Only Investigation**: In compliance with the Teamwork explorer archetype, no test files (`tier1-features.test.ts`, etc.) or production files were modified directly during this investigation.
- **TDD Failing Tests Expected**: When Phase 3 endpoints have not yet been implemented in `apps/worker/src/index.ts`, `Schema.parse(await res.json())` will naturally throw `SyntaxError: Unexpected token` or `ZodError` when unmounted routes return 404 HTML/text. This is normal and expected for a TDD test suite; when routes are implemented, they must conform strictly to the schemas to pass.

---

## 4. Conclusion & Concrete Code Recommendations

### Summary of Changes by File

#### File 1: `apps/worker/test/e2e/tier1-features.test.ts`

**Imports to Add at Top**:
```ts
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
} from '@better-moodle/shared';
```

**Replacements by Test**:

1. **Feature 1: GET /api/dashboard**
   - **T1-DASH-01** (Line 79):
     ```ts
     // Replace:
     const body = (await res.json()) as any;
     // With:
     const body = DashboardResponseSchema.parse(await res.json());
     ```
   - **T1-DASH-02** (Lines 141–146):
     ```ts
     // Replace:
     const body = (await res.json()) as any;
     const assignmentKeys = body.upcoming_assignments.map((a: any) => a.item_key);
     ...
     const gradeKeys = body.current_grades.map((g: any) => g.item_key);
     // With:
     const body = DashboardResponseSchema.parse(await res.json());
     const assignmentKeys = body.upcoming_assignments.map((a) => a.item_key);
     ...
     const gradeKeys = body.current_grades.map((g) => g.item_key);
     ```
   - **T1-DASH-03** (Lines 178–179):
     ```ts
     // Replace:
     const body = (await res.json()) as any;
     const keys = body.upcoming_assignments.map((a: any) => a.item_key);
     // With:
     const body = DashboardResponseSchema.parse(await res.json());
     const keys = body.upcoming_assignments.map((a) => a.item_key);
     ```
   - **T1-DASH-04** (Line 199):
     ```ts
     // Replace:
     const body = (await res.json()) as any;
     // With:
     const body = DashboardResponseSchema.parse(await res.json());
     ```
   - **T1-DASH-05** (Lines 225–226 — incorporating Challenger Obs 3 fix):
     ```ts
     // Replace:
     const body = (await res.json()) as any;
     expect(body.recent_activity.length).toBeLessThanOrEqual(15);
     // With:
     const body = DashboardResponseSchema.parse(await res.json());
     expect(body.recent_activity.length).toBe(15);
     ```
   - **T1-DASH-06** (Lines 262–263):
     ```ts
     // Replace:
     const body = (await res.json()) as any;
     const returnedStatuses = body.upcoming_assignments.map((a: any) => a.submission_status);
     // With:
     const body = DashboardResponseSchema.parse(await res.json());
     const returnedStatuses = body.upcoming_assignments.map((a) => a.submission_status);
     ```

2. **Feature 2: GET /api/courses/:id/contents**
   - **T1-CONT-01** (Line 310):
     ```ts
     const body = CourseContentsResponseSchema.parse(await res.json());
     ```
   - **T1-CONT-02** (Line 327):
     ```ts
     const body = CourseContentsResponseSchema.parse(await res.json());
     ```
   - **T1-CONT-03** (Line 341):
     ```ts
     const body = CourseContentsResponseSchema.parse(await res.json());
     ```
   - **T1-CONT-04** (Lines 380–381):
     ```ts
     const body = CourseContentsResponseSchema.parse(await res.json());
     expect(body.sections[0].modules[0].contents).toBeDefined();
     const content = body.sections[0].modules[0].contents![0];
     ```
   - **T1-CONT-05** (Line 401):
     ```ts
     const body = CourseContentsResponseSchema.parse(await res.json());
     ```

3. **Feature 3: GET /api/courses/:id/grades**
   - **T1-GRAD-01** (Line 444):
     ```ts
     const body = CourseGradesResponseSchema.parse(await res.json());
     ```
   - **T1-GRAD-02** (Line 459):
     ```ts
     const body = CourseGradesResponseSchema.parse(await res.json());
     ```
   - **T1-GRAD-03** (Line 488):
     ```ts
     const body = CourseGradesResponseSchema.parse(await res.json());
     ```
   - **T1-GRAD-04** (Line 519):
     ```ts
     const body = CourseGradesResponseSchema.parse(await res.json());
     ```
   - **T1-GRAD-05** (Line 540):
     ```ts
     const body = CourseGradesResponseSchema.parse(await res.json());
     ```
   - **T1-GRAD-06** (Line 573):
     ```ts
     const body = CourseGradesResponseSchema.parse(await res.json());
     ```

4. **Feature 4: GET /api/health**
   - **T1-HLTH-01** (Line 605):
     ```ts
     const body = EnhancedHealthResponseSchema.parse(await res.json());
     ```
   - **T1-HLTH-02** (Line 632):
     ```ts
     const body = EnhancedHealthResponseSchema.parse(await res.json());
     ```
   - **T1-HLTH-03** (Line 650):
     ```ts
     const body = EnhancedHealthResponseSchema.parse(await res.json());
     ```
   - **T1-HLTH-04** (Line 667):
     ```ts
     const body = EnhancedHealthResponseSchema.parse(await res.json());
     ```
   - **T1-HLTH-05** (Line 692):
     ```ts
     const body = EnhancedHealthResponseSchema.parse(await res.json());
     ```
   - **T1-HLTH-06** (Line 709):
     ```ts
     const body = EnhancedHealthResponseSchema.parse(await res.json());
     ```

---

#### File 2: `apps/worker/test/e2e/tier3-combinations.test.ts`

**Imports to Add at Top**:
```ts
import { z } from 'zod';
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
  SyncedItemSchema,
} from '@better-moodle/shared';
```

**Replacements by Test**:

- **T3-XFEAT-01** (Lines 42–55):
  ```ts
  // 1. Query dashboard
  const dashRes = await client.request('/api/dashboard');
  expect(dashRes.status).toBe(200);
  const dashData = DashboardResponseSchema.parse(await dashRes.json());
  const dashGrade = dashData.current_grades.find(
    (g) => g.item_key === 'grade_cs101_midterm'
  );
  expect(dashGrade).toBeDefined();
  expect(dashGrade!.grade_num).toBe(92.0);

  // 2. Query course grades
  const gradesRes = await client.request('/api/courses/101/grades');
  expect(gradesRes.status).toBe(200);
  const gradesData = CourseGradesResponseSchema.parse(await gradesRes.json());
  const courseGrade = gradesData.grades.find(
    (g) => g.item_key === 'grade_cs101_midterm'
  );
  expect(courseGrade).toBeDefined();
  expect(courseGrade!.grade_num).toBe(92.0);
  ```

- **T3-XFEAT-02** (Lines 94–96):
  ```ts
  const contentsRes = await client.request('/api/courses/101/contents');
  expect(contentsRes.status).toBe(200);
  const contentsData = CourseContentsResponseSchema.parse(await contentsRes.json());
  expect(contentsData.sections[0].modules[0].contents).toBeDefined();
  const rawUrl = contentsData.sections[0].modules[0].contents![0].fileurl;
  expect(rawUrl).toBe(targetFileUrl);
  ```

- **T3-XFEAT-03** (Lines 124, 134, 141):
  ```ts
  const res1 = await client.request('/api/health');
  expect(res1.status).toBe(200);
  const body1 = EnhancedHealthResponseSchema.parse(await res1.json());
  expect(body1.status).toBe('ok');
  expect(body1.failure_rate).toBe(0.0);
  ...
  const res2 = await client.request('/api/health');
  expect(res2.status).toBe(200);
  const body2 = EnhancedHealthResponseSchema.parse(await res2.json());
  expect(body2.status).toBe('degraded');
  expect(body2.failure_rate).toBe(0.5);
  ...
  const res3 = await client.request('/api/health');
  expect(res3.status).toBe(200);
  const body3 = EnhancedHealthResponseSchema.parse(await res3.json());
  expect(body3.status).toBe('circuit_open');
  ```

- **T3-XFEAT-04** (Lines 162–175):
  ```ts
  // 1. Dashboard upcoming assignments
  const dashRes = await client.request('/api/dashboard');
  expect(dashRes.status).toBe(200);
  const dashData = DashboardResponseSchema.parse(await dashRes.json());
  const dashAssign = dashData.upcoming_assignments.find(
    (a) => a.item_key === 'assign_project_v1'
  );
  expect(dashAssign).toBeDefined();
  expect(dashAssign!.title).toBe('Project V1 Prototype');

  // 2. Items filtered by assignment
  const itemsRes = await client.request('/api/items?type=assignment');
  expect(itemsRes.status).toBe(200);
  const itemsData = z.object({ items: z.array(SyncedItemSchema) }).parse(await itemsRes.json());
  const itemsAssign = itemsData.items.find(
    (a) => a.item_key === 'assign_project_v1'
  );
  expect(itemsAssign).toBeDefined();
  expect(itemsAssign!.title).toBe('Project V1 Prototype');
  ```

- **T3-XFEAT-05** (Lines 194–213 — incorporating Challenger Obs 6 baseline check):
  ```ts
  // Verify item is initially visible in BOTH grades AND dashboard before deletion
  const resBefore = await client.request('/api/courses/103/grades');
  expect(resBefore.status).toBe(200);
  const dataBefore = CourseGradesResponseSchema.parse(await resBefore.json());
  expect(dataBefore.grades.length).toBe(1);

  const dashResBefore = await client.request('/api/dashboard');
  expect(dashResBefore.status).toBe(200);
  const dashDataBefore = DashboardResponseSchema.parse(await dashResBefore.json());
  expect(dashDataBefore.current_grades.some((g) => g.item_key === 'grade_arch_quiz')).toBe(true);

  // Apply tombstone
  client.db.sqlite
    .query(`UPDATE synced_items SET deleted_at = ? WHERE item_key = ?`)
    .run(now, 'grade_arch_quiz');

  // Query /dashboard and /courses/103/grades post-deletion
  const dashRes = await client.request('/api/dashboard');
  expect(dashRes.status).toBe(200);
  const dashData = DashboardResponseSchema.parse(await dashRes.json());
  expect(
    dashData.current_grades.some((g) => g.item_key === 'grade_arch_quiz')
  ).toBe(false);

  const gradesRes = await client.request('/api/courses/103/grades');
  expect(gradesRes.status).toBe(200);
  const gradesData = CourseGradesResponseSchema.parse(await gradesRes.json());
  expect(gradesData.grades.length).toBe(0);
  ```

- **T3-XFEAT-06** (Lines 228–232):
  ```ts
  const res = await client.request('/api/health');
  expect(res.status).toBe(200);

  const body = EnhancedHealthResponseSchema.parse(await res.json());
  expect(body.subrequests.last_used).toBe(45);
  expect(body.subrequests.max_recent).toBe(45);
  expect(body.subrequests.avg_recent).toBeCloseTo(42.33, 1);
  expect(body.subrequests.max_budget).toBe(45);
  ```

---

#### File 3: `apps/worker/test/e2e/tier4-scenarios.test.ts`

**Imports to Add at Top**:
```ts
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
} from '@better-moodle/shared';
```

**Replacements by Test**:

- **T4-SCEN-01** (Lines 80–96):
  ```ts
  // Step 1: App checks system health
  const healthRes = await client.request('/api/health');
  expect(healthRes.status).toBe(200);
  EnhancedHealthResponseSchema.parse(await healthRes.json());

  // Step 2: App loads main student dashboard
  const dashRes = await client.request('/api/dashboard');
  expect(dashRes.status).toBe(200);
  const dashData = DashboardResponseSchema.parse(await dashRes.json());
  expect(dashData.courses.length).toBe(3);
  expect(dashData.upcoming_assignments.length).toBe(2);

  // Step 3: Student navigates into Course 101 contents
  const contentsRes = await client.request('/api/courses/101/contents');
  expect(contentsRes.status).toBe(200);
  const contentsData = CourseContentsResponseSchema.parse(await contentsRes.json());
  expect(contentsData.sections[0].modules[0].contents).toBeDefined();
  const file = contentsData.sections[0].modules[0].contents![0];
  expect(file.filename).toBe('diapositivas_tema2.pdf');
  ```

- **T4-SCEN-02** (Lines 154–169):
  ```ts
  // 1. Audit Course 101
  const res101 = await client.request('/api/courses/101/grades');
  expect(res101.status).toBe(200);
  const data101 = CourseGradesResponseSchema.parse(await res101.json());
  expect(data101.grades.length).toBe(2);
  expect(data101.grades.map((g) => g.grade_num)).toEqual([88.5, 95.0]);

  // 2. Audit Course 102
  const res102 = await client.request('/api/courses/102/grades');
  expect(res102.status).toBe(200);
  const data102 = CourseGradesResponseSchema.parse(await res102.json());
  expect(data102.grades.length).toBe(1);
  expect(data102.grades[0].grade_num).toBe(100.0);

  // 3. Audit Course 103 (empty)
  const res103 = await client.request('/api/courses/103/grades');
  expect(res103.status).toBe(200);
  const data103 = CourseGradesResponseSchema.parse(await res103.json());
  expect(data103.grades).toEqual([]);
  ```

- **T4-SCEN-04** (Lines 217–228):
  ```ts
  const dashRes = await client.request('/api/dashboard');
  expect(dashRes.status).toBe(200);
  DashboardResponseSchema.parse(await dashRes.json());

  const contentsRes = await client.request('/api/courses/101/contents');
  expect(contentsRes.status).toBe(200);
  CourseContentsResponseSchema.parse(await contentsRes.json());

  const gradesRes = await client.request('/api/courses/101/grades');
  expect(gradesRes.status).toBe(200);
  CourseGradesResponseSchema.parse(await gradesRes.json());

  const healthRes = await client.request('/api/health');
  expect(healthRes.status).toBe(200);
  EnhancedHealthResponseSchema.parse(await healthRes.json());
  ```

- **T4-SCEN-06** (Lines 324–340):
  ```ts
  const h1 = await client.request('/api/health');
  expect(h1.status).toBe(200);
  const b1 = EnhancedHealthResponseSchema.parse(await h1.json());
  expect(b1.status).toBe('circuit_open');
  expect(b1.failure_rate).toBe(1.0);

  // 2. Successful sync run executes and recovers state
  seedSyncRun(client.db, { started_at: now, status: 'ok', subrequests_used: 15 });
  seedSyncState(client.db, {
    consecutive_failures: 0,
    circuit_open_until: 0,
    last_success_at: now,
  });

  const h2 = await client.request('/api/health');
  expect(h2.status).toBe(200);
  const b2 = EnhancedHealthResponseSchema.parse(await h2.json());
  expect(b2.status).toBe('ok');
  expect(b2.failure_rate).toBeLessThan(1.0);
  expect(b2.recent_runs[0].status).toBe('ok');
  ```

---

#### Bonus File: `apps/worker/test/e2e/tier2-boundaries.test.ts`
*(To address Challenger 2 Obs 2, 4, 5, 7 and eliminate remaining `as any`)*

**Imports**:
```ts
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
  ApiErrorResponseSchema,
} from '@better-moodle/shared';
```

**Key Recommended Updates**:
1. In `T2-DASH-01`, `T2-DASH-02`, `T2-DASH-03`, `T2-DASH-04`: Replace `(await res.json()) as any` with `DashboardResponseSchema.parse(await res.json())`.
2. In `T2-DASH-04`: Remove flaky `expect(elapsed).toBeLessThan(100)` (Obs 7).
3. In `T2-DASH-05`: `const body = ApiErrorResponseSchema.parse(await res.json()); expect(body.error).toBeDefined();`.
4. In `T2-CONT-01`, `T2-CONT-04`: `const body = ApiErrorResponseSchema.parse(await res.json()); expect(body.error).toBeDefined();`.
5. In `T2-GRAD-01`: `const body = ApiErrorResponseSchema.parse(await res.json()); expect(body.error).toBeDefined();`.
6. In `T2-GRAD-04` (Fixing Obs 2 tautological false-positive on unmounted route):
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
7. In `T2-GRAD-05`: `const body = CourseGradesResponseSchema.parse(await res.json());`.
8. In `T2-HLTH-02`: `const body = ApiErrorResponseSchema.parse(await res.json()); expect(body.status).toBe('error');`.
9. In `T2-HLTH-03`, `T2-HLTH-04`, `T2-HLTH-06`: Parse with `EnhancedHealthResponseSchema.parse(await res.json())`.
10. In `T2-HLTH-05` (Fixing Obs 4 `Number.isNaN()` bypass):
    ```ts
    const res = await client.request('/api/health');
    expect(res.status).toBe(200);

    const body = EnhancedHealthResponseSchema.parse(await res.json());
    expect(typeof body.subrequests.avg_recent).toBe('number');
    expect(body.subrequests.avg_recent).toBe(0);
    ```
11. In `T2-PROX-01`: `const body = ApiErrorResponseSchema.parse(await res.json()); expect(body.error).toBeDefined();`.

---

## 5. Verification Method

To independently verify this strategy:

1. **Verify Bare Workspace Package Import**:
   ```powershell
   bun -e "import { DashboardResponseSchema, CourseContentsResponseSchema, CourseGradesResponseSchema, EnhancedHealthResponseSchema, ApiErrorResponseSchema } from '@better-moodle/shared'; console.log('All schemas imported successfully');" --cwd apps/worker
   ```
   *Expected Output*: `All schemas imported successfully`.

2. **Verify Schema Rejection on Malformed Payloads**:
   ```powershell
   bun test ./scripts/challenger-assertiveness-test.ts
   ```
   *Expected Output*: 5 passed, 0 failed.

3. **Verify Zero Regressions on Typecheck & Web Build**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   bun run build:web
   ```
   *Expected Output*: 0 errors, build exits 0.

4. **Verify Zod Error Diagnostics during Implementation**:
   Once test files are updated, executing `bun test apps/worker/test/e2e/tier1-features.test.ts` against an incomplete or malformed endpoint will fail with descriptive Zod path validation errors (e.g. `[ZodError: [ { code: 'invalid_type', expected: 'number', received: 'string', path: [ 'courses', 0, 'id' ] } ]]`).
