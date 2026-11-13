import type { MoodleClient, MoodleForum } from '../moodle/client';
import type { SyncChange } from '../notify/telegram';

const STAGGER_INTERVAL_SEC = 1800; // 30 minutos (§4.4)

interface ExistingDiscussionRow {
  item_key: string;
  title: string;
  timemodified: number;
  deleted_at: number | null;
}

interface CourseForumRow {
  id: number;
  shortname: string;
  fullname: string;
  forums_synced_at: number;
}

export interface ForumsSyncOutput {
  changes: SyncChange[];
  partial: boolean;
  allCoursesSeeded: boolean;
}

export async function syncForums(
  db: D1Database,
  client: MoodleClient,
  moodleUrl: string,
  now: number,
  forumsSeeded: boolean
): Promise<ForumsSyncOutput> {
  const staleThreshold = now - STAGGER_INTERVAL_SEC;
  const staleCourses = await db
    .prepare(
      `SELECT id, shortname, fullname, forums_synced_at
       FROM courses
       WHERE forums_synced_at < ?
       ORDER BY forums_synced_at ASC`
    )
    .bind(staleThreshold)
    .all<CourseForumRow>();

  if (staleCourses.results.length === 0) {
    return { changes: [], partial: false, allCoursesSeeded: true };
  }

  if (client.remainingBudget <= 3) {
    return { changes: [], partial: true, allCoursesSeeded: false };
  }

  const staleIds = staleCourses.results.map((c) => c.id);
  const forums = await client.getForumsByCourses(staleIds);

  const forumsByCourse = new Map<number, MoodleForum[]>();
  for (const forum of forums) {
    const list = forumsByCourse.get(forum.course) ?? [];
    list.push(forum);
    forumsByCourse.set(forum.course, list);
  }

  // Priorizar foro de avisos ('news') primero dentro de cada curso
  for (const list of forumsByCourse.values()) {
    list.sort((a, b) => (a.type === 'news' ? -1 : b.type === 'news' ? 1 : 0));
  }

  const existingRows = await db
    .prepare(
      "SELECT item_key, title, timemodified, deleted_at FROM synced_items WHERE item_type = 'announcement'"
    )
    .all<ExistingDiscussionRow>();

  const existingMap = new Map<string, ExistingDiscussionRow>();
  for (const row of existingRows.results) {
    existingMap.set(row.item_key, row);
  }

  const changes: SyncChange[] = [];
  let partial = false;

  for (const course of staleCourses.results) {
    const courseForums = forumsByCourse.get(course.id) ?? [];
    const courseName = course.shortname || course.fullname;
    const stmts: D1PreparedStatement[] = [];
    let courseCompleted = true;

    for (const forum of courseForums) {
      // Reservar presupuesto para notificaciones Telegram
      if (client.remainingBudget <= 2) {
        partial = true;
        courseCompleted = false;
        break;
      }

      const res = await client.getForumDiscussions(forum.id, 15);
      for (const d of res.discussions || []) {
        const discussionId = d.discussion ?? d.id;
        const itemKey = `discussion_${discussionId}`;
        const title = d.subject?.trim() || d.name;
        const url = `${moodleUrl}/mod/forum/discuss.php?d=${discussionId}`;
        const existing = existingMap.get(itemKey);

        let changeKind: SyncChange['kind'] | null = null;
        if (!existing || existing.deleted_at !== null) {
          changeKind = 'new';
        } else if (existing.timemodified !== d.timemodified || existing.title !== title) {
          changeKind = 'updated';
        }

        if (changeKind) {
          if (forumsSeeded) {
            changes.push({
              kind: changeKind,
              itemType: 'announcement',
              courseName,
              title,
              url,
            });
          }

          stmts.push(
            db
              .prepare(
                `INSERT INTO synced_items (
                   item_key, course_id, item_type, title, url, due_date,
                   grade_num, timemodified, payload_json, first_seen_at, updated_at, deleted_at
                 ) VALUES (?, ?, 'announcement', ?, ?, NULL, NULL, ?, ?, ?, ?, NULL)
                 ON CONFLICT(item_key) DO UPDATE SET
                   title = excluded.title,
                   url = excluded.url,
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
                d.timemodified,
                JSON.stringify({ ...d, forum_name: forum.name, forum_type: forum.type }),
                now,
                now
              )
          );
        }
      }
    }

    if (courseCompleted) {
      stmts.push(
        db.prepare('UPDATE courses SET forums_synced_at = ? WHERE id = ?').bind(now, course.id)
      );
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    if (!courseCompleted) {
      break;
    }
  }

  const unseeded = await db
    .prepare('SELECT COUNT(*) as cnt FROM courses WHERE forums_synced_at = 0')
    .first<{ cnt: number }>();

  return {
    changes,
    partial,
    allCoursesSeeded: (unseeded?.cnt ?? 0) === 0,
  };
}
