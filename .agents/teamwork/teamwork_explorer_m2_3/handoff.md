# Handoff Report — Explorer 3: Zod Validation, Test Harness & Verification Strategy

**Agent**: `teamwork_explorer_m2_3`  
**Milestone**: Milestone M2 (D1 Read BFF Endpoints)  
**Target Path**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_3\handoff.md`  
**Parent Sub-Orchestrator**: `50de1d56-7225-42e8-a82f-254482b8b3f6`  

---

## 1. Observation

### 1.1 Shared Zod Schemas Inspection (`packages/shared/src/index.ts`)
Direct inspection of `packages/shared/src/index.ts` revealed that all schemas required for Milestone M2 are fully defined, strongly typed, and exported:

1. **Dashboard Endpoint (`GET /api/dashboard`)**:
   - `DashboardResponseSchema` (lines 130-135):
     ```ts
     export const DashboardResponseSchema = z.object({
       courses: z.array(DashboardCourseSchema),
       upcoming_assignments: z.array(UpcomingAssignmentSchema),
       recent_activity: z.array(RecentActivityItemSchema),
       current_grades: z.array(DashboardGradeSchema)
     });
     ```
   - `DashboardCourseSchema` (lines 85-91): `id: number`, `shortname: string`, `fullname: string`, `progress: number | null | undefined`, `refreshed_at: number`.
   - `UpcomingAssignmentSchema` (lines 94-103): `item_key: string`, `course_id: number`, `course_name: string | null | undefined`, `title: string`, `url: string | null | undefined`, `due_date: number`, `submission_status: SubmissionStatus | null | undefined`, `timemodified: number`.
   - `RecentActivityItemSchema` (lines 106-115): `item_key: string`, `course_id: number`, `course_name: string | null | undefined`, `item_type: 'assignment' | 'grade' | 'announcement'`, `title: string`, `url: string | null | undefined`, `timemodified: number`, `updated_at?: number`.
   - `DashboardGradeSchema` (lines 118-127): `item_key: string`, `course_id: number`, `course_name: string | null | undefined`, `title: string`, `grade_num: number | null`, `grade_formatted?: string | null`, `timemodified: number`, `url?: string | null`.

2. **Course Contents Endpoint (`GET /api/courses/:id/contents`)**:
   - `CourseContentsParamsSchema` (lines 142-144):
     ```ts
     export const CourseContentsParamsSchema = z.object({
       id: z.coerce.number().int().positive({ message: 'El ID de curso debe ser un entero positivo' })
     });
     ```
   - `CourseContentsResponseSchema` (lines 181-185):
     ```ts
     export const CourseContentsResponseSchema = z.object({
       course_id: z.number(),
       sections: z.array(CourseSectionSchema),
       synced_at: z.number().nullable()
     });
     ```
   - Nested models: `CourseSectionSchema` (lines 171-179) containing `modules: CourseModuleSchema[]`, which in turn contains `contents?: CourseResourceFileSchema[]`.

3. **Course Grades Endpoint (`GET /api/courses/:id/grades`)**:
   - `CourseGradesParamsSchema` (lines 192-194):
     ```ts
     export const CourseGradesParamsSchema = z.object({
       id: z.coerce.number().int().positive({ message: 'El ID de curso debe ser un entero positivo' })
     });
     ```
   - `CourseGradesResponseSchema` (lines 215-218):
     ```ts
     export const CourseGradesResponseSchema = z.object({
       course_id: z.number(),
       grades: z.array(GradeItemDetailSchema)
     });
     ```
   - `GradeItemDetailSchema` (lines 197-212): `item_key`, `course_id`, `title`, `grade_num: number | null`, `grade_formatted?`, `grademin?`, `grademax?`, `percentage_formatted?`, `feedback?`, `itemtype?`, `itemmodule?`, `weight_formatted?`, `timemodified: number`, `url?`.

4. **Enhanced Health Endpoint (`GET /api/health`)**:
   - `EnhancedHealthResponseSchema` (lines 233-242):
     ```ts
     export const EnhancedHealthResponseSchema = z.object({
       status: z.enum(['ok', 'degraded', 'error', 'circuit_open']),
       timestamp: z.number(),
       sync_state: SyncStateSchema.nullable().optional(),
       syncState: SyncStateSchema.nullable().optional(), // Retrocompat alias for Web App
       recent_runs: z.array(SyncRunSchema),
       lastRun: SyncRunSchema.nullable().optional(), // Retrocompat alias
       failure_rate: z.number(),
       subrequests: SubrequestMetricsSchema
     });
     ```
   - `SubrequestMetricsSchema` (lines 225-230): `last_used: number`, `max_budget: number` (expected value `45`), `avg_recent: number`, `max_recent: number`.

5. **API Error Schema (`ApiErrorResponseSchema`)**:
   - `ApiErrorResponseSchema` (lines 317-322):
     ```ts
     export const ApiErrorResponseSchema = z.object({
       error: z.string(),
       code: z.string().optional(),
       details: z.unknown().optional(),
       status: z.string().optional()
     });
     ```

### 1.2 Test Harness Inspection (`apps/worker/test/`)
Examination of `apps/worker/test/` revealed a fully-fledged, production-ready test infrastructure:
- **`helpers/d1-mock.ts` (`createTestD1`)**:
  - Implements an in-memory SQLite backend using `bun:sqlite` (`new Database(':memory:')`).
  - Auto-executes migrations in alphabetical order (`0001_initial_schema.sql`, `0002_phase2_sync_metadata.sql`, and future `0003_phase3_course_contents.sql`).
  - Contains an automated fallback that creates `course_contents` table if `0003` is not yet committed.
  - Fully emulates `D1Database` and `D1PreparedStatement` APIs (`prepare()`, `bind()`, `first()`, `all()`, `run()`, `raw()`, `batch()`, `exec()`, `reset()`).
- **`helpers/fetch-mock.ts` (`createForbiddenFetchGuard`, `createProxyFetchMock`)**:
  - `createForbiddenFetchGuard()` attaches a spy to `globalThis.fetch` via `spyOn(globalThis, 'fetch')` that throws `[RNF-02 VIOLATION]` if any outbound call is made, guaranteeing strict Moodle isolation on read routes.
  - `assertZeroCalls()` asserts that 0 fetch calls were initiated.
- **`helpers/fixtures.ts`**:
  - Provides high-level seed helpers: `seedCourse`, `seedItem`, `seedCourseContents`, `seedSyncState`, `seedSyncRun`, and `clearAllData`.
- **`helpers/test-client.ts` (`createTestClient`)**:
  - Constructs a mocked `Env` binding with in-memory D1 and dummy tokens.
  - Exposes `client.request(path, init)` that invokes `worker.fetch(new Request(url, init), env)` in-process without network overhead.
- **Test Suites in `apps/worker/test/`**:
  - `test/harness-empirical.test.ts`: 37 empirical tests validating the helpers themselves (100% pass).
  - `test/e2e/tier1-features.test.ts`: 30 tests covering baseline feature functionality for `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, and `/api/files/proxy`.
  - `test/e2e/tier2-boundaries.test.ts`: 30 tests covering edge cases (empty DB, null progress, Unicode Spanish accents, high volume datasets, 400 validation on invalid/decimal/negative IDs, 404 on missing courses, SQL injection rejection, D1 failure resilience, SSRF defense).
  - `test/e2e/tier3-combinations.test.ts`: 6 tests verifying cross-feature data integrity.
  - `test/e2e/tier4-scenarios.test.ts`: 6 real-world user journey scenarios.
  - `test/e2e.test.ts`: Master runner importing tiers 1–4.
  - `src/sync/phase2.test.ts`: 85 unit tests for Phase 2 sync logic.

### 1.3 Baseline Verification Command Results
1. `bunx tsc --noEmit -p apps/worker/tsconfig.json`:
   - Command: `bunx tsc --noEmit -p apps/worker/tsconfig.json`
   - Exit code: `0`
   - Output: Empty (0 errors).
2. `bun run build:web`:
   - Command: `bun run build:web`
   - Exit code: `0`
   - Output: Vite production build successful (`dist/index.html` 0.54 kB, `dist/assets/index-Dz-10sJl.js` 275.28 kB).
3. `bun test apps/worker/test/harness-empirical.test.ts`:
   - Command: `bun test apps/worker/test/harness-empirical.test.ts`
   - Exit code: `0` (37 pass, 0 fail).
4. Full `bun test`:
   - Command: `bun test`
   - Result: 244 pass, 70 fail across 314 tests.
   - Analysis: The 70 failures are 100% expected because the routes `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, enhanced `/api/health`, and `/api/files/proxy` have not yet been mounted in `apps/worker/src/index.ts`. All 70 failing tests directly verify these exact routes.

---

## 2. Logic Chain

### 2.1 Request Validation Architecture for Route Parameters
- **Observation**: `apps/worker/package.json` depends only on `hono` and `@better-moodle/shared`. `@hono/zod-validator` is not installed.
- **Empirical Test of Zod Schemas**:
  - `CourseContentsParamsSchema.safeParse({ id: 'notanumber' })` → `success: false`
  - `CourseContentsParamsSchema.safeParse({ id: '-5' })` → `success: false`
  - `CourseContentsParamsSchema.safeParse({ id: '0' })` → `success: false`
  - `CourseContentsParamsSchema.safeParse({ id: '12.34' })` → `success: false` (`.int()` rejects non-integers)
  - `CourseContentsParamsSchema.safeParse({ id: '1 OR 1=1' })` → `success: false`
  - `CourseContentsParamsSchema.safeParse({ id: '101' })` → `success: true, data: { id: 101 }`
- **Inference**:
  Instead of adding a new external dependency, route handlers can directly validate path parameters using `safeParse`:
  ```ts
  const paramResult = CourseContentsParamsSchema.safeParse({ id: c.req.param('id') });
  if (!paramResult.success) {
    return c.json({
      error: paramResult.error.errors[0]?.message || 'El ID de curso debe ser un entero positivo',
      code: 'INVALID_COURSE_ID'
    }, 400);
  }
  const courseId = paramResult.data.id;
  ```
  This is fast, zero-dependency, type-safe, and immediately produces standard 400 responses adhering to `ApiErrorResponseSchema`.

### 2.2 Course Existence and 404 Not Found Contract
- **Observation**: Tests `T2-CONT-04` and `T2-GRAD-04` explicitly verify that querying an ID that does not exist in the `courses` table returns HTTP 404 with `ApiErrorResponseSchema`.
- **Inference**:
  Before reading `course_contents` or `synced_items` for a specific course, both `/api/courses/:id/contents` and `/api/courses/:id/grades` MUST verify existence in `courses`:
  ```ts
  const course = await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(courseId).first();
  if (!course) {
    return c.json({
      error: `Curso con ID ${courseId} no encontrado`,
      code: 'COURSE_NOT_FOUND'
    }, 404);
  }
  ```

### 2.3 Course Contents Fallback and JSON Corruption Defense
- **Observation**:
  - `T1-CONT-03` requires that if a course exists in `courses` but has no entry in `course_contents`, the endpoint returns 200 with `{ course_id: id, sections: [], synced_at: null }`.
  - `T2-CONT-05` requires that if `sections_json` in the database contains corrupted or invalid JSON, the endpoint must catch the JSON parse exception and safely return `{ course_id: id, sections: [], synced_at: row.updated_at }` without crashing (200 OK).
- **Inference**:
  The contents query logic must be:
  ```ts
  const contentRow = await c.env.DB.prepare(
    'SELECT sections_json, updated_at FROM course_contents WHERE course_id = ?'
  ).bind(courseId).first<{ sections_json: string; updated_at: number }>();

  if (!contentRow) {
    return c.json({ course_id: courseId, sections: [], synced_at: null });
  }

  let sections: CourseSection[] = [];
  try {
    const parsed = JSON.parse(contentRow.sections_json);
    if (Array.isArray(parsed)) sections = parsed;
  } catch {
    sections = [];
  }

  return c.json({
    course_id: courseId,
    sections,
    synced_at: contentRow.updated_at
  });
  ```

### 2.4 Course Grades Extraction & Payload Enrichment
- **Observation**:
  - `T1-GRAD-01` to `T1-GRAD-06` verify:
    1. Returns normalized grade items where `item_type = 'grade' AND deleted_at IS NULL`.
    2. Strict course isolation (`WHERE course_id = ?`).
    3. Null `grade_num` is preserved (not converted to 0 or string).
    4. Numeric precision (e.g. `87.654321`) is preserved without loss.
- **Inference**:
  Query:
  ```sql
  SELECT item_key, course_id, title, grade_num, timemodified, url, payload_json
  FROM synced_items
  WHERE course_id = ? AND item_type = 'grade' AND deleted_at IS NULL
  ORDER BY timemodified DESC
  ```
  And map each item:
  ```ts
  const grades = results.map((row: any) => {
    let extra: any = {};
    if (row.payload_json) {
      try { extra = JSON.parse(row.payload_json); } catch {}
    }
    return {
      item_key: row.item_key,
      course_id: row.course_id,
      title: row.title,
      grade_num: row.grade_num,
      grade_formatted: extra.grade_formatted ?? null,
      grademin: extra.grademin ?? null,
      grademax: extra.grademax ?? null,
      percentage_formatted: extra.percentage_formatted ?? null,
      feedback: extra.feedback ?? null,
      itemtype: extra.itemtype ?? null,
      itemmodule: extra.itemmodule ?? null,
      weight_formatted: extra.weight_formatted ?? null,
      timemodified: row.timemodified,
      url: row.url ?? null
    };
  });
  ```

### 2.5 Enhanced Health Metric Computation
- **Observation**:
  `EnhancedHealthResponseSchema` and tests `T1-HLTH-01` through `T1-HLTH-06` define the exact business logic:
  - `max_budget`: Constant `45` (subrequests budget ceiling before Cloudflare threshold).
  - `recent_runs`: `SELECT * FROM sync_runs ORDER BY id DESC LIMIT 15`.
  - `sync_state`: `SELECT * FROM sync_state WHERE id = 1`.
  - Status logic:
    - If `syncState?.circuit_open_until && syncState.circuit_open_until > now`: `'circuit_open'`.
    - Else if `!syncState` or `syncState.baseline_seeded === 0` or `syncState.consecutive_failures >= 3` or `failure_rate > 0.5`: `'degraded'`.
    - Else: `'ok'`.
  - Subrequests calculations:
    - Filter runs where `subrequests_used != null`.
    - `last_used`: `recent_runs[0]?.subrequests_used ?? 0`.
    - `avg_recent`: Average of `subrequests_used` among non-null runs, or `0` if empty.
    - `max_recent`: Max of `subrequests_used` among non-null runs, or `0` if empty.
  - Failure rate calculation:
    - Count error runs in `recent_runs` / total `recent_runs.length`. If empty, `0.0`.
  - Retrocompatibility aliases:
    - `syncState`: alias for `sync_state`.
    - `lastRun`: alias for `recent_runs[0] ?? null`.

### 2.6 Dashboard Consolidation Strategy
- **Observation**:
  `T1-DASH-01` to `T1-DASH-06` and `T2-DASH-01` to `T2-DASH-05`:
  - `courses`: Enrolled courses from `courses` table.
  - `upcoming_assignments`: `item_type = 'assignment' AND due_date >= now AND deleted_at IS NULL ORDER BY due_date ASC`.
  - `recent_activity`: `deleted_at IS NULL ORDER BY timemodified DESC LIMIT 15`. Must respect limit 15.
  - `current_grades`: `item_type = 'grade' AND deleted_at IS NULL ORDER BY timemodified DESC`.
  - `course_name`: Joined via `LEFT JOIN courses c ON si.course_id = c.id`.
  - Response adheres 100% to `DashboardResponseSchema`.

---

## 3. Caveats

1. **Phase Boundary & Scope**:
   - Milestone M2 covers exclusively the D1 migration `0003` and read endpoints (`/api/dashboard`, `/api/courses`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, `/api/items`, `/api/sync/manual`).
   - The file proxy endpoint (`/api/files/proxy`) is scheduled for Milestone M3. Its tests currently in `tier1` to `tier4` will continue to fail (or can be temporarily scoped) until M3 implements `src/routes/proxy.ts`.
2. **Double Test Execution with Bare `bun test`**:
   - `test/e2e.test.ts` imports `./e2e/tier1-features.test`, `./e2e/tier2-boundaries.test`, etc.
   - When running bare `bun test`, Bun recursively discovers all `*.test.ts` files, executing each tier twice.
   - Running `bun test apps/worker/test/e2e.test.ts` or `bun test apps/worker/test/e2e/` avoids duplicate test runs.
3. **Root `bunx tsc --noEmit` vs Targeted TSConfig**:
   - Running `bunx tsc --noEmit` at the repository root uses the bare root `tsconfig.json` which does not include DOM/JSX/Workers types. Always run `bunx tsc --noEmit -p apps/worker/tsconfig.json` for worker type verification.

---

## 4. Conclusion

### 4.1 Schema Usage Recommendations for Worker Implementation
1. **Request Parameter Validation**:
   - In `apps/worker/src/routes/courses.ts`:
     - Import `CourseContentsParamsSchema` and `CourseGradesParamsSchema` from `@better-moodle/shared`.
     - Validate `c.req.param('id')` with `.safeParse({ id: c.req.param('id') })`.
     - On failure, immediately return HTTP 400 with `ApiErrorResponseSchema`.
2. **Course Existence Check**:
   - Check `SELECT id FROM courses WHERE id = ?`. On failure, return HTTP 404 with `ApiErrorResponseSchema`.
3. **Response Serialization & Defense-in-Depth**:
   - All read routes should construct response payloads matching the exact schemas (`DashboardResponseSchema`, `CourseContentsResponseSchema`, `CourseGradesResponseSchema`, `EnhancedHealthResponseSchema`).
   - In development/testing, optionally pass payloads through `Schema.parse(payload)` to guarantee contract adherence.
4. **Error Handling Architecture**:
   - Register global error handlers on Hono `app`:
     - `app.onError((err, c) => c.json({ error: err.message || 'Error interno', code: 'INTERNAL_ERROR', status: 'error' }, 500))`
     - `app.notFound((c) => c.json({ error: 'Ruta no encontrada', code: 'NOT_FOUND' }, 404))`

### 4.2 Modular Router Layout for M2 Implementation
The worker structure should be modularized as follows:
```
apps/worker/
├── migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_phase2_sync_metadata.sql
│   └── 0003_phase3_course_contents.sql   <-- To be added in M2
└── src/
    ├── index.ts                          <-- Mounts routes, exports app and default worker
    └── routes/
        ├── dashboard.ts                  <-- GET /api/dashboard
        ├── courses.ts                    <-- GET /api/courses, /api/courses/:id/contents, /api/courses/:id/grades
        ├── health.ts                     <-- GET /api/health (enhanced)
        ├── items.ts                      <-- GET /api/items (preserved)
        ├── sync.ts                       <-- POST /api/sync/manual (preserved)
        └── proxy.ts                      <-- Placeholder / M3 proxy route
```

### 4.3 Export Contract in `apps/worker/src/index.ts`
To support both Cloudflare Workers runtime and unit testing with `app.request`, `apps/worker/src/index.ts` must export:
```ts
export { app };
export default {
  fetch: app.fetch,
  scheduled
};
```

---

## 5. Verification Method

### 5.1 Verification Commands
Any developer or auditor can independently verify the schemas, test harness, and build cleanliness using these exact commands from the workspace root:

1. **Worker TypeScript Verification**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected result*: Exit code `0`, 0 type errors.

2. **Web Production Build**:
   ```powershell
   bun run build:web
   ```
   *Expected result*: Exit code `0`, clean Vite build.

3. **Test Harness Self-Verification (Empirical Test Suite)**:
   ```powershell
   bun test apps/worker/test/harness-empirical.test.ts
   ```
   *Expected result*: 37 passed, 0 failed.

4. **Shared Package Test Suite**:
   ```powershell
   bun test packages/shared
   ```
   *Expected result*: 201 passed, 0 failed.

5. **Read Endpoints E2E Suites**:
   ```powershell
   bun test apps/worker/test/e2e/tier1-features.test.ts
   bun test apps/worker/test/e2e/tier2-boundaries.test.ts
   bun test apps/worker/test/e2e/tier3-combinations.test.ts
   bun test apps/worker/test/e2e/tier4-scenarios.test.ts
   ```
   *Current state*: Tests fail with 404 because M2 routes are not yet mounted.  
   *Post-M2 expected state*: All 24 non-proxy tests in Tier 1, all 24 non-proxy tests in Tier 2, and all non-proxy tests in Tiers 3 & 4 will pass cleanly with 0 outbound fetch calls verified by `FetchForbiddenGuard`.

### 5.2 Invalidation Conditions
This analysis will be invalidated if:
1. `CourseContentsParamsSchema` or `CourseGradesParamsSchema` are modified to accept non-integers or negative values without `.positive()`.
2. `EnhancedHealthResponseSchema` drops the `subrequests` object or removes the backward-compatible aliases `syncState` and `lastRun`.
3. An outbound `fetch()` call is introduced into any read route handler in `apps/worker/src/routes/` (violating RNF-02 and triggering `createForbiddenFetchGuard`).
