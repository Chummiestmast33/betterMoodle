import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
  SyncedItemSchema,
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

describe('Tier 3: Cross-Feature Combinations (6 Tests)', () => {
  let client: TestClient;
  let fetchGuard: FetchMockControl;

  beforeEach(() => {
    client = createTestClient();
    fetchGuard = createForbiddenFetchGuard();
  });

  afterEach(() => {
    fetchGuard.restore();
  });

  test('T3-XFEAT-01: Dashboard & Course Grades Cross-Consistency matches identical grade items', async () => {
    seedCourse(client.db, { id: 101, shortname: 'CS101', fullname: 'Algorithms' });
    seedItem(client.db, {
      item_key: 'grade_cs101_midterm',
      course_id: 101,
      item_type: 'grade',
      title: 'Midterm Exam',
      grade_num: 92.0,
      timemodified: 1700000000,
    });

    // 1. Query dashboard
    const dashRes = await client.request('/api/dashboard');
    expect(dashRes.status).toBe(200);
    const dashData = DashboardResponseSchema.parse(await dashRes.json());
    const dashGrade = dashData.current_grades.find(
      (g) => g.item_key === 'grade_cs101_midterm'
    );
    expect(dashGrade).toBeDefined();
    expect(dashGrade!.grade_num).toBe(92.0);

    // 2. Query course grades
    const gradesRes = await client.request('/api/courses/101/grades');
    expect(gradesRes.status).toBe(200);
    const gradesData = CourseGradesResponseSchema.parse(await gradesRes.json());
    const courseGrade = gradesData.grades.find(
      (g) => g.item_key === 'grade_cs101_midterm'
    );
    expect(courseGrade).toBeDefined();
    expect(courseGrade!.grade_num).toBe(92.0);

    fetchGuard.assertZeroCalls();
  });

  test('T3-XFEAT-02: Course Contents Resource URLs Streamed Through File Proxy', async () => {
    seedCourse(client.db, { id: 101, shortname: 'CS101', fullname: 'Algorithms' });
    const targetFileUrl =
      'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/101/mod_resource/content/1/syllabus.pdf';

    const sections = [
      {
        id: 1,
        name: 'General',
        visible: 1,
        modules: [
          {
            id: 1,
            name: 'Syllabus Module',
            modname: 'resource',
            contents: [
              {
                filename: 'syllabus.pdf',
                fileurl: targetFileUrl,
                filesize: 1024,
                mimetype: 'application/pdf',
              },
            ],
          },
        ],
      },
    ];
    seedCourseContents(client.db, 101, JSON.stringify(sections));

    // 1. Fetch course contents strictly from D1
    const contentsRes = await client.request('/api/courses/101/contents');
    expect(contentsRes.status).toBe(200);
    const contentsData = CourseContentsResponseSchema.parse(await contentsRes.json());
    expect(contentsData.sections[0].modules[0].contents).toBeDefined();
    const rawUrl = contentsData.sections[0].modules[0].contents![0].fileurl;
    expect(rawUrl).toBe(targetFileUrl);
    fetchGuard.assertZeroCalls();

    // 2. Stream through file proxy with proxy mock
    fetchGuard.restore();
    const proxyMock = createProxyFetchMock('PDF-STREAM-CONTENT-101');
    try {
      const proxyRes = await client.request(
        `/api/files/proxy?url=${encodeURIComponent(rawUrl)}`
      );
      expect(proxyRes.status).toBe(200);
      const text = await proxyRes.text();
      expect(text).toBe('PDF-STREAM-CONTENT-101');
      expect(proxyMock.calls.length).toBe(1);
    } finally {
      proxyMock.restore();
    }
  });

  test('T3-XFEAT-03: Sync Runs Lifecycle Impact on Health Endpoint Telemetry', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedSyncState(client.db, { baseline_seeded: 1, consecutive_failures: 0, circuit_open_until: 0 });

    // Step 1: 5 OK runs -> Status is OK
    for (let i = 1; i <= 5; i++) {
      seedSyncRun(client.db, { started_at: now - 500 + i * 10, status: 'ok' });
    }
    const res1 = await client.request('/api/health');
    const body1 = EnhancedHealthResponseSchema.parse(await res1.json());
    expect(body1.status).toBe('ok');
    expect(body1.failure_rate).toBe(0.0);

    // Step 2: 5 Error runs and 3 consecutive failures -> Degraded
    for (let i = 6; i <= 10; i++) {
      seedSyncRun(client.db, { started_at: now - 500 + i * 10, status: 'error' });
    }
    seedSyncState(client.db, { consecutive_failures: 3 });
    const res2 = await client.request('/api/health');
    const body2 = EnhancedHealthResponseSchema.parse(await res2.json());
    expect(body2.status).toBe('degraded');
    expect(body2.failure_rate).toBe(0.5);

    // Step 3: Trip circuit breaker -> circuit_open
    seedSyncState(client.db, { circuit_open_until: now + 3600 });
    const res3 = await client.request('/api/health');
    const body3 = EnhancedHealthResponseSchema.parse(await res3.json());
    expect(body3.status).toBe('circuit_open');

    fetchGuard.assertZeroCalls();
  });

  test('T3-XFEAT-04: Assignment Creation Consistency Across Dashboard & Items Endpoints', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedCourse(client.db, { id: 102, shortname: 'CS102', fullname: 'Web Dev' });
    seedItem(client.db, {
      item_key: 'assign_project_v1',
      course_id: 102,
      item_type: 'assignment',
      title: 'Project V1 Prototype',
      due_date: now + 7200,
      submission_status: 'pending',
    });

    // 1. Dashboard upcoming assignments
    const dashRes = await client.request('/api/dashboard');
    expect(dashRes.status).toBe(200);
    const dashData = DashboardResponseSchema.parse(await dashRes.json());
    const dashAssign = dashData.upcoming_assignments.find(
      (a) => a.item_key === 'assign_project_v1'
    );
    expect(dashAssign).toBeDefined();
    expect(dashAssign!.title).toBe('Project V1 Prototype');

    // 2. Items filtered by assignment
    const itemsRes = await client.request('/api/items?type=assignment');
    expect(itemsRes.status).toBe(200);
    const rawItemsData = (await itemsRes.json()) as { items?: unknown };
    const items = SyncedItemSchema.array().parse(rawItemsData.items);
    const itemsAssign = items.find(
      (a) => a.item_key === 'assign_project_v1'
    );
    expect(itemsAssign).toBeDefined();
    expect(itemsAssign!.title).toBe('Project V1 Prototype');

    fetchGuard.assertZeroCalls();
  });

  test('T3-XFEAT-05: Soft-Delete (Tombstone) Cascade Across Read Views', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedCourse(client.db, { id: 103, shortname: 'CS103', fullname: 'Architecture' });
    seedItem(client.db, {
      item_key: 'grade_arch_quiz',
      course_id: 103,
      item_type: 'grade',
      title: 'Quiz 1',
      grade_num: 88,
    });

    // Verify item is initially visible across both read views
    const resBefore = await client.request('/api/courses/103/grades');
    expect(resBefore.status).toBe(200);
    const dataBefore = CourseGradesResponseSchema.parse(await resBefore.json());
    expect(dataBefore.grades.length).toBe(1);
    expect(dataBefore.grades[0].item_key).toBe('grade_arch_quiz');

    const dashResBefore = await client.request('/api/dashboard');
    expect(dashResBefore.status).toBe(200);
    const dashDataBefore = DashboardResponseSchema.parse(await dashResBefore.json());
    expect(
      dashDataBefore.current_grades.some((g) => g.item_key === 'grade_arch_quiz')
    ).toBe(true);

    // Apply tombstone
    client.db.sqlite
      .query(`UPDATE synced_items SET deleted_at = ? WHERE item_key = ?`)
      .run(now, 'grade_arch_quiz');

    // Query /dashboard and /courses/103/grades post-tombstone
    const dashRes = await client.request('/api/dashboard');
    expect(dashRes.status).toBe(200);
    const dashData = DashboardResponseSchema.parse(await dashRes.json());
    expect(
      dashData.current_grades.some((g) => g.item_key === 'grade_arch_quiz')
    ).toBe(false);

    const gradesRes = await client.request('/api/courses/103/grades');
    expect(gradesRes.status).toBe(200);
    const gradesData = CourseGradesResponseSchema.parse(await gradesRes.json());
    expect(gradesData.grades.length).toBe(0);

    fetchGuard.assertZeroCalls();
  });

  test('T3-XFEAT-06: Subrequest Quota Telemetry Tracking updates health accurately', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedSyncState(client.db, { baseline_seeded: 1 });

    seedSyncRun(client.db, { started_at: now - 300, status: 'ok', subrequests_used: 40 });
    seedSyncRun(client.db, { started_at: now - 200, status: 'ok', subrequests_used: 42 });
    seedSyncRun(client.db, { started_at: now - 100, status: 'ok', subrequests_used: 45 });

    const res = await client.request('/api/health');
    expect(res.status).toBe(200);

    const body = EnhancedHealthResponseSchema.parse(await res.json());
    expect(body.subrequests.last_used).toBe(45);
    expect(body.subrequests.max_recent).toBe(45);
    expect(body.subrequests.avg_recent).toBeCloseTo(42.33, 1);
    expect(body.subrequests.max_budget).toBe(45);

    fetchGuard.assertZeroCalls();
  });
});
