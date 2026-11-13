# Original User Request

## Initial Request — 2026-11-12T20:23:36Z

Implement production Phase 3 (BFF Read API and Secure Proxy) for BetterMoodle in the existing monorepo. Expose read endpoints in Hono backed exclusively by Cloudflare D1, a secure SSRF-protected file proxy, shared Zod validation schemas, and automated test coverage including mutation testing.

Integrity mode: development

## Requirements

### R1. Consolidated Read Endpoints from D1
Expose REST read endpoints in Hono (`apps/worker`) that serve data strictly from Cloudflare D1 without querying Moodle:
- `GET /api/dashboard`: Consolidated view returning enrolled courses, upcoming assignments, recent activity, and current grades.
- `GET /api/courses/:id/contents`: Course contents and resources read strictly from D1 (populated by scheduled sync).
- `GET /api/courses/:id/grades`: Normalized grade items for the specified course from D1.
- `GET /api/health`: Enhanced health endpoint returning system status along with recent `sync_runs` history, failure rate, and subrequest metrics.

### R2. Secure Resource Proxy
Implement `GET /api/files/proxy` to stream Moodle files without exposing `MOODLE_TOKEN` to the client:
- Enforce strict allowlist validation requiring host `catedig.itlalaguna.edu.mx` and path prefix `/webservice/pluginfile.php` to prevent SSRF.
- Inject `MOODLE_TOKEN` securely server-side during the outbound stream to the client, ensuring the token is never exposed in client URLs, headers, or response payloads.

### R3. Shared Schemas and Phase Documentation
- Define and export Zod schemas and TypeScript types for all request queries/params and response payloads in `packages/shared`.
- Update `docs/fases/fase-3.md` marking completed activities with `[x]` and document architectural decisions and verification results in `## Notas` in accordance with `AGENTS.md`.

### R4. Test Suite and Mutation Testing
- Implement automated test suites using `bun test` in `apps/worker` covering all new read endpoints, proxy parameter validation, SSRF blocking, token injection, and error states.
- Add mutation testing to the test suite to verify test robustness and kill induced mutations in endpoint logic and proxy validation.

## Acceptance Criteria

### Read Endpoints Verification
- [ ] `GET /api/dashboard` returns 200 with consolidated courses, items, and grades read exclusively from D1 without initiating outbound fetches to Moodle.
- [ ] `GET /api/courses/:id/contents` returns 200 with course content resources read strictly from D1.
- [ ] `GET /api/courses/:id/grades` returns 200 with normalized course grade items from D1.
- [ ] `GET /api/health` returns recent sync run statistics, failure rate, and subrequest metrics.

### Secure Proxy Verification
- [ ] `GET /api/files/proxy` rejects requests with target URLs outside `catedig.itlalaguna.edu.mx` or without prefix `/webservice/pluginfile.php` with 400 or 403.
- [ ] `GET /api/files/proxy` successfully streams allowed resources with server-side token injection without leaking `MOODLE_TOKEN` in responses, headers, or error payloads.

### Schema and Documentation Verification
- [ ] Request parameters and response payloads for all Phase 3 endpoints are typed and validated with Zod schemas in `packages/shared`.
- [ ] `docs/fases/fase-3.md` has all task checkboxes marked as `[x]` and the `## Notas` section updated with technical decisions and test output.

### Quality, Build, and Mutation Test Verification
- [ ] `bunx tsc --noEmit -p apps/worker/tsconfig.json` completes with 0 errors.
- [ ] `bun run build:web` succeeds.
- [ ] Automated tests execute via `bun test` in `apps/worker` and pass with 0 failures.
- [ ] Mutation testing is implemented and executed against the test suite, verifying that test mutations in endpoint and proxy logic are detected and killed.
