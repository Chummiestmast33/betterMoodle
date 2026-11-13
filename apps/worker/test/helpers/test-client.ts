import worker, { type Env } from '../../src/index';
import { createTestD1, type TestD1Database } from './d1-mock';

export interface TestClient {
  db: TestD1Database;
  env: Env;
  request(path: string, init?: RequestInit): Promise<Response>;
  json<T = unknown>(
    path: string,
    init?: RequestInit
  ): Promise<{ status: number; body: T; response: Response }>;
  text(
    path: string,
    init?: RequestInit
  ): Promise<{ status: number; text: string; response: Response }>;
}

export function createTestClient(envOverrides: Partial<Env> = {}): TestClient {
  const db = createTestD1();
  const env: Env = {
    DB: db,
    MOODLE_TOKEN: 'test-moodle-token-xyz-12345',
    MOODLE_URL: 'https://catedig.itlalaguna.edu.mx',
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
    TELEGRAM_CHAT_ID: 'test-chat-id',
    ...envOverrides,
  };

  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const url = path.startsWith('http') ? path : `http://localhost${path}`;
    const req = new Request(url, init);
    return worker.fetch(req, env);
  };

  const json = async <T = unknown>(
    path: string,
    init?: RequestInit
  ): Promise<{ status: number; body: T; response: Response }> => {
    const response = await request(path, init);
    const body = (await response.json()) as T;
    return { status: response.status, body, response };
  };

  const text = async (
    path: string,
    init?: RequestInit
  ): Promise<{ status: number; text: string; response: Response }> => {
    const response = await request(path, init);
    const text = await response.text();
    return { status: response.status, text, response };
  };

  return { db, env, request, json, text };
}
