import { describe, test, expect, afterEach } from 'bun:test';
import {
  createForbiddenFetchGuard,
  createProxyFetchMock,
  createTestD1,
  seedCourse,
  seedItem,
  seedCourseContents,
  seedSyncState,
  seedSyncRun,
  clearAllData,
  createTestClient,
} from './helpers';

describe('Empirical Verification: Phase 3 Test Harness Helpers', () => {
  // =========================================================================
  // 1. createForbiddenFetchGuard Verification
  // =========================================================================
  describe('createForbiddenFetchGuard', () => {
    let guard: ReturnType<typeof createForbiddenFetchGuard> | null = null;

    afterEach(() => {
      if (guard) {
        guard.restore();
        guard = null;
      }
    });

    test('1.1: Traps outbound fetch called with string URL and throws RNF-02 error', async () => {
      guard = createForbiddenFetchGuard();

      let thrownError: Error | null = null;
      try {
        await fetch('https://catedig.itlalaguna.edu.mx/webservice/rest/server.php');
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError!.message).toContain('[RNF-02 VIOLATION]');
      expect(thrownError!.message).toContain('https://catedig.itlalaguna.edu.mx/webservice/rest/server.php');
      expect(guard.calls.length).toBe(1);
      expect(guard.calls[0].url).toBe('https://catedig.itlalaguna.edu.mx/webservice/rest/server.php');
    });

    test('1.2: Traps outbound fetch called with URL object', async () => {
      guard = createForbiddenFetchGuard();

      const targetUrl = new URL('https://catedig.itlalaguna.edu.mx/mod/assign/view.php?id=99');
      let thrownError: Error | null = null;
      try {
        await fetch(targetUrl);
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError!.message).toContain('[RNF-02 VIOLATION]');
      expect(thrownError!.message).toContain(targetUrl.toString());
      expect(guard.calls.length).toBe(1);
      expect(guard.calls[0].url).toBe(targetUrl.toString());
    });

    test('1.3: Traps outbound fetch called with Request object', async () => {
      guard = createForbiddenFetchGuard();

      const targetReq = new Request('https://catedig.itlalaguna.edu.mx/api/test', {
        method: 'POST',
        headers: { 'x-custom': 'val' },
      });

      let thrownError: Error | null = null;
      try {
        await fetch(targetReq);
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError!.message).toContain('[RNF-02 VIOLATION]');
      expect(thrownError!.message).toContain('https://catedig.itlalaguna.edu.mx/api/test');
      expect(guard.calls.length).toBe(1);
      expect(guard.calls[0].url).toBe('https://catedig.itlalaguna.edu.mx/api/test');
    });

    test('1.4: assertZeroCalls succeeds when 0 calls made and throws when calls > 0', () => {
      guard = createForbiddenFetchGuard();

      // Zero calls initially -> must NOT throw
      expect(() => guard!.assertZeroCalls()).not.toThrow();

      // Simulate a call pushed
      guard.calls.push({
        input: 'https://leak.example.com',
        url: 'https://leak.example.com',
      });

      expect(() => guard!.assertZeroCalls()).toThrow(/Expected 0 outbound fetches but found 1/);
    });

    test('1.5: assertZeroCalls handles Request object in calls without throwing serialization errors', async () => {
      guard = createForbiddenFetchGuard();

      try {
        await fetch(new Request('https://catedig.itlalaguna.edu.mx/path'));
      } catch {
        // expected violation
      }

      // Assert that assertZeroCalls formats its error message without crashing on circular/non-serializable Request
      expect(() => guard!.assertZeroCalls()).toThrow();
    });

    test('1.6: mockUpstreamResponse throws descriptive error', () => {
      guard = createForbiddenFetchGuard();
      expect(() => guard!.mockUpstreamResponse('data')).toThrow(
        'Forbidden fetch guard does not allow mockUpstreamResponse'
      );
    });

    test('1.7: restore() cleanly restores globalThis.fetch', async () => {
      guard = createForbiddenFetchGuard();
      guard.restore();
      guard = null;

      // Now globalThis.fetch should NOT throw [RNF-02 VIOLATION]
      // We can install a temp spy to check
      let wasCalled = false;
      const tempMock = createProxyFetchMock('TEMP-TEST');
      try {
        const res = await fetch('https://example.com');
        wasCalled = true;
        expect(await res.text()).toBe('TEMP-TEST');
      } finally {
        tempMock.restore();
      }
      expect(wasCalled).toBe(true);
    });

    test('1.8: Defense-in-depth: Catches swallowed exceptions via assertZeroCalls()', async () => {
      guard = createForbiddenFetchGuard();

      // Simulate a route handler catching the forbidden fetch error and returning fallback response
      async function rogueHandler() {
        try {
          await fetch('https://catedig.itlalaguna.edu.mx/secret-leak');
        } catch {
          return new Response(JSON.stringify({ status: 'ok_swallowed' }), { status: 200 });
        }
        return new Response('ok');
      }

      const res = await rogueHandler();
      expect(res.status).toBe(200);

      // Even though handler swallowed the error, the guard caught the call and must fail assertZeroCalls
      expect(guard.calls.length).toBe(1);
      expect(() => guard!.assertZeroCalls()).toThrow(/Expected 0 outbound fetches but found 1/);
    });

    test('1.9: Multiple sequential forbidden calls are all recorded with exact URLs', async () => {
      guard = createForbiddenFetchGuard();

      const urls = [
        'https://catedig.itlalaguna.edu.mx/call1',
        'https://catedig.itlalaguna.edu.mx/call2',
        'https://catedig.itlalaguna.edu.mx/call3',
      ];

      for (const u of urls) {
        try {
          await fetch(u);
        } catch {
          // ignore to continue loop
        }
      }

      expect(guard.calls.length).toBe(3);
      expect(guard.calls.map((c) => c.url)).toEqual(urls);
      expect(() => guard!.assertZeroCalls()).toThrow(/Expected 0 outbound fetches but found 3/);
    });
  });

  // =========================================================================
  // 2. createProxyFetchMock Verification
  // =========================================================================
  describe('createProxyFetchMock', () => {
    let mock: ReturnType<typeof createProxyFetchMock> | null = null;

    afterEach(() => {
      if (mock) {
        mock.restore();
        mock = null;
      }
    });

    test('2.1: Intercepts outbound fetch with string URL and returns default 200 PDF payload', async () => {
      mock = createProxyFetchMock();

      const res = await fetch('https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="document.pdf"');
      expect(await res.text()).toBe('PDF-SAMPLE-BYTES-CONTENT-12345');

      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0].url).toBe('https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf');
    });

    test('2.2: Intercepts outbound fetch with URL object and records URL', async () => {
      mock = createProxyFetchMock('CUSTOM-DATA');

      const urlObj = new URL('https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/2/file.txt');
      const res = await fetch(urlObj);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('CUSTOM-DATA');
      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0].url).toBe(urlObj.toString());
    });

    test('2.3: Intercepts outbound fetch with Request object and records URL', async () => {
      mock = createProxyFetchMock();

      const reqObj = new Request('https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/3/test.pdf');
      const res = await fetch(reqObj);
      expect(res.status).toBe(200);
      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0].url).toBe('https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/3/test.pdf');
    });

    test('2.4: Accurately records injected token in searchParams', async () => {
      mock = createProxyFetchMock();

      const testToken = 'super-secret-moodle-token-xyz-987';
      const targetUrl = `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/doc.pdf?token=${testToken}`;
      await fetch(targetUrl);

      expect(mock.calls.length).toBe(1);
      const parsedUrl = new URL(mock.calls[0].url);
      expect(parsedUrl.searchParams.get('token')).toBe(testToken);
    });

    test('2.5: Accurately records init options including redirect: manual', async () => {
      mock = createProxyFetchMock();

      await fetch('https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/redirect', {
        redirect: 'manual',
        headers: { 'x-proxy-agent': 'bettermoodle' },
      });

      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0].init).toBeDefined();
      expect(mock.calls[0].init?.redirect).toBe('manual');
      expect((mock.calls[0].init?.headers as Record<string, string>)?.['x-proxy-agent']).toBe('bettermoodle');
    });

    test('2.6: Fidelity Check: Handling redirect when Request object is passed directly', async () => {
      mock = createProxyFetchMock();

      // Case A: standard fetch(url, { redirect: 'manual' })
      await fetch('https://catedig.itlalaguna.edu.mx/test-a', { redirect: 'manual' });
      expect(mock.calls[0].init?.redirect).toBe('manual');

      // Case B: fetch(new Request(url, { redirect: 'manual' })) without 2nd argument
      const req = new Request('https://catedig.itlalaguna.edu.mx/test-b', { redirect: 'manual' });
      await fetch(req);
      // Verify behavior: mock.calls[1].input is Request, mock.calls[1].init is undefined
      expect(mock.calls[1].init).toBeUndefined();
      expect((mock.calls[1].input as Request).redirect).toBe('manual');
    });

    test('2.7: Supports custom default body and headers (Uint8Array body)', async () => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      mock = createProxyFetchMock(bytes, {
        status: 201,
        headers: { 'content-type': 'application/pdf', 'etag': '"custom-etag"' },
      });

      const res = await fetch('https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/doc.pdf');
      expect(res.status).toBe(201);
      expect(res.headers.get('etag')).toBe('"custom-etag"');
      const buf = await res.arrayBuffer();
      expect(new Uint8Array(buf)).toEqual(bytes);
    });

    test('2.8: mockUpstreamResponse dynamically mutates subsequent responses', async () => {
      mock = createProxyFetchMock('FIRST');

      const res1 = await fetch('https://catedig.itlalaguna.edu.mx/file1');
      expect(await res1.text()).toBe('FIRST');

      // Mutate to 404
      mock.mockUpstreamResponse('NOT-FOUND', { status: 404 });
      const res2 = await fetch('https://catedig.itlalaguna.edu.mx/file2');
      expect(res2.status).toBe(404);
      expect(await res2.text()).toBe('NOT-FOUND');

      // Mutate to 302 redirect
      mock.mockUpstreamResponse('', {
        status: 302,
        headers: { location: 'http://internal/trap' },
      });
      const res3 = await fetch('https://catedig.itlalaguna.edu.mx/file3');
      expect(res3.status).toBe(302);
      expect(res3.headers.get('location')).toBe('http://internal/trap');
    });

    test('2.9: assertZeroCalls and restore work as expected', () => {
      mock = createProxyFetchMock();
      expect(() => mock!.assertZeroCalls()).not.toThrow();

      mock.calls.push({ input: 'https://test.com', url: 'https://test.com' });
      expect(() => mock!.assertZeroCalls()).toThrow(/Expected 0 outbound fetches but found 1/);

      mock.restore();
      mock = null;
    });

    test('2.10: High-concurrency outbound proxy fetching preserves all call records', async () => {
      mock = createProxyFetchMock('CONCURRENT-PAYLOAD');

      const requests = Array.from({ length: 10 }, (_, i) =>
        fetch(`https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/file_${i}.pdf?token=token_${i}`, {
          redirect: 'manual',
        })
      );

      const responses = await Promise.all(requests);
      expect(responses.length).toBe(10);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('CONCURRENT-PAYLOAD');
      }

      expect(mock.calls.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        const call = mock.calls[i];
        expect(call.url).toContain(`file_${i}.pdf?token=token_${i}`);
        expect(call.init?.redirect).toBe('manual');
      }
    });
  });

  // =========================================================================
  // 3. createTestD1 Verification
  // =========================================================================
  describe('createTestD1', () => {
    test('3.1: Applies migrations 0001 and 0002 and creates core tables', () => {
      const db = createTestD1();

      // Query sqlite_master to verify tables exist
      const tables = db.sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('courses');
      expect(tableNames).toContain('synced_items');
      expect(tableNames).toContain('sync_state');
      expect(tableNames).toContain('sync_runs');
      expect(tableNames).toContain('course_contents');
    });

    test('3.2: Fallback creates course_contents table with exact column types', () => {
      const db = createTestD1();

      const columns = db.sqlite
        .query('PRAGMA table_info(course_contents)')
        .all() as { cid: number; name: string; type: string; notnull: number; pk: number }[];

      expect(columns.length).toBe(3);
      const colMap = new Map(columns.map((c) => [c.name, c]));

      expect(colMap.get('course_id')!.pk).toBe(1);
      expect(colMap.get('sections_json')!.notnull).toBe(1);
      expect(colMap.get('updated_at')!.notnull).toBe(1);
    });

    test('3.3: Parameterized queries with bind() and first() returning whole row', async () => {
      const db = createTestD1();

      // Insert via prepare.bind.run
      await db
        .prepare('INSERT INTO courses (id, shortname, fullname, progress, refreshed_at) VALUES (?, ?, ?, ?, ?)')
        .bind(501, 'MATH1', 'Calculus I', 88.5, 1700000000)
        .run();

      // Query via prepare.bind.first()
      const row = await db
        .prepare('SELECT id, shortname, fullname, progress FROM courses WHERE id = ?')
        .bind(501)
        .first<{ id: number; shortname: string; fullname: string; progress: number }>();

      expect(row).not.toBeNull();
      expect(row!.id).toBe(501);
      expect(row!.shortname).toBe('MATH1');
      expect(row!.fullname).toBe('Calculus I');
      expect(row!.progress).toBe(88.5);
    });

    test('3.4: first(colName) returns specific column value', async () => {
      const db = createTestD1();

      await db
        .prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)')
        .bind(502, 'PHYS1', 'Physics I', 1700000000)
        .run();

      const name = await db
        .prepare('SELECT fullname FROM courses WHERE id = ?')
        .bind(502)
        .first<string>('fullname');

      expect(name).toBe('Physics I');
    });

    test('3.5: first() returns null when query matches no rows', async () => {
      const db = createTestD1();

      const result = await db
        .prepare('SELECT * FROM courses WHERE id = ?')
        .bind(999999)
        .first();

      expect(result).toBeNull();
    });

    test('3.6: all() returns D1Result with results array and meta', async () => {
      const db = createTestD1();

      await db
        .prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)')
        .bind(503, 'BIO1', 'Biology I', 1700000000, 504, 'BIO2', 'Biology II', 1700000000)
        .run();

      const res = await db
        .prepare('SELECT id, shortname FROM courses WHERE id IN (?, ?) ORDER BY id ASC')
        .bind(503, 504)
        .all<{ id: number; shortname: string }>();

      expect(res.success).toBe(true);
      expect(res.results.length).toBe(2);
      expect(res.results[0].shortname).toBe('BIO1');
      expect(res.results[1].shortname).toBe('BIO2');
      expect(res.meta.rows_read).toBe(2);
    });

    test('3.7: run() returns last_row_id and changes count', async () => {
      const db = createTestD1();

      const res = await db
        .prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)')
        .bind(505, 'CHEM1', 'Chemistry I', 1700000000)
        .run();

      expect(res.success).toBe(true);
      expect(res.meta.changes).toBe(1);

      const upd = await db
        .prepare('UPDATE courses SET fullname = ? WHERE id = ?')
        .bind('Chemistry I (Honors)', 505)
        .run();

      expect(upd.meta.changes).toBe(1);
    });

    test('3.8: raw() returns 2D value matrix', async () => {
      const db = createTestD1();

      await db
        .prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)')
        .bind(506, 'HIST1', 'World History', 1700000000)
        .run();

      const raw = await db
        .prepare('SELECT id, shortname FROM courses WHERE id = ?')
        .bind(506)
        .raw();

      expect(raw).toEqual([[506, 'HIST1']]);
    });

    test('3.9: Parameter binding types: strings with special chars, unicode, nulls, floats, booleans', async () => {
      const db = createTestD1();

      const unicodeTitle = "Ecuaciones Diferenciales — Tarea #1: Integración & Análisis (100% de la calificación) — O'Connor";
      await db
        .prepare(`
          INSERT INTO synced_items (
            item_key, course_id, item_type, title, due_date, grade_num, submission_status, timemodified, first_seen_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          'item_unicode_test',
          601,
          'assignment',
          unicodeTitle,
          null,
          99.75,
          null,
          1700000000,
          1700000000,
          1700000000
        )
        .run();

      const retrieved = await db
        .prepare('SELECT title, due_date, grade_num, submission_status FROM synced_items WHERE item_key = ?')
        .bind('item_unicode_test')
        .first<{ title: string; due_date: number | null; grade_num: number; submission_status: string | null }>();

      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe(unicodeTitle);
      expect(retrieved!.due_date).toBeNull();
      expect(retrieved!.grade_num).toBe(99.75);
      expect(retrieved!.submission_status).toBeNull();
    });

    test('3.10: Prepared statement immutability on repeated bind() calls', async () => {
      const db = createTestD1();

      const baseStmt = db.prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)');
      const stmtA = baseStmt.bind(701, 'A1', 'Course A', 1700000000);
      const stmtB = baseStmt.bind(702, 'B1', 'Course B', 1700000000);

      await stmtA.run();
      await stmtB.run();

      const rows = await db
        .prepare('SELECT id FROM courses WHERE id IN (701, 702) ORDER BY id ASC')
        .all<{ id: number }>();

      expect(rows.results.map((r) => r.id)).toEqual([701, 702]);
    });

    test('3.11: batch() executes multiple statements', async () => {
      const db = createTestD1();

      const stmts = [
        db.prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)').bind(801, 'B1', 'Batch 1', 1700000000),
        db.prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)').bind(802, 'B2', 'Batch 2', 1700000000),
        db.prepare('UPDATE courses SET fullname = ? WHERE id = ?').bind('Batch 1 Updated', 801),
      ];

      const batchResults = await db.batch(stmts);
      expect(batchResults.length).toBe(3);
      expect(batchResults[0].success).toBe(true);
      expect(batchResults[1].success).toBe(true);
      expect(batchResults[2].success).toBe(true);
      expect(batchResults[2].meta.changes).toBe(1);

      const check = await db
        .prepare('SELECT fullname FROM courses WHERE id = ?')
        .bind(801)
        .first<string>('fullname');
      expect(check).toBe('Batch 1 Updated');
    });

    test('3.12: exec() runs multi-statement SQL strings', async () => {
      const db = createTestD1();

      await db.exec(`
        INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (901, 'E1', 'Exec 1', 1700000000);
        INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (902, 'E2', 'Exec 2', 1700000000);
      `);

      const count = await db
        .prepare('SELECT count(*) as cnt FROM courses WHERE id IN (901, 902)')
        .first<number>('cnt');

      expect(count).toBe(2);
    });

    test('3.13: reset() completely wipes database and re-applies migrations cleanly', async () => {
      const db = createTestD1();

      await db
        .prepare("INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (999, 'RESET', 'Reset Test', 1700000000)")
        .run();

      expect(
        await db.prepare('SELECT count(*) as cnt FROM courses').first<number>('cnt')
      ).toBe(1);

      db.reset();

      // Count must now be 0, but tables still exist
      expect(
        await db.prepare('SELECT count(*) as cnt FROM courses').first<number>('cnt')
      ).toBe(0);

      // Verify course_contents still exists after reset
      expect(
        await db.prepare('SELECT count(*) as cnt FROM course_contents').first<number>('cnt')
      ).toBe(0);
    });

    test('3.14: SQL Injection Neutralization via Parameterized Binding', async () => {
      const db = createTestD1();

      // Attempt SQL injection via parameter
      const maliciousPayload = "'; DROP TABLE courses; --";
      await db
        .prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)')
        .bind(991, 'INJ1', maliciousPayload, 1700000000)
        .run();

      // Check courses table still exists and data was inserted literally
      const row = await db
        .prepare('SELECT fullname FROM courses WHERE id = ?')
        .bind(991)
        .first<{ fullname: string }>();

      expect(row).not.toBeNull();
      expect(row!.fullname).toBe(maliciousPayload);

      // Attempt SQL injection in WHERE clause
      const maliciousWhere = '991 OR 1=1';
      const searchRes = await db
        .prepare('SELECT * FROM courses WHERE id = ?')
        .bind(maliciousWhere)
        .all();

      // Should return 0 rows because '991 OR 1=1' is parsed as 0/non-integer or exact match, not OR 1=1
      expect(searchRes.results.length).toBe(0);
    });

    test('3.15: Fidelity Inspection: batch() execution behavior with SELECT vs INSERT', async () => {
      const db = createTestD1();

      await db
        .prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)')
        .bind(1001, 'BATCH_SEL', 'Batch Select Test', 1700000000)
        .run();

      // Test batch with SELECT statement
      const selectBatchResult = await db.batch([
        db.prepare('SELECT * FROM courses WHERE id = ?').bind(1001),
      ]);

      expect(selectBatchResult.length).toBe(1);
      expect(selectBatchResult[0].success).toBe(true);
      // NOTE: In current d1-mock.ts implementation, batch() delegates to stmt.run(),
      // meaning selectBatchResult[0].results is undefined.
      // We document this empirical fidelity finding:
      const resultsField = (selectBatchResult[0] as any).results;
      expect(resultsField).toBeUndefined();
    });

    test('3.16: Fidelity Inspection: batch() atomicity on partial failure', async () => {
      const db = createTestD1();

      const stmts = [
        db.prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)').bind(1002, 'ATOMIC1', 'Atomic 1', 1700000000),
        // This statement violates the PRIMARY KEY constraint (reusing id 1002)
        db.prepare('INSERT INTO courses (id, shortname, fullname, refreshed_at) VALUES (?, ?, ?, ?)').bind(1002, 'ATOMIC_DUP', 'Atomic Dup', 1700000000),
      ];

      let batchError: Error | null = null;
      try {
        await db.batch(stmts);
      } catch (err) {
        batchError = err as Error;
      }

      expect(batchError).not.toBeNull();
      expect(batchError!.message).toContain('UNIQUE constraint failed');

      // Check whether stmt 1 was committed or rolled back:
      // In current d1-mock.ts, batch runs statements sequentially in a loop without sqlite.transaction,
      // so stmt 1 persists in the DB. We record this fidelity limitation.
      const committedCount = await db
        .prepare('SELECT count(*) as c FROM courses WHERE id = ?')
        .bind(1002)
        .first<number>('c');

      expect(committedCount).toBe(1);
    });
  });

  // =========================================================================
  // 4. Fixtures and TestClient Integration Verification
  // =========================================================================
  describe('Fixtures and TestClient', () => {
    test('4.1: Seed functions and clearAllData work harmoniously', async () => {
      const db = createTestD1();

      seedCourse(db, { id: 10, shortname: 'S1', fullname: 'Seed 1' });
      seedItem(db, {
        item_key: 'ik_1',
        course_id: 10,
        item_type: 'grade',
        title: 'Grade 1',
        grade_num: 95.0,
      });
      seedCourseContents(db, 10, JSON.stringify([{ id: 1, name: 'Sect 1' }]));
      seedSyncState(db, { baseline_seeded: 1, consecutive_failures: 2 });
      seedSyncRun(db, { started_at: 1700000000, status: 'ok', subrequests_used: 15 });

      expect(await db.prepare('SELECT count(*) as c FROM courses').first<number>('c')).toBe(1);
      expect(await db.prepare('SELECT count(*) as c FROM synced_items').first<number>('c')).toBe(1);
      expect(await db.prepare('SELECT count(*) as c FROM course_contents').first<number>('c')).toBe(1);
      expect(await db.prepare('SELECT count(*) as c FROM sync_runs').first<number>('c')).toBe(1);

      clearAllData(db);

      expect(await db.prepare('SELECT count(*) as c FROM courses').first<number>('c')).toBe(0);
      expect(await db.prepare('SELECT count(*) as c FROM synced_items').first<number>('c')).toBe(0);
      expect(await db.prepare('SELECT count(*) as c FROM course_contents').first<number>('c')).toBe(0);
      expect(await db.prepare('SELECT count(*) as c FROM sync_runs').first<number>('c')).toBe(0);
    });

    test('4.2: TestClient provides isolated environment with DB and secrets', () => {
      const client = createTestClient();

      expect(client.db).toBeDefined();
      expect(client.env.MOODLE_TOKEN).toBe('test-moodle-token-xyz-12345');
      expect(client.env.MOODLE_URL).toBe('https://catedig.itlalaguna.edu.mx');
      expect(typeof client.request).toBe('function');
      expect(typeof client.json).toBe('function');
      expect(typeof client.text).toBe('function');
    });
  });
});
