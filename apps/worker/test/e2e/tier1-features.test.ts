import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
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
  createProxyFetchMock,
  type FetchMockControl,
} from '../helpers';

describe('Tier 1: Feature Coverage (30 Tests)', () => {
  let client: TestClient;
  let fetchGuard: FetchMockControl;

  beforeEach(() => {
    client = createTestClient();
    fetchGuard = createForbiddenFetchGuard();
  });

  afterEach(() => {
    fetchGuard.restore();
  });

  // -------------------------------------------------------------------------
  // Feature 1: GET /api/dashboard (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 1: GET /api/dashboard', () => {
    test('T1-DASH-01: Standard Dashboard Retrieval returns consolidated data with 0 outbound fetch calls', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Seed 2 courses
      seedCourse(client.db, { id: 10, shortname: 'MAT101', fullname: 'Cálculo Diferencial', progress: 50 });
      seedCourse(client.db, { id: 20, shortname: 'FIS201', fullname: 'Física General', progress: 80 });

      // Seed 2 upcoming assignments
      seedItem(client.db, {
        item_key: 'assign_1',
        course_id: 10,
        item_type: 'assignment',
        title: 'Problem Set 1',
        due_date: now + 3600,
        submission_status: 'pending',
      });
      seedItem(client.db, {
        item_key: 'assign_2',
        course_id: 20,
        item_type: 'assignment',
        title: 'Laboratorio 1',
        due_date: now + 7200,
        submission_status: 'submitted',
      });

      // Seed 1 recent activity
      seedItem(client.db, {
        item_key: 'ann_1',
        course_id: 10,
        item_type: 'announcement',
        title: 'Bienvenida al curso',
        timemodified: now - 100,
      });

      // Seed 1 grade item
      seedItem(client.db, {
        item_key: 'grade_1',
        course_id: 10,
        item_type: 'grade',
        title: 'Examen Diagnóstico',
        grade_num: 95.5,
        timemodified: now - 50,
      });

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(Array.isArray(body.courses)).toBe(true);
      expect(body.courses.length).toBe(2);

      expect(Array.isArray(body.upcoming_assignments)).toBe(true);
      expect(body.upcoming_assignments.length).toBe(2);

      expect(Array.isArray(body.recent_activity)).toBe(true);
      expect(body.recent_activity.length).toBeGreaterThanOrEqual(1);

      expect(Array.isArray(body.current_grades)).toBe(true);
      expect(body.current_grades.length).toBe(1);
      expect(body.current_grades[0].grade_num).toBe(95.5);

      fetchGuard.assertZeroCalls();
    });

    test('T1-DASH-02: Soft-Deleted Item Exclusion omits tombstoned records', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 10, shortname: 'CS101', fullname: 'Programación' });

      // Active assignment
      seedItem(client.db, {
        item_key: 'assign_active',
        course_id: 10,
        item_type: 'assignment',
        title: 'Active Task',
        due_date: now + 3600,
      });

      // Tombstoned assignment
      seedItem(client.db, {
        item_key: 'assign_deleted',
        course_id: 10,
        item_type: 'assignment',
        title: 'Deleted Task',
        due_date: now + 3600,
        deleted_at: now - 10,
      });

      // Active grade
      seedItem(client.db, {
        item_key: 'grade_active',
        course_id: 10,
        item_type: 'grade',
        title: 'Active Grade',
        grade_num: 90,
      });

      // Tombstoned grade
      seedItem(client.db, {
        item_key: 'grade_deleted',
        course_id: 10,
        item_type: 'grade',
        title: 'Deleted Grade',
        grade_num: 80,
        deleted_at: now - 10,
      });

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      const assignmentKeys = body.upcoming_assignments.map((a) => a.item_key);
      expect(assignmentKeys).toContain('assign_active');
      expect(assignmentKeys).not.toContain('assign_deleted');

      const gradeKeys = body.current_grades.map((g) => g.item_key);
      expect(gradeKeys).toContain('grade_active');
      expect(gradeKeys).not.toContain('grade_deleted');

      fetchGuard.assertZeroCalls();
    });

    test('T1-DASH-03: Upcoming Assignment Due Date Horizon filters past assignments', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 10, shortname: 'BIO101', fullname: 'Biología' });

      // Future assignment
      seedItem(client.db, {
        item_key: 'future_task',
        course_id: 10,
        item_type: 'assignment',
        title: 'Future Task',
        due_date: now + 86400,
      });

      // Past assignment
      seedItem(client.db, {
        item_key: 'past_task',
        course_id: 10,
        item_type: 'assignment',
        title: 'Past Task',
        due_date: now - 3600,
      });

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      const keys = body.upcoming_assignments.map((a) => a.item_key);
      expect(keys).toContain('future_task');
      expect(keys).not.toContain('past_task');

      fetchGuard.assertZeroCalls();
    });

    test('T1-DASH-04: Course Progress & Metadata Preservation returns exact progress values', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, {
        id: 10,
        shortname: 'QUI101',
        fullname: 'Química Orgánica',
        progress: 75.5,
        refreshed_at: now,
      });

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.courses.length).toBe(1);
      expect(body.courses[0].id).toBe(10);
      expect(body.courses[0].progress).toBe(75.5);
      expect(body.courses[0].shortname).toBe('QUI101');

      fetchGuard.assertZeroCalls();
    });

    test('T1-DASH-05: Recent Activity Ordering and Bounded Limit respects DESC order and max 15', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 10, shortname: 'HIS101', fullname: 'Historia' });

      for (let i = 1; i <= 20; i++) {
        seedItem(client.db, {
          item_key: `item_${i}`,
          course_id: 10,
          item_type: 'announcement',
          title: `Announcement ${i}`,
          timemodified: now - (20 - i) * 60,
        });
      }

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.recent_activity.length).toBe(15);
      expect(body.recent_activity[0].item_key).toBe('item_20');

      for (let i = 0; i < body.recent_activity.length - 1; i++) {
        expect(body.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
          body.recent_activity[i + 1].timemodified
        );
      }

      fetchGuard.assertZeroCalls();
    });

    test('T1-DASH-06: Submission Status Mapping preserves statuses', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 10, shortname: 'ENG101', fullname: 'English' });

      const statuses: Array<'pending' | 'draft' | 'submitted' | 'graded'> = [
        'pending',
        'draft',
        'submitted',
        'graded',
      ];

      for (const st of statuses) {
        seedItem(client.db, {
          item_key: `assign_${st}`,
          course_id: 10,
          item_type: 'assignment',
          title: `Task ${st}`,
          due_date: now + 3600,
          submission_status: st,
        });
      }

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      const returnedStatuses = body.upcoming_assignments.map((a) => a.submission_status);
      for (const st of statuses) {
        expect(returnedStatuses).toContain(st);
      }

      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 2: GET /api/courses/:id/contents (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 2: GET /api/courses/:id/contents', () => {
    test('T1-CONT-01: Full Course Section & Resource Tree returns complete cached contents', async () => {
      seedCourse(client.db, { id: 101, shortname: 'CS101', fullname: 'Algorithms' });

      const sampleSections = [
        {
          id: 1,
          name: 'General',
          visible: 1,
          summary: 'Course intro',
          modules: [
            {
              id: 10,
              name: 'Syllabus',
              instance: 1,
              modname: 'resource',
              contents: [
                {
                  filename: 'syllabus.pdf',
                  fileurl:
                    'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/syllabus.pdf',
                  filesize: 1024,
                  mimetype: 'application/pdf',
                },
              ],
            },
          ],
        },
      ];

      seedCourseContents(client.db, 101, JSON.stringify(sampleSections), 1700000000);

      const res = await client.request('/api/courses/101/contents');
      expect(res.status).toBe(200);

      const body = CourseContentsResponseSchema.parse(await res.json());
      expect(body.course_id).toBe(101);
      expect(body.sections.length).toBe(1);
      expect(body.sections[0].name).toBe('General');
      expect(body.sections[0].modules[0].name).toBe('Syllabus');
      expect(body.synced_at).toBe(1700000000);

      fetchGuard.assertZeroCalls();
    });

    test('T1-CONT-02: Course with Empty Section List returns clean sections array', async () => {
      seedCourse(client.db, { id: 102, shortname: 'CS102', fullname: 'Data Structures' });
      seedCourseContents(client.db, 102, JSON.stringify([]), 1700000000);

      const res = await client.request('/api/courses/102/contents');
      expect(res.status).toBe(200);

      const body = CourseContentsResponseSchema.parse(await res.json());
      expect(body.course_id).toBe(102);
      expect(body.sections).toEqual([]);

      fetchGuard.assertZeroCalls();
    });

    test('T1-CONT-03: Course Not Yet Cached in course_contents returns safe fallback', async () => {
      seedCourse(client.db, { id: 103, shortname: 'CS103', fullname: 'Discrete Math' });
      // Do not seed course_contents for 103

      const res = await client.request('/api/courses/103/contents');
      expect(res.status).toBe(200);

      const body = CourseContentsResponseSchema.parse(await res.json());
      expect(body.course_id).toBe(103);
      expect(body.sections).toEqual([]);
      expect(body.synced_at).toBeNull();

      fetchGuard.assertZeroCalls();
    });

    test('T1-CONT-04: Resource File Metadata & Proxy URL Attachment includes valid fields', async () => {
      seedCourse(client.db, { id: 104, shortname: 'CS104', fullname: 'Databases' });

      const sections = [
        {
          id: 1,
          name: 'Unit 1',
          visible: 1,
          modules: [
            {
              id: 20,
              name: 'Guide',
              modname: 'resource',
              contents: [
                {
                  filename: 'guide.pdf',
                  fileurl:
                    'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/20/guide.pdf',
                  filesize: 2048,
                  mimetype: 'application/pdf',
                },
              ],
            },
          ],
        },
      ];
      seedCourseContents(client.db, 104, JSON.stringify(sections));

      const res = await client.request('/api/courses/104/contents');
      expect(res.status).toBe(200);

      const body = CourseContentsResponseSchema.parse(await res.json());
      expect(body.sections[0].modules[0].contents).toBeDefined();
      const content = body.sections[0].modules[0].contents![0];
      expect(content.filename).toBe('guide.pdf');
      expect(content.mimetype).toBe('application/pdf');
      expect(content.filesize).toBe(2048);

      fetchGuard.assertZeroCalls();
    });

    test('T1-CONT-05: Section & Module Visibility Flags conveyed correctly', async () => {
      seedCourse(client.db, { id: 105, shortname: 'CS105', fullname: 'Operating Systems' });

      const sections = [
        { id: 1, name: 'Visible Section', visible: 1, modules: [] },
        { id: 2, name: 'Hidden Section', visible: 0, modules: [] },
      ];
      seedCourseContents(client.db, 105, JSON.stringify(sections));

      const res = await client.request('/api/courses/105/contents');
      expect(res.status).toBe(200);

      const body = CourseContentsResponseSchema.parse(await res.json());
      expect(body.sections[0].visible).toBe(1);
      expect(body.sections[1].visible).toBe(0);

      fetchGuard.assertZeroCalls();
    });

    test('T1-CONT-06: Response Headers & Content-Type returns application/json', async () => {
      seedCourse(client.db, { id: 106, shortname: 'CS106', fullname: 'Compilers' });

      const res = await client.request('/api/courses/106/contents');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 3: GET /api/courses/:id/grades (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 3: GET /api/courses/:id/grades', () => {
    test('T1-GRAD-01: Standard Course Grades Retrieval returns normalized items', async () => {
      seedCourse(client.db, { id: 201, shortname: 'NET101', fullname: 'Networking' });

      seedItem(client.db, {
        item_key: 'grade_201_1',
        course_id: 201,
        item_type: 'grade',
        title: 'Examen Parcial 1',
        grade_num: 85.0,
      });
      seedItem(client.db, {
        item_key: 'grade_201_2',
        course_id: 201,
        item_type: 'grade',
        title: 'Examen Parcial 2',
        grade_num: 92.5,
      });

      const res = await client.request('/api/courses/201/grades');
      expect(res.status).toBe(200);

      const body = CourseGradesResponseSchema.parse(await res.json());
      expect(body.course_id).toBe(201);
      expect(body.grades.length).toBe(2);
      expect(body.grades[0].grade_num).toBe(85.0);
      expect(body.grades[1].grade_num).toBe(92.5);

      fetchGuard.assertZeroCalls();
    });

    test('T1-GRAD-02: Course with No Grade Items Recorded returns empty grades array', async () => {
      seedCourse(client.db, { id: 202, shortname: 'NET102', fullname: 'Advanced Networking' });

      const res = await client.request('/api/courses/202/grades');
      expect(res.status).toBe(200);

      const body = CourseGradesResponseSchema.parse(await res.json());
      expect(body.course_id).toBe(202);
      expect(body.grades).toEqual([]);

      fetchGuard.assertZeroCalls();
    });

    test('T1-GRAD-03: Strict Cross-Course Grade Isolation ensures no grade bleed', async () => {
      seedCourse(client.db, { id: 201, shortname: 'CRS1', fullname: 'Course 1' });
      seedCourse(client.db, { id: 202, shortname: 'CRS2', fullname: 'Course 2' });

      seedItem(client.db, {
        item_key: 'g_crs1',
        course_id: 201,
        item_type: 'grade',
        title: 'Grade Course 1',
        grade_num: 90,
      });
      seedItem(client.db, {
        item_key: 'g_crs2',
        course_id: 202,
        item_type: 'grade',
        title: 'Grade Course 2',
        grade_num: 70,
      });

      const res = await client.request('/api/courses/201/grades');
      expect(res.status).toBe(200);

      const body = CourseGradesResponseSchema.parse(await res.json());
      expect(body.grades.length).toBe(1);
      expect(body.grades[0].course_id).toBe(201);
      expect(body.grades[0].title).toBe('Grade Course 1');

      fetchGuard.assertZeroCalls();
    });

    test('T1-GRAD-04: Soft-Deleted Grade Exclusion omits tombstoned grades', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 203, shortname: 'CRS3', fullname: 'Course 3' });

      seedItem(client.db, {
        item_key: 'g_active',
        course_id: 203,
        item_type: 'grade',
        title: 'Active Grade',
        grade_num: 100,
      });
      seedItem(client.db, {
        item_key: 'g_deleted',
        course_id: 203,
        item_type: 'grade',
        title: 'Deleted Grade',
        grade_num: 50,
        deleted_at: now - 100,
      });

      const res = await client.request('/api/courses/203/grades');
      expect(res.status).toBe(200);

      const body = CourseGradesResponseSchema.parse(await res.json());
      expect(body.grades.length).toBe(1);
      expect(body.grades[0].item_key).toBe('g_active');

      fetchGuard.assertZeroCalls();
    });

    test('T1-GRAD-05: Ungraded Item / Null Grade Representation serializes cleanly', async () => {
      seedCourse(client.db, { id: 204, shortname: 'CRS4', fullname: 'Course 4' });

      seedItem(client.db, {
        item_key: 'g_ungraded',
        course_id: 204,
        item_type: 'grade',
        title: 'Pending Essay Grade',
        grade_num: null,
      });

      const res = await client.request('/api/courses/204/grades');
      expect(res.status).toBe(200);

      const body = CourseGradesResponseSchema.parse(await res.json());
      expect(body.grades.length).toBe(1);
      expect(body.grades[0].grade_num).toBeNull();

      fetchGuard.assertZeroCalls();
    });

    test('T1-GRAD-06: Non-Grade Item Filtering excludes assignments and announcements', async () => {
      seedCourse(client.db, { id: 205, shortname: 'CRS5', fullname: 'Course 5' });

      seedItem(client.db, {
        item_key: 'item_assign',
        course_id: 205,
        item_type: 'assignment',
        title: 'Some Assignment',
      });
      seedItem(client.db, {
        item_key: 'item_ann',
        course_id: 205,
        item_type: 'announcement',
        title: 'Some Announcement',
      });
      seedItem(client.db, {
        item_key: 'item_grade',
        course_id: 205,
        item_type: 'grade',
        title: 'Real Grade',
        grade_num: 88,
      });

      const res = await client.request('/api/courses/205/grades');
      expect(res.status).toBe(200);

      const body = CourseGradesResponseSchema.parse(await res.json());
      expect(body.grades.length).toBe(1);
      expect(body.grades[0].item_key).toBe('item_grade');

      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 4: GET /api/health (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 4: GET /api/health', () => {
    test('T1-HLTH-01: Healthy System Baseline returns status ok and failure_rate 0', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, {
        baseline_seeded: 1,
        consecutive_failures: 0,
        circuit_open_until: 0,
        last_success_at: now - 60,
      });

      for (let i = 1; i <= 5; i++) {
        seedSyncRun(client.db, {
          started_at: now - (6 - i) * 300,
          status: 'ok',
          subrequests_used: 10,
        });
      }

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.status).toBe('ok');
      expect(body.failure_rate).toBe(0.0);
      expect(body.recent_runs.length).toBe(5);

      fetchGuard.assertZeroCalls();
    });

    test('T1-HLTH-02: Degraded Status on High Failure Rate reports degraded', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, {
        baseline_seeded: 1,
        consecutive_failures: 3,
        circuit_open_until: 0,
      });

      // 6 errors and 4 oks
      for (let i = 1; i <= 4; i++) {
        seedSyncRun(client.db, { started_at: now - 1000 + i * 10, status: 'ok' });
      }
      for (let i = 5; i <= 10; i++) {
        seedSyncRun(client.db, { started_at: now - 1000 + i * 10, status: 'error' });
      }

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.status).toBe('degraded');
      expect(body.failure_rate).toBe(0.6);

      fetchGuard.assertZeroCalls();
    });

    test('T1-HLTH-03: Circuit Breaker Tripped Status returns status circuit_open', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, {
        baseline_seeded: 1,
        consecutive_failures: 4,
        circuit_open_until: now + 1800,
      });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.status).toBe('circuit_open');

      fetchGuard.assertZeroCalls();
    });

    test('T1-HLTH-04: Subrequest Metric Calculation calculates correct averages and maximums', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, { baseline_seeded: 1 });

      seedSyncRun(client.db, { started_at: now - 300, status: 'ok', subrequests_used: 20 });
      seedSyncRun(client.db, { started_at: now - 200, status: 'ok', subrequests_used: 25 });
      seedSyncRun(client.db, { started_at: now - 100, status: 'ok', subrequests_used: 30 });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.subrequests.last_used).toBe(30);
      expect(body.subrequests.avg_recent).toBe(25);
      expect(body.subrequests.max_recent).toBe(30);
      expect(body.subrequests.max_budget).toBe(45);

      fetchGuard.assertZeroCalls();
    });

    test('T1-HLTH-05: Recent Runs Ordering & Limit caps at 15 ordered id DESC', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, { baseline_seeded: 1 });

      for (let i = 1; i <= 25; i++) {
        seedSyncRun(client.db, {
          id: i,
          started_at: now - (30 - i) * 60,
          status: 'ok',
          subrequests_used: 12,
        });
      }

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.recent_runs.length).toBe(15);
      expect(body.recent_runs[0].id).toBe(25);

      fetchGuard.assertZeroCalls();
    });

    test('T1-HLTH-06: Health with Fresh Database (Zero Runs) avoids division by zero', async () => {
      seedSyncState(client.db, {
        baseline_seeded: 0,
        consecutive_failures: 0,
        circuit_open_until: 0,
      });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.recent_runs).toEqual([]);
      expect(body.failure_rate).toBe(0.0);
      expect(body.subrequests.avg_recent).toBe(0);

      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 5: GET /api/files/proxy (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 5: GET /api/files/proxy', () => {
    test('T1-PROX-01: Valid HTTPS Moodle File Streaming streams file bytes', async () => {
      fetchGuard.restore();
      const proxyMock = createProxyFetchMock('TEST-BINARY-DATA-FILE');

      try {
        const targetUrl =
          'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/doc.pdf';
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(targetUrl)}`);

        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBe('TEST-BINARY-DATA-FILE');
        expect(proxyMock.calls.length).toBe(1);
      } finally {
        proxyMock.restore();
      }
    });

    test('T1-PROX-02: Server-Side Token Injection injects MOODLE_TOKEN to upstream fetch', async () => {
      fetchGuard.restore();
      const proxyMock = createProxyFetchMock('FILE-CONTENT');

      try {
        const targetUrl =
          'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/456/mod_assign/introattachment/0/rubric.pdf';
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(targetUrl)}`);

        expect(res.status).toBe(200);
        expect(proxyMock.calls.length).toBe(1);

        const outboundUrl = new URL(proxyMock.calls[0].url);
        expect(outboundUrl.searchParams.get('token')).toBe(client.env.MOODLE_TOKEN!);
      } finally {
        proxyMock.restore();
      }
    });

    test('T1-PROX-03: Zero Token Leakage in Client Response ensures token never leaks', async () => {
      fetchGuard.restore();
      const proxyMock = createProxyFetchMock('CLEAN-PDF-STREAM');

      try {
        const targetUrl =
          'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf';
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(targetUrl)}`);

        expect(res.status).toBe(200);
        const token = client.env.MOODLE_TOKEN!;

        for (const [headerKey, headerVal] of res.headers.entries()) {
          expect(headerVal).not.toContain(token);
          expect(headerKey).not.toContain(token);
        }

        const bodyText = await res.text();
        expect(bodyText).not.toContain(token);
      } finally {
        proxyMock.restore();
      }
    });

    test('T1-PROX-04: Header Passthrough & Sanitization passes safe headers and scrubs cookies', async () => {
      fetchGuard.restore();
      const proxyMock = createProxyFetchMock('SAFE-STREAM', {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="tarea.pdf"',
          'set-cookie': 'MoodleSession=secret_session_id',
        },
      });

      try {
        const targetUrl =
          'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/tarea.pdf';
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(targetUrl)}`);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toBe('attachment; filename="tarea.pdf"');
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      } finally {
        proxyMock.restore();
      }
    });

    test('T1-PROX-05: Upstream 404 / 500 Handling returns 502 Bad Gateway without leaking traces', async () => {
      fetchGuard.restore();
      const proxyMock = createProxyFetchMock('Moodle Error Stacktrace', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      });

      try {
        const targetUrl =
          'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/999/nonexistent.pdf';
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(targetUrl)}`);

        expect(res.status).toBe(502);
        const bodyText = await res.text();
        expect(bodyText).not.toContain(client.env.MOODLE_TOKEN!);
      } finally {
        proxyMock.restore();
      }
    });

    test('T1-PROX-06: Manual Redirect Enforcement uses redirect: manual and rejects 302', async () => {
      fetchGuard.restore();
      const proxyMock = createProxyFetchMock('', {
        status: 302,
        headers: { location: 'http://internal-server/admin' },
      });

      try {
        const targetUrl =
          'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/redirect';
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(targetUrl)}`);

        expect(res.status).toBe(502);
        expect(proxyMock.calls[0].init?.redirect).toBe('manual');
      } finally {
        proxyMock.restore();
      }
    });
  });
});
