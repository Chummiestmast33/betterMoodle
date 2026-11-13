## 2026-11-12T23:02:10Z
You are Explorer 2 for Milestone M2 (D1 Read BFF Endpoints).
Working Directory: c:\Users\corte\Downloads\betterMoodle
State Folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_2
Scope Document: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\sub_orch_m2\SCOPE.md
Authoritative Request: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md
Global Architecture: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md

Your mission:
Investigate D1 database migrations in `apps/worker/migrations/` and design the SQL migration `0003_phase3_course_contents.sql`.
Design the precise D1 SQL queries and data mapping logic for all read endpoints:
1. `apps/worker/migrations/0003_phase3_course_contents.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS course_contents (
     course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
     sections_json TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   ```
2. `GET /api/dashboard`: consolidated query for enrolled courses, upcoming assignments (`due_date >= now AND deleted_at IS NULL`), recent activity, and latest grades.
3. `GET /api/courses`: existing list query.
4. `GET /api/courses/:id/contents`: query `course_contents`. Fallback behavior when no row exists: `{ course_id: id, sections: [], synced_at: null }`. Safe parsing of `sections_json`.
5. `GET /api/courses/:id/grades`: query `synced_items` (`course_id = ? AND item_type = 'grade' AND deleted_at IS NULL`).
6. `GET /api/health`: read `sync_state`, recent history from `sync_runs`, compute failure rate and subrequest metrics.
Verify that all read endpoints read strictly from D1 with zero network calls to Moodle (RNF-02).
Do NOT modify any code. Write your comprehensive analysis, SQL designs, and data mapping recommendations to:
`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_m2_2\handoff.md`
Then send a completion message to the parent sub-orchestrator.
