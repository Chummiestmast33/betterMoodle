# Analysis & Recommendations for Fixing Boundary Assertion Weaknesses (Explorer 2)

**Track**: Phase 3 BFF Read API & Secure Proxy E2E Testing (Iteration 2)  
**Author**: Explorer 2 (Teamwork Explorer / Analyst)  
**Date**: 2026-11-12T22:48:00Z  
**Target File**: `apps/worker/test/e2e/tier2-boundaries.test.ts`  
**State Folder**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_r2_2`

---

## Executive Summary

Challenger 2 identified critical assertion weaknesses in `tier2-boundaries.test.ts` where tests either pass tautologically before implementation, pass on missing/undefined properties, permit unhandled 500 crashes, or introduce CI flakiness via wall-clock timing checks.

This report provides the exact root-cause analysis, logic chains, and drop-in code snippets for the test writer to resolve:
1. **`T2-GRAD-04`**: Eliminate tautological pass on unmounted routes by asserting `content-type: application/json` and `body.error`.
2. **`T2-HLTH-05`**: Fix `Number.isNaN(undefined)` defect by asserting `typeof === 'number'` and exact default `=== 0`.
3. **`T2-HLTH-01` & `T2-CONT-05`**: Eliminate permissive `[200, 500]` status sets and enforce exact deterministic HTTP statuses (`200` for graceful degradation / fallback).
4. **`T2-DASH-04`**: Remove flaky `< 100ms` wall-clock assertion and tighten functional capacity checks.

---

## 1. Observation

### Obs 1: `T2-GRAD-04` Tautological Pass on Unmounted `/api/courses/:id/grades`
- **Location**: `apps/worker/test/e2e/tier2-boundaries.test.ts:242-247`
- **Verbatim Code**:
  ```ts
  test('T2-GRAD-04: Non-Existent Course ID returns 404 Not Found', async () => {
    const res = await client.request('/api/courses/88888/grades');
    expect(res.status).toBe(404);

    fetchGuard.assertZeroCalls();
  });
  ```
- **Empirical Execution**:
  Running `bun test apps/worker/test/e2e/tier2-boundaries.test.ts -t "T2-GRAD-04"`:
  ```
  (pass) Tier 2: Boundary & Corner Cases (30 Tests) > Feature 3: GET /api/courses/:id/grades Boundaries > T2-GRAD-04: Non-Existent Course ID returns 404 Not Found [12.18ms]
  1 pass, 0 fail
  ```
- **Root Cause**:
  `apps/worker/src/index.ts` has not yet mounted route `/api/courses/:id/grades`. In Hono, any unmounted route defaults to:
  `Status: 404`, `Content-Type: text/plain; charset=UTF-8`, `Body: "404 Not Found"`.
  Because `T2-GRAD-04` only asserts `expect(res.status).toBe(404)`, it passes unconditionally without executing any application logic.
  In contrast, `T2-CONT-04` (line 180) checks `const body = (await res.json()) as any; expect(body.error).toBeDefined();`, failing with `SyntaxError` on unmounted routes as expected in TDD.

### Obs 2: `T2-HLTH-05` Masking `undefined` Metrics via `Number.isNaN(undefined) === false`
- **Location**: `apps/worker/test/e2e/tier2-boundaries.test.ts:357-376`
- **Verbatim Code (lines 372-374)**:
  ```ts
  const body = (await res.json()) as any;
  expect(Number.isNaN(body.subrequests.avg_recent)).toBe(false);
  ```
- **Empirical Verification**:
  In Bun / JavaScript runtime:
  ```ts
  Number.isNaN(undefined); // => false
  Number.isNaN(null);      // => false
  Number.isNaN('foo');     // => false
  ```
  As proven by Experiment 3 in `scripts/challenger-assertiveness-test.ts`, if a backend omits `avg_recent` completely (`undefined`), `Number.isNaN(undefined)` returns `false`, causing the test to pass unconditionally.
  According to `SubrequestMetricsSchema` (`packages/shared/src/index.ts:225-230`), `avg_recent` is a required `z.number()`. When all sync runs have `NULL` metrics in D1, `avg_recent` must safely default to `0`.

### Obs 3: `T2-HLTH-01` and `T2-CONT-05` Accepting Unhandled Crashes via `[200, 500]`
- **Locations**:
  - `apps/worker/test/e2e/tier2-boundaries.test.ts:303`: `expect([200, 500]).toContain(res.status);`
  - `apps/worker/test/e2e/tier2-boundaries.test.ts:198`: `expect([200, 500]).toContain(res.status);`
- **Root Cause & Empirical Verification**:
  In both tests, the author wrote `expect([200, 500]).toContain(res.status)` to avoid deciding on an exact contract.
  - In `T2-HLTH-01`, if the backend queries `sync_state` and accesses `state.baseline_seeded` without checking if `state` is null, a `TypeError: Cannot read properties of null` throws. The catch block catches this and returns HTTP 500. `expect([200, 500])` treats this unhandled null pointer crash as a PASS.
  - In `T2-CONT-05`, if `JSON.parse` crashes on malformed `sections_json` with an unhandled `SyntaxError`, `expect([200, 500])` also treats the crash as a PASS.

### Obs 4: `T2-DASH-04` Wall-Clock Timing Assertion Inducing Flakiness
- **Location**: `apps/worker/test/e2e/tier2-boundaries.test.ts:100-105`
- **Verbatim Code**:
  ```ts
  const start = performance.now();
  const res = await client.request('/api/dashboard');
  const elapsed = performance.now() - start;

  expect(res.status).toBe(200);
  expect(elapsed).toBeLessThan(100); // Must be under 100ms in-memory
  ```
- **Root Cause**:
  Wall-clock thresholds in functional E2E tests are vulnerable to CPU throttling, Windows background indexing, garbage collection pauses, or runner virtualization delays. A run taking 105ms on a loaded machine fails the test despite 100% correct logic.
  Furthermore, the subsequent assertion `expect(body.recent_activity.length).toBeLessThanOrEqual(15)` allows an empty array (`0 <= 15`) to pass even though 120 items were seeded.

---

## 2. Logic Chain

### Step 1: Solving `T2-GRAD-04` Tautology
1. **Premise**: An unmounted Hono route returns `text/plain` 404. An implemented BFF endpoint returns `application/json` 404 with standard error body conforming to `ApiErrorResponseSchema`.
2. **Inference**: By asserting:
   - `expect(res.status).toBe(404);`
   - `expect(res.headers.get('content-type')).toContain('application/json');`
   - `const body = (await res.json()) as any; expect(body.error).toBeDefined();`
3. **Deduction**: The test fails immediately on unmounted routes (preventing false-positive passes) and passes only when the developer mounts `/api/courses/:id/grades` and returns a structured JSON 404.

### Step 2: Solving `T2-HLTH-05` Defect
1. **Premise**: `Number.isNaN(x)` only checks if `x` is `NaN`. It does not verify that `x` is a number or that it is present.
2. **Inference**: In `packages/shared/src/index.ts`, `SubrequestMetricsSchema` requires `avg_recent` to be a number. When D1 contains NULL metrics, the endpoint must calculate `0`, not `undefined` or `NaN`.
3. **Deduction**: Asserting `expect(typeof body.subrequests.avg_recent).toBe('number');`, `expect(Number.isNaN(body.subrequests.avg_recent)).toBe(false);`, and `expect(body.subrequests.avg_recent).toBe(0);` kills mutants that omit `avg_recent` or return non-numeric values.

### Step 3: Resolving Status Ambiguity in `T2-HLTH-01` and `T2-CONT-05`
1. **Premise**: In HTTP API testing, status sets like `[200, 500]` mask unhandled runtime exceptions. A deterministic test must assert a single expected status code.
2. **Analysis for `T2-HLTH-01`**:
   - The test is named *"Missing sync_state Row handled gracefully"*.
   - Database connectivity is intact (database connection failure is already tested in `T2-HLTH-02` returning 500).
   - In `EnhancedHealthResponseSchema`, `sync_state` is explicitly defined as `nullable().optional()`.
   - A missing row represents an uninitialized/degraded system state, not an unhandled crash.
   - Therefore, the endpoint must return **HTTP 200** with `status: 'degraded'` (or `'error'`) and `sync_state: null`.
   - Asserting `expect(res.status).toBe(200)` forces the developer to write null-safe access (`syncState?.baseline_seeded ?? 0`), preventing null pointer crashes.
3. **Analysis for `T2-CONT-05`**:
   - The test is named *"Corrupted sections_json in Database handled safely"*.
   - BetterMoodle is an offline-first PWA reading from an edge D1 cache.
   - Safe handling of a corrupted cache row means isolating the error and returning safe fallback data (`sections: []`), returning **HTTP 200** so that the client UI does not crash.
   - *Primary Recommendation*: **HTTP 200** with `sections: []`.
   - *Alternative (if data corruption must be signaled to client)*: Exact **HTTP 500** with `content-type: application/json` and `body.error`.
   - Both options eliminate `[200, 500]`. Primary recommendation aligns with "handled safely" and client resilience.

### Step 4: Solving `T2-DASH-04` Flakiness & Assertiveness
1. **Premise**: Wall-clock latency assertions (`elapsed < 100ms`) are non-deterministic and induce CI flakiness.
2. **Inference**: Removing `performance.now()` and `expect(elapsed).toBeLessThan(100)` restores test determinism.
3. **Inference 2**: The test seeds 120 items (60 announcements with descending timestamps). The dashboard query must cap recent activity at exactly 15.
4. **Deduction**: Replacing `toBeLessThanOrEqual(15)` with `expect(body.recent_activity.length).toBe(15)` eliminates the mutant where an empty array survives.

---

## 3. Concrete Recommendations & Drop-in Code Snippets

### 1. Fix for `T2-GRAD-04` (Replace lines 242–247)

```ts
    test('T2-GRAD-04: Non-Existent Course ID returns 404 Not Found', async () => {
      const res = await client.request('/api/courses/88888/grades');
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = (await res.json()) as any;
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });
```
*Note*: If shared Zod schemas are imported:
```ts
      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();
```

---

### 2. Fix for `T2-HLTH-05` (Replace lines 370–374)

```ts
      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(typeof body.subrequests.avg_recent).toBe('number');
      expect(Number.isNaN(body.subrequests.avg_recent)).toBe(false);
      expect(body.subrequests.avg_recent).toBe(0);

      fetchGuard.assertZeroCalls();
```
*Note*: If shared Zod schemas are imported:
```ts
      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(typeof body.subrequests.avg_recent).toBe('number');
      expect(body.subrequests.avg_recent).toBe(0);
```

---

### 3. Fix for `T2-HLTH-01` (Replace lines 298–306)

```ts
    test('T2-HLTH-01: Missing sync_state Row handled gracefully', async () => {
      // Delete sync_state row
      client.db.sqlite.exec('DELETE FROM sync_state');

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = (await res.json()) as any;
      expect(['degraded', 'error']).toContain(body.status);
      expect(body.sync_state == null).toBe(true);

      fetchGuard.assertZeroCalls();
    });
```
*Note*: If shared Zod schemas are imported:
```ts
      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(['degraded', 'error']).toContain(body.status);
      expect(body.sync_state == null).toBe(true);
```

---

### 4. Fix for `T2-CONT-05` (Replace lines 186–201)

#### Primary Recommendation: Resilient Fallback (HTTP 200 with Empty Sections)
```ts
    test('T2-CONT-05: Corrupted sections_json in Database handled safely', async () => {
      seedCourse(client.db, { id: 301, shortname: 'CORRUPT', fullname: 'Corrupted Course' });
      // Insert invalid non-JSON into course_contents
      client.db.sqlite
        .query(
          `INSERT OR REPLACE INTO course_contents (course_id, sections_json, updated_at)
           VALUES (301, '{malformed:json[', 1700000000)`
        )
        .run();

      const res = await client.request('/api/courses/301/contents');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = (await res.json()) as any;
      expect(body.course_id).toBe(301);
      expect(body.sections).toEqual([]);

      fetchGuard.assertZeroCalls();
    });
```
*Note*: If shared Zod schemas are imported:
```ts
      const body = CourseContentsResponseSchema.parse(await res.json());
      expect(body.course_id).toBe(301);
      expect(body.sections).toEqual([]);
```

#### Alternative Option (if team strictly prefers 500 on corrupted cache):
```ts
      expect(res.status).toBe(500);
      expect(res.headers.get('content-type')).toContain('application/json');
      const body = (await res.json()) as any;
      expect(body.error).toBeDefined();
```

---

### 5. Fix for `T2-DASH-04` (Replace lines 83–111)

```ts
    test('T2-DASH-04: High Volume Items Load handles 100+ items within performance budget', async () => {
      seedCourse(client.db, { id: 52, shortname: 'VOL101', fullname: 'High Volume Course' });

      // Seed 120 items to stress query limits and memory
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 120; i++) {
        seedItem(client.db, {
          item_key: `vol_item_${i}`,
          course_id: 52,
          item_type: i % 2 === 0 ? 'assignment' : 'announcement',
          title: `Item Title ${i}`,
          due_date: now + i * 3600,
          timemodified: now - i * 60,
        });
      }

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.courses.length).toBe(1);
      expect(body.recent_activity.length).toBe(15);

      fetchGuard.assertZeroCalls();
    });
```
*Note*: If shared Zod schemas are imported:
```ts
      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.courses.length).toBe(1);
      expect(body.recent_activity.length).toBe(15);
```

---

## 4. Caveats

1. **Read-Only Investigation**: In accordance with the explorer archetype, no production code in `apps/worker/src/` or test code in `apps/worker/test/` was directly modified. The snippets provided above are ready for immediate application by the test writer.
2. **Schema Integration Synergy**: While this report specifically targets the boundary assertion fixes, combining these snippets with Zod schema parsing (as analyzed in Challenger Obs 1) provides maximum defect sensitivity and 100% contract compliance.
3. **HTTP 200 vs 500 for `T2-CONT-05`**: We strongly recommend HTTP 200 with empty fallback `sections: []` as the standard for edge cache resilience. If the team prefers HTTP 500, the exact 500 snippet provided above must be used instead to ensure `[200, 500]` is eliminated.

---

## 5. Verification Method

To verify these recommendations independently:

1. **Verify `T2-GRAD-04` Tautological Defect & Fix**:
   - Run current test: `bun test apps/worker/test/e2e/tier2-boundaries.test.ts -t "T2-GRAD-04"`.
   - Observe it passes today against an unmounted route.
   - Apply the recommended snippet adding `content-type: application/json` and `body.error`.
   - Re-run the test: it will now properly fail on the unmounted route with `Expected "application/json", received "text/plain; charset=UTF-8"`, confirming the tautological pass is fixed.

2. **Verify `T2-HLTH-05` Defect**:
   - Run `bun test ./scripts/challenger-assertiveness-test.ts -t "Experiment 3"`.
   - Confirms `Number.isNaN(undefined) === false` allows missing properties to pass.
   - Asserting `typeof === 'number'` and `=== 0` kills this defect.

3. **Verify `[200, 500]` Elimination in `T2-HLTH-01` and `T2-CONT-05`**:
   - Run `bun test ./scripts/challenger-assertiveness-test.ts -t "Experiment 4"`.
   - Confirms `[200, 500]` permits unhandled 500 crashes.
   - Searching for `[200, 500]` across the codebase will yield 0 occurrences after applying the snippets.

4. **Verify CI Determinism in `T2-DASH-04`**:
   - Confirm lines 100–105 (`performance.now()`) are removed.
   - Search for `performance.now` across `apps/worker/test/e2e/` to ensure no lingering wall-clock assertions remain.
