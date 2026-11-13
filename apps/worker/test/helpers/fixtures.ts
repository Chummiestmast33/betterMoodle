import type { TestD1Database } from './d1-mock';

export interface CourseSeed {
  id: number;
  shortname: string;
  fullname: string;
  progress?: number | null;
  payload_json?: string | null;
  refreshed_at?: number;
}

export interface ItemSeed {
  item_key: string;
  course_id: number;
  item_type: 'assignment' | 'grade' | 'announcement';
  title: string;
  url?: string | null;
  due_date?: number | null;
  grade_num?: number | null;
  submission_status?: 'pending' | 'draft' | 'submitted' | 'graded' | null;
  timemodified?: number;
  payload_json?: string | null;
  deleted_at?: number | null;
}

export function seedCourse(db: TestD1Database, course: CourseSeed) {
  const now = Math.floor(Date.now() / 1000);
  db.sqlite
    .query(
      `INSERT OR REPLACE INTO courses (id, shortname, fullname, progress, payload_json, refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      course.id,
      course.shortname,
      course.fullname,
      course.progress ?? null,
      course.payload_json ?? null,
      course.refreshed_at ?? now
    );
}

export function seedItem(db: TestD1Database, item: ItemSeed) {
  const now = Math.floor(Date.now() / 1000);
  db.sqlite
    .query(
      `INSERT OR REPLACE INTO synced_items (
         item_key, course_id, item_type, title, url, due_date, grade_num,
         submission_status, timemodified, payload_json, first_seen_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      item.item_key,
      item.course_id,
      item.item_type,
      item.title,
      item.url ?? null,
      item.due_date ?? null,
      item.grade_num ?? null,
      item.submission_status ?? null,
      item.timemodified ?? now,
      item.payload_json ?? null,
      now,
      now,
      item.deleted_at ?? null
    );
}

export function seedCourseContents(
  db: TestD1Database,
  courseId: number,
  sectionsJson: string,
  updatedAt?: number
) {
  const now = updatedAt ?? Math.floor(Date.now() / 1000);
  db.sqlite
    .query(
      `INSERT OR REPLACE INTO course_contents (course_id, sections_json, updated_at)
       VALUES (?, ?, ?)`
    )
    .run(courseId, sectionsJson, now);
}

export interface SyncStateSeed {
  baseline_seeded?: number;
  last_success_at?: number;
  last_attempt_at?: number;
  consecutive_failures?: number;
  moodle_user_id?: number | null;
  courses_refreshed_at?: number;
  grades_seeded?: number;
  forums_seeded?: number;
  circuit_open_until?: number;
  dead_man_alerted?: number;
}

export function seedSyncState(db: TestD1Database, state: SyncStateSeed) {
  const now = Math.floor(Date.now() / 1000);
  db.sqlite
    .query(
      `INSERT OR REPLACE INTO sync_state (
         id, baseline_seeded, last_success_at, last_attempt_at, consecutive_failures,
         moodle_user_id, courses_refreshed_at, grades_seeded, forums_seeded,
         circuit_open_until, dead_man_alerted
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      state.baseline_seeded ?? 1,
      state.last_success_at ?? now - 300,
      state.last_attempt_at ?? now - 300,
      state.consecutive_failures ?? 0,
      state.moodle_user_id ?? 835,
      state.courses_refreshed_at ?? now,
      state.grades_seeded ?? 1,
      state.forums_seeded ?? 1,
      state.circuit_open_until ?? 0,
      state.dead_man_alerted ?? 0
    );
}

export interface SyncRunSeed {
  id?: number;
  started_at: number;
  finished_at?: number | null;
  status: 'ok' | 'partial' | 'error';
  subrequests_used?: number;
  items_changed?: number;
  error?: string | null;
}

export function seedSyncRun(db: TestD1Database, run: SyncRunSeed) {
  if (run.id) {
    db.sqlite
      .query(
        `INSERT OR REPLACE INTO sync_runs (id, started_at, finished_at, status, subrequests_used, items_changed, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.started_at,
        run.finished_at ?? run.started_at + 5,
        run.status,
        run.subrequests_used ?? 12,
        run.items_changed ?? 2,
        run.error ?? null
      );
  } else {
    db.sqlite
      .query(
        `INSERT INTO sync_runs (started_at, finished_at, status, subrequests_used, items_changed, error)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.started_at,
        run.finished_at ?? run.started_at + 5,
        run.status,
        run.subrequests_used ?? 12,
        run.items_changed ?? 2,
        run.error ?? null
      );
  }
}

export function clearAllData(db: TestD1Database) {
  db.sqlite.exec(`
    DELETE FROM courses;
    DELETE FROM synced_items;
    DELETE FROM course_contents;
    DELETE FROM sync_runs;
    UPDATE sync_state SET
      baseline_seeded = 0,
      last_success_at = 0,
      last_attempt_at = 0,
      consecutive_failures = 0,
      circuit_open_until = 0;
  `);
}
