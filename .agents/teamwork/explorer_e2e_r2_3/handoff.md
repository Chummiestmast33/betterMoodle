# E2E Test Remediation Report: Mutation Survival & Missing Preconditions (Explorer 3)

**Track**: Phase 3 BFF Read API & Secure Proxy E2E Testing — Iteration 2  
**Role**: Explorer 3 (Investigation & Synthesis)  
**Date**: 2026-11-12T22:49:00Z  
**Target Files**:
- `apps/worker/test/e2e/tier1-features.test.ts` (Test: `T1-DASH-05`, line 208–235)
- `apps/worker/test/e2e/tier3-combinations.test.ts` (Test: `T3-XFEAT-05`, line 182–215)
- (Bonus) `apps/worker/test/e2e/tier1-features.test.ts` (Test: `T1-HLTH-05`, line 676–697)

---

## 1. Observation

### Observation 1: `T1-DASH-05` Mutation Escape on Empty Array
- **Location**: `apps/worker/test/e2e/tier1-features.test.ts:222-234`
- **Verbatim Code**:
  ```typescript
  208:     test('T1-DASH-05: Recent Activity Ordering and Bounded Limit respects DESC order and max 15', async () => {
  209:       const now = Math.floor(Date.now() / 1000);
  210:       seedCourse(client.db, { id: 10, shortname: 'HIS101', fullname: 'Historia' });
  211: 
  212:       for (let i = 1; i <= 20; i++) {
  213:         seedItem(client.db, {
  214:           item_key: `item_${i}`,
  215:           course_id: 10,
  216:           item_type: 'announcement',
  217:           title: `Announcement ${i}`,
  218:           timemodified: now - (20 - i) * 60,
  219:         });
  220:       }
  221: 
  222:       const res = await client.request('/api/dashboard');
  223:       expect(res.status).toBe(200);
  224: 
  225:       const body = (await res.json()) as any;
  226:       expect(body.recent_activity.length).toBeLessThanOrEqual(15);
  227: 
  228:       for (let i = 0; i < body.recent_activity.length - 1; i++) {
  229:         expect(body.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
  230:           body.recent_activity[i + 1].timemodified
  231:         );
  232:       }
  233: 
  234:       fetchGuard.assertZeroCalls();
  235:     });
  ```
- **Execution Proof (`scripts/challenger-assertiveness-test.ts:70-98`)**:
  When a mutant backend returns `{ recent_activity: [] }`, `body.recent_activity.length` is `0`.
  1. `expect(0).toBeLessThanOrEqual(15)` evaluates to `true`.
  2. The loop condition `i < 0 - 1` (`i < -1`) is immediately `false`, so the loop executes 0 times.
  3. The assertion passes without error, allowing an empty array mutation to escape completely despite 20 active items seeded in D1.

### Observation 2: `T3-XFEAT-05` Missing Baseline Precondition for Dashboard
- **Location**: `apps/worker/test/e2e/tier3-combinations.test.ts:182-215`
- **Verbatim Code**:
  ```typescript
  182:   test('T3-XFEAT-05: Soft-Delete (Tombstone) Cascade Across Read Views', async () => {
  183:     const now = Math.floor(Date.now() / 1000);
  184:     seedCourse(client.db, { id: 103, shortname: 'CS103', fullname: 'Architecture' });
  185:     seedItem(client.db, {
  186:       item_key: 'grade_arch_quiz',
  187:       course_id: 103,
  188:       item_type: 'grade',
  189:       title: 'Quiz 1',
  190:       grade_num: 88,
  191:     });
  192: 
  193:     // Verify item is initially visible
  194:     const resBefore = await client.request('/api/courses/103/grades');
  195:     const dataBefore = (await resBefore.json()) as any;
  196:     expect(dataBefore.grades.length).toBe(1);
  197: 
  198:     // Apply tombstone
  199:     client.db.sqlite
  200:       .query(`UPDATE synced_items SET deleted_at = ? WHERE item_key = ?`)
  201:       .run(now, 'grade_arch_quiz');
  202: 
  203:     // Query /dashboard and /courses/103/grades
  204:     const dashRes = await client.request('/api/dashboard');
  205:     const dashData = (await dashRes.json()) as any;
  206:     expect(
  207:       dashData.current_grades.some((g: any) => g.item_key === 'grade_arch_quiz')
  208:     ).toBe(false);
  209: 
  210:     const gradesRes = await client.request('/api/courses/103/grades');
  211:     const gradesData = (await gradesRes.json()) as any;
  212:     expect(gradesData.grades.length).toBe(0);
  213: 
  214:     fetchGuard.assertZeroCalls();
  215:   });
  ```
- **Execution Proof (`scripts/challenger-assertiveness-test.ts:149-164`)**:
  The test objective is to verify that soft-deleting an item cascades and disappears across **both** read views (`/api/courses/103/grades` and `/api/dashboard`).
  Before applying the tombstone (lines 193–197), only `/api/courses/103/grades` is queried. `/api/dashboard` is **never queried**.
  If `/api/dashboard` contains a bug that completely omits grades from course 103 (or returns `current_grades: []` unconditionally), `dashData.current_grades.some((g: any) => g.item_key === 'grade_arch_quiz')` evaluates to `false` both before and after deletion.
  The assertion on line 206 passes trivially without verifying that the tombstone caused the grade to disappear from `/api/dashboard`.

### Observation 3: Bonus Finding in `T1-HLTH-05`
- **Location**: `apps/worker/test/e2e/tier1-features.test.ts:693`
- The test seeds 25 sync runs and asserts:
  ```typescript
  expect(body.recent_runs.length).toBeLessThanOrEqual(15);
  expect(body.recent_runs[0].id).toBe(25);
  ```
  While `body.recent_runs[0].id === 25` prevents an empty array, a mutant returning fewer than 15 runs (e.g. `LIMIT 5`) survives because `5 <= 15` is true. Since 25 runs were seeded, the test should strictly assert `expect(body.recent_runs.length).toBe(15);`.

---

## 2. Logic Chain

1. **Premise 1 (Deterministic Seed State)**:
   In `T1-DASH-05`, exactly 20 distinct announcement items belonging to active course 10 with non-deleted status and valid timestamps are inserted into D1.
2. **Premise 2 (Specification Contract for Recent Activity)**:
   Per `ORIGINAL_REQUEST.md` (R1) and `packages/shared/src/index.ts` (`DashboardResponseSchema`), `GET /api/dashboard` must return recent activity items ordered by `timemodified DESC` with a maximum limit of 15 items. When $\ge 15$ items exist in the database, the returned list must contain exactly 15 items.
3. **Step 1 (Mutation Vulnerability in `T1-DASH-05`)**:
   Under Obs 1, `toBeLessThanOrEqual(15)` accepts any array length in $[0, 15]$. When a mutant implementation yields 0 items (e.g. failing SQL query or unpopulated field), `0 <= 15` evaluates to true, and the loop comparing timestamps does not execute ($0 - 1 = -1$).
4. **Step 2 (Mutation Kill Strategy for `T1-DASH-05`)**:
   By replacing `toBeLessThanOrEqual(15)` with `toBe(15)`, any implementation returning fewer than 15 items (including empty array) fails immediately with `Expected: 15, Received: N`. Furthermore, asserting `expect(body.recent_activity[0].item_key).toBe('item_20')` validates that the returned items are specifically the 15 newest items (`item_20` down to `item_6`).
5. **Step 3 (Precondition Gap in `T3-XFEAT-05`)**:
   Under Obs 2, `T3-XFEAT-05` tests cross-feature consistency across read endpoints upon soft-deletion. Prior to soft-deletion, it only verifies presence in `/api/courses/103/grades`. It never queries `/api/dashboard`.
6. **Step 4 (False-Positive Escape in `T3-XFEAT-05`)**:
   If `/api/dashboard` fails to return `grade_arch_quiz` initially (e.g. join bug or missing course mapping), `dashData.current_grades.some(...)` is `false` initially and remains `false` after deletion. The test falsely attributes the absence of the item to the tombstone update.
7. **Step 5 (Remediation for `T3-XFEAT-05`)**:
   Adding a pre-tombstone query to `/api/dashboard` that asserts `dashDataBefore.current_grades.some((g: any) => g.item_key === 'grade_arch_quiz') === true` creates an explicit baseline. This guarantees that absence in post-deletion assertions reflects an actual state transition caused by `deleted_at`.

---

## 3. Caveats

- **No Source Code Changes**: In adherence to the Teamwork Explorer read-only constraint, no test files or worker source files were modified directly.
- **TDD Failure State**: Tests in `apps/worker/test/e2e/` currently fail with 404 / 500 against the Phase 2 baseline worker because Phase 3 endpoints are not yet implemented. The fixes proposed here ensure that once endpoints are implemented, they cannot pass under defective or mutated conditions.
- **Zod Schema Integration Harmony**: Explorer 1 is designing the migration from `as any` to Zod `.parse()`. The code snippets below provide both the minimal drop-in fix and the schema-integrated version so the test writer can apply either seamlessly.

---

## 4. Conclusion & Actionable Recommendations

### Recommendation 1: Fix `T1-DASH-05` in `apps/worker/test/e2e/tier1-features.test.ts`

**Target File**: `apps/worker/test/e2e/tier1-features.test.ts` (lines 222–234)

#### Code Snippet (Before):
```typescript
      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.recent_activity.length).toBeLessThanOrEqual(15);

      for (let i = 0; i < body.recent_activity.length - 1; i++) {
        expect(body.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
          body.recent_activity[i + 1].timemodified
        );
      }

      fetchGuard.assertZeroCalls();
```

#### Code Snippet (After — Direct Fix):
```typescript
      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.recent_activity.length).toBe(15);
      expect(body.recent_activity[0].item_key).toBe('item_20');

      for (let i = 0; i < body.recent_activity.length - 1; i++) {
        expect(body.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
          body.recent_activity[i + 1].timemodified
        );
      }

      fetchGuard.assertZeroCalls();
```

#### Code Snippet (After — With Shared Zod Schema):
```typescript
      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.recent_activity.length).toBe(15);
      expect(body.recent_activity[0].item_key).toBe('item_20');

      for (let i = 0; i < body.recent_activity.length - 1; i++) {
        expect(body.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
          body.recent_activity[i + 1].timemodified
        );
      }

      fetchGuard.assertZeroCalls();
```

---

### Recommendation 2: Fix `T3-XFEAT-05` in `apps/worker/test/e2e/tier3-combinations.test.ts`

**Target File**: `apps/worker/test/e2e/tier3-combinations.test.ts` (lines 193–215)

#### Code Snippet (Before):
```typescript
    // Verify item is initially visible
    const resBefore = await client.request('/api/courses/103/grades');
    const dataBefore = (await resBefore.json()) as any;
    expect(dataBefore.grades.length).toBe(1);

    // Apply tombstone
    client.db.sqlite
      .query(`UPDATE synced_items SET deleted_at = ? WHERE item_key = ?`)
      .run(now, 'grade_arch_quiz');

    // Query /dashboard and /courses/103/grades
    const dashRes = await client.request('/api/dashboard');
    const dashData = (await dashRes.json()) as any;
    expect(
      dashData.current_grades.some((g: any) => g.item_key === 'grade_arch_quiz')
    ).toBe(false);

    const gradesRes = await client.request('/api/courses/103/grades');
    const gradesData = (await gradesRes.json()) as any;
    expect(gradesData.grades.length).toBe(0);

    fetchGuard.assertZeroCalls();
```

#### Code Snippet (After — Direct Fix with Baseline Precondition):
```typescript
    // Verify item is initially visible across both read views
    const resBefore = await client.request('/api/courses/103/grades');
    expect(resBefore.status).toBe(200);
    const dataBefore = (await resBefore.json()) as any;
    expect(dataBefore.grades.length).toBe(1);
    expect(dataBefore.grades[0].item_key).toBe('grade_arch_quiz');

    const dashResBefore = await client.request('/api/dashboard');
    expect(dashResBefore.status).toBe(200);
    const dashDataBefore = (await dashResBefore.json()) as any;
    expect(
      dashDataBefore.current_grades.some((g: any) => g.item_key === 'grade_arch_quiz')
    ).toBe(true);

    // Apply tombstone
    client.db.sqlite
      .query(`UPDATE synced_items SET deleted_at = ? WHERE item_key = ?`)
      .run(now, 'grade_arch_quiz');

    // Query /dashboard and /courses/103/grades post-tombstone
    const dashRes = await client.request('/api/dashboard');
    expect(dashRes.status).toBe(200);
    const dashData = (await dashRes.json()) as any;
    expect(
      dashData.current_grades.some((g: any) => g.item_key === 'grade_arch_quiz')
    ).toBe(false);

    const gradesRes = await client.request('/api/courses/103/grades');
    expect(gradesRes.status).toBe(200);
    const gradesData = (await gradesRes.json()) as any;
    expect(gradesData.grades.length).toBe(0);

    fetchGuard.assertZeroCalls();
```

#### Code Snippet (After — With Shared Zod Schema):
```typescript
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
    client.db.sqlite
      .query(`UPDATE synced_items SET deleted_at = ? WHERE item_key = ?`)
      .run(now, 'grade_arch_quiz');

    // Query /dashboard and /courses/103/grades post-tombstone
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

    fetchGuard.assertZeroCalls();
```

---

### Recommendation 3 (Bonus): Tighten `T1-HLTH-05` in `apps/worker/test/e2e/tier1-features.test.ts`

**Target File**: `apps/worker/test/e2e/tier1-features.test.ts` (line 693)

#### Code Snippet:
```typescript
// Replace:
expect(body.recent_runs.length).toBeLessThanOrEqual(15);
// With:
expect(body.recent_runs.length).toBe(15);
```
Rationale: 25 sync runs are seeded. Changing from `toBeLessThanOrEqual(15)` to `toBe(15)` kills any mutant returning fewer than 15 runs.

---

## 5. Verification Method

To verify these findings and confirm that the proposed changes eliminate mutation escapes:

1. **Verify Challenger Assertiveness Experiments**:
   ```powershell
   bun test ./scripts/challenger-assertiveness-test.ts
   ```
   *Expectation*: Tests pass, empirically proving Experiment 2 (empty array in `T1-DASH-05`) and Experiment 5 (missing dashboard baseline in `T3-XFEAT-05`).

2. **Verify That Proposed Code Kills the Mutants**:
   - In an empty array scenario (`{ recent_activity: [] }`), `expect(0).toBe(15)` throws an error.
   - In an unpopulated dashboard scenario (`{ current_grades: [] }`), `expect(false).toBe(true)` on `dashDataBefore` throws an error.

3. **Verify Type Checking and Build Integrity**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   bun run build:web
   ```
   *Expectation*: 0 errors.
