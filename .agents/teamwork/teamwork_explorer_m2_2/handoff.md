# Handoff Report — Explorer 2: D1 Migration and Read BFF Endpoints Design

## 1. Observation

1. **Existing Migrations in `apps/worker/migrations/`**:
   - `0001_initial_schema.sql`: defines `courses` (`id`, `shortname`, `fullname`, `progress`, `payload_json`, `refreshed_at`), `synced_items` (`item_key`, `course_id`, `item_type`, `title`, `url`, `due_date`, `grade_num`, `timemodified`, `payload_json`, `first_seen_at`, `updated_at`, `deleted_at`), `sync_state`, `sync_runs`, `push_subscriptions`.
   - `0002_phase2_sync_metadata.sql`: alters `courses` (`grades_synced_at`, `forums_synced_at`), alters `synced_items` (`submission_status`, `status_synced_at`), alters `sync_state` (`moodle_user_id`, `courses_refreshed_at`, `grades_seeded`, `forums_seeded`, `circuit_open_until`, `dead_man_alerted`), and adds index `idx_items_type_status ON synced_items(item_type, deleted_at)`.
   - Missing migration: `0003_phase3_course_contents.sql` is not yet created.

2. **Existing Endpoints in `apps/worker/src/index.ts`**:
   - Lines 9-26: `app.get('/api/health')` returns only `{ status: 'ok', timestamp: Date.now(), syncState, lastRun }`. Missing `subrequests`, `failure_rate`, `recent_runs`, and circuit breaker logic.
   - Lines 29-38: `app.get('/api/courses')` returns `{ courses: results }` with query `'SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC'`.
   - Lines 41-60: `app.get('/api/items')` queries `synced_items`.
   - Lines 63-84: `app.post('/api/sync/manual')` runs manual sync with 30s rate limit.
   - Missing routes: `GET /api/dashboard`, `GET /api/courses/:id/contents`, `GET /api/courses/:id/grades`.

3. **Shared Schemas in `packages/shared/src/index.ts`**:
   - Lines 85-136: `DashboardResponseSchema`:
     - `courses`: `Array<DashboardCourse>` (`id`, `shortname`, `fullname`, `progress`, `refreshed_at`)
     - `upcoming_assignments`: `Array<UpcomingAssignment>` (`item_key`, `course_id`, `course_name`, `title`, `url`, `due_date`, `submission_status`, `timemodified`)
     - `recent_activity`: `Array<RecentActivityItem>` (`item_key`, `course_id`, `course_name`, `item_type`, `title`, `url`, `timemodified`, `updated_at`)
     - `current_grades`: `Array<DashboardGrade>` (`item_key`, `course_id`, `course_name`, `title`, `grade_num`, `grade_formatted`, `timemodified`, `url`)
   - Lines 142-186: `CourseContentsParamsSchema` and `CourseContentsResponseSchema`:
     - `CourseContentsParamsSchema`: `z.object({ id: z.coerce.number().int().positive(...) })`
     - `CourseContentsResponseSchema`: `course_id`, `sections: CourseSection[]`, `synced_at: number | null`
   - Lines 192-220: `CourseGradesParamsSchema` and `CourseGradesResponseSchema`:
     - `CourseGradesParamsSchema`: `z.object({ id: z.coerce.number().int().positive(...) })`
     - `CourseGradesResponseSchema`: `course_id`, `grades: GradeItemDetail[]`
   - Lines 225-243: `EnhancedHealthResponseSchema`:
     - `status`: `'ok' | 'degraded' | 'error' | 'circuit_open'`
     - `timestamp`: number
     - `sync_state`: SyncState | null
     - `syncState`: alias
     - `recent_runs`: Array<SyncRun>
     - `lastRun`: SyncRun | null
     - `failure_rate`: number
     - `subrequests`: `{ last_used: number, max_budget: number, avg_recent: number, max_recent: number }`

4. **Test Harness Constraints and Assertions**:
   - `apps/worker/test/e2e/tier1-features.test.ts:38-100`: `fetchGuard.assertZeroCalls()` is asserted on all read routes (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`). Any HTTP call causes immediate failure (RNF-02).
   - `apps/worker/test/e2e/tier1-features.test.ts:214-242` (`T1-DASH-05`): `recent_activity` must be bounded to maximum 15 items in `DESC` order by `timemodified`.
   - `apps/worker/test/e2e/tier2-boundaries.test.ts:178-187` (`T2-CONT-04`) & `tier2-boundaries.test.ts:249-258` (`T2-GRAD-04`): Non-existent course IDs must return `404 Not Found` with `{ error: string }`.
   - `apps/worker/test/e2e/tier2-boundaries.test.ts:189-208` (`T2-CONT-05`): Corrupted/malformed `sections_json` must be safely parsed, falling back to `{ course_id, sections: [], synced_at }` with status 200 without throwing 500.
   - `apps/worker/test/e2e/tier1-features.test.ts:664-682` (`T1-HLTH-04`): `subrequests.max_budget` is constant `45`.
   - `apps/worker/test/helpers/d1-mock.ts:105-110`:
     ```ts
     batch: async (stmts: D1PreparedStatement[]) => {
       const out: any[] = [];
       for (const s of stmts) {
         out.push(await s.run());
       }
       return out;
     }
     ```
     Crucial discovery: The test mock's `batch()` implementation invokes `s.run()` instead of returning query `.results`. Therefore, read queries in route handlers must use `Promise.all([s1.all(), s2.all(), ...])` instead of `c.env.DB.batch(...)` to succeed across both local test mock and Cloudflare D1.

---

## 2. Logic Chain

1. **Migration 0003 Design (from Observation 1 & 4)**:
   - In `apps/worker/migrations/`, migrations are ordered numerically (`0001`, `0002`). The next migration must be `0003_phase3_course_contents.sql`.
   - In `apps/worker/test/helpers/d1-mock.ts:28-34`, the mock schema explicitly anticipates:
     `CREATE TABLE IF NOT EXISTS course_contents (course_id INTEGER PRIMARY KEY, sections_json TEXT NOT NULL, updated_at INTEGER NOT NULL);`
   - Incorporating `REFERENCES courses(id) ON DELETE CASCADE` ensures referential integrity when courses are cleared or re-synced.

2. **Dashboard Query Strategy (from Observation 2, 3, & 4)**:
   - `DashboardResponseSchema` requires 4 arrays: `courses`, `upcoming_assignments`, `recent_activity`, `current_grades`.
   - Joining `courses` on `synced_items.course_id` allows fetching `course_name` (`COALESCE(courses.shortname, courses.fullname)`), which is required by `UpcomingAssignmentSchema`, `RecentActivityItemSchema`, and `DashboardGradeSchema`.
   - Upcoming assignments filter: `item_type = 'assignment' AND due_date >= ? AND deleted_at IS NULL` with `now = Math.floor(Date.now() / 1000)`, ordered by `due_date ASC, timemodified DESC`.
   - Recent activity filter: `deleted_at IS NULL` ordered by `timemodified DESC, updated_at DESC LIMIT 15` (satisfying `T1-DASH-05`).
   - Current grades filter: `item_type = 'grade' AND deleted_at IS NULL` ordered by `timemodified DESC, item_key ASC`. Mapping parses `payload_json` if present to extract `gradeformatted`, and guarantees `grade_num: row.grade_num ?? null` (never `undefined`).
   - Using `Promise.all([pCourses, pAssignments, pActivity, pGrades])` executes all 4 queries concurrently and avoids the `d1-mock.ts` `s.run()` batch caveat.

3. **Course Contents Route Design (from Observation 3 & 4)**:
   - Validate `:id` using `CourseContentsParamsSchema.safeParse({ id: c.req.param('id') })`. If invalid, return 400 with `{ error: 'El ID de curso debe ser un entero positivo' }`.
   - Check if course exists: `SELECT id FROM courses WHERE id = ?`. If missing, return 404 with `{ error: 'Curso no encontrado' }`.
   - Query `course_contents`: `SELECT sections_json, updated_at FROM course_contents WHERE course_id = ?`.
   - If row is null, return `{ course_id: id, sections: [], synced_at: null }`.
   - If row exists, parse `sections_json` within `try / catch`. If invalid JSON, fallback to `sections: []`.

4. **Course Grades Route Design (from Observation 3 & 4)**:
   - Validate `:id` using `CourseGradesParamsSchema.safeParse({ id: c.req.param('id') })`. If invalid, return 400.
   - Check if course exists: `SELECT id FROM courses WHERE id = ?`. If missing, return 404.
   - Query `synced_items`: `WHERE course_id = ? AND item_type = 'grade' AND deleted_at IS NULL ORDER BY timemodified DESC`.
   - Safe parsing of `payload_json` to extract `grademin`, `grademax`, `feedback`, `grade_formatted`, etc., with `grade_num: row.grade_num ?? null`.

5. **Health Telemetry Route Design (from Observation 3 & 4)**:
   - Query `sync_state WHERE id = 1` and `sync_runs ORDER BY id DESC LIMIT 15`.
   - Calculate `failure_rate = recent_runs.length === 0 ? 0 : recent_runs.filter(r => r.status === 'error').length / recent_runs.length`.
   - Calculate subrequest metrics: `last_used = recent_runs[0]?.subrequests_used ?? 0`, `max_budget = 45`, `max_recent = Math.max(0, ...subrequests)`, `avg_recent = average of subrequests (0 if empty)`.
   - Determine health status:
     - `circuit_open` if `sync_state?.circuit_open_until > now`
     - `degraded` if `!sync_state || sync_state.baseline_seeded === 0 || sync_state.consecutive_failures > 0 || failure_rate > 0`
     - `error` if `failure_rate >= 1.0` (or `degraded`)
     - `ok` otherwise.
   - Include both modern keys and legacy compatibility aliases (`sync_state` + `syncState`, `recent_runs` + `lastRun`).

---

## 3. Caveats

1. **`d1-mock.ts` Batch Behavior**:
   In `apps/worker/test/helpers/d1-mock.ts`, the mock `batch` implementation calls `s.run()`, returning metadata instead of results. Therefore, never use `c.env.DB.batch()` for `SELECT` queries in route handlers; use `Promise.all([stmt1.all(), stmt2.all(), ...])`.
2. **Nullable vs Undefined Fields in Zod Schemas**:
   `grade_num` in `DashboardGradeSchema` and `GradeItemDetailSchema` is `z.number().nullable()` (nullable, NOT optional). If SQLite returns `undefined` or `null`, the code must explicitly assign `null` (`row.grade_num ?? null`), otherwise schema validation fails.
3. **Course Existence Check Precedes Fallback**:
   For both `/api/courses/:id/contents` and `/api/courses/:id/grades`, if course `:id` is not present in `courses`, the endpoint MUST return 404. Returning empty arrays for a non-existent course ID violates test `T2-CONT-04` and `T2-GRAD-04`.

---

## 4. Conclusion & Precise Designs

### A. SQL Migration: `apps/worker/migrations/0003_phase3_course_contents.sql`

```sql
-- 0003_phase3_course_contents.sql
-- Almacenamiento de secciones y recursos del curso para Fase 3 (BFF Read API)

CREATE TABLE IF NOT EXISTS course_contents (
  course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  sections_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

### B. Route Implementation Designs

#### 1. `apps/worker/src/routes/dashboard.ts`

```ts
import { Hono } from 'hono';
import {
  DashboardResponseSchema,
  type DashboardCourse,
  type UpcomingAssignment,
  type RecentActivityItem,
  type DashboardGrade,
} from '@better-moodle/shared';
import type { Env } from '../index';

export const dashboardRouter = new Hono<{ Bindings: Env }>();

dashboardRouter.get('/api/dashboard', async (c) => {
  try {
    const now = Math.floor(Date.now() / 1000);

    // 1. Enrolled courses
    const coursesStmt = c.env.DB.prepare(
      'SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC'
    );

    // 2. Upcoming assignments (due_date >= now AND deleted_at IS NULL)
    const assignmentsStmt = c.env.DB.prepare(`
      SELECT 
        si.item_key,
        si.course_id,
        COALESCE(c.shortname, c.fullname) AS course_name,
        si.title,
        si.url,
        si.due_date,
        si.submission_status,
        si.timemodified
      FROM synced_items si
      LEFT JOIN courses c ON c.id = si.course_id
      WHERE si.item_type = 'assignment'
        AND si.due_date >= ?
        AND si.deleted_at IS NULL
      ORDER BY si.due_date ASC, si.timemodified DESC
    `).bind(now);

    // 3. Recent activity (bounded limit 15, DESC order)
    const activityStmt = c.env.DB.prepare(`
      SELECT 
        si.item_key,
        si.course_id,
        COALESCE(c.shortname, c.fullname) AS course_name,
        si.item_type,
        si.title,
        si.url,
        si.timemodified,
        si.updated_at
      FROM synced_items si
      LEFT JOIN courses c ON c.id = si.course_id
      WHERE si.deleted_at IS NULL
      ORDER BY si.timemodified DESC, si.updated_at DESC
      LIMIT 15
    `);

    // 4. Current grades
    const gradesStmt = c.env.DB.prepare(`
      SELECT 
        si.item_key,
        si.course_id,
        COALESCE(c.shortname, c.fullname) AS course_name,
        si.title,
        si.grade_num,
        si.timemodified,
        si.url,
        si.payload_json
      FROM synced_items si
      LEFT JOIN courses c ON c.id = si.course_id
      WHERE si.item_type = 'grade'
        AND si.deleted_at IS NULL
      ORDER BY si.timemodified DESC, si.item_key ASC
    `);

    // Concurrent read execution without calling Moodle (RNF-02)
    const [coursesRes, assignmentsRes, activityRes, gradesRes] = await Promise.all([
      coursesStmt.all<any>(),
      assignmentsStmt.all<any>(),
      activityStmt.all<any>(),
      gradesStmt.all<any>(),
    ]);

    const courses: DashboardCourse[] = (coursesRes.results ?? []).map((row) => ({
      id: row.id,
      shortname: row.shortname,
      fullname: row.fullname,
      progress: row.progress ?? null,
      refreshed_at: row.refreshed_at,
    }));

    const upcoming_assignments: UpcomingAssignment[] = (assignmentsRes.results ?? []).map((row) => ({
      item_key: row.item_key,
      course_id: row.course_id,
      course_name: row.course_name ?? null,
      title: row.title,
      url: row.url ?? null,
      due_date: row.due_date,
      submission_status: row.submission_status ?? null,
      timemodified: row.timemodified,
    }));

    const recent_activity: RecentActivityItem[] = (activityRes.results ?? []).map((row) => ({
      item_key: row.item_key,
      course_id: row.course_id,
      course_name: row.course_name ?? null,
      item_type: row.item_type,
      title: row.title,
      url: row.url ?? null,
      timemodified: row.timemodified,
      updated_at: row.updated_at,
    }));

    const current_grades: DashboardGrade[] = (gradesRes.results ?? []).map((row) => {
      let gradeFormatted: string | null = null;
      if (row.payload_json) {
        try {
          const payload = JSON.parse(row.payload_json);
          if (payload.gradeformatted) {
            gradeFormatted = String(payload.gradeformatted);
          }
        } catch {
          gradeFormatted = null;
        }
      }

      return {
        item_key: row.item_key,
        course_id: row.course_id,
        course_name: row.course_name ?? null,
        title: row.title,
        grade_num: row.grade_num !== undefined ? row.grade_num : null,
        grade_formatted: gradeFormatted,
        timemodified: row.timemodified,
        url: row.url ?? null,
      };
    });

    const payload = {
      courses,
      upcoming_assignments,
      recent_activity,
      current_grades,
    };

    const validated = DashboardResponseSchema.parse(payload);
    return c.json(validated, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error consultando el dashboard';
    return c.json({ error: message }, 500);
  }
});
```

---

#### 2. `apps/worker/src/routes/courses.ts`

```ts
import { Hono } from 'hono';
import {
  CourseContentsParamsSchema,
  CourseContentsResponseSchema,
  CourseGradesParamsSchema,
  CourseGradesResponseSchema,
  type GradeItemDetail,
} from '@better-moodle/shared';
import type { Env } from '../index';

export const coursesRouter = new Hono<{ Bindings: Env }>();

// GET /api/courses: preserves existing list
coursesRouter.get('/api/courses', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC'
    ).all();
    return c.json({ courses: results ?? [] }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error consultando cursos';
    return c.json({ error: message }, 500);
  }
});

// GET /api/courses/:id/contents: strictly reads course_contents from D1
coursesRouter.get('/api/courses/:id/contents', async (c) => {
  const paramResult = CourseContentsParamsSchema.safeParse({ id: c.req.param('id') });
  if (!paramResult.success) {
    return c.json(
      { error: paramResult.error.errors[0]?.message ?? 'ID de curso inválido', code: 'INVALID_COURSE_ID' },
      400
    );
  }

  const courseId = paramResult.data.id;

  try {
    // 1. Verify course existence (404 if missing)
    const course = await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(courseId).first();
    if (!course) {
      return c.json({ error: `Curso con ID ${courseId} no encontrado`, code: 'COURSE_NOT_FOUND' }, 404);
    }

    // 2. Fetch cached course contents
    const contentsRow = await c.env.DB.prepare(
      'SELECT sections_json, updated_at FROM course_contents WHERE course_id = ?'
    )
      .bind(courseId)
      .first<{ sections_json: string; updated_at: number }>();

    if (!contentsRow) {
      const fallback = { course_id: courseId, sections: [], synced_at: null };
      return c.json(CourseContentsResponseSchema.parse(fallback), 200);
    }

    let sections: any[] = [];
    try {
      const parsed = JSON.parse(contentsRow.sections_json);
      sections = Array.isArray(parsed) ? parsed : [];
    } catch {
      // Safe fallback for corrupted sections_json
      sections = [];
    }

    const responsePayload = {
      course_id: courseId,
      sections,
      synced_at: contentsRow.updated_at,
    };

    return c.json(CourseContentsResponseSchema.parse(responsePayload), 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error consultando contenidos';
    return c.json({ error: message }, 500);
  }
});

// GET /api/courses/:id/grades: normalized grade items from D1
coursesRouter.get('/api/courses/:id/grades', async (c) => {
  const paramResult = CourseGradesParamsSchema.safeParse({ id: c.req.param('id') });
  if (!paramResult.success) {
    return c.json(
      { error: paramResult.error.errors[0]?.message ?? 'ID de curso inválido', code: 'INVALID_COURSE_ID' },
      400
    );
  }

  const courseId = paramResult.data.id;

  try {
    // 1. Verify course existence (404 if missing)
    const course = await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(courseId).first();
    if (!course) {
      return c.json({ error: `Curso con ID ${courseId} no encontrado`, code: 'COURSE_NOT_FOUND' }, 404);
    }

    // 2. Fetch grade items strictly from D1
    const { results } = await c.env.DB.prepare(`
      SELECT item_key, course_id, title, grade_num, timemodified, url, payload_json
      FROM synced_items
      WHERE course_id = ?
        AND item_type = 'grade'
        AND deleted_at IS NULL
      ORDER BY timemodified DESC, item_key ASC
    `)
      .bind(courseId)
      .all<any>();

    const grades: GradeItemDetail[] = (results ?? []).map((row) => {
      let payload: any = {};
      if (row.payload_json) {
        try {
          payload = JSON.parse(row.payload_json);
        } catch {
          payload = {};
        }
      }

      return {
        item_key: row.item_key,
        course_id: row.course_id,
        title: row.title,
        grade_num: row.grade_num !== undefined ? row.grade_num : null,
        grade_formatted: payload.gradeformatted ?? null,
        grademin: payload.grademin ?? null,
        grademax: payload.grademax ?? null,
        percentage_formatted: payload.percentageformatted ?? null,
        feedback: payload.feedback ?? null,
        itemtype: payload.itemtype ?? null,
        itemmodule: payload.itemmodule ?? null,
        weight_formatted: payload.weightformatted ?? null,
        timemodified: row.timemodified,
        url: row.url ?? null,
      };
    });

    const responsePayload = {
      course_id: courseId,
      grades,
    };

    return c.json(CourseGradesResponseSchema.parse(responsePayload), 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error consultando calificaciones';
    return c.json({ error: message }, 500);
  }
});
```

---

#### 3. `apps/worker/src/routes/health.ts`

```ts
import { Hono } from 'hono';
import { EnhancedHealthResponseSchema } from '@better-moodle/shared';
import type { Env } from '../index';

export const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get('/api/health', async (c) => {
  try {
    const now = Math.floor(Date.now() / 1000);

    const [syncStateRes, runsRes] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM sync_state WHERE id = 1').first<any>(),
      c.env.DB.prepare(`
        SELECT id, started_at, finished_at, status, subrequests_used, items_changed, error
        FROM sync_runs
        ORDER BY id DESC
        LIMIT 15
      `).all<any>(),
    ]);

    const syncState = syncStateRes ?? null;
    const recentRuns = runsRes.results ?? [];

    // Calculate failure rate
    const failureRate =
      recentRuns.length === 0
        ? 0.0
        : Number((recentRuns.filter((r) => r.status === 'error').length / recentRuns.length).toFixed(4));

    // Calculate subrequest telemetry
    const lastUsed = recentRuns[0]?.subrequests_used ?? 0;
    const maxBudget = 45;
    const maxRecent = recentRuns.length === 0 ? 0 : Math.max(0, ...recentRuns.map((r) => r.subrequests_used ?? 0));
    const avgRecent =
      recentRuns.length === 0
        ? 0
        : recentRuns.reduce((sum, r) => sum + (r.subrequests_used ?? 0), 0) / recentRuns.length;

    // Determine status
    let status: 'ok' | 'degraded' | 'error' | 'circuit_open' = 'ok';
    if (syncState && syncState.circuit_open_until && syncState.circuit_open_until > now) {
      status = 'circuit_open';
    } else if (!syncState || syncState.baseline_seeded === 0) {
      status = 'degraded';
    } else if (failureRate >= 1.0) {
      status = 'degraded'; // Or 'error', test accepts both ['degraded', 'error']
    } else if (syncState.consecutive_failures > 0 || failureRate > 0) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    const payload = {
      status,
      timestamp: Date.now(),
      sync_state: syncState,
      syncState: syncState, // Retrocompatibility alias
      recent_runs: recentRuns,
      lastRun: recentRuns[0] ?? null, // Retrocompatibility alias
      failure_rate: failureRate,
      subrequests: {
        last_used: lastUsed,
        max_budget: maxBudget,
        avg_recent: avgRecent,
        max_recent: maxRecent,
      },
    };

    const validated = EnhancedHealthResponseSchema.parse(payload);
    return c.json(validated, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en consulta de base de datos';
    return c.json({ error: message, status: 'error' }, 500);
  }
});
```

---

#### 4. Preserved Routes: `items.ts` & `sync.ts`
- `items.ts`: mounts `GET /api/items` with optional `?type=` filter and order `due_date ASC, timemodified DESC`.
- `sync.ts`: mounts `POST /api/sync/manual` with 30-second rate limiter checking `sync_state.last_attempt_at`.

---

## 5. Verification Method

1. **Verify D1 Migration File Creation**:
   - Inspect `apps/worker/migrations/0003_phase3_course_contents.sql`.
   - Ensure DDL matches `CREATE TABLE IF NOT EXISTS course_contents (course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE, sections_json TEXT NOT NULL, updated_at INTEGER NOT NULL);`.

2. **Verify Zero Outbound Network Calls (RNF-02)**:
   - Run tests with `fetchGuard`:
     `bun test apps/worker/test/e2e/tier1-features.test.ts`
   - All tests asserting `fetchGuard.assertZeroCalls()` must pass without throwing `[RNF-02 VIOLATION]`.

3. **Verify Boundary and Failure Cases**:
   - Run:
     `bun test apps/worker/test/e2e/tier2-boundaries.test.ts`
   - Confirms:
     - 400 Bad Request on negative, non-numeric, decimal `:id`.
     - 404 Not Found on non-existent course `:id`.
     - 200 OK safe fallback on corrupted `sections_json`.
     - 500 Internal Server Error formatted with `ApiErrorResponseSchema` when DB prepare fails.

4. **Verify TypeScript and Monorepo Compilation**:
   - Run:
     `bunx tsc --noEmit -p apps/worker/tsconfig.json`
   - Run:
     `bun run build:web`
