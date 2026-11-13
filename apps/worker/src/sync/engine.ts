import { MoodleClient, MoodleError } from '../moodle/client';
import { formatAggregatedAlert, sendTelegramMessage, type SyncChange } from '../notify/telegram';
import { sendWebPushNotifications, type WebPushEnv } from '../notify/webpush';
import { syncAssignments } from './assignments';
import { syncGrades } from './grades';
import { syncForums } from './forums';
import { syncCourseContents } from './contents';

const COURSES_CACHE_SEC = 21600; // 6 horas (§4.4)
const DEAD_MAN_THRESHOLD_SEC = 1800; // 30 minutos (RF-10)
const MAX_SUBREQUESTS = 45; // Corte antes del límite duro de 50 (RNF-05)

export interface SyncEnv extends WebPushEnv {
  DB: D1Database;
  MOODLE_TOKEN?: string;
  MOODLE_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export interface SyncOptions {
  isScheduled?: boolean;
  force?: boolean;
}

export interface SyncResult {
  status: 'ok' | 'partial' | 'error' | 'circuit_open';
  coursesCount: number;
  itemsChanged: number;
  subrequestsUsed: number;
  baselineSeeded: boolean;
  error?: string;
}

interface SyncStateRow {
  baseline_seeded: number;
  last_success_at: number;
  consecutive_failures: number;
  moodle_user_id: number | null;
  courses_refreshed_at: number;
  grades_seeded: number;
  forums_seeded: number;
  circuit_open_until: number;
  dead_man_alerted: number;
}

interface CachedCourseRow {
  id: number;
  shortname: string;
  fullname: string;
}

async function applyJitter(): Promise<void> {
  const jitterMs = 1000 + Math.floor(Math.random() * 4000);
  await new Promise((resolve) => setTimeout(resolve, jitterMs));
}

async function maybeSendDeadManAlert(
  env: SyncEnv,
  state: SyncStateRow,
  failures: number,
  now: number,
  errorText: string
): Promise<boolean> {
  if (state.dead_man_alerted === 1) return true;

  const stalledTooLong = state.last_success_at > 0 && now - state.last_success_at >= DEAD_MAN_THRESHOLD_SEC;
  if (failures < 6 && !stalledTooLong) return false;

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_CHAT_ID,
      `⚠️ <b>BetterMoodle: Alerta de salud del sync</b>\nLleva ${failures} fallos consecutivos (>30 min sin sincronizar).\nÚltimo error: <code>${errorText}</code>`
    ).catch(() => {});
  }
  return true;
}

async function resolveCourses(
  db: D1Database,
  client: MoodleClient,
  state: SyncStateRow,
  now: number,
  force: boolean
): Promise<{
  moodleUserId: number;
  courseIds: number[];
  courseNameMap: Map<number, string>;
  coursesRefreshedAt: number;
}> {
  let moodleUserId = state.moodle_user_id;
  if (!moodleUserId) {
    const siteInfo = await client.getSiteInfo();
    moodleUserId = siteInfo.userid;
  }

  const cached = await db
    .prepare('SELECT id, shortname, fullname FROM courses ORDER BY id ASC')
    .all<CachedCourseRow>();

  const needsRefresh =
    force ||
    cached.results.length === 0 ||
    now - state.courses_refreshed_at >= COURSES_CACHE_SEC;

  const courseNameMap = new Map<number, string>();

  if (!needsRefresh) {
    for (const c of cached.results) {
      courseNameMap.set(c.id, c.shortname || c.fullname);
    }
    return {
      moodleUserId,
      courseIds: cached.results.map((c) => c.id),
      courseNameMap,
      coursesRefreshedAt: state.courses_refreshed_at,
    };
  }

  const courses = await client.getUserCourses(moodleUserId);
  if (courses.length > 0) {
    const stmts = courses.map((course) => {
      courseNameMap.set(course.id, course.shortname || course.fullname);
      return db
        .prepare(
          `INSERT INTO courses (id, shortname, fullname, progress, payload_json, refreshed_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             shortname = excluded.shortname,
             fullname = excluded.fullname,
             progress = excluded.progress,
             payload_json = excluded.payload_json,
             refreshed_at = excluded.refreshed_at`
        )
        .bind(
          course.id,
          course.shortname,
          course.fullname,
          course.progress ?? null,
          JSON.stringify(course),
          now
        );
    });
    await db.batch(stmts);
  }

  return {
    moodleUserId,
    courseIds: courses.map((c) => c.id),
    courseNameMap,
    coursesRefreshedAt: now,
  };
}

export async function runSync(env: SyncEnv, options: SyncOptions = {}): Promise<SyncResult> {
  const startedAt = Math.floor(Date.now() / 1000);
  const moodleUrl = (env.MOODLE_URL || 'https://catedig.itlalaguna.edu.mx').replace(/\/$/, '');

  if (!env.MOODLE_TOKEN) {
    return {
      status: 'error',
      coursesCount: 0,
      itemsChanged: 0,
      subrequestsUsed: 0,
      baselineSeeded: false,
      error: 'MOODLE_TOKEN no configurado',
    };
  }

  const state = (await env.DB.prepare(
    `SELECT baseline_seeded, last_success_at, consecutive_failures,
            moodle_user_id, courses_refreshed_at, grades_seeded,
            forums_seeded, circuit_open_until, dead_man_alerted
     FROM sync_state WHERE id = 1`
  ).first<SyncStateRow>()) ?? {
    baseline_seeded: 0,
    last_success_at: 0,
    consecutive_failures: 0,
    moodle_user_id: null,
    courses_refreshed_at: 0,
    grades_seeded: 0,
    forums_seeded: 0,
    circuit_open_until: 0,
    dead_man_alerted: 0,
  };

  // Circuit breaker (RNF-03)
  if (!options.force && state.consecutive_failures >= 3 && startedAt < state.circuit_open_until) {
    const alerted = await maybeSendDeadManAlert(
      env,
      state,
      state.consecutive_failures,
      startedAt,
      'Circuit breaker abierto temporalmente por fallos repetidos.'
    );
    if (alerted && state.dead_man_alerted === 0) {
      await env.DB.prepare('UPDATE sync_state SET dead_man_alerted = 1 WHERE id = 1').run();
    }
    return {
      status: 'circuit_open',
      coursesCount: 0,
      itemsChanged: 0,
      subrequestsUsed: 0,
      baselineSeeded: state.baseline_seeded === 1,
      error: `Circuit breaker activo hasta ${new Date(state.circuit_open_until * 1000).toISOString()}`,
    };
  }

  if (options.isScheduled) {
    await applyJitter();
  }

  const runInsert = await env.DB.prepare(
    'INSERT INTO sync_runs (started_at, status) VALUES (?, ?)'
  )
    .bind(startedAt, 'error')
    .run();
  const runId = runInsert.meta.last_row_id;

  await env.DB.prepare('UPDATE sync_state SET last_attempt_at = ? WHERE id = 1')
    .bind(startedAt)
    .run();

  const client = new MoodleClient(moodleUrl, env.MOODLE_TOKEN, MAX_SUBREQUESTS);

  try {
    const now = Math.floor(Date.now() / 1000);
    const isFirstSeed = state.baseline_seeded === 0;

    const { moodleUserId, courseIds, courseNameMap, coursesRefreshedAt } =
      await resolveCourses(env.DB, client, state, now, Boolean(options.force));

    const assignRes = await syncAssignments(
      env.DB,
      client,
      moodleUrl,
      courseIds,
      courseNameMap,
      now,
      !isFirstSeed
    );

    const gradesRes = await syncGrades(
      env.DB,
      client,
      moodleUrl,
      moodleUserId,
      now,
      state.grades_seeded === 1
    );

    const forumsRes = await syncForums(
      env.DB,
      client,
      moodleUrl,
      now,
      state.forums_seeded === 1
    );

    const contentsRes = await syncCourseContents(
      env.DB,
      client,
      now,
      Boolean(options.force)
    );

    const allChanges: SyncChange[] = isFirstSeed
      ? []
      : [...assignRes.changes, ...gradesRes.changes, ...forumsRes.changes];

    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      if (isFirstSeed) {
        await sendTelegramMessage(
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_CHAT_ID,
          `✅ <b>BetterMoodle inicializado</b>\nSe indexaron ${courseIds.length} materias y ${assignRes.totalSeen} tareas sin inundar de alertas. A partir del siguiente ciclo recibirás novedades.`
        );
      } else if (allChanges.length > 0) {
        const msg = formatAggregatedAlert(allChanges);
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, msg);
      }
    }

    if (!isFirstSeed && allChanges.length > 0) {
      await sendWebPushNotifications(env, allChanges).catch(() => {});
    }

    const isPartial =
      assignRes.partial || gradesRes.partial || forumsRes.partial || contentsRes.partial;
    const runStatus = isPartial ? 'partial' : 'ok';
    const finishedAt = Math.floor(Date.now() / 1000);

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE sync_state
         SET baseline_seeded = 1,
             last_success_at = ?,
             consecutive_failures = 0,
             moodle_user_id = ?,
             courses_refreshed_at = ?,
             grades_seeded = ?,
             forums_seeded = ?,
             circuit_open_until = 0,
             dead_man_alerted = 0
         WHERE id = 1`
      ).bind(
        finishedAt,
        moodleUserId,
        coursesRefreshedAt,
        state.grades_seeded === 1 || gradesRes.allCoursesSeeded ? 1 : 0,
        state.forums_seeded === 1 || forumsRes.allCoursesSeeded ? 1 : 0
      ),
      env.DB.prepare(
        `UPDATE sync_runs
         SET finished_at = ?, status = ?, subrequests_used = ?, items_changed = ?, error = NULL
         WHERE id = ?`
      ).bind(finishedAt, runStatus, client.subrequestsUsed, allChanges.length, runId),
    ]);

    return {
      status: runStatus,
      coursesCount: courseIds.length,
      itemsChanged: allChanges.length,
      subrequestsUsed: client.subrequestsUsed,
      baselineSeeded: true,
    };
  } catch (err: unknown) {
    const finishedAt = Math.floor(Date.now() / 1000);
    const message = err instanceof Error ? err.message : String(err);
    const errorCode = err instanceof MoodleError ? err.errorcode : undefined;
    const fullError = errorCode ? `[${errorCode}] ${message}` : message;

    const failures = state.consecutive_failures + 1;
    const circuitOpenUntil =
      failures >= 3
        ? finishedAt + Math.min(300 * 2 ** (failures - 3), 3600)
        : 0;

    const alerted = await maybeSendDeadManAlert(env, state, failures, finishedAt, fullError);

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE sync_state
         SET consecutive_failures = ?, circuit_open_until = ?, dead_man_alerted = ?
         WHERE id = 1`
      ).bind(failures, circuitOpenUntil, alerted ? 1 : state.dead_man_alerted),
      env.DB.prepare(
        `UPDATE sync_runs
         SET finished_at = ?, status = 'error', subrequests_used = ?, error = ?
         WHERE id = ?`
      ).bind(finishedAt, client.subrequestsUsed, fullError, runId),
    ]);

    return {
      status: 'error',
      coursesCount: 0,
      itemsChanged: 0,
      subrequestsUsed: client.subrequestsUsed,
      baselineSeeded: state.baseline_seeded === 1,
      error: fullError,
    };
  }
}
