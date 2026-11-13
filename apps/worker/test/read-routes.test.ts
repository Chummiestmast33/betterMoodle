import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
  ApiErrorResponseSchema,
} from '@better-moodle/shared';
import {
  createTestClient,
  type TestClient,
  seedCourse,
  seedItem,
  seedCourseContents,
  seedSyncState,
  seedSyncRun,
  createForbiddenFetchGuard,
  type FetchMockControl,
} from './helpers';

describe('BFF Read Routes Unit & Integration Suite', () => {
  let client: TestClient;
  let fetchGuard: FetchMockControl;

  beforeEach(() => {
    client = createTestClient();
    fetchGuard = createForbiddenFetchGuard();
  });

  afterEach(() => {
    fetchGuard.restore();
  });

  // =========================================================================
  // 1. GET /api/dashboard
  // =========================================================================
  describe('GET /api/dashboard', () => {
    test('returns consolidated dashboard data from D1 strictly without network calls', async () => {
      const now = Math.floor(Date.now() / 1000);

      seedCourse(client.db, {
        id: 1,
        shortname: 'MAT101',
        fullname: 'Cálculo Diferencial',
        progress: 65.5,
      });
      seedCourse(client.db, {
        id: 2,
        shortname: 'FIS101',
        fullname: 'Física Clásica',
        progress: null,
      });

      seedItem(client.db, {
        item_key: 'assign_1',
        course_id: 1,
        item_type: 'assignment',
        title: 'Problem Set 1',
        due_date: now + 3600,
        submission_status: 'pending',
      });
      seedItem(client.db, {
        item_key: 'assign_past',
        course_id: 1,
        item_type: 'assignment',
        title: 'Past Assignment',
        due_date: now - 3600,
      });
      seedItem(client.db, {
        item_key: 'assign_deleted',
        course_id: 1,
        item_type: 'assignment',
        title: 'Deleted Assignment',
        due_date: now + 7200,
        deleted_at: now - 10,
      });

      seedItem(client.db, {
        item_key: 'ann_1',
        course_id: 1,
        item_type: 'announcement',
        title: 'Bienvenida al curso',
        timemodified: now - 50,
      });

      seedItem(client.db, {
        item_key: 'grade_1',
        course_id: 1,
        item_type: 'grade',
        title: 'Examen Diagnóstico',
        grade_num: 92.5,
        payload_json: JSON.stringify({ gradeformatted: '92.50 / 100' }),
      });

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const data = DashboardResponseSchema.parse(await res.json());

      // Courses
      expect(data.courses.length).toBe(2);
      expect(data.courses[0].shortname).toBe('MAT101');
      expect(data.courses[0].progress).toBe(65.5);
      expect(data.courses[1].progress).toBeNull();

      // Upcoming assignments (only future, non-deleted)
      expect(data.upcoming_assignments.length).toBe(1);
      expect(data.upcoming_assignments[0].item_key).toBe('assign_1');
      expect(data.upcoming_assignments[0].course_name).toBe('MAT101');

      // Recent activity
      expect(data.recent_activity.length).toBeGreaterThanOrEqual(1);

      // Current grades
      expect(data.current_grades.length).toBe(1);
      expect(data.current_grades[0].grade_num).toBe(92.5);
      expect(data.current_grades[0].grade_formatted).toBe('92.50 / 100');

      fetchGuard.assertZeroCalls();
    });

    test('cold start with empty database returns 200 with empty arrays', async () => {
      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const data = DashboardResponseSchema.parse(await res.json());
      expect(data.courses).toEqual([]);
      expect(data.upcoming_assignments).toEqual([]);
      expect(data.recent_activity).toEqual([]);
      expect(data.current_grades).toEqual([]);

      fetchGuard.assertZeroCalls();
    });

    test('recent activity caps at 15 items in descending timemodified order', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 10, shortname: 'CS100', fullname: 'Intro CS' });

      for (let i = 1; i <= 25; i++) {
        seedItem(client.db, {
          item_key: `act_${i}`,
          course_id: 10,
          item_type: 'announcement',
          title: `Announcement ${i}`,
          timemodified: now - (30 - i) * 60,
        });
      }

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const data = DashboardResponseSchema.parse(await res.json());
      expect(data.recent_activity.length).toBe(15);
      expect(data.recent_activity[0].item_key).toBe('act_25');

      for (let i = 0; i < data.recent_activity.length - 1; i++) {
        expect(data.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
          data.recent_activity[i + 1].timemodified
        );
      }

      fetchGuard.assertZeroCalls();
    });
  });

  // =========================================================================
  // 2. GET /api/courses
  // =========================================================================
  describe('GET /api/courses', () => {
    test('returns enrolled courses list ordered by fullname ASC', async () => {
      seedCourse(client.db, { id: 2, shortname: 'QUI', fullname: 'Quimica' });
      seedCourse(client.db, { id: 1, shortname: 'ALG', fullname: 'Algebra' });

      const res = await client.request('/api/courses');
      expect(res.status).toBe(200);

      const body = (await res.json()) as { courses: any[] };
      expect(body.courses.length).toBe(2);
      expect(body.courses[0].fullname).toBe('Algebra');
      expect(body.courses[1].fullname).toBe('Quimica');

      fetchGuard.assertZeroCalls();
    });
  });

  // =========================================================================
  // 3. GET /api/courses/:id/contents
  // =========================================================================
  describe('GET /api/courses/:id/contents', () => {
    test('returns cached contents tree for course', async () => {
      seedCourse(client.db, { id: 100, shortname: 'RED', fullname: 'Redes' });

      const sections = [
        {
          id: 1,
          name: 'Unidad 1',
          visible: 1,
          modules: [
            {
              id: 10,
              name: 'Guía de Estudio',
              modname: 'resource',
              contents: [
                {
                  filename: 'guia.pdf',
                  fileurl:
                    'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/10/guia.pdf',
                  filesize: 2048,
                  mimetype: 'application/pdf',
                },
              ],
            },
          ],
        },
      ];

      seedCourseContents(client.db, 100, JSON.stringify(sections), 1700000000);

      const res = await client.request('/api/courses/100/contents');
      expect(res.status).toBe(200);

      const data = CourseContentsResponseSchema.parse(await res.json());
      expect(data.course_id).toBe(100);
      expect(data.sections.length).toBe(1);
      expect(data.sections[0].name).toBe('Unidad 1');
      expect(data.sections[0].modules[0].contents![0].filename).toBe('guia.pdf');
      expect(data.synced_at).toBe(1700000000);

      fetchGuard.assertZeroCalls();
    });

    test('returns fallback with empty sections when course exists but has not been cached', async () => {
      seedCourse(client.db, { id: 101, shortname: 'SO', fullname: 'Sistemas Operativos' });

      const res = await client.request('/api/courses/101/contents');
      expect(res.status).toBe(200);

      const data = CourseContentsResponseSchema.parse(await res.json());
      expect(data.course_id).toBe(101);
      expect(data.sections).toEqual([]);
      expect(data.synced_at).toBeNull();

      fetchGuard.assertZeroCalls();
    });

    test('handles corrupted sections_json safely without crashing', async () => {
      seedCourse(client.db, { id: 102, shortname: 'CORR', fullname: 'Corrupt Contents Course' });
      client.db.sqlite
        .query(
          `INSERT OR REPLACE INTO course_contents (course_id, sections_json, updated_at)
           VALUES (102, '{corrupted-non-json:', 1700000000)`
        )
        .run();

      const res = await client.request('/api/courses/102/contents');
      expect(res.status).toBe(200);

      const data = CourseContentsResponseSchema.parse(await res.json());
      expect(data.course_id).toBe(102);
      expect(data.sections).toEqual([]);
      expect(data.synced_at).toBe(1700000000);

      fetchGuard.assertZeroCalls();
    });

    test('rejects non-numeric, decimal, zero, or negative course IDs with 400', async () => {
      for (const invalidId of ['notanumber', '12.34', '0', '-5', '1;DROP TABLE courses;']) {
        const res = await client.request(`/api/courses/${encodeURIComponent(invalidId)}/contents`);
        expect(res.status).toBe(400);

        const body = ApiErrorResponseSchema.parse(await res.json());
        expect(body.error).toBeDefined();
      }

      fetchGuard.assertZeroCalls();
    });

    test('returns 404 when course does not exist in courses table', async () => {
      const res = await client.request('/api/courses/999999/contents');
      expect(res.status).toBe(404);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });
  });

  // =========================================================================
  // 4. GET /api/courses/:id/grades
  // =========================================================================
  describe('GET /api/courses/:id/grades', () => {
    test('returns normalized grade items from D1', async () => {
      seedCourse(client.db, { id: 200, shortname: 'BD', fullname: 'Bases de Datos' });

      seedItem(client.db, {
        item_key: 'grade_bd_1',
        course_id: 200,
        item_type: 'grade',
        title: 'Examen Parcial 1',
        grade_num: 88.5,
        payload_json: JSON.stringify({
          gradeformatted: '88.50',
          grademin: 0,
          grademax: 100,
          feedback: 'Excelente desarrollo de consultas SQL',
          weightformatted: '30.00 %',
        }),
      });

      seedItem(client.db, {
        item_key: 'grade_bd_ungraded',
        course_id: 200,
        item_type: 'grade',
        title: 'Proyecto Final',
        grade_num: null,
      });

      // Assignment in same course must be excluded
      seedItem(client.db, {
        item_key: 'assign_bd_1',
        course_id: 200,
        item_type: 'assignment',
        title: 'Tarea 1',
      });

      const res = await client.request('/api/courses/200/grades');
      expect(res.status).toBe(200);

      const data = CourseGradesResponseSchema.parse(await res.json());
      expect(data.course_id).toBe(200);
      expect(data.grades.length).toBe(2);

      const graded = data.grades.find((g) => g.item_key === 'grade_bd_1');
      expect(graded).toBeDefined();
      expect(graded!.grade_num).toBe(88.5);
      expect(graded!.grade_formatted).toBe('88.50');
      expect(graded!.grademin).toBe(0);
      expect(graded!.grademax).toBe(100);
      expect(graded!.feedback).toBe('Excelente desarrollo de consultas SQL');
      expect(graded!.weight_formatted).toBe('30.00 %');

      const ungraded = data.grades.find((g) => g.item_key === 'grade_bd_ungraded');
      expect(ungraded).toBeDefined();
      expect(ungraded!.grade_num).toBeNull();

      fetchGuard.assertZeroCalls();
    });

    test('rejects non-numeric, decimal, zero, or negative course IDs with 400', async () => {
      for (const invalidId of ['invalid', '45.67', '0', '-10']) {
        const res = await client.request(`/api/courses/${encodeURIComponent(invalidId)}/grades`);
        expect(res.status).toBe(400);

        const body = ApiErrorResponseSchema.parse(await res.json());
        expect(body.error).toBeDefined();
      }

      fetchGuard.assertZeroCalls();
    });

    test('returns 404 when course does not exist in courses table', async () => {
      const res = await client.request('/api/courses/888888/grades');
      expect(res.status).toBe(404);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });
  });

  // =========================================================================
  // 5. GET /api/health
  // =========================================================================
  describe('GET /api/health', () => {
    test('returns status ok and subrequest metrics on healthy system', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, {
        baseline_seeded: 1,
        consecutive_failures: 0,
        circuit_open_until: 0,
        last_success_at: now - 30,
      });

      seedSyncRun(client.db, { id: 1, started_at: now - 300, status: 'ok', subrequests_used: 10 });
      seedSyncRun(client.db, { id: 2, started_at: now - 200, status: 'ok', subrequests_used: 20 });
      seedSyncRun(client.db, { id: 3, started_at: now - 100, status: 'ok', subrequests_used: 30 });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const data = EnhancedHealthResponseSchema.parse(await res.json());
      expect(data.status).toBe('ok');
      expect(data.failure_rate).toBe(0.0);
      expect(data.subrequests.max_budget).toBe(45);
      expect(data.subrequests.last_used).toBe(30);
      expect(data.subrequests.avg_recent).toBe(20);
      expect(data.subrequests.max_recent).toBe(30);
      expect(data.syncState).toBeDefined();
      expect(data.lastRun).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('reports circuit_open when circuit breaker is tripped', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, {
        baseline_seeded: 1,
        consecutive_failures: 5,
        circuit_open_until: now + 900,
      });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const data = EnhancedHealthResponseSchema.parse(await res.json());
      expect(data.status).toBe('circuit_open');

      fetchGuard.assertZeroCalls();
    });

    test('reports degraded when baseline is not yet seeded', async () => {
      seedSyncState(client.db, {
        baseline_seeded: 0,
        consecutive_failures: 0,
      });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const data = EnhancedHealthResponseSchema.parse(await res.json());
      expect(data.status).toBe('degraded');

      fetchGuard.assertZeroCalls();
    });

    test('computes failure_rate properly when some runs failed', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, { baseline_seeded: 1 });

      seedSyncRun(client.db, { started_at: now - 400, status: 'ok' });
      seedSyncRun(client.db, { started_at: now - 300, status: 'error' });
      seedSyncRun(client.db, { started_at: now - 200, status: 'ok' });
      seedSyncRun(client.db, { started_at: now - 100, status: 'error' });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const data = EnhancedHealthResponseSchema.parse(await res.json());
      expect(data.status).toBe('degraded');
      expect(data.failure_rate).toBe(0.5);

      fetchGuard.assertZeroCalls();
    });

    test('handles fresh database with 0 runs without division by zero', async () => {
      seedSyncState(client.db, { baseline_seeded: 1 });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const data = EnhancedHealthResponseSchema.parse(await res.json());
      expect(data.recent_runs).toEqual([]);
      expect(data.failure_rate).toBe(0.0);
      expect(data.subrequests.avg_recent).toBe(0);
      expect(data.subrequests.max_recent).toBe(0);
      expect(data.subrequests.last_used).toBe(0);

      fetchGuard.assertZeroCalls();
    });
  });

  // =========================================================================
  // 6. Global error & 404 handling
  // =========================================================================
  describe('Global error handling', () => {
    test('returns 500 JSON adhering to ApiErrorResponseSchema on DB error', async () => {
      const brokenClient = createTestClient();
      brokenClient.db.prepare = () => {
        throw new Error('D1_ERROR: simulated database error');
      };

      const res = await brokenClient.request('/api/dashboard');
      expect(res.status).toBe(500);

      const data = ApiErrorResponseSchema.parse(await res.json());
      expect(data.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('returns 404 JSON for non-existent API routes', async () => {
      const res = await client.request('/api/non-existent-endpoint');
      expect(res.status).toBe(404);

      const data = ApiErrorResponseSchema.parse(await res.json());
      expect(data.error).toBe('Ruta no encontrada');

      fetchGuard.assertZeroCalls();
    });
  });
});
