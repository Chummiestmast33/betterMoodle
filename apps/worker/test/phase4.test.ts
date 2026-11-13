import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { PushStatusResponseSchema } from '@better-moodle/shared';
import {
  buildAggregatedPushPayload,
  sendWebPushNotifications,
} from '../src/notify/webpush';
import { syncCourseContents } from '../src/sync/contents';
import type { MoodleClient } from '../src/moodle/client';
import {
  createForbiddenFetchGuard,
  createTestClient,
  seedCourse,
  type FetchMockControl,
  type TestClient,
} from './helpers';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateTestVapidAndSubscriptionKeys() {
  const vapidPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privateJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey);
  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', vapidPair.publicKey),
  );

  const clientPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const clientPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', clientPair.publicKey),
  );
  const authBytes = crypto.getRandomValues(new Uint8Array(16));

  return {
    publicKey: toBase64Url(publicRaw),
    privateJwk: JSON.stringify(privateJwk),
    p256dh: toBase64Url(clientPubRaw),
    auth: toBase64Url(authBytes),
  };
}

describe('Phase 4: Web Push API, Push Dispatch & Course Contents Sync', () => {
  let client: TestClient;
  let fetchGuard: FetchMockControl | null = null;
  let fetchSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    client = createTestClient({
      VAPID_PUBLIC_KEY: 'BTestPublicKey1234567890',
      VAPID_PRIVATE_JWK: '{"kty":"EC","crv":"P-256","d":"test"}',
      VAPID_SUBJECT: 'mailto:test@example.com',
    });
  });

  afterEach(() => {
    fetchGuard?.restore();
    fetchGuard = null;
    fetchSpy?.mockRestore();
    fetchSpy = null;
  });

  describe('Push routes (/api/push/*)', () => {
    test('GET /api/push/status reports status without outbound fetch and never exposes private JWK', async () => {
      fetchGuard = createForbiddenFetchGuard();

      const res = await client.json('/api/push/status');
      expect(res.status).toBe(200);

      const parsed = PushStatusResponseSchema.parse(res.body);
      expect(parsed.configured).toBe(true);
      expect(parsed.public_key).toBe('BTestPublicKey1234567890');
      expect(parsed.subscription_count).toBe(0);
      expect(JSON.stringify(res.body)).not.toContain('VAPID_PRIVATE_JWK');
      expect(JSON.stringify(res.body)).not.toContain('"d":"test"');

      fetchGuard.assertZeroCalls();
    });

    test('POST /api/push/subscribe validates input, persists and upserts in D1', async () => {
      fetchGuard = createForbiddenFetchGuard();

      const bad = await client.json<{ error: string; code: string }>(
        '/api/push/subscribe',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: 'not-a-url', keys: {} }),
        },
      );
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('INVALID_SUBSCRIPTION');

      const endpoint = 'https://fcm.googleapis.com/fcm/send/sub-12345';
      const created = await client.json<{ ok: boolean; endpoint: string }>(
        '/api/push/subscribe',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            endpoint,
            keys: { p256dh: 'key-1', auth: 'auth-1' },
            userAgent: 'TestBrowser/1.0',
          }),
        },
      );
      expect(created.status).toBe(201);
      expect(created.body.ok).toBe(true);

      // Upsert same endpoint with updated keys should still keep 1 row
      const updated = await client.json<{ ok: boolean }>(
        '/api/push/subscribe',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            endpoint,
            keys: { p256dh: 'key-2', auth: 'auth-2' },
          }),
        },
      );
      expect(updated.status).toBe(201);

      const statusRes = await client.json('/api/push/status');
      expect(PushStatusResponseSchema.parse(statusRes.body).subscription_count).toBe(1);

      const delRes = await client.json<{ ok: boolean }>('/api/push/unsubscribe', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      expect(delRes.status).toBe(200);
      expect(delRes.body.ok).toBe(true);

      const afterStatus = await client.json('/api/push/status');
      expect(
        PushStatusResponseSchema.parse(afterStatus.body).subscription_count,
      ).toBe(0);

      fetchGuard.assertZeroCalls();
    });
  });

  describe('Web Push payload & auto-purge', () => {
    test('buildAggregatedPushPayload summarizes assignments, grades, and announcements', () => {
      const payload = buildAggregatedPushPayload([
        {
          itemKey: 'a1',
          courseId: 10,
          courseName: 'Arquitectura',
          itemType: 'assignment',
          title: 'Práctica 4',
          changeType: 'new',
        },
        {
          itemKey: 'g1',
          courseId: 10,
          courseName: 'Arquitectura',
          itemType: 'grade',
          title: 'Examen U2',
          changeType: 'updated',
        },
      ]);

      expect(payload.title).toContain('1 tarea');
      expect(payload.title).toContain('1 calificación');
      expect(payload.url).toBe('/?view=tasks');
    });

    test('sendWebPushNotifications encrypts with VAPID and purges 410/404 subscriptions from D1', async () => {
      const keys = await generateTestVapidAndSubscriptionKeys();
      const now = Math.floor(Date.now() / 1000);

      await client.db
        .prepare(
          'INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          'sub-active',
          'https://push.example/active',
          keys.p256dh,
          keys.auth,
          'UA',
          now,
        )
        .run();

      await client.db
        .prepare(
          'INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          'sub-gone',
          'https://push.example/gone',
          keys.p256dh,
          keys.auth,
          'UA',
          now,
        )
        .run();

      await client.db
        .prepare(
          'INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          'sub-notfound',
          'https://push.example/notfound',
          keys.p256dh,
          keys.auth,
          'UA',
          now,
        )
        .run();

      const requests: Array<{ url: string; authHeader: string | null }> = [];
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        async (input, init) => {
          const url = typeof input === 'string' ? input : input.toString();
          const headers = new Headers(init?.headers);
          requests.push({ url, authHeader: headers.get('authorization') });

          if (url.endsWith('/gone')) return new Response('Gone', { status: 410 });
          if (url.endsWith('/notfound')) {
            return new Response('Not Found', { status: 404 });
          }
          return new Response('', { status: 201 });
        },
      );

      const summary = await sendWebPushNotifications(
        {
          DB: client.db,
          VAPID_PUBLIC_KEY: keys.publicKey,
          VAPID_PRIVATE_JWK: keys.privateJwk,
          VAPID_SUBJECT: 'mailto:admin@example.com',
        },
        [
          {
            itemKey: 'assign-99',
            courseId: 1,
            courseName: 'Sistemas Operativos',
            itemType: 'assignment',
            title: 'Proyecto Final',
            changeType: 'new',
          },
        ],
      );

      expect(summary).toEqual({ sent: 1, purged: 2, failed: 0 });
      expect(requests).toHaveLength(3);
      for (const req of requests) {
        expect(req.authHeader).toMatch(/^vapid t=.+, k=.+/i);
      }

      const remaining = await client.db
        .prepare('SELECT endpoint FROM push_subscriptions')
        .all<{ endpoint: string }>();
      expect(remaining.results).toEqual([
        { endpoint: 'https://push.example/active' },
      ]);
    });
  });

  describe('Course contents sync (syncCourseContents)', () => {
    test('strips Moodle tokens from fileurl and generates /api/files/proxy URLs', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, {
        id: 101,
        shortname: 'SO101',
        fullname: 'Sistemas Operativos',
      });
      seedCourse(client.db, {
        id: 102,
        shortname: 'BD102',
        fullname: 'Bases de Datos',
      });

      const fakeMoodleClient = {
        remainingBudget: 20,
        async getCourseContents(courseId: number) {
          fakeMoodleClient.remainingBudget -= 1;
          return [
            {
              id: 1,
              name: `Unidad 1 (${courseId})`,
              modules: [
                {
                  id: 500 + courseId,
                  name: 'Manual de Prácticas',
                  modname: 'resource',
                  contents: [
                    {
                      type: 'file',
                      filename: 'guia.pdf',
                      fileurl:
                        'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/guia.pdf?forcedownload=1&token=SECRET_TOKEN_LEAK',
                      filesize: 2048,
                      mimetype: 'application/pdf',
                    },
                  ],
                },
              ],
            },
          ];
        },
      } as unknown as MoodleClient;

      const result = await syncCourseContents(
        client.db,
        fakeMoodleClient,
        now,
        false,
      );
      expect(result).toEqual({ partial: false, syncedCount: 2 });

      const stored = await client.db
        .prepare('SELECT sections_json FROM course_contents WHERE course_id = ?')
        .bind(101)
        .first<{ sections_json: string }>();

      expect(stored).not.toBeNull();
      expect(stored!.sections_json).not.toContain('SECRET_TOKEN_LEAK');

      const parsedSections = JSON.parse(stored!.sections_json) as Array<{
        modules: Array<{
          contents?: Array<{ fileurl: string; proxy_url?: string }>;
        }>;
      }>;
      const file = parsedSections[0]?.modules[0]?.contents?.[0];
      expect(file?.fileurl).toBe(
        'https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/guia.pdf?forcedownload=1',
      );
      expect(file?.proxy_url).toBe(
        `/api/files/proxy?url=${encodeURIComponent(file!.fileurl)}`,
      );
    });

    test('cuts off cleanly with partial=true when subrequest budget is low', async () => {
      const now = Math.floor(Date.now() / 1000);
      seedCourse(client.db, { id: 201, shortname: 'C1', fullname: 'Curso 1' });
      seedCourse(client.db, { id: 202, shortname: 'C2', fullname: 'Curso 2' });

      const lowBudgetClient = {
        remainingBudget: 4, // 1 call drops to 3 -> loop cuts off on next course
        async getCourseContents() {
          lowBudgetClient.remainingBudget -= 1;
          return [];
        },
      } as unknown as MoodleClient;

      const result = await syncCourseContents(
        client.db,
        lowBudgetClient,
        now,
        false,
      );
      expect(result.syncedCount).toBe(1);
      expect(result.partial).toBe(true);
    });
  });
});
