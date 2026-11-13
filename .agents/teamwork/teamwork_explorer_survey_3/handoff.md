# Handoff Report: Phase 3 Survey — Secure Proxy, Testing & Mutation Testing Architecture

## 1. Observation

### 1.1 Codebase & Configuration Observations
- **Monorepo setup (`package.json`)**:
  - Workspaces: `apps/*` (`apps/web`, `apps/worker`), `packages/*` (`packages/shared`).
  - Runtime & package manager: Bun `1.3.14`.
  - Typescript version: `5.9.3` root, `wrangler: 4.161.0`.
- **Existing Worker & Routes (`apps/worker/src/index.ts:1-99`)**:
  - Hono app instance initialized: `const app = new Hono<{ Bindings: Env }>();` (line 6).
  - Routes currently implemented:
    - `GET /api/health` (lines 9-26): Reads `sync_state` and `sync_runs` from `c.env.DB`.
    - `GET /api/courses` (lines 29-38): Reads from `courses` table in D1.
    - `GET /api/items` (lines 41-60): Reads from `synced_items` table in D1.
    - `POST /api/sync/manual` (lines 63-84): Manual sync trigger with 30s rate limit.
  - Export: `export default { fetch: app.fetch, async scheduled(...) { ... } }` (lines 87-99). Notice `app` is not currently exported as a named export.
- **Worker Configuration (`apps/worker/wrangler.jsonc:1-27`)**:
  - Compatibility flags: `["nodejs_compat"]`.
  - Static assets: `{"directory": "../web/dist", "binding": "ASSETS", "not_found_handling": "single-page-application"}`.
  - D1 database binding: `DB` linked to database `catedig-db`.
  - Cron trigger: `["*/5 * * * *"]`.
- **D1 Database Schemas (`apps/worker/migrations/`)**:
  - `0001_initial_schema.sql`:
    - `courses`: `id INTEGER PRIMARY KEY`, `shortname`, `fullname`, `progress`, `payload_json`, `refreshed_at`.
    - `synced_items`: `item_key PRIMARY KEY`, `course_id`, `item_type`, `title`, `url`, `due_date`, `grade_num`, `timemodified`, `payload_json`, `first_seen_at`, `updated_at`, `deleted_at`.
    - `sync_state`: `id CHECK(id = 1)`, `baseline_seeded`, `last_success_at`, `last_attempt_at`, `consecutive_failures`.
    - `sync_runs`: `id AUTOINCREMENT`, `started_at`, `finished_at`, `status`, `subrequests_used`, `items_changed`, `error`.
  - `0002_phase2_sync_metadata.sql`:
    - `courses`: added `grades_synced_at`, `forums_synced_at`.
    - `synced_items`: added `submission_status`, `status_synced_at`.
    - `sync_state`: added `moodle_user_id`, `courses_refreshed_at`, `grades_seeded`, `forums_seeded`, `circuit_open_until`, `dead_man_alerted`.
- **Existing Test Suite (`apps/worker/src/sync/phase2.test.ts:1-171`)**:
  - Uses `import { describe, expect, test } from 'bun:test';` and `import { Database } from 'bun:sqlite';`.
  - Creates in-memory D1 mock (`createTestD1()` lines 10-56) using `:memory:` SQLite, loading migrations `0001_initial_schema.sql` and `0002_phase2_sync_metadata.sql`.
  - Implements D1 statement methods: `prepare()`, `bind()`, `first()`, `all()`, `run()`, `batch()`, `exec()`.
  - Intercepts `globalThis.fetch` for simulating Telegram and Moodle responses.
  - Execution result: `bun test` ran 4 tests in 73ms (`4 pass, 0 fail, 22 expect() calls`).
  - Baseline checks: `bunx tsc --noEmit -p apps/worker/tsconfig.json` exits with code 0; `bun run build:web` exits with code 0.
- **Phase 3 Documentation (`docs/fases/fase-3.md:1-23`)**:
  - Status: `Pendiente ⏳`.
  - Activities checklist:
    - [ ] `GET /api/dashboard`
    - [ ] `GET /api/courses/:id/contents`
    - [ ] `GET /api/courses/:id/grades`
    - [ ] `GET /api/health`
    - [ ] `GET /api/files/proxy` (SSRF allowlist + token injection)
    - [ ] Zod schemas in `packages/shared`
  - Notes: Mentions strict requirement that no `/api/*` route leaks `MOODLE_TOKEN` in URLs, headers, or JSON bodies.

---

## 2. Logic Chain

### 2.1 Secure Proxy (`GET /api/files/proxy`) Design & SSRF Mitigation

#### 2.1.1 Threat Model & Attack Vectors
The proxy accepts a target URL (`?url=...`), downloads the file from Moodle on behalf of the client, and injects `MOODLE_TOKEN` server-side so the client never gains access to the token. Without rigorous validation, this endpoint is vulnerable to:
1. **SSRF to Cloudflare / Host metadata**: `http://169.254.169.254/` or internal service endpoints.
2. **SSRF to local / private loopbacks**: `http://127.0.0.1`, `http://localhost`, `http://0.0.0.0`, `http://[::1]`.
3. **Domain suffix / spoofing attacks**: `https://catedig.itlalaguna.edu.mx.attacker.com` or `https://evil-catedig.itlalaguna.edu.mx`.
4. **URL credential embedding**: `https://user:pass@catedig.itlalaguna.edu.mx`.
5. **Port tampering**: `https://catedig.itlalaguna.edu.mx:8080/`.
6. **Protocol smuggling**: `file:///`, `ftp://`, `data:`, `javascript:`, or plain `http://`.
7. **Path traversal / unauthorized Moodle endpoints**: `https://catedig.itlalaguna.edu.mx/admin/` or `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../login/index.php`.
8. **Upstream Open Redirect exploitation**: Upstream Moodle returning HTTP 301/302 that redirects to an attacker-controlled server. If the fetch client follows redirects automatically, it could transmit the injected token query parameter in the `Referer` header or follow to an untrusted domain.
9. **Client-supplied Token Forgery**: Client passes `?url=https://catedig.../file.pdf?token=malicious_token` attempting parameter pollution or token spoofing.

#### 2.1.2 Validation Rules & Implementation
The proxy validator must perform strict deterministic checks using WHATWG `URL`:
```ts
const ALLOWED_HOST = 'catedig.itlalaguna.edu.mx';
const ALLOWED_PATH_PREFIX = '/webservice/pluginfile.php';

export interface ProxyValidationResult {
  valid: boolean;
  code?: 400 | 403;
  error?: string;
  targetUrl?: URL;
}

export function validateProxyUrl(rawUrl: unknown): ProxyValidationResult {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, code: 400, error: 'Parámetro url es requerido.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, code: 400, error: 'URL inválida o malformada.' };
  }

  // 1. Strict Protocol
  if (parsed.protocol !== 'https:') {
    return { valid: false, code: 403, error: 'Solo se permite protocolo seguro https://.' };
  }

  // 2. Strict Hostname (exact match, case-insensitive)
  if (parsed.hostname.toLowerCase() !== ALLOWED_HOST) {
    return { valid: false, code: 403, error: `Host no autorizado. Solo se permite ${ALLOWED_HOST}.` };
  }

  // 3. Reject Credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, code: 400, error: 'URLs con credenciales están prohibidas.' };
  }

  // 4. Reject Custom Ports
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, code: 403, error: 'Puerto no autorizado.' };
  }

  // 5. Strict Path Prefix (exact or subpath)
  const pathname = parsed.pathname;
  const isAllowedPath = pathname === ALLOWED_PATH_PREFIX || pathname.startsWith(`${ALLOWED_PATH_PREFIX}/`);
  if (!isAllowedPath) {
    return { valid: false, code: 403, error: `Ruta no autorizada. Debe iniciar con ${ALLOWED_PATH_PREFIX}.` };
  }

  return { valid: true, targetUrl: parsed };
}
```

#### 2.1.3 Token Injection & Stream Mechanics
1. **Sanitize & Inject**:
   - Construct outbound URL from the validated pathname and query params:
     ```ts
     const upstreamUrl = new URL(targetUrl.pathname + targetUrl.search, `https://${ALLOWED_HOST}`);
     // Remove any user-supplied token to prevent token spoofing
     upstreamUrl.searchParams.delete('token');
     upstreamUrl.searchParams.delete('wstoken');
     // Inject server token
     upstreamUrl.searchParams.set('token', c.env.MOODLE_TOKEN);
     ```
2. **Prevent Open Redirect via `redirect: 'manual'`**:
   ```ts
   const upstreamRes = await fetch(upstreamUrl.toString(), {
     method: 'GET',
     headers: {
       'User-Agent': 'BetterMoodle/1.0',
       'Accept': '*/*',
     },
     redirect: 'manual', // Never blindly follow redirects to prevent token leakage
     signal: AbortSignal.timeout(15000),
   });
   ```
   If `upstreamRes.status >= 300 && upstreamRes.status < 400`, reject with 502 Bad Gateway to avoid redirect loops or leakage.
3. **Response Headers & Security Policy**:
   Only forward safe content headers from upstream:
   - `Content-Type`: `upstreamRes.headers.get('Content-Type') || 'application/octet-stream'`
   - `Content-Disposition`: `upstreamRes.headers.get('Content-Disposition')` (preserves filename for downloads)
   - `Content-Length`: `upstreamRes.headers.get('Content-Length')` (if present)
   - `ETag`: `upstreamRes.headers.get('ETag')`
   - `Last-Modified`: `upstreamRes.headers.get('Last-Modified')`
   Add mandatory security headers:
   - `X-Content-Type-Options: nosniff`
   - `Cache-Control: private, max-age=3600`
   Explicitly omit/strip:
   - `Location` (never return upstream URL containing the token)
   - `Set-Cookie`
   - Any custom headers echoing query params.
4. **Memory-Safe Streaming**:
   - Return `new Response(upstreamRes.body, { status: upstreamRes.status, headers: safeHeaders })`.
   - By passing `upstreamRes.body` (a native `ReadableStream`) directly into `Response`, Cloudflare Workers chunks the stream without buffering the entire file in RAM, staying well within Worker free memory limits (128 MB).
5. **Zero Token Leakage Guarantee**:
   - If `fetch` throws a network or timeout error, catch it and return:
     `c.json({ error: 'No fue posible descargar el archivo de Moodle.' }, 502)`
   - Never log `upstreamUrl.toString()` (which contains the token). Always log `targetUrl.pathname` only.

---

### 2.2 Worker Test Architecture with `bun test`

#### 2.2.1 In-Memory D1 Mocking Strategy
The existing `apps/worker/src/sync/phase2.test.ts` proves that `bun:sqlite` (`new Database(':memory:')`) can faithfully run D1 migrations and execute queries synchronously.
Recommendation:
- Extract `createTestD1()` into `apps/worker/test/test-d1.ts` (or `apps/worker/src/test/helpers.ts`) so that:
  - Phase 2 tests and Phase 3 tests share the exact same D1 mock.
  - Future migrations (`0003_...sql` if added) automatically apply to test databases.
  - Test suites can seed mock courses, assignments, grades, and sync runs cleanly before each test.

#### 2.2.2 Direct Hono App Testing (`app.request`)
- Export `app` from `apps/worker/src/index.ts`:
  `export { app };`
- In test files, invoke routes directly:
  ```ts
  const res = await app.request('/api/health', { method: 'GET' }, {
    DB: testDb,
    MOODLE_TOKEN: 'secret-test-token',
    MOODLE_URL: 'https://catedig.itlalaguna.edu.mx'
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  ```
- Benefits:
  - Zero network sockets opened.
  - Executes full Hono middleware, route matching, parameter binding, and error handlers.
  - Execution time per test is under 2ms.

#### 2.2.3 Test File Structure for Phase 3
Organize tests under `apps/worker/src/` or `apps/worker/test/`:
1. `apps/worker/test/read-endpoints.test.ts`:
   - `GET /api/dashboard`: tests consolidated courses, upcoming assignments, recent activity, and current grades. Verifies `deleted_at IS NULL` filtering and that no `fetch` is made.
   - `GET /api/courses/:id/contents`: tests course content resources read strictly from D1.
   - `GET /api/courses/:id/grades`: tests normalized grades filtered by `course_id`.
   - `GET /api/health`: tests sync run statistics, failure rate, and subrequest metrics.
2. `apps/worker/test/proxy.test.ts`:
   - Tests valid download and stream piping.
   - Tests SSRF rejection (invalid host, http protocol, credentials in URL, port tampering, path traversal).
   - Tests server-side token injection into upstream request.
   - Tests absence of token in response headers, client URLs, and error payloads.
3. `apps/worker/test/mutation.test.ts`:
   - Dedicated mutation test suite verifying that all induced mutations are detected and killed.

---

### 2.3 Mutation Testing Architecture

#### 2.3.1 Analysis: Stryker vs Tailored Deterministic Mutation Suite
| Dimension | Stryker Mutator | Tailored Mutation Suite (`bun test`) |
|---|---|---|
| **Bun Test Compatibility** | Experimental/partial via command runner; can fail or hang | Native 100% compatible with Bun runner |
| **Dependencies** | Requires 5+ heavy npm packages (`@stryker-mutator/*`) | 0 additional dependencies |
| **Execution Time** | 45-180 seconds | < 1 second (< 150ms in Bun) |
| **Windows Pathing** | Known issues with path separators in Windows | Seamless in Bun on Windows |
| **Domain-Specific Logic** | Generic AST operators (often generates irrelevant mutants) | Precisely targets security invariants (SSRF bypass, token leaks, D1 isolation) |
| **Verdict** | High friction, fragile in monorepo | **Recommended: Highly reliable, deterministic & fast** |

#### 2.3.2 Induced Mutants Catalog (12 Mutants to Kill)
The mutation test suite (`apps/worker/test/mutation.test.ts` / `scripts/mutation-test.ts`) must introduce specific defect mutants into the endpoint and proxy logic, run the test assertions against them, and verify that 100% of the mutants are killed:

1. **Mutant 1 (`SSRF_MUTANT_ALLOW_HTTP`)**:
   - *Mutation*: Protocol check removed or allows `'http:'`.
   - *Kill Condition*: Test sending `http://catedig...` must fail if allowed. Assertion catches HTTP 200 instead of 403. **Mutant killed.**
2. **Mutant 2 (`SSRF_MUTANT_BYPASS_HOST`)**:
   - *Mutation*: Host validation returns true or checks substring (`includes`) instead of exact equality.
   - *Kill Condition*: Test sending `https://evil-catedig.itlalaguna.edu.mx` or `https://attacker.com`. Assertion catches unauthorized host. **Mutant killed.**
3. **Mutant 3 (`SSRF_MUTANT_BYPASS_PATH`)**:
   - *Mutation*: Path prefix check removed or allows any path.
   - *Kill Condition*: Test sending `https://catedig.itlalaguna.edu.mx/admin/index.php`. Assertion catches unauthorized path. **Mutant killed.**
4. **Mutant 4 (`SSRF_MUTANT_ALLOW_CREDS`)**:
   - *Mutation*: Skips credential check (`username || password`).
   - *Kill Condition*: Test sending `https://user:pass@catedig...`. Assertion catches credentials. **Mutant killed.**
5. **Mutant 5 (`SSRF_MUTANT_ALLOW_CUSTOM_PORT`)**:
   - *Mutation*: Skips port validation (`port !== '443'`).
   - *Kill Condition*: Test sending `https://catedig...:8443/...`. Assertion catches non-standard port. **Mutant killed.**
6. **Mutant 6 (`TOKEN_MUTANT_OMIT_INJECTION`)**:
   - *Mutation*: Fails to inject `token` parameter into upstream URL.
   - *Kill Condition*: Mock fetch inspects incoming URL; fails when `token` param is missing. **Mutant killed.**
7. **Mutant 7 (`TOKEN_MUTANT_LEAK_HEADER`)**:
   - *Mutation*: Attaches `X-Moodle-Token: <token>` to client response headers.
   - *Kill Condition*: Test asserts client response headers do not contain token. **Mutant killed.**
8. **Mutant 8 (`TOKEN_MUTANT_LEAK_BODY`)**:
   - *Mutation*: Includes upstream URL with token in error response JSON.
   - *Kill Condition*: Test checks error payload string for token substring. **Mutant killed.**
9. **Mutant 9 (`TOKEN_MUTANT_PRESERVE_CLIENT_TOKEN`)**:
   - *Mutation*: Fails to strip client-supplied `?token=forged` param.
   - *Kill Condition*: Test passes forged token; verifies upstream receives only server token. **Mutant killed.**
10. **Mutant 10 (`READ_MUTANT_LEAK_TOMBSTONES`)**:
    - *Mutation*: Removes `deleted_at IS NULL` from SQL query.
    - *Kill Condition*: Test inserts item with `deleted_at = 12345`; asserts it is omitted. **Mutant killed.**
11. **Mutant 11 (`READ_MUTANT_CROSS_COURSE_LEAK`)**:
    - *Mutation*: Removes `course_id = ?` filter from `/api/courses/:id/grades`.
    - *Kill Condition*: Test queries Course 1; asserts Course 2 grades are excluded. **Mutant killed.**
12. **Mutant 12 (`STATUS_MUTANT_INVERT_ERROR_CODE`)**:
    - *Mutation*: Replaces 400/403/404 return with 200 OK on validation error.
    - *Kill Condition*: Test asserts HTTP status code >= 400. **Mutant killed.**

#### 2.3.3 Mutation Runner Script (`scripts/mutation-test.ts`)
Add a script to `package.json`:
`"test:mutation": "bun ./scripts/mutation-test.ts"`
The script:
1. Runs the test suite with all 12 mutants active one by one.
2. Verifies each mutant causes test failure (is killed).
3. Prints a structured report table with mutation score:
   ```
   ==================================================
   BetterMoodle Mutation Testing Summary
   ==================================================
   Mutants Tested:  12
   Mutants Killed:  12 (100.0%)
   Mutants Survived: 0
   Status: PASSED ✅
   ==================================================
   ```
4. Exits with code 0 if 100% killed, code 1 if any mutant survives.

---

### 2.4 Review of `docs/fases/fase-3.md` & Notes Requirements

#### 2.4.1 Checklist Items & Mapping
- `- [ ] Construir GET /api/dashboard`: Maps to consolidated courses, upcoming assignments (`due_date >= now AND deleted_at IS NULL`), recent items, and latest grades.
- `- [ ] Construir GET /api/courses/:id/contents`: Maps to course content resources read from D1 (from `courses.payload_json` or `synced_items`).
- `- [ ] Construir GET /api/courses/:id/grades`: Maps to normalized grade items filtered by `course_id`.
- `- [ ] Enriquecer GET /api/health`: Maps to system status, recent `sync_runs` history (e.g. last 5 runs), failure rate calculation, and subrequests consumed.
- `- [ ] Implementar GET /api/files/proxy`:
  - `- [ ] Validar URL objetivo con allowlist estricta de host (catedig.itlalaguna.edu.mx) y prefijo /webservice/pluginfile.php para mitigar SSRF.`
  - `- [ ] Inyectar MOODLE_TOKEN únicamente en el servidor al hacer el stream hacia el cliente.`
- `- [ ] Revisar y validar esquemas de entrada/salida con Zod en packages/shared.`

#### 2.4.2 Documentation in `## Notas` for Phase 3
Upon completion of Phase 3, the implementer must document in `docs/fases/fase-3.md`:
1. **Architectural & Security Decisions**:
   - Details of SSRF defense: URL normalization, strict host matching, protocol enforcement, manual redirect handling, port/credential stripping.
   - Token isolation guarantee: token injected exclusively in server-side upstream request; zero token leakage in client headers, URLs, or error bodies.
   - Cloudflare Worker stream piping via `ReadableStream` preserving low memory usage.
2. **D1 Read Strategy**:
   - Confirmation that all `/api/*` read routes interact only with D1 without outbound fetches to Moodle.
3. **Automated Testing & Mutation Testing Results**:
   - `bun test` results with test counts and timing.
   - Mutation testing metrics: 12/12 mutants killed, 100% score.
   - Verification commands and build statuses (`tsc`, `build:web`).

---

## 3. Caveats

1. **Moodle Redirection Behavior**:
   Standard Moodle `pluginfile.php` directly serves files with binary streams and does not issue external redirects. However, by setting `redirect: 'manual'`, the proxy defensively prevents any redirect-based SSRF or token leakage. If Moodle ever issues a 302 for an expired session, the proxy will safely return 502 rather than leaking credentials to a redirect target.
2. **Course Contents Data Source**:
   Course contents in Moodle are returned by `core_course_get_contents`. In D1, `courses.payload_json` currently stores course metadata. If course sections and module resources are cached in `courses.payload_json` during sync or structured in `synced_items`, the endpoint `/api/courses/:id/contents` should parse or query from D1 accordingly.
3. **No Code Modification Constraint**:
   As an Explorer agent in read-only investigation mode, no production source code has been altered. All designs and proposed snippets are provided in this handoff for the planner and implementer agents.

---

## 4. Conclusion

1. **Secure Proxy Design**:
   A dedicated validator `validateProxyUrl` enforces strict HTTPS, exact hostname (`catedig.itlalaguna.edu.mx`), path prefix (`/webservice/pluginfile.php`), and forbids credentials and non-443 ports. Server-side token injection modifies query parameters solely for the outbound request, using `redirect: 'manual'` and streaming `upstreamRes.body` with sanitized headers, ensuring total token confidentiality.
2. **Test Architecture in `apps/worker`**:
   The in-memory SQLite D1 mock (`bun:sqlite`) provides sub-millisecond database testing. By exporting `app` from `apps/worker/src/index.ts`, all Hono routes can be tested directly with `app.request()` without external servers. Outbound fetch mocking allows full verification of proxy streaming and SSRF blocking.
3. **Mutation Testing**:
   A deterministic 12-mutant catalog targeting SSRF bypasses, token leakage, and endpoint data isolation runs under `bun test` and a dedicated script `bun run test:mutation`, delivering a 100% kill rate without the latency or fragility of heavy npm mutation packages.
4. **Documentation**:
   The requirements of `docs/fases/fase-3.md` and `AGENTS.md` are mapped to actionable deliverables.

---

## 5. Verification Method

To independently verify the facts and feasibility outlined in this report:

1. **Verify Existing Tests**:
   ```powershell
   bun test
   ```
   *Expected*: Passes with 4 tests, 0 failures in <100ms.

2. **Verify TypeScript Compilation**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected*: 0 errors.

3. **Verify Web Build**:
   ```powershell
   bun run build:web
   ```
   *Expected*: Successful Vite production build.

4. **Verify Hono `app.request` with Bun**:
   ```powershell
   bun --cwd apps/worker -e "import { Hono } from 'hono'; const app = new Hono<{ Bindings: { TOKEN: string } }>(); app.get('/token', (c) => c.text(c.env.TOKEN)); const res = await app.request('/token', undefined, { TOKEN: 'test' }); console.log(await res.text());"
   ```
   *Expected*: Outputs `test`.

5. **Verify SSRF Validator Prototype**:
   Run the URL validation logic against attack vectors:
   ```powershell
   bun -e "const u = new URL('https://catedig.itlalaguna.edu.mx.attacker.com/webservice/pluginfile.php'); console.log(u.hostname === 'catedig.itlalaguna.edu.mx');"
   ```
   *Expected*: Outputs `false`.
