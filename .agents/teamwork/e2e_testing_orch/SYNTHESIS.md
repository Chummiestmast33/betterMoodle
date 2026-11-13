# Synthesis: E2E Test Suite Design & Infrastructure

## Consensus Findings
1. **Test Runner**:
   - `bun test` is Bun's built-in native test runner. It executes tests directly with zero configuration and ultra-low latency (<100ms for full test suites).
   - Test suites will be located in `apps/worker/test/` with helpers under `apps/worker/test/helpers/` and test files under `apps/worker/test/e2e/`.
2. **D1 In-Memory Simulation**:
   - `bun:sqlite` with `:memory:` database provides 100% SQLite 3 query syntax parity with Cloudflare D1.
   - Auto-discovering and executing all migration files in `apps/worker/migrations/*.sql` (`0001`, `0002`, and upcoming `0003`) ensures synchronization with schema changes.
3. **Opaque-Box Application Invocation**:
   - Interacting with `worker.fetch(new Request(url, init), env)` or `app.request(path, init, env)` exercises the full Hono routing and middleware pipeline as an external HTTP client, without opening real network ports.
4. **Outbound Fetch Guarding (Zero-Moodle-Touch & Proxy Verification)**:
   - For read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`), a strict poison fetch mock is installed: any attempt to make an outbound network call will throw immediately, deterministically enforcing RNF-02.
   - For `/api/files/proxy`, the proxy fetch mock intercepts calls, asserts server-side injection of `MOODLE_TOKEN` and `redirect: 'manual'`, and verifies zero token leakage in client responses.
5. **Hierarchical 4-Tier Test Catalog (72 tests)**:
   - **Tier 1 (Feature Coverage)**: 30 tests (6 per endpoint across the 5 endpoints).
   - **Tier 2 (Boundary & Corner Cases)**: 30 tests (6 per endpoint covering edge cases, SQL injection, negative IDs, and extensive SSRF attack vectors).
   - **Tier 3 (Cross-Feature Combinations)**: 6 tests (cross-endpoint data consistency, lifecycle transitions, tombstone propagation).
   - **Tier 4 (Real-World Application Scenarios)**: 6 scenarios (daily student routine, grade audits, multi-resource downloads, upstream Moodle outage survivability, and malicious SSRF defense).

## File Ownership & Deliverables Plan
- `TEST_INFRA.md` at project root (`c:\Users\corte\Downloads\betterMoodle\TEST_INFRA.md`).
- `apps/worker/test/helpers/`:
  - `d1-mock.ts`: In-memory SQLite D1 database simulator.
  - `fixtures.ts`: Seeding helpers for courses, synced_items, sync_state, sync_runs, course_contents.
  - `fetch-mock.ts`: Outbound fetch spy, poison guard, and upstream mock.
  - `test-client.ts`: Opaque-box TestClient wrapper.
- `apps/worker/test/e2e/`:
  - `tier1-features.test.ts`
  - `tier2-boundaries.test.ts`
  - `tier3-combinations.test.ts`
  - `tier4-scenarios.test.ts`
- `TEST_READY.md` at project root (`c:\Users\corte\Downloads\betterMoodle\TEST_READY.md`).
