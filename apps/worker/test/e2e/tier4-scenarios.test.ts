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

describe('Tier 4: Real-World Application User Scenarios (6 Scenarios)', () => {
  let client: TestClient;
  let fetchGuard: FetchMockControl;

  beforeEach(() => {
    client = createTestClient();
    fetchGuard = createForbiddenFetchGuard();
  });

  afterEach(() => {
    fetchGuard.restore();
  });

  test('T4-SCEN-01: Complete Student Morning Routine (Daily App Launch)', async () => {
    const now = Math.floor(Date.now() / 1000);

    // Arrange: Seed enrolled courses, tasks, and course contents
    seedCourse(client.db, { id: 101, shortname: 'TEL101', fullname: 'Telemática' });
    seedCourse(client.db, { id: 102, shortname: 'BD201', fullname: 'Bases de Datos' });
    seedCourse(client.db, { id: 103, shortname: 'MET301', fullname: 'Metodología' });

    seedItem(client.db, {
      item_key: 'assign_tel_1',
      course_id: 101,
      item_type: 'assignment',
      title: 'Práctica Redes WAN',
      due_date: now + 7200,
      submission_status: 'pending',
    });
    seedItem(client.db, {
      item_key: 'assign_bd_1',
      course_id: 102,
      item_type: 'assignment',
      title: 'Diagrama ER Normalizado',
      due_date: now + 14400,
      submission_status: 'pending',
    });

    const slidesUrl =
      'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/101/mod_resource/content/1/diapositivas_tema2.pdf';
    const contents = [
      {
        id: 2,
        name: 'Unidad 2',
        visible: 1,
        modules: [
          {
            id: 201,
            name: 'Diapositivas Tema 2',
            modname: 'resource',
            contents: [
              {
                filename: 'diapositivas_tema2.pdf',
                fileurl: slidesUrl,
                filesize: 4096,
                mimetype: 'application/pdf',
              },
            ],
          },
        ],
      },
    ];
    seedCourseContents(client.db, 101, JSON.stringify(contents));

    // Step 1: App checks system health
    const healthRes = await client.request('/api/health');
    expect(healthRes.status).toBe(200);
    EnhancedHealthResponseSchema.parse(await healthRes.json());

    // Step 2: App loads main student dashboard
    const dashRes = await client.request('/api/dashboard');
    expect(dashRes.status).toBe(200);
    const dashData = DashboardResponseSchema.parse(await dashRes.json());
    expect(dashData.courses.length).toBe(3);
    expect(dashData.upcoming_assignments.length).toBe(2);

    // Step 3: Student navigates into Course 101 contents
    const contentsRes = await client.request('/api/courses/101/contents');
    expect(contentsRes.status).toBe(200);
    const contentsData = CourseContentsResponseSchema.parse(await contentsRes.json());
    expect(contentsData.sections[0].modules[0].contents).toBeDefined();
    const file = contentsData.sections[0].modules[0].contents![0];
    expect(file.filename).toBe('diapositivas_tema2.pdf');

    // Asserts: Steps 1-3 must NEVER contact Moodle
    fetchGuard.assertZeroCalls();

    // Step 4: Student clicks download for the slides
    fetchGuard.restore();
    const proxyMock = createProxyFetchMock('SLIDES-PDF-PAYLOAD');
    try {
      const proxyRes = await client.request(
        `/api/files/proxy?url=${encodeURIComponent(file.fileurl)}`
      );
      expect(proxyRes.status).toBe(200);
      expect(await proxyRes.text()).toBe('SLIDES-PDF-PAYLOAD');
      expect(proxyMock.calls.length).toBe(1);

      // Verify token was injected and redirect is manual
      const outbound = proxyMock.calls[0];
      const outboundUrl = new URL(outbound.url);
      expect(outboundUrl.searchParams.get('token')).toBe(client.env.MOODLE_TOKEN!);
      expect(outbound.init?.redirect).toBe('manual');

      // Zero token leakage
      expect(proxyRes.headers.get('content-disposition')).not.toContain(client.env.MOODLE_TOKEN!);
    } finally {
      proxyMock.restore();
    }
  });

  test('T4-SCEN-02: Academic Grade Audit and Feedback Review', async () => {
    seedCourse(client.db, { id: 101, shortname: 'REDES', fullname: 'Redes y Telecomunicaciones' });
    seedCourse(client.db, { id: 102, shortname: 'WEB', fullname: 'Programación Web' });
    seedCourse(client.db, { id: 103, shortname: 'INV', fullname: 'Taller de Investigación' });

    seedItem(client.db, {
      item_key: 'g_redes_u1',
      course_id: 101,
      item_type: 'grade',
      title: 'Examen Unidad 1',
      grade_num: 88.5,
    });
    seedItem(client.db, {
      item_key: 'g_redes_hw1',
      course_id: 101,
      item_type: 'grade',
      title: 'Práctica Packet Tracer',
      grade_num: 95.0,
    });
    seedItem(client.db, {
      item_key: 'g_web_p1',
      course_id: 102,
      item_type: 'grade',
      title: 'Proyecto 1 React',
      grade_num: 100.0,
    });

    // 1. Audit Course 101
    const res101 = await client.request('/api/courses/101/grades');
    expect(res101.status).toBe(200);
    const data101 = CourseGradesResponseSchema.parse(await res101.json());
    expect(data101.grades.length).toBe(2);
    expect(data101.grades.map((g) => g.grade_num)).toEqual([88.5, 95.0]);

    // 2. Audit Course 102
    const res102 = await client.request('/api/courses/102/grades');
    expect(res102.status).toBe(200);
    const data102 = CourseGradesResponseSchema.parse(await res102.json());
    expect(data102.grades.length).toBe(1);
    expect(data102.grades[0].grade_num).toBe(100.0);

    // 3. Audit Course 103 (empty)
    const res103 = await client.request('/api/courses/103/grades');
    expect(res103.status).toBe(200);
    const data103 = CourseGradesResponseSchema.parse(await res103.json());
    expect(data103.grades).toEqual([]);

    fetchGuard.assertZeroCalls();
  });

  test('T4-SCEN-03: High-Volume Multi-Resource Download with Leak Defense', async () => {
    fetchGuard.restore();
    const proxyMock = createProxyFetchMock('GENERIC-STREAM');

    try {
      const urls = [
        'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/101/mod_resource/content/1/slides.pdf',
        'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/101/mod_resource/content/2/starter_code.zip',
        'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/101/mod_assign/introattachment/0/rubric.docx',
      ];

      const responses = await Promise.all(
        urls.map((u) => client.request(`/api/files/proxy?url=${encodeURIComponent(u)}`))
      );

      for (const res of responses) {
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).not.toContain(client.env.MOODLE_TOKEN!);
      }

      expect(proxyMock.calls.length).toBe(3);
      for (const call of proxyMock.calls) {
        const u = new URL(call.url);
        expect(u.searchParams.get('token')).toBe(client.env.MOODLE_TOKEN!);
      }
    } finally {
      proxyMock.restore();
    }
  });

  test('T4-SCEN-04: Upstream Moodle Outage Survivability (Zero-Moodle-Touch Guarantee)', async () => {
    seedCourse(client.db, { id: 101, shortname: 'SURV101', fullname: 'Surviving Outages' });
    seedItem(client.db, {
      item_key: 'surv_grade',
      course_id: 101,
      item_type: 'grade',
      title: 'Exam 1',
      grade_num: 90,
    });
    seedCourseContents(client.db, 101, JSON.stringify([{ id: 1, name: 'S1', modules: [] }]));

    // All read endpoints must function flawlessly even if outbound network is blocked
    const dashRes = await client.request('/api/dashboard');
    expect(dashRes.status).toBe(200);
    DashboardResponseSchema.parse(await dashRes.json());

    const contentsRes = await client.request('/api/courses/101/contents');
    expect(contentsRes.status).toBe(200);
    CourseContentsResponseSchema.parse(await contentsRes.json());

    const gradesRes = await client.request('/api/courses/101/grades');
    expect(gradesRes.status).toBe(200);
    CourseGradesResponseSchema.parse(await gradesRes.json());

    const healthRes = await client.request('/api/health');
    expect(healthRes.status).toBe(200);
    EnhancedHealthResponseSchema.parse(await healthRes.json());

    fetchGuard.assertZeroCalls();

    // Now test file proxy when upstream Moodle is completely broken
    fetchGuard.restore();
    const failingProxy = createProxyFetchMock('', { status: 503 });
    try {
      const proxyRes = await client.request(
        '/api/files/proxy?url=' +
          encodeURIComponent(
            'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf'
          )
      );
      // Upstream 503 results in 502 Bad Gateway
      expect(proxyRes.status).toBe(502);
      const errBody = await proxyRes.text();
      expect(errBody).not.toContain(client.env.MOODLE_TOKEN!);
    } finally {
      failingProxy.restore();
    }
  });

  test('T4-SCEN-05: Malicious Attacker SSRF Penetration Attack blocked at proxy', async () => {
    // Attack 1: AWS metadata
    const r1 = await client.request(
      '/api/files/proxy?url=' + encodeURIComponent('https://169.254.169.254/latest/meta-data/')
    );
    expect([400, 403]).toContain(r1.status);

    // Attack 2: Localhost service probing
    const r2 = await client.request(
      '/api/files/proxy?url=' + encodeURIComponent('https://127.0.0.1:8787/api/health')
    );
    expect([400, 403]).toContain(r2.status);

    // Attack 3: Suffix spoofing
    const r3 = await client.request(
      '/api/files/proxy?url=' +
        encodeURIComponent(
          'https://catedig.itlalaguna.edu.mx.attacker.com/webservice/pluginfile.php/1/doc.pdf'
        )
    );
    expect([400, 403]).toContain(r3.status);

    // Attack 4: Userinfo authentication trick
    const r4 = await client.request(
      '/api/files/proxy?url=' +
        encodeURIComponent(
          'https://admin:pass@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf'
        )
    );
    expect([400, 403]).toContain(r4.status);

    // Attack 5: Administrative path traversal
    const r5 = await client.request(
      '/api/files/proxy?url=' +
        encodeURIComponent(
          'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../admin/settings.php'
        )
    );
    expect([400, 403]).toContain(r5.status);

    fetchGuard.assertZeroCalls();

    // Attack 6: Forged token parameter override
    fetchGuard.restore();
    const proxyMock = createProxyFetchMock('AUTHENTIC-PDF-DATA');
    try {
      const forgedUrl =
        'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf?token=attacker_forged_token';
      const r6 = await client.request(`/api/files/proxy?url=${encodeURIComponent(forgedUrl)}`);
      expect(r6.status).toBe(200);

      // Verify attacker's token was stripped and server token injected
      const outboundUrl = new URL(proxyMock.calls[0].url);
      expect(outboundUrl.searchParams.get('token')).toBe(client.env.MOODLE_TOKEN!);
      expect(outboundUrl.searchParams.get('token')).not.toBe('attacker_forged_token');
    } finally {
      proxyMock.restore();
    }
  });

  test('T4-SCEN-06: Background Sync Recovery & Self-Healing Health Lifecycle', async () => {
    const now = Math.floor(Date.now() / 1000);

    // 1. Initial degraded state with open circuit
    seedSyncState(client.db, {
      baseline_seeded: 1,
      consecutive_failures: 4,
      circuit_open_until: now + 600,
    });
    for (let i = 1; i <= 5; i++) {
      seedSyncRun(client.db, { started_at: now - 1000 + i * 60, status: 'error' });
    }

    const h1 = await client.request('/api/health');
    expect(h1.status).toBe(200);
    const b1 = EnhancedHealthResponseSchema.parse(await h1.json());
    expect(b1.status).toBe('circuit_open');
    expect(b1.failure_rate).toBe(1.0);

    // 2. Successful sync run executes and recovers state
    seedSyncRun(client.db, { started_at: now, status: 'ok', subrequests_used: 15 });
    seedSyncState(client.db, {
      consecutive_failures: 0,
      circuit_open_until: 0,
      last_success_at: now,
    });

    const h2 = await client.request('/api/health');
    expect(h2.status).toBe(200);
    const b2 = EnhancedHealthResponseSchema.parse(await h2.json());
    expect(b2.status).toBe('ok');
    expect(b2.failure_rate).toBeLessThan(1.0);
    expect(b2.recent_runs[0].status).toBe('ok');

    fetchGuard.assertZeroCalls();
  });
});
