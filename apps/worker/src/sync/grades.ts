import type { MoodleClient } from '../moodle/client';
import type { SyncChange } from '../notify/telegram';

const STAGGER_INTERVAL_SEC = 1800; // 30 minutos (§4.4)

interface ExistingGradeRow {
  item_key: string;
  grade_num: number | null;
  title: string;
}

interface CourseSyncRow {
  id: number;
  shortname: string;
  fullname: string;
  grades_synced_at: number;
}

export interface GradesSyncOutput {
  changes: SyncChange[];
  partial: boolean;
  allCoursesSeeded: boolean;
}

export function normalizeGrade(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null;
  }
  return Math.round(raw * 10000) / 10000;
}

function gradesEqual(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 1e-6;
}

export async function syncGrades(
  db: D1Database,
  client: MoodleClient,
  moodleUrl: string,
  moodleUserId: number,
  now: number,
  gradesSeeded: boolean
): Promise<GradesSyncOutput> {
  const staleThreshold = now - STAGGER_INTERVAL_SEC;
  const staleCourses = await db
    .prepare(
      `SELECT id, shortname, fullname, grades_synced_at
       FROM courses
       WHERE grades_synced_at < ?
       ORDER BY grades_synced_at ASC`
    )
    .bind(staleThreshold)
    .all<CourseSyncRow>();

  if (staleCourses.results.length === 0) {
    return { changes: [], partial: false, allCoursesSeeded: true };
  }

  const existingRows = await db
    .prepare("SELECT item_key, grade_num, title FROM synced_items WHERE item_type = 'grade'")
    .all<ExistingGradeRow>();

  const existingMap = new Map<string, ExistingGradeRow>();
  for (const row of existingRows.results) {
    existingMap.set(row.item_key, row);
  }

  const changes: SyncChange[] = [];
  let partial = false;
  let processed = 0;

  for (const course of staleCourses.results) {
    // Reservar presupuesto para foros y Telegram
    if (client.remainingBudget <= 6) {
      partial = true;
      break;
    }

    const res = await client.getGradeItems(course.id, moodleUserId);
    processed++;

    const userGrade = res.usergrades?.[0];
    const stmts: D1PreparedStatement[] = [];
    const courseName = course.shortname || course.fullname;

    if (userGrade?.gradeitems) {
      for (const item of userGrade.gradeitems) {
        const itemKey = `grade_${item.id}`;
        const title =
          item.itemname?.trim() ||
          (item.itemtype === 'course' ? 'Total del curso' : `Calificación #${item.id}`);
        const nextGrade = normalizeGrade(item.graderaw);
        const timemodified = item.gradedategraded ?? item.gradedatesubmitted ?? now;
        const url = item.cmid && item.itemmodule
          ? `${moodleUrl}/mod/${item.itemmodule}/view.php?id=${item.cmid}`
          : `${moodleUrl}/grade/report/user/index.php?id=${course.id}`;

        const existing = existingMap.get(itemKey);
        const prevGrade = existing?.grade_num ?? null;
        const gradeChanged = !gradesEqual(prevGrade, nextGrade);

        if (gradesSeeded && nextGrade !== null && gradeChanged) {
          changes.push({
            kind: prevGrade === null ? 'new' : 'updated',
            itemType: 'grade',
            courseName,
            title,
            gradeNum: nextGrade,
            url,
          });
        }

        if (!existing || gradeChanged || existing.title !== title) {
          stmts.push(
            db
              .prepare(
                `INSERT INTO synced_items (
                   item_key, course_id, item_type, title, url, due_date,
                   grade_num, timemodified, payload_json, first_seen_at, updated_at, deleted_at
                 ) VALUES (?, ?, 'grade', ?, ?, NULL, ?, ?, ?, ?, ?, NULL)
                 ON CONFLICT(item_key) DO UPDATE SET
                   title = excluded.title,
                   url = excluded.url,
                   grade_num = excluded.grade_num,
                   timemodified = excluded.timemodified,
                   payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at,
                   deleted_at = NULL`
              )
              .bind(
                itemKey,
                course.id,
                title,
                url,
                nextGrade,
                timemodified,
                JSON.stringify(item),
                now,
                now
              )
          );
        }
      }
    }

    stmts.push(
      db.prepare('UPDATE courses SET grades_synced_at = ? WHERE id = ?').bind(now, course.id)
    );
    await db.batch(stmts);
  }

  if (processed < staleCourses.results.length) {
    partial = true;
  }

  const unseeded = await db
    .prepare('SELECT COUNT(*) as cnt FROM courses WHERE grades_synced_at = 0')
    .first<{ cnt: number }>();

  return {
    changes,
    partial,
    allCoursesSeeded: (unseeded?.cnt ?? 0) === 0,
  };
}
