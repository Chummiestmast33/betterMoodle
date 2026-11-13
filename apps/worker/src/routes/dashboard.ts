import { Hono } from 'hono';
import {
  DashboardResponseSchema,
  type DashboardCourse,
  type UpcomingAssignment,
  type RecentActivityItem,
  type DashboardGrade,
} from '@better-moodle/shared';
import type { Env } from '../types';

export const dashboardRouter = new Hono<{ Bindings: Env }>();

dashboardRouter.get('/', async (c) => {
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

    // 3. Recent activity (bounded limit 15, DESC order by timemodified)
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
      progress: row.progress !== undefined ? row.progress : null,
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
      updated_at: row.updated_at ?? undefined,
    }));

    const current_grades: DashboardGrade[] = (gradesRes.results ?? []).map((row) => {
      let gradeFormatted: string | null = null;
      if (row.payload_json) {
        try {
          const payload = JSON.parse(row.payload_json);
          if (payload.gradeformatted !== undefined && payload.gradeformatted !== null) {
            gradeFormatted = String(payload.gradeformatted);
          } else if (payload.grade_formatted !== undefined && payload.grade_formatted !== null) {
            gradeFormatted = String(payload.grade_formatted);
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
    return c.json({ error: message, status: 'error' }, 500);
  }
});
