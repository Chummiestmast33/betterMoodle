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
} from '../helpers';

describe('Tier 2: Boundary & Corner Cases (30 Tests)', () => {
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
  // Feature 1: GET /api/dashboard Boundary Cases (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 1: GET /api/dashboard Boundaries', () => {
    test('T2-DASH-01: Empty Database Cold Start returns empty arrays with 200 OK', async () => {
      // 0 courses, 0 items, 0 runs in D1
      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.courses).toEqual([]);
      expect(body.upcoming_assignments).toEqual([]);
      expect(body.recent_activity).toEqual([]);
      expect(body.current_grades).toEqual([]);

      fetchGuard.assertZeroCalls();
    });

    test('T2-DASH-02: Null Course Progress Value handles null progress gracefully', async () => {
      seedCourse(client.db, {
        id: 50,
        shortname: 'PROG-NULL',
        fullname: 'Materia sin progreso',
        progress: null,
      });

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.courses.length).toBe(1);
      expect(body.courses[0].progress).toBeNull();

      fetchGuard.assertZeroCalls();
    });

    test('T2-DASH-03: Non-ASCII Unicode & Spanish Accents preserve strings verbatim', async () => {
      const courseTitle = 'Álgebra Lineal & Métodos Numéricos — ITL 🚀';
      const itemTitle = '¿Cómo funciona la Transformada Z y Fourier en México?';

      seedCourse(client.db, { id: 51, shortname: 'ALG-ITL', fullname: courseTitle });
      seedItem(client.db, {
        item_key: 'item_unicode',
        course_id: 51,
        item_type: 'announcement',
        title: itemTitle,
      });

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.courses[0].fullname).toBe(courseTitle);
      expect(body.recent_activity[0].title).toBe(itemTitle);

      fetchGuard.assertZeroCalls();
    });

    test('T2-DASH-04: High Volume Dataset Query Limits handles 200+ items without latency breach', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 52, shortname: 'VOL101', fullname: 'High Volume Course' });

      for (let i = 1; i <= 200; i++) {
        seedItem(client.db, {
          item_key: `vol_item_${i}`,
          course_id: 52,
          item_type: i % 2 === 0 ? 'assignment' : 'announcement',
          title: `Item Title ${i}`,
          due_date: now + i * 3600,
          timemodified: now - i * 60,
        });
      }

      const res = await client.request('/api/dashboard');
      expect(res.status).toBe(200);

      const body = DashboardResponseSchema.parse(await res.json());
      expect(body.recent_activity.length).toBe(15);

      fetchGuard.assertZeroCalls();
    });

    test('T2-DASH-05: Database Error / Query Exception returns 500 without crashing', async () => {
      // Simulate D1 error by corrupting the schema or breaking DB prepare
      const brokenClient = createTestClient();
      brokenClient.db.prepare = () => {
        throw new Error('D1_ERROR: disk I/O failure');
      };

      const res = await brokenClient.request('/api/dashboard');
      expect(res.status).toBe(500);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('T2-DASH-06: Unsupported HTTP Method Rejection rejects POST requests', async () => {
      const res = await client.request('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ malicious: 'payload' }),
      });

      expect([404, 405]).toContain(res.status);
      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 2: GET /api/courses/:id/contents Boundary Cases (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 2: GET /api/courses/:id/contents Boundaries', () => {
    test('T2-CONT-01: Non-Numeric Course ID Parameter rejects with 400 Bad Request', async () => {
      const res = await client.request('/api/courses/notanumber/contents');
      expect(res.status).toBe(400);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('T2-CONT-02: Negative and Zero Course ID rejects with 400 Bad Request', async () => {
      const resNeg = await client.request('/api/courses/-5/contents');
      expect(resNeg.status).toBe(400);

      const resZero = await client.request('/api/courses/0/contents');
      expect(resZero.status).toBe(400);

      fetchGuard.assertZeroCalls();
    });

    test('T2-CONT-03: SQL Injection Attempt in Course ID Path rejects with 400 Bad Request', async () => {
      const res1 = await client.request('/api/courses/1%20OR%201=1/contents');
      expect(res1.status).toBe(400);

      const res2 = await client.request('/api/courses/1;DROP%20TABLE%20courses;/contents');
      expect(res2.status).toBe(400);

      fetchGuard.assertZeroCalls();
    });

    test('T2-CONT-04: Non-Existent Course ID returns 404 Not Found', async () => {
      // Course 99999 does not exist
      const res = await client.request('/api/courses/99999/contents');
      expect(res.status).toBe(404);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('T2-CONT-05: Corrupted sections_json in Database handled safely', async () => {
      seedCourse(client.db, { id: 301, shortname: 'CORRUPT', fullname: 'Corrupted Course' });
      // Insert invalid non-JSON into course_contents
      client.db.sqlite
        .query(
          `INSERT OR REPLACE INTO course_contents (course_id, sections_json, updated_at)
           VALUES (301, '{malformed:json[', 1700000000)`
        )
        .run();

      const res = await client.request('/api/courses/301/contents');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = CourseContentsResponseSchema.parse(await res.json());
      expect(body.course_id).toBe(301);
      expect(body.sections).toEqual([]);

      fetchGuard.assertZeroCalls();
    });

    test('T2-CONT-06: Decimal Course ID rejects with 400 Bad Request', async () => {
      const res = await client.request('/api/courses/12.34/contents');
      expect(res.status).toBe(400);

      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 3: GET /api/courses/:id/grades Boundary Cases (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 3: GET /api/courses/:id/grades Boundaries', () => {
    test('T2-GRAD-01: Non-Numeric Course ID Parameter rejects with 400 Bad Request', async () => {
      const res = await client.request('/api/courses/invalid-id/grades');
      expect(res.status).toBe(400);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('T2-GRAD-02: Negative and Zero Course ID rejects with 400 Bad Request', async () => {
      const resNeg = await client.request('/api/courses/-10/grades');
      expect(resNeg.status).toBe(400);

      const resZero = await client.request('/api/courses/0/grades');
      expect(resZero.status).toBe(400);

      fetchGuard.assertZeroCalls();
    });

    test('T2-GRAD-03: SQL Injection Attempt in Course ID Path rejects with 400 Bad Request', async () => {
      const res = await client.request('/api/courses/1%27%20UNION%20SELECT%20null--/grades');
      expect(res.status).toBe(400);

      fetchGuard.assertZeroCalls();
    });

    test('T2-GRAD-04: Non-Existent Course ID returns 404 Not Found', async () => {
      const res = await client.request('/api/courses/88888/grades');
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('T2-GRAD-05: Extreme Grade Values & Decimal Precision preserves numbers without loss', async () => {
      seedCourse(client.db, { id: 401, shortname: 'NUMS', fullname: 'Numeric Precision Course' });

      seedItem(client.db, {
        item_key: 'g_zero',
        course_id: 401,
        item_type: 'grade',
        title: 'Zero Grade',
        grade_num: 0.0,
      });
      seedItem(client.db, {
        item_key: 'g_max',
        course_id: 401,
        item_type: 'grade',
        title: 'Max Grade',
        grade_num: 100.0,
      });
      seedItem(client.db, {
        item_key: 'g_precise',
        course_id: 401,
        item_type: 'grade',
        title: 'High Precision Grade',
        grade_num: 87.654321,
      });

      const res = await client.request('/api/courses/401/grades');
      expect(res.status).toBe(200);

      const body = CourseGradesResponseSchema.parse(await res.json());
      const gradesMap = new Map(body.grades.map((g) => [g.item_key, g.grade_num]));
      expect(gradesMap.get('g_zero')).toBe(0.0);
      expect(gradesMap.get('g_max')).toBe(100.0);
      expect(gradesMap.get('g_precise')).toBeCloseTo(87.654321, 5);

      fetchGuard.assertZeroCalls();
    });

    test('T2-GRAD-06: Decimal ID Parameter rejects with 400 Bad Request', async () => {
      const res = await client.request('/api/courses/101.5/grades');
      expect(res.status).toBe(400);

      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 4: GET /api/health Boundary Cases (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 4: GET /api/health Boundaries', () => {
    test('T2-HLTH-01: Missing sync_state Row handled gracefully', async () => {
      // Delete sync_state row
      client.db.sqlite.exec('DELETE FROM sync_state');

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(['degraded', 'error']).toContain(body.status);
      expect(body.sync_state == null).toBe(true);

      fetchGuard.assertZeroCalls();
    });

    test('T2-HLTH-02: Database Connection Failure returns 500 with error status', async () => {
      const brokenClient = createTestClient();
      brokenClient.db.prepare = () => {
        throw new Error('D1_DOWN: Database unreachable');
      };

      const res = await brokenClient.request('/api/health');
      expect(res.status).toBe(500);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.status).toBe('error');

      fetchGuard.assertZeroCalls();
    });

    test('T2-HLTH-03: High Consecutive Failures without Circuit Trip reports degraded', async () => {
      seedSyncState(client.db, {
        baseline_seeded: 1,
        consecutive_failures: 4,
        circuit_open_until: 0,
      });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.status).toBe('degraded');

      fetchGuard.assertZeroCalls();
    });

    test('T2-HLTH-04: 100% Failure Rate in sync_runs calculates failure_rate 1.0', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, { baseline_seeded: 1 });

      for (let i = 1; i <= 10; i++) {
        seedSyncRun(client.db, { started_at: now - i * 60, status: 'error' });
      }

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.failure_rate).toBe(1.0);
      expect(['degraded', 'error']).toContain(body.status);

      fetchGuard.assertZeroCalls();
    });

    test('T2-HLTH-05: Null Metrics in sync_runs defaults subrequests safely', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedSyncState(client.db, { baseline_seeded: 1 });

      // Run with null subrequests_used and items_changed
      client.db.sqlite
        .query(
          `INSERT INTO sync_runs (started_at, finished_at, status, subrequests_used, items_changed)
           VALUES (?, ?, 'ok', NULL, NULL)`
        )
        .run(now - 100, now - 95);

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(typeof body.subrequests.avg_recent).toBe('number');
      expect(Number.isNaN(body.subrequests.avg_recent)).toBe(false);
      expect(body.subrequests.avg_recent).toBe(0);

      fetchGuard.assertZeroCalls();
    });

    test('T2-HLTH-06: Initial Unseeded Baseline reports degraded status', async () => {
      seedSyncState(client.db, {
        baseline_seeded: 0,
        consecutive_failures: 0,
        circuit_open_until: 0,
      });

      const res = await client.request('/api/health');
      expect(res.status).toBe(200);

      const body = EnhancedHealthResponseSchema.parse(await res.json());
      expect(body.status).toBe('degraded');

      fetchGuard.assertZeroCalls();
    });
  });

  // -------------------------------------------------------------------------
  // Feature 5: GET /api/files/proxy Boundary & SSRF Vectors (6 Tests)
  // -------------------------------------------------------------------------
  describe('Feature 5: GET /api/files/proxy Boundaries & SSRF Vectors', () => {
    test('T2-PROX-01: Missing url Query Parameter rejects with 400 Bad Request', async () => {
      const res = await client.request('/api/files/proxy');
      expect(res.status).toBe(400);

      const body = ApiErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeDefined();

      fetchGuard.assertZeroCalls();
    });

    test('T2-PROX-02: Empty or Whitespace url Query Parameter rejects with 400 Bad Request', async () => {
      const resEmpty = await client.request('/api/files/proxy?url=');
      expect(resEmpty.status).toBe(400);

      const resSpaces = await client.request('/api/files/proxy?url=%20%20%20');
      expect(resSpaces.status).toBe(400);

      fetchGuard.assertZeroCalls();
    });

    test('T2-PROX-03: Insecure Protocols (HTTP, FTP, file, javascript) rejected', async () => {
      const insecureUrls = [
        'http://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf',
        'ftp://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf',
        'file:///etc/passwd',
        'javascript:alert(document.cookie)',
        'data:text/html,<html>alert(1)</html>',
      ];

      for (const badUrl of insecureUrls) {
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(badUrl)}`);
        expect([400, 403]).toContain(res.status);
      }

      fetchGuard.assertZeroCalls();
    });

    test('T2-PROX-04: Host Spoofing & SSRF Vectors (Suffix, Subdomain, Metadata IP) rejected with 403', async () => {
      const ssrfUrls = [
        'https://catedig.itlalaguna.edu.mx.attacker.com/webservice/pluginfile.php/1/f.pdf',
        'https://evil.catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/f.pdf',
        'https://127.0.0.1/webservice/pluginfile.php/1/f.pdf',
        'https://169.254.169.254/latest/meta-data/',
        'https://[::1]/webservice/pluginfile.php/1/f.pdf',
        'https://google.com/webservice/pluginfile.php/1/f.pdf',
      ];

      for (const evilUrl of ssrfUrls) {
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(evilUrl)}`);
        expect([400, 403]).toContain(res.status);
      }

      fetchGuard.assertZeroCalls();
    });

    test('T2-PROX-05: Port Injection & Embedded Userinfo rejected', async () => {
      const portOrUserUrls = [
        'https://catedig.itlalaguna.edu.mx:8443/webservice/pluginfile.php/1/f.pdf',
        'https://catedig.itlalaguna.edu.mx:8080/webservice/pluginfile.php/1/f.pdf',
        'https://admin:pass@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/f.pdf',
      ];

      for (const badUrl of portOrUserUrls) {
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(badUrl)}`);
        expect([400, 403]).toContain(res.status);
      }

      fetchGuard.assertZeroCalls();
    });

    test('T2-PROX-06: Unauthorized Path & Path Traversal rejected with 403', async () => {
      const unauthorizedPaths = [
        'https://catedig.itlalaguna.edu.mx/admin/index.php',
        'https://catedig.itlalaguna.edu.mx/login/index.php',
        'https://catedig.itlalaguna.edu.mx/webservice/rest/server.php',
        'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../admin/settings.php',
        'https://catedig.itlalaguna.edu.mx/mod/resource/view.php?id=101',
      ];

      for (const badUrl of unauthorizedPaths) {
        const res = await client.request(`/api/files/proxy?url=${encodeURIComponent(badUrl)}`);
        expect([400, 403]).toContain(res.status);
      }

      fetchGuard.assertZeroCalls();
    });
  });
});
