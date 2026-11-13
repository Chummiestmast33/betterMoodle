import type { MoodleClient } from '../moodle/client';
import type { SyncChange } from '../notify/telegram';

interface ExistingAssignmentRow {
  item_key: string;
  course_id: number;
  title: string;
  due_date: number | null;
  timemodified: number;
  submission_status: string | null;
  status_synced_at: number;
  deleted_at: number | null;
}

export interface AssignmentSyncOutput {
  changes: SyncChange[];
  totalSeen: number;
  partial: boolean;
}

function resolveSubmissionStatus(
  res: Awaited<ReturnType<MoodleClient['getSubmissionStatus']>>
): 'pending' | 'draft' | 'submitted' | 'graded' {
  const attempt = res.lastattempt;
  if (attempt?.graded || res.feedback?.grade) return 'graded';
  const rawStatus = attempt?.submission?.status;
  if (rawStatus === 'submitted') return 'submitted';
  if (rawStatus === 'draft') return 'draft';
  return 'pending';
}

export async function syncAssignments(
  db: D1Database,
  client: MoodleClient,
  moodleUrl: string,
  courseIds: number[],
  courseNameMap: Map<number, string>,
  now: number,
  isSeeded: boolean
): Promise<AssignmentSyncOutput> {
  const assignmentsRes = await client.getAssignments(courseIds);
  const existingRows = await db
    .prepare(
      `SELECT item_key, course_id, title, due_date, timemodified, submission_status, status_synced_at, deleted_at
       FROM synced_items WHERE item_type = 'assignment'`
    )
    .all<ExistingAssignmentRow>();

  const existingMap = new Map<string, ExistingAssignmentRow>();
  for (const row of existingRows.results) {
    existingMap.set(row.item_key, row);
  }

  const seenKeys = new Set<string>();
  const changes: SyncChange[] = [];
  const itemStmts: D1PreparedStatement[] = [];
  const statusCandidates: Array<{
    itemKey: string;
    assignId: number;
    courseId: number;
    courseName: string;
    title: string;
    baseDueDate: number | null;
    storedDueDate: number | null;
    url: string;
    statusSyncedAt: number;
    isNewOrUpdated: boolean;
  }> = [];

  for (const courseGroup of assignmentsRes.courses) {
    const courseName =
      courseNameMap.get(courseGroup.id) || courseGroup.shortname || courseGroup.fullname;

    for (const assign of courseGroup.assignments) {
      const itemKey = `assign_${assign.cmid}`;
      seenKeys.add(itemKey);

      const baseDueDate = assign.duedate > 0 ? assign.duedate : null;
      const url = `${moodleUrl}/mod/assign/view.php?id=${assign.cmid}`;
      const existing = existingMap.get(itemKey);
      const effectiveDueDate = existing?.due_date && baseDueDate
        ? Math.max(baseDueDate, existing.due_date)
        : (existing?.due_date ?? baseDueDate);

      let changeKind: SyncChange['kind'] | null = null;
      if (!existing || existing.deleted_at !== null) {
        changeKind = 'new';
      } else if (baseDueDate !== null && existing.due_date !== null && baseDueDate > existing.due_date) {
        changeKind = 'due_changed';
      } else if (existing.title !== assign.name || existing.timemodified !== assign.timemodified) {
        changeKind = 'updated';
      }

      if (changeKind) {
        changes.push({
          kind: changeKind,
          itemType: 'assignment',
          courseName,
          title: assign.name,
          dueDate: effectiveDueDate,
          url,
        });

        itemStmts.push(
          db
            .prepare(
              `INSERT INTO synced_items (
                 item_key, course_id, item_type, title, url, due_date,
                 grade_num, submission_status, status_synced_at, timemodified,
                 payload_json, first_seen_at, updated_at, deleted_at
               ) VALUES (?, ?, 'assignment', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)
               ON CONFLICT(item_key) DO UPDATE SET
                 course_id = excluded.course_id,
                 title = excluded.title,
                 url = excluded.url,
                 due_date = COALESCE(synced_items.due_date, excluded.due_date),
                 timemodified = excluded.timemodified,
                 payload_json = excluded.payload_json,
                 updated_at = excluded.updated_at,
                 deleted_at = NULL`
            )
            .bind(
              itemKey,
              courseGroup.id,
              assign.name,
              url,
              baseDueDate,
              existing?.submission_status ?? 'pending',
              existing?.status_synced_at ?? 0,
              assign.timemodified,
              JSON.stringify(assign),
              now,
              now
            )
        );
      }

      // Candidato para consultar mod_assign_get_submission_status (prórrogas y estado de entrega)
      const isRecentOrOpen =
        effectiveDueDate === null || effectiveDueDate >= now - 14 * 86400;
      const needsStatusCheck =
        isRecentOrOpen &&
        (!existing ||
          existing.submission_status === null ||
          (existing.submission_status !== 'graded' && now - existing.status_synced_at >= 1800));

      if (needsStatusCheck) {
        statusCandidates.push({
          itemKey,
          assignId: assign.id,
          courseId: courseGroup.id,
          courseName,
          title: assign.name,
          baseDueDate,
          storedDueDate: existing?.due_date ?? baseDueDate,
          url,
          statusSyncedAt: existing?.status_synced_at ?? 0,
          isNewOrUpdated: changeKind !== null,
        });
      }
    }
  }

  // Tombstones para tareas eliminadas en Moodle
  for (const [key, existing] of existingMap.entries()) {
    if (!seenKeys.has(key) && existing.deleted_at === null) {
      itemStmts.push(
        db
          .prepare('UPDATE synced_items SET deleted_at = ?, updated_at = ? WHERE item_key = ?')
          .bind(now, now, key)
      );
    }
  }

  if (itemStmts.length > 0) {
    await db.batch(itemStmts);
  }

  // Consultar estado de entrega y prórrogas ordenando por los más antiguos sin refrescar
  statusCandidates.sort((a, b) => a.statusSyncedAt - b.statusSyncedAt);
  const statusStmts: D1PreparedStatement[] = [];
  let partial = false;
  let checkedCount = 0;

  for (const cand of statusCandidates) {
    // Dejar margen para calificaciones, foros y Telegram
    if (client.remainingBudget <= 12 || checkedCount >= 12) {
      partial = checkedCount < statusCandidates.length;
      break;
    }

    try {
      const statusRes = await client.getSubmissionStatus(cand.assignId);
      checkedCount++;
      const subStatus = resolveSubmissionStatus(statusRes);
      const extDue = statusRes.lastattempt?.extensionduedate;
      const finalDueDate =
        extDue && extDue > 0 ? extDue : cand.baseDueDate;

      if (
        isSeeded &&
        !cand.isNewOrUpdated &&
        finalDueDate !== null &&
        cand.storedDueDate !== finalDueDate
      ) {
        changes.push({
          kind: 'due_changed',
          itemType: 'assignment',
          courseName: cand.courseName,
          title: cand.title,
          dueDate: finalDueDate,
          url: cand.url,
        });
      }

      statusStmts.push(
        db
          .prepare(
            `UPDATE synced_items
             SET due_date = ?, submission_status = ?, status_synced_at = ?, updated_at = ?
             WHERE item_key = ?`
          )
          .bind(finalDueDate, subStatus, now, now, cand.itemKey)
      );
    } catch {
      // Si una tarea específica falla en submission_status, continuar con las demás
      checkedCount++;
    }
  }

  if (statusStmts.length > 0) {
    await db.batch(statusStmts);
  }

  return { changes, totalSeen: seenKeys.size, partial };
}
