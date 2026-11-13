import { Hono } from 'hono';
import {
  CourseContentsParamsSchema,
  CourseContentsResponseSchema,
  CourseGradesParamsSchema,
  CourseGradesResponseSchema,
  type GradeItemDetail,
} from '@better-moodle/shared';
import type { Env } from '../types';

export const coursesRouter = new Hono<{ Bindings: Env }>();

const toNullableString = (val: unknown): string | null => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
};

const toNullableNumber = (val: unknown): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
};

// GET /api/courses: preserves existing list
coursesRouter.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC'
    ).all();
    return c.json({ courses: results ?? [] }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error consultando cursos';
    return c.json({ error: message, status: 'error' }, 500);
  }
});

// GET /api/courses/:id/contents: strictly reads course_contents from D1
coursesRouter.get('/:id/contents', async (c) => {
  const paramResult = CourseContentsParamsSchema.safeParse({ id: c.req.param('id') });
  if (!paramResult.success) {
    return c.json(
      {
        error: paramResult.error.errors[0]?.message ?? 'ID de curso inválido',
        code: 'INVALID_COURSE_ID',
      },
      400
    );
  }

  const courseId = paramResult.data.id;

  try {
    // 1. Verify course existence (404 if missing)
    const course = await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(courseId).first();
    if (!course) {
      return c.json(
        {
          error: `Curso con ID ${courseId} no encontrado`,
          code: 'COURSE_NOT_FOUND',
        },
        404
      );
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
      // Safe fallback for corrupted sections_json (T2-CONT-05)
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
    return c.json({ error: message, status: 'error' }, 500);
  }
});

// GET /api/courses/:id/grades: normalized grade items from D1
coursesRouter.get('/:id/grades', async (c) => {
  const paramResult = CourseGradesParamsSchema.safeParse({ id: c.req.param('id') });
  if (!paramResult.success) {
    return c.json(
      {
        error: paramResult.error.errors[0]?.message ?? 'ID de curso inválido',
        code: 'INVALID_COURSE_ID',
      },
      400
    );
  }

  const courseId = paramResult.data.id;

  try {
    // 1. Verify course existence (404 if missing)
    const course = await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(courseId).first();
    if (!course) {
      return c.json(
        {
          error: `Curso con ID ${courseId} no encontrado`,
          code: 'COURSE_NOT_FOUND',
        },
        404
      );
    }

    // 2. Fetch grade items strictly from D1
    const { results } = await c.env.DB.prepare(`
      SELECT item_key, course_id, title, grade_num, timemodified, url, payload_json
      FROM synced_items
      WHERE course_id = ?
        AND item_type = 'grade'
        AND deleted_at IS NULL
      ORDER BY timemodified DESC, rowid ASC
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
        grade_formatted: toNullableString(payload.gradeformatted ?? payload.grade_formatted),
        grademin: toNullableNumber(payload.grademin),
        grademax: toNullableNumber(payload.grademax),
        percentage_formatted: toNullableString(payload.percentageformatted ?? payload.percentage_formatted),
        feedback: toNullableString(payload.feedback),
        itemtype: toNullableString(payload.itemtype),
        itemmodule: toNullableString(payload.itemmodule),
        weight_formatted: toNullableString(payload.weightformatted ?? payload.weight_formatted),
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
    return c.json({ error: message, status: 'error' }, 500);
  }
});
