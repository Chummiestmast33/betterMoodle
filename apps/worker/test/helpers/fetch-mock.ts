import { spyOn } from 'bun:test';

export interface FetchCallRecord {
  input: string | URL | Request;
  init?: RequestInit;
  url: string;
}

export interface FetchMockControl {
  spy: ReturnType<typeof spyOn>;
  calls: FetchCallRecord[];
  assertZeroCalls(): void;
  mockUpstreamResponse(body: string | Uint8Array, init?: ResponseInit): void;
  restore(): void;
}

/**
 * Creates a fetch mock that forbids any outbound network calls.
 * Used for all read endpoint tests to guarantee RNF-02.
 */
export function createForbiddenFetchGuard(): FetchMockControl {
  const calls: FetchCallRecord[] = [];
  const spy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    calls.push({ input, init, url });
    throw new Error(
      `[RNF-02 VIOLATION] Forbidden outbound fetch call attempted in read path: ${url}`
    );
  });

  return {
    spy,
    calls,
    assertZeroCalls: () => {
      if (calls.length > 0) {
        throw new Error(
          `Expected 0 outbound fetches but found ${calls.length}: ${JSON.stringify(calls)}`
        );
      }
    },
    mockUpstreamResponse: () => {
      throw new Error('Forbidden fetch guard does not allow mockUpstreamResponse');
    },
    restore: () => {
      spy.mockRestore();
    },
  };
}

/**
 * Creates a fetch mock specifically for testing /api/files/proxy.
 * Intercepts outbound calls and returns controlled upstream file payloads.
 */
export function createProxyFetchMock(
  defaultFileBody: string | Uint8Array = 'PDF-SAMPLE-BYTES-CONTENT-12345',
  defaultInit?: ResponseInit
): FetchMockControl {
  const calls: FetchCallRecord[] = [];
  let responseBody: BodyInit =
    typeof defaultFileBody === 'string'
      ? defaultFileBody
      : new Blob([defaultFileBody as any]);

  let responseInit: ResponseInit = defaultInit ?? {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="document.pdf"',
      'content-length': String(
        typeof defaultFileBody === 'string'
          ? defaultFileBody.length
          : defaultFileBody.byteLength
      ),
      'etag': '"hash123"',
      'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT',
    },
  };

  const spy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    calls.push({ input, init, url });
    return new Response(responseBody, responseInit);
  });

  return {
    spy,
    calls,
    assertZeroCalls: () => {
      if (calls.length > 0) {
        throw new Error(`Expected 0 outbound fetches but found ${calls.length}`);
      }
    },
    mockUpstreamResponse: (body, init) => {
      responseBody = typeof body === 'string' ? body : new Blob([body as any]);
      if (init) responseInit = init;
    },
    restore: () => {
      spy.mockRestore();
    },
  };
}
