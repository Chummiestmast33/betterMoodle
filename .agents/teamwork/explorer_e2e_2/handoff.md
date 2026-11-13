# E2E Test Suite Architecture & Comprehensive Test Catalog (Tiers 1–4)

**Role**: Explorer 2 (`explorer_e2e_2`) — E2E Test Catalog & Test Suite Architecture Designer  
**Milestone**: Phase 3 (BFF Read API & Secure Proxy)  
**Parent Orchestrator Conv ID**: `633791a2-7779-4c0d-82f1-cfb32407190b`  
**State Folder**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_2`  
**Date**: 2026-11-12T20:43:00Z  

---

## 1. Observation

### 1.1 Direct File Observations & Authoritative Directives
1. **`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md`**:
   - Lines 11–17: Requirement R1 mandates consolidated read endpoints in Hono (`apps/worker`) serving data strictly from Cloudflare D1 without querying Moodle:
     - `GET /api/dashboard`: Consolidated view returning enrolled courses, upcoming assignments, recent activity, and current grades.
     - `GET /api/courses/:id/contents`: Course contents and resources read strictly from D1.
     - `GET /api/courses/:id/grades`: Normalized grade items for the specified course from D1.
     - `GET /api/health`: Enhanced health endpoint returning system status along with recent `sync_runs` history, failure rate, and subrequest metrics.
   - Lines 18–22: Requirement R2 mandates `GET /api/files/proxy` to stream Moodle files without exposing `MOODLE_TOKEN` to the client:
     - Strict allowlist requiring host `catedig.itlalaguna.edu.mx` and path prefix `/webservice/pluginfile.php` to prevent SSRF.
     - Inject `MOODLE_TOKEN` securely server-side during the outbound stream; token must NEVER appear in client URLs, headers, or response payloads.
   - Lines 27–30: Requirement R4 mandates automated test suites using `bun test` in `apps/worker` covering all new read endpoints, proxy validation, SSRF blocking, token injection, error states, and mutation testing.

2. **`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md`**:
   - Lines 8–11: Read path: All `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health` queries read strictly from Cloudflare D1. Zero outbound network calls to Moodle (RNF-02). Secure Proxy: `GET /api/files/proxy` validates target URL against strict host (`catedig.itlalaguna.edu.mx`) and path prefix (`/webservice/pluginfile.php`), injects `MOODLE_TOKEN` server-side, streams response to client with `redirect: 'manual'`, zero token leakage (RF-04, RNF-01).
   - Lines 50–57: Interface Contracts:
     - `DashboardResponse`: `{ courses: DashboardCourse[], upcoming_assignments: UpcomingAssignment[], recent_activity: RecentActivityItem[], current_grades: DashboardGrade[] }`
     - `CourseContentsResponse`: `{ course_id: number, sections: CourseSection[], synced_at: number | null }`
     - `CourseGradesResponse`: `{ course_id: number, grades: GradeItemDetail[] }`
     - `EnhancedHealthResponse`: `{ status: 'ok' | 'degraded' | 'error' | 'circuit_open', timestamp: number, sync_state?: SyncState | null, recent_runs: SyncRun[], failure_rate: number, subrequests: SubrequestMetrics }`
     - `FileProxyQuery`: `{ url: string }`

3. **`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md`**:
   - Lines 4–13: Requires creating `TEST_INFRA.md` defining test philosophy, feature inventory, runner (`bun test`), directory layout, implementing Tiers 1–4 test cases covering all 5 endpoints, and publishing `TEST_READY.md`.
   - Approach: Opaque-box testing exercising the Hono application (`app.request()`) as an external HTTP client with an in-memory/mock Cloudflare D1 environment and mock upstream `fetch`.

4. **`c:\Users\corte\Downloads\betterMoodle\AGENTS.md`**:
   - Section 2.1: "La ruta de lectura nunca toca Moodle... Ningún endpoint interactivo (`/api/*`) debe hacer `fetch` hacia `catedig.itlalaguna.edu.mx` (excepto `/api/files/proxy` bajo allowlist estricta en Fase 3 y `/api/sync/manual` con rate limit)."
   - Section 2.3: "Presupuesto de subpeticiones (RNF-05): Límite duro de Cloudflare Workers gratuitos (~50 subpeticiones por invocación)."

5. **Peer Intelligence (`spec_miner_e2e_1/handoff.md`)**:
   - Comprehensive extraction of 5 core endpoints, exact response shapes, 32 edge cases, and 8 SSRF allowlist constraints.

---

## 2. Logic Chain

1. **Opaque-Box Testing Strategy**:
   - E2E testing must treat the Worker as an opaque black box via Hono's `app.request(path, init, env)` or `app.fetch(request, env)`.
   - The test runner supplies standard Cloudflare Worker bindings (`env.DB` and `env.MOODLE_TOKEN`), sends HTTP requests, and verifies HTTP status codes, headers, and parsed JSON responses against shared Zod schemas.

2. **D1 Read Isolation Verification**:
   - For any read request (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`), the test harness installs an outbound `fetch` spy.
   - If `fetch()` is called during a read request, the test must immediately fail. This enforces RNF-02 deterministically.

3. **Secure Proxy Security Verification**:
   - The file proxy must be tested against an exhaustive battery of SSRF vectors (malicious protocols, domain spoofing, suffix attacks, IP literals, AWS/Cloud metadata IPs `169.254.169.254`, port manipulation, and path traversal).
   - In outbound proxy requests, `fetch` must be called with injected `MOODLE_TOKEN` and `redirect: 'manual'`.
   - Response status, headers, and body must be string-searched to confirm 0 instances of `MOODLE_TOKEN`.

4. **Hierarchical 4-Tier Test Partitioning**:
   - **Tier 1 (Feature Coverage)**: Baseline happy-path tests ensuring every endpoint satisfies its primary functional contract (6 tests per endpoint $\times$ 5 endpoints = 30 tests).
   - **Tier 2 (Boundary & Corner Cases)**: Adverse inputs, type mismatches, SQL injection strings, empty tables, oversized inputs, and SSRF exploits (6 tests per endpoint $\times$ 5 endpoints = 30 tests).
   - **Tier 3 (Cross-Feature Combinations)**: Multi-endpoint state consistency, data coupling across dashboard/grades/contents, and sync state transitions (6 tests).
   - **Tier 4 (Real-World Scenarios)**: Realistic end-to-end user journeys representing daily student workflows, outage survivability, and security penetration resilience (6 scenarios).
   - Total Suite: **72 tests**, far exceeding the minimum requirement ($\ge 60$ tests).

---

## 3. Caveats

1. **Course Contents Cache Population**:
   - `GET /api/courses/:id/contents` serves data strictly from the `course_contents` table (populated by scheduled sync). If a course exists in `courses` but has not yet been synced to `course_contents`, the endpoint must return HTTP 200 OK with `sections: []` and `synced_at: null` rather than failing.
2. **Phase 3 Single-User Scope**:
   - Phase 3 operates in single-user mode (`moodle_user_id` stored in `sync_state`). Multi-tenant JWT authorization headers are reserved for Phase 6 per `plan.md`.
3. **Upstream Streaming**:
   - The secure proxy must stream the response body directly (`ReadableStream`) to honor Cloudflare's 128 MB RAM budget rather than buffering entire files with `arrayBuffer()`.

---

## 4. Conclusion & Test Suite Architecture

### 4.1 Master Test Suite Overview

| Tier | Focus | Test Count | Target Endpoints Covered |
|------|-------|------------|---------------------------|
| **Tier 1** | Feature Coverage (Happy Path) | 30 tests (6 per endpoint) | Dashboard, Contents, Grades, Health, Proxy |
| **Tier 2** | Boundary & Corner Cases (Negative / Adversarial) | 30 tests (6 per endpoint) | Dashboard, Contents, Grades, Health, Proxy |
| **Tier 3** | Cross-Feature Combinations & State Coupling | 6 tests | Multi-endpoint consistency & transitions |
| **Tier 4** | Real-World Application User Scenarios | 6 scenarios | End-to-end student journeys & resilience |
| **Total** | **Comprehensive E2E Coverage** | **72 tests** | **All Phase 3 Capabilities** |

---

### 4.2 Complete Tier 1 Test Catalog: Feature Coverage (30 Tests)

#### Feature 1: `GET /api/dashboard`
- **`T1-DASH-01` Standard Dashboard Retrieval**
  - *Objective*: Verify consolidated retrieval of active courses, upcoming assignments, recent activity, and current grades.
  - *Setup*: Seed D1: 2 courses (ID 10, 20), 3 upcoming assignments (`due_date` in future), 2 recent items, 2 grade items.
  - *Request*: `GET /api/dashboard`.
  - *Assertion*: `200 OK`. Matches `DashboardResponseSchema`. `courses.length === 2`, `upcoming_assignments.length === 3` sorted `due_date ASC`, `recent_activity.length === 2` sorted `timemodified DESC`, `current_grades.length === 2`. Outbound `fetch` call count = 0.
- **`T1-DASH-02` Soft-Deleted Item Exclusion**
  - *Objective*: Verify tombstoned records (`deleted_at IS NOT NULL`) do not appear on the dashboard.
  - *Setup*: Seed 1 active assignment (`deleted_at = null`) and 1 tombstoned assignment (`deleted_at = 1700000000`). Seed 1 active grade and 1 tombstoned grade.
  - *Request*: `GET /api/dashboard`.
  - *Assertion*: `200 OK`. `upcoming_assignments.length === 1`, `current_grades.length === 1`. Tombstoned items are completely omitted. Outbound `fetch` call count = 0.
- **`T1-DASH-03` Upcoming Assignment Due Date Horizon**
  - *Objective*: Verify past-due assignments are excluded from the `upcoming_assignments` list.
  - *Setup*: Set current reference time $T$. Seed Assignment A with `due_date = T + 86400` and Assignment B with `due_date = T - 3600`.
  - *Request*: `GET /api/dashboard`.
  - *Assertion*: `200 OK`. `upcoming_assignments` contains only Assignment A. Outbound `fetch` call count = 0.
- **`T1-DASH-04` Course Progress & Metadata Preservation**
  - *Objective*: Verify course completion progress values (e.g. 0.0, 75.5, 100.0) and `refreshed_at` timestamps are returned accurately.
  - *Setup*: Seed Course 10 with `progress = 75.5` and `refreshed_at = 1700000100`.
  - *Request*: `GET /api/dashboard`.
  - *Assertion*: `200 OK`. `courses[0].progress === 75.5`, `courses[0].refreshed_at === 1700000100`. Outbound `fetch` call count = 0.
- **`T1-DASH-05` Recent Activity Ordering and Bounded Limit**
  - *Objective*: Verify recent activity feed reflects items sorted strictly by `timemodified DESC` and respects default limit (15).
  - *Setup*: Seed 25 items across various courses with staggered timestamps.
  - *Request*: `GET /api/dashboard`.
  - *Assertion*: `200 OK`. `recent_activity.length <= 15`. For every index $i$, `recent_activity[i].timemodified >= recent_activity[i+1].timemodified`. Outbound `fetch` call count = 0.
- **`T1-DASH-06` Submission Status Mapping**
  - *Objective*: Verify assignments accurately reflect submission statuses: `'pending'`, `'draft'`, `'submitted'`, `'graded'`.
  - *Setup*: Seed 4 upcoming assignments, one for each submission status.
  - *Request*: `GET /api/dashboard`.
  - *Assertion*: `200 OK`. Each assignment's `submission_status` enum is parsed and returned correctly. Outbound `fetch` call count = 0.

#### Feature 2: `GET /api/courses/:id/contents`
- **`T1-CONT-01` Full Course Section & Resource Tree**
  - *Objective*: Retrieve complete course contents tree for an enrolled course.
  - *Setup*: Seed `courses` with ID 101. Seed `course_contents` with course ID 101, `updated_at = 1700000000`, and `sections_json` containing 3 sections (General, Unit 1, Unit 2) with resource modules.
  - *Request*: `GET /api/courses/101/contents`.
  - *Assertion*: `200 OK`. Matches `CourseContentsResponseSchema`. `course_id === 101`, `sections.length === 3`, `synced_at === 1700000000`. Outbound `fetch` call count = 0.
- **`T1-CONT-02` Course with Empty Section List**
  - *Objective*: Verify course with valid contents record but empty sections array returns cleanly.
  - *Setup*: Seed `courses` with ID 102. Seed `course_contents` with `sections_json = '[]'`.
  - *Request*: `GET /api/courses/102/contents`.
  - *Assertion*: `200 OK`. `course_id === 102`, `sections === []`. Outbound `fetch` call count = 0.
- **`T1-CONT-03` Course Not Yet Cached in `course_contents`**
  - *Objective*: Verify graceful fallback when a course exists in `courses` but background sync has not yet cached its sections.
  - *Setup*: Seed `courses` with ID 103; zero rows in `course_contents` for ID 103.
  - *Request*: `GET /api/courses/103/contents`.
  - *Assertion*: `200 OK`. Returns `{ course_id: 103, sections: [], synced_at: null }`. Outbound `fetch` call count = 0.
- **`T1-CONT-04` Resource File Metadata & Proxy URL Attachment**
  - *Objective*: Verify file resources include filename, filesize, mimetype, and client-safe proxy URL.
  - *Setup*: Seed section with a module containing file resource `manual.pdf` at `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/50/mod_resource/content/1/manual.pdf`.
  - *Request*: `GET /api/courses/101/contents`.
  - *Assertion*: `200 OK`. Resource file has `filename === "manual.pdf"`, `mimetype === "application/pdf"`, and contains non-tokenized URL or `proxy_url`. Outbound `fetch` call count = 0.
- **`T1-CONT-05` Section & Module Visibility Flags**
  - *Objective*: Verify hidden or conditional sections (`visible = 0`) correctly convey their visibility flags.
  - *Setup*: Seed Section 1 with `visible: 1` and Section 2 with `visible: 0`.
  - *Request*: `GET /api/courses/101/contents`.
  - *Assertion*: `200 OK`. `sections[0].visible === 1`, `sections[1].visible === 0`. Outbound `fetch` call count = 0.
- **`T1-CONT-06` Response Headers & Content-Type**
  - *Objective*: Verify standard JSON headers without leaking server info.
  - *Request*: `GET /api/courses/101/contents`.
  - *Assertion*: `200 OK`. Header `Content-Type` contains `application/json`. Outbound `fetch` call count = 0.

#### Feature 3: `GET /api/courses/:id/grades`
- **`T1-GRAD-01` Standard Course Grades Retrieval**
  - *Objective*: Verify normalized grade items retrieval for a specific course.
  - *Setup*: Seed Course 201. Seed `synced_items` with 3 items (`item_type = 'grade'`) for `course_id = 201` with `grade_num` values `85.0`, `92.5`, `100.0`.
  - *Request*: `GET /api/courses/201/grades`.
  - *Assertion*: `200 OK`. Matches `CourseGradesResponseSchema`. `course_id === 201`, `grades.length === 3`. Outbound `fetch` call count = 0.
- **`T1-GRAD-02` Course with No Grade Items Recorded**
  - *Objective*: Verify course with no grades returns an empty array.
  - *Setup*: Seed Course 202; zero grade items in `synced_items` for 202.
  - *Request*: `GET /api/courses/202/grades`.
  - *Assertion*: `200 OK`. `{ course_id: 202, grades: [] }`. Outbound `fetch` call count = 0.
- **`T1-GRAD-03` Strict Cross-Course Grade Isolation**
  - *Objective*: Verify that grades for other courses are not returned in the requested course's gradebook.
  - *Setup*: Seed Course 201 with 2 grades; Seed Course 202 with 4 grades.
  - *Request*: `GET /api/courses/201/grades`.
  - *Assertion*: `200 OK`. `grades.length === 2`. All returned items have `course_id === 201`. Zero items from 202. Outbound `fetch` call count = 0.
- **`T1-GRAD-04` Soft-Deleted Grade Exclusion**
  - *Objective*: Verify tombstoned grades (`deleted_at IS NOT NULL`) are omitted.
  - *Setup*: Seed Course 201 with 1 active grade and 1 grade with `deleted_at = 1700000000`.
  - *Request*: `GET /api/courses/201/grades`.
  - *Assertion*: `200 OK`. `grades.length === 1`. Tombstoned grade omitted. Outbound `fetch` call count = 0.
- **`T1-GRAD-05` Ungraded Item / Null Grade Representation**
  - *Objective*: Verify grade item where assessment is pending (`grade_num = null`) serializes cleanly.
  - *Setup*: Seed Course 201 with a grade item where `grade_num = null`.
  - *Request*: `GET /api/courses/201/grades`.
  - *Assertion*: `200 OK`. Item returned with `grade_num: null`. Outbound `fetch` call count = 0.
- **`T1-GRAD-06` Non-Grade Item Filtering**
  - *Objective*: Verify assignments and announcements for the course are excluded from the grades endpoint.
  - *Setup*: Seed Course 201 with 1 assignment, 1 announcement, and 1 grade item.
  - *Request*: `GET /api/courses/201/grades`.
  - *Assertion*: `200 OK`. `grades.length === 1`. Assignment and announcement excluded. Outbound `fetch` call count = 0.

#### Feature 4: `GET /api/health`
- **`T1-HLTH-01` Healthy System Baseline**
  - *Objective*: Verify healthy operational status when background sync is operating normally.
  - *Setup*: Seed `sync_state` with `consecutive_failures = 0`, `circuit_open_until = 0`, `baseline_seeded = 1`. Seed `sync_runs` with 5 successful runs (`status = 'ok'`).
  - *Request*: `GET /api/health`.
  - *Assertion*: `200 OK`. Matches `EnhancedHealthResponseSchema`. `status === 'ok'`, `failure_rate === 0.0`, `recent_runs.length === 5`. Outbound `fetch` call count = 0.
- **`T1-HLTH-02` Degraded Status on High Failure Rate**
  - *Objective*: Verify status changes to `'degraded'` when recent sync failure rate exceeds threshold.
  - *Setup*: Seed `sync_runs` with 6 `'error'` runs and 4 `'ok'` runs (`failure_rate = 0.6`). `consecutive_failures = 2`.
  - *Request*: `GET /api/health`.
  - *Assertion*: `200 OK`. `status === 'degraded'`, `failure_rate === 0.6`. Outbound `fetch` call count = 0.
- **`T1-HLTH-03` Circuit Breaker Tripped Status**
  - *Objective*: Verify status reports `'circuit_open'` when circuit breaker timer is active in the future.
  - *Setup*: Set current time $T$. Seed `sync_state` with `circuit_open_until = T + 1800`.
  - *Request*: `GET /api/health`.
  - *Assertion*: `200 OK`. `status === 'circuit_open'`. Outbound `fetch` call count = 0.
- **`T1-HLTH-04` Subrequest Metric Calculation**
  - *Objective*: Verify subrequest metrics (`last_used`, `avg_recent`, `max_recent`, `max_budget: 45/50`) reflect recent runs.
  - *Setup*: Seed `sync_runs` with `subrequests_used` values: `[20, 25, 30]`.
  - *Request*: `GET /api/health`.
  - *Assertion*: `200 OK`. `subrequests.last_used === 30`, `subrequests.avg_recent === 25.0`, `subrequests.max_recent === 30`. Outbound `fetch` call count = 0.
- **`T1-HLTH-05` Recent Runs Ordering & Limit**
  - *Objective*: Verify `recent_runs` is capped at configured limit (15) and ordered `id DESC`.
  - *Setup*: Seed 25 `sync_runs` with incrementing IDs 1 to 25.
  - *Request*: `GET /api/health`.
  - *Assertion*: `200 OK`. `recent_runs.length <= 15`, `recent_runs[0].id === 25`. Outbound `fetch` call count = 0.
- **`T1-HLTH-06` Health with Fresh Database (Zero Runs)**
  - *Objective*: Verify health endpoint does not divide by zero when `sync_runs` is empty.
  - *Setup*: Empty `sync_runs` table, default `sync_state`.
  - *Request*: `GET /api/health`.
  - *Assertion*: `200 OK`. `recent_runs === []`, `failure_rate === 0.0`, `subrequests.avg_recent === 0`. Outbound `fetch` call count = 0.

#### Feature 5: `GET /api/files/proxy`
- **`T1-PROX-01` Valid HTTPS Moodle File Streaming**
  - *Objective*: Stream allowed PDF file through proxy.
  - *Setup*: Set `c.env.MOODLE_TOKEN = 'token-123'`. Mock upstream fetch returning `200 OK`, `Content-Type: application/pdf`, `Content-Length: 512`, body `Buffer.from('%PDF-1.4 sample content')`.
  - *Request*: `GET /api/files/proxy?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/doc.pdf`.
  - *Assertion*: `200 OK`. Response body matches binary content. `Content-Type` is `application/pdf`. Upstream fetch was called exactly once.
- **`T1-PROX-02` Server-Side Token Injection**
  - *Objective*: Verify secret `MOODLE_TOKEN` is injected server-side into the outbound URL query parameters.
  - *Setup*: `c.env.MOODLE_TOKEN = 'secret-tok-987'`. Intercept upstream fetch call.
  - *Request*: `GET /api/files/proxy?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/456/mod_assign/introattachment/0/rubric.pdf`.
  - *Assertion*: Outbound fetch URL contains `token=secret-tok-987`.
- **`T1-PROX-03` Zero Token Leakage in Client Response**
  - *Objective*: Verify secret `MOODLE_TOKEN` is NEVER reflected in client response headers, status, or payload.
  - *Setup*: `c.env.MOODLE_TOKEN = 'secret-tok-987'`.
  - *Request*: `GET /api/files/proxy?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf`.
  - *Assertion*: All response headers (including `Content-Disposition`, `Location`), status, and body string representations do NOT contain `'secret-tok-987'`.
- **`T1-PROX-04` Header Passthrough & Sanitization**
  - *Objective*: Verify safe headers (`Content-Disposition`, `Content-Length`) pass through, while sensitive headers are scrubbed.
  - *Setup*: Upstream returns `Content-Disposition: attachment; filename="tarea.pdf"` and `Set-Cookie: MoodleSession=xyz`.
  - *Request*: `GET /api/files/proxy?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/tarea.pdf`.
  - *Assertion*: Client receives `Content-Disposition: attachment; filename="tarea.pdf"`. Client does NOT receive `Set-Cookie`. `X-Content-Type-Options: nosniff` is attached.
- **`T1-PROX-05` Upstream 404 / 500 Handling**
  - *Objective*: Verify upstream file not found or server error returns clean 502/404 without leaking upstream stack traces or tokens.
  - *Setup*: Upstream mock returns `404 Not Found`.
  - *Request*: `GET /api/files/proxy?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/999/nonexistent.pdf`.
  - *Assertion*: Proxy returns `502 Bad Gateway` (or 404) with structured JSON error. Zero token leakage.
- **`T1-PROX-06` Manual Redirect Enforcement (`redirect: 'manual'`)**
  - *Objective*: Verify proxy does not follow 301/302 redirects automatically (preventing redirect-based SSRF).
  - *Setup*: Upstream mock returns `302 Found` with `Location: http://internal-server/admin`.
  - *Request*: `GET /api/files/proxy?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/redirect`.
  - *Assertion*: Upstream fetch call was dispatched with `{ redirect: 'manual' }`. Proxy returns `502 Bad Gateway` and does not follow the redirect.

---

### 4.3 Complete Tier 2 Test Catalog: Boundary & Corner Cases (30 Tests)

#### Feature 1: `GET /api/dashboard` Boundary Cases
- **`T2-DASH-01` Empty Database Cold Start**
  - *Input*: Fresh database; 0 courses, 0 items, 0 runs.
  - *Assertion*: `200 OK`. `{ courses: [], upcoming_assignments: [], recent_activity: [], current_grades: [] }`. Zero unhandled null pointer exceptions.
- **`T2-DASH-02` Null Course Progress Value**
  - *Input*: Seed course with `progress = NULL`.
  - *Assertion*: `200 OK`. `courses[0].progress === null`. Schema validates successfully.
- **`T2-DASH-03` Non-ASCII Unicode & Spanish Accents**
  - *Input*: Seed course name: `Álgebra Lineal & Métodos Numéricos — ITL 🚀`, assignment title: `¿Cómo funciona la Transformada Z?`.
  - *Assertion*: `200 OK`. Characters preserved verbatim without UTF-8 corruption or HTML escaping errors.
- **`T2-DASH-04` High Volume Dataset Query Limits**
  - *Input*: Seed 500 items in `synced_items`.
  - *Assertion*: `200 OK`. Response executes promptly under 50ms; arrays respect bounded limits (`recent_activity <= 15`).
- **`T2-DASH-05` Database Error / Query Exception**
  - *Input*: D1 mock throws `Error('D1_ERROR: disk I/O failure')`.
  - *Assertion*: `500 Internal Server Error`. Body `{ error: string }` matching `ApiErrorResponseSchema`. Does not leak internal SQL statements.
- **`T2-DASH-06` Unsupported HTTP Method Rejection**
  - *Input*: `POST /api/dashboard` with body `{}`.
  - *Assertion*: `404 Not Found` or `405 Method Not Allowed`.

#### Feature 2: `GET /api/courses/:id/contents` Boundary Cases
- **`T2-CONT-01` Non-Numeric Course ID Parameter**
  - *Input*: `GET /api/courses/notanumber/contents`.
  - *Assertion*: `400 Bad Request`. `{ error: "ID de curso inválido", code: "INVALID_COURSE_ID" }`. Zero SQL prepare or outbound fetch.
- **`T2-CONT-02` Negative and Zero Course ID**
  - *Input*: `GET /api/courses/-5/contents` and `GET /api/courses/0/contents`.
  - *Assertion*: `400 Bad Request`. Positive integer validation strictly enforced.
- **`T2-CONT-03` SQL Injection Attempt in Course ID Path**
  - *Input*: `GET /api/courses/1%20OR%201=1/contents` and `GET /api/courses/1;DROP%20TABLE%20courses;/contents`.
  - *Assertion*: `400 Bad Request`. Blocked at parameter schema validation before reaching SQL execution.
- **`T2-CONT-04` Non-Existent Course ID**
  - *Input*: `GET /api/courses/99999/contents` (course 99999 not in `courses` table).
  - *Assertion*: `404 Not Found`. `{ error: "Curso no encontrado", code: "COURSE_NOT_FOUND" }`.
- **`T2-CONT-05` Corrupted `sections_json` in Database**
  - *Input*: Seed `course_contents` with `sections_json = '{malformed:json['`.
  - *Assertion*: Safe error handling (`500` or fallback `{ sections: [] }`); worker process does not crash.
- **`T2-CONT-06` Integer Overflow / Floating Point ID**
  - *Input*: `GET /api/courses/12.34/contents` and `GET /api/courses/99999999999999999999/contents`.
  - *Assertion*: `400 Bad Request`.

#### Feature 3: `GET /api/courses/:id/grades` Boundary Cases
- **`T2-GRAD-01` Non-Numeric Course ID Parameter**
  - *Input*: `GET /api/courses/abc/grades`.
  - *Assertion*: `400 Bad Request`. `{ error: "ID de curso inválido", code: "INVALID_COURSE_ID" }`.
- **`T2-GRAD-02` Negative and Zero Course ID**
  - *Input*: `GET /api/courses/-10/grades` and `GET /api/courses/0/grades`.
  - *Assertion*: `400 Bad Request`.
- **`T2-GRAD-03` SQL Injection Attempt in Course ID Path**
  - *Input*: `GET /api/courses/1%27%20UNION%20SELECT%20null--/grades`.
  - *Assertion*: `400 Bad Request`.
- **`T2-GRAD-04` Non-Existent Course ID**
  - *Input*: `GET /api/courses/88888/grades` (course 88888 not in `courses` table).
  - *Assertion*: `404 Not Found`. `{ error: "Curso no encontrado", code: "COURSE_NOT_FOUND" }`.
- **`T2-GRAD-05` Extreme Grade Values & Decimal Precision**
  - *Input*: Seed grades with `grade_num = 0.0`, `grade_num = 100.0`, `grade_num = 87.654321`.
  - *Assertion*: `200 OK`. Floats represented accurately without truncation or floating point conversion error.
- **`T2-GRAD-06` Decimal ID Parameter**
  - *Input*: `GET /api/courses/101.5/grades`.
  - *Assertion*: `400 Bad Request`. Only integer IDs allowed.

#### Feature 4: `GET /api/health` Boundary Cases
- **`T2-HLTH-01` Missing `sync_state` Row**
  - *Input*: `sync_state` table exists but has 0 rows.
  - *Assertion*: `200 OK`. `sync_state === null`, status handles missing state gracefully.
- **`T2-HLTH-02` Database Connection Failure**
  - *Input*: D1 statement prepare throws exception.
  - *Assertion*: `500 Internal Server Error`. `{ status: "error", error: string }`.
- **`T2-HLTH-03` High Consecutive Failures without Circuit Trip**
  - *Input*: `sync_state.consecutive_failures = 4`, `circuit_open_until = 0`.
  - *Assertion*: `200 OK`. `status === 'degraded'`.
- **`T2-HLTH-04` 100% Failure Rate in `sync_runs`**
  - *Input*: 10 recent runs all with `status = 'error'`.
  - *Assertion*: `200 OK`. `failure_rate === 1.0`, `status === 'degraded'` (or `'error'`).
- **`T2-HLTH-05` Null Metrics in `sync_runs`**
  - *Input*: Seed runs with `subrequests_used = null`, `finished_at = null`.
  - *Assertion*: `200 OK`. Subrequest averages default safely to 0 without NaN outputs.
- **`T2-HLTH-06` Initial Unseeded Baseline**
  - *Input*: `sync_state.baseline_seeded = 0`.
  - *Assertion*: `200 OK`. `status === 'degraded'`.

#### Feature 5: `GET /api/files/proxy` Boundary Cases (SSRF, Malicious URLs, Injection)
- **`T2-PROX-01` Missing `url` Query Parameter**
  - *Input*: `GET /api/files/proxy`.
  - *Assertion*: `400 Bad Request`. `{ error: "Parámetro url es requerido" }`. Zero outbound fetch.
- **`T2-PROX-02` Empty or Whitespace `url` Query Parameter**
  - *Input*: `GET /api/files/proxy?url=` and `GET /api/files/proxy?url=%20%20`.
  - *Assertion*: `400 Bad Request`. Zero outbound fetch.
- **`T2-PROX-03` Insecure Protocols (HTTP, FTP, file, javascript)**
  - *Input*:
    - `GET /api/files/proxy?url=http://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/f.pdf` (plain HTTP)
    - `GET /api/files/proxy?url=ftp://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/f.pdf`
    - `GET /api/files/proxy?url=file:///etc/passwd`
    - `GET /api/files/proxy?url=javascript:alert(1)`
  - *Assertion*: `403 Forbidden` (or 400). Non-HTTPS protocol rejected. Zero outbound fetch.
- **`T2-PROX-04` Host Spoofing & SSRF Vectors (Suffix, Subdomain, IP literals, Cloud Metadata)**
  - *Input*:
    - `https://catedig.itlalaguna.edu.mx.attacker.com/webservice/pluginfile.php/1/f.pdf`
    - `https://evil.catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/f.pdf`
    - `https://127.0.0.1/webservice/pluginfile.php/1/f.pdf`
    - `https://169.254.169.254/latest/meta-data/`
    - `https://[::1]/webservice/pluginfile.php/1/f.pdf`
  - *Assertion*: `403 Forbidden`. Strict hostname equality `catedig.itlalaguna.edu.mx` enforced. Zero outbound fetch.
- **`T2-PROX-05` Port Injection & Embedded Userinfo**
  - *Input*:
    - `https://catedig.itlalaguna.edu.mx:8443/webservice/pluginfile.php/1/f.pdf`
    - `https://admin:pass@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/f.pdf`
  - *Assertion*: `403 Forbidden` / `400 Bad Request`. Zero outbound fetch.
- **`T2-PROX-06` Unauthorized Path & Path Traversal**
  - *Input*:
    - `https://catedig.itlalaguna.edu.mx/admin/index.php`
    - `https://catedig.itlalaguna.edu.mx/login/index.php`
    - `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../admin/settings.php`
  - *Assertion*: `403 Forbidden`. Path prefix `/webservice/pluginfile.php` strictly enforced after URL normalization. Zero outbound fetch.

---

### 4.4 Complete Tier 3 Test Catalog: Cross-Feature Combinations (6 Tests)

- **`T3-XFEAT-01` Dashboard & Course Grades Cross-Consistency**
  - *Objective*: Verify grade items appearing in `/api/dashboard` `current_grades` match the specific course grade records returned by `/api/courses/:id/grades`.
  - *Setup*: Seed Course 101 with 2 grades in `synced_items`.
  - *Action*:
    1. Call `GET /api/dashboard`. Extract grades where `course_id === 101`.
    2. Call `GET /api/courses/101/grades`.
  - *Assertion*: Both endpoints return identical grade titles, numerical values, and item keys. Both execute with 0 outbound fetch calls.
- **`T3-XFEAT-02` Course Contents Resource URLs Streamed Through File Proxy**
  - *Objective*: Verify that file URLs embedded in `/api/courses/:id/contents` pass proxy SSRF validation seamlessly and download successfully.
  - *Setup*: Seed course contents containing a resource with file URL `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/101/mod_resource/content/1/syllabus.pdf`. Set upstream mock to return valid PDF bytes.
  - *Action*:
    1. Call `GET /api/courses/101/contents`. Extract `fileurl`.
    2. Call `GET /api/files/proxy?url=` with the extracted `fileurl`.
  - *Assertion*: Proxy accepts the URL, returns `200 OK` streaming the PDF, injects `c.env.MOODLE_TOKEN` into the upstream call, and does not leak the token to the client.
- **`T3-XFEAT-03` Sync Runs Lifecycle Impact on Health Endpoint Telemetry**
  - *Objective*: Verify that background sync run updates in D1 dynamically update health failure rates and status without server restart.
  - *Setup*: System starts healthy (5 ok runs).
  - *Action*:
    1. Call `GET /api/health` -> verify `status === 'ok'`, `failure_rate === 0.0`.
    2. Insert 5 error runs into `sync_runs` and set `sync_state.consecutive_failures = 3`.
    3. Call `GET /api/health` -> verify `status === 'degraded'`, `failure_rate === 0.5`.
    4. Set `sync_state.circuit_open_until = now + 1800`.
    5. Call `GET /api/health` -> verify `status === 'circuit_open'`.
  - *Assertion*: Health endpoint dynamically reflects real-time D1 state changes. Zero outbound fetch calls.
- **`T3-XFEAT-04` Assignment Creation Consistency Across Dashboard & Items Endpoints**
  - *Objective*: Verify that newly synced assignments appear consistently on both `/api/dashboard` and `/api/items?type=assignment`.
  - *Setup*: Insert a new assignment into `synced_items` with future due date.
  - *Action*:
    1. Call `GET /api/dashboard`. Check `upcoming_assignments`.
    2. Call `GET /api/items?type=assignment`.
  - *Assertion*: The new assignment appears in both responses with identical item keys, title, and due dates. Zero outbound fetch calls.
- **`T3-XFEAT-05` Soft-Delete (Tombstone) Cascade Across Read Views**
  - *Objective*: Verify that setting `deleted_at = now` on an item removes it simultaneously from `/api/dashboard`, `/api/courses/:id/grades`, and `/api/items`.
  - *Setup*: Course 101 with an active grade item.
  - *Action*:
    1. Verify item is present in `/api/dashboard` and `/api/courses/101/grades`.
    2. Update `synced_items` setting `deleted_at = 1700000000` for that item.
    3. Query `/api/dashboard` and `/api/courses/101/grades`.
  - *Assertion*: Item immediately disappears from both endpoints.
- **`T3-XFEAT-06` Subrequest Quota Telemetry Tracking**
  - *Objective*: Verify that sync runs consuming subrequests near the 50-request limit update `subrequests.last_used` and `max_recent` in `/api/health`.
  - *Setup*: Seed runs consuming `[40, 42, 45]` subrequests.
  - *Action*: Call `GET /api/health`.
  - *Assertion*: `subrequests.last_used === 45`, `subrequests.max_recent === 45`, `subrequests.avg_recent === 42.33`. Zero outbound fetch calls.

---

### 4.5 Complete Tier 4 Test Catalog: Real-World Scenarios (6 Scenarios)

- **`T4-SCEN-01` Complete Student Morning Routine (Daily App Launch)**
  - *Story*: A student opens BetterMoodle at 7:30 AM before classes to check their schedule, assignments, and download lecture notes.
  - *Execution Steps*:
    1. App performs initial health check: `GET /api/health` -> asserts `status: 'ok'`.
    2. App loads main dashboard: `GET /api/dashboard` -> student sees 3 enrolled courses, 2 upcoming homework assignments due tonight, and 1 important exam date.
    3. Student selects Course 101: `GET /api/courses/101/contents` -> student navigates to "Unidad 2" and locates `diapositivas_tema2.pdf`.
    4. Student clicks download: `GET /api/files/proxy?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/101/mod_resource/content/1/diapositivas_tema2.pdf`.
  - *Assertions*:
    - Steps 1–3 execute with 0 outbound network calls to Moodle, completing under 10ms.
    - Step 4 executes exactly 1 outbound call to Moodle with injected `MOODLE_TOKEN`.
    - Downloaded PDF streams to student with headers `Content-Type: application/pdf`, `X-Content-Type-Options: nosniff`.
    - Zero token leakage across all headers and bodies.
- **`T4-SCEN-02` Academic Grade Audit and Feedback Review**
  - *Story*: Following midterm exams, a student reviews their grades across all enrolled courses to check GPA and teacher feedback.
  - *Execution Steps*:
    1. Student checks dashboard: `GET /api/dashboard` -> views `current_grades` summary.
    2. Student dives into "Redes y Telecomunicaciones" (Course 101): `GET /api/courses/101/grades` -> views Unit 1 Exam (88.5) and Homework 1 (95.0).
    3. Student checks "Programación Web" (Course 102): `GET /api/courses/102/grades` -> views Project 1 (100.0).
    4. Student checks "Taller de Investigación" (Course 103, no grades submitted yet): `GET /api/courses/103/grades` -> receives `200 OK` with `grades: []`.
  - *Assertions*:
    - 100% course grade isolation (grades from 101 never appear in 102 or 103).
    - Numeric grade values, feedback strings, and min/max boundaries are exact.
    - Zero outbound network calls to Moodle across the entire audit.
- **`T4-SCEN-03` High-Volume Multi-Resource Download with Leak Defense**
  - *Story*: A student downloads multiple lecture attachments and assignment templates in rapid succession.
  - *Execution Steps*:
    1. Request `GET /api/courses/101/contents` and parse 3 distinct file URLs (PDF, ZIP archive, and DOCX rubric).
    2. Dispatch 3 parallel proxy download requests:
       - `GET /api/files/proxy?url=.../slides.pdf`
       - `GET /api/files/proxy?url=.../starter_code.zip`
       - `GET /api/files/proxy?url=.../rubric.docx`
  - *Assertions*:
    - All 3 proxy requests succeed with `200 OK`.
    - Outbound fetch called 3 times, each with server `token=...` injected.
    - Full response string search confirms that the secret `MOODLE_TOKEN` was not leaked in any client response.
- **`T4-SCEN-04` Upstream Moodle Outage Survivability (Zero-Moodle-Touch Guarantee)**
  - *Story*: The university Moodle server (`catedig.itlalaguna.edu.mx`) suffers an unplanned outage (HTTP 503 / connection drop).
  - *Execution Steps*:
    1. Upstream fetch mock is set to throw `new Error('Moodle server unreachable - Connection Refused')`.
    2. Student uses the PWA: calls `GET /api/dashboard`, `GET /api/courses/101/contents`, `GET /api/courses/101/grades`, `GET /api/health`.
    3. Student attempts to download a new uncached file: `GET /api/files/proxy?url=...`.
  - *Assertions*:
    - All 4 read endpoints (`dashboard`, `contents`, `grades`, `health`) return `200 OK` without error, serving cached data from D1.
    - None of the read endpoints attempt to fetch upstream Moodle.
    - The file proxy fails gracefully with `502 Bad Gateway` (`UPSTREAM_ERROR`) without leaking secrets or crashing the Worker.
- **`T4-SCEN-05` Malicious Attacker SSRF Penetration Attack**
  - *Story*: A malicious actor attempts various SSRF vectors through the file proxy to probe internal networks, read Cloudflare credentials, and access server administrative interfaces.
  - *Execution Steps*:
    - Attack 1: AWS/Cloud metadata exfiltration -> `?url=https://169.254.169.254/latest/meta-data/`
    - Attack 2: Localhost service probing -> `?url=https://127.0.0.1:8787/api/health`
    - Attack 3: Domain suffix bypass -> `?url=https://catedig.itlalaguna.edu.mx.attacker.com/webservice/pluginfile.php`
    - Attack 4: Userinfo authentication trick -> `?url=https://admin:pass@catedig.itlalaguna.edu.mx/webservice/pluginfile.php`
    - Attack 5: Administrative path traversal -> `?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../admin/settings.php`
    - Attack 6: Injected client token override -> `?url=https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1/doc.pdf?token=attacker_token`
  - *Assertions*:
    - Attacks 1–5 are blocked with `400 Bad Request` or `403 Forbidden`; zero outbound fetch calls initiated.
    - Attack 6 strips the attacker's client token, injects the authorized server token, and streams only the allowed file.
    - Zero token leakage.
- **`T4-SCEN-06` Background Sync Recovery & Self-Healing Health Lifecycle**
  - *Story*: The system recovers from a series of transient network failures, and the health status automatically transitions from circuit breaker back to operational.
  - *Execution Steps*:
    1. System is in tripped state: `consecutive_failures = 3`, `circuit_open_until = now + 600`.
    2. `GET /api/health` returns `status: 'circuit_open'`.
    3. Next scheduled sync run succeeds: writes `sync_runs` record with `status = 'ok'`, resets `consecutive_failures = 0`, resets `circuit_open_until = 0`, updates `last_success_at = now`.
    4. Next call to `GET /api/health` immediately reports `status: 'ok'`, `failure_rate` drops, and recent runs list is updated.
  - *Assertions*:
    - Dynamic state reflection without manual intervention.
    - Read endpoints remained fully accessible during the entire recovery cycle.

---

### 4.6 Proposed Specification & Structure for `TEST_INFRA.md`

`TEST_INFRA.md` will be placed at the project root (`c:\Users\corte\Downloads\betterMoodle\TEST_INFRA.md`) to define the test architecture, execution models, and fixture standards:

```markdown
# Test Infrastructure Specification: Phase 3 BFF Read API & Secure Proxy

## 1. Test Architecture & Philosophy
- **Opaque-Box Testing**: The Hono application (`app.request()`) is treated as an external HTTP service. Tests verify HTTP status codes, headers, and response payloads against shared Zod schemas.
- **Zero-Moodle-Touch Invariant (RNF-02)**: All read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`) query Cloudflare D1 exclusively. Global `fetch()` spy asserts 0 outbound network requests.
- **Strict SSRF & Token Defense (RF-04, RNF-01)**: The file proxy (`/api/files/proxy`) enforces strict hostname (`catedig.itlalaguna.edu.mx`) and path prefix (`/webservice/pluginfile.php`) validation, injects `MOODLE_TOKEN` server-side, uses `redirect: 'manual'`, and verifies 0 token leakage in responses.

## 2. Directory & File Organization
```
apps/worker/
├── test/
│   ├── fixtures/
│   │   ├── d1.ts                 # In-memory SQLite D1 simulator matching Cloudflare D1Database API
│   │   ├── env.ts                # Test environment bindings factory (DB, MOODLE_TOKEN)
│   │   └── mock-fetch.ts         # Outbound fetch interceptor & call assertion spy
│   ├── e2e/
│   │   ├── tier1-feature-coverage.test.ts  # Tier 1: 30 Happy path feature tests
│   │   ├── tier2-boundary-cases.test.ts    # Tier 2: 30 Corner, boundary & SSRF attack tests
│   │   ├── tier3-cross-feature.test.ts     # Tier 3: 6 Multi-endpoint consistency tests
│   │   └── tier4-real-world.test.ts        # Tier 4: 6 End-to-end student scenarios
│   └── e2e.test.ts                         # Master runner executing all 72 tests
```

## 3. Test Runner & Execution Commands
- **Runner**: `bun test`
- **Execution Commands**:
  - Run full test suite: `bun test` in `apps/worker`
  - Run E2E suites specifically: `bun test apps/worker/test/e2e/`
  - Run specific tier: `bun test apps/worker/test/e2e/tier1-feature-coverage.test.ts`
- **Pass Criteria**:
  - Exit code 0
  - 0 test failures
  - 0 outbound fetch calls on any read endpoint
  - 0 token leaks on proxy endpoint
```

---

### 4.7 Proposed Specification & Structure for `TEST_READY.md`

`TEST_READY.md` will be placed at the project root (`c:\Users\corte\Downloads\betterMoodle\TEST_READY.md`) as the formal sign-off artifact signaling that the test catalog is ready for implementation:

```markdown
# Test Readiness Sign-off: Phase 3 BFF Read API & Secure Proxy

## 1. Status Declaration
- **Target Phase**: Phase 3 (BFF Read API & Secure Resource Proxy)
- **Gate Status**: ✅ READY FOR IMPLEMENTATION
- **Baseline Requirements**: `ORIGINAL_REQUEST.md` (§R1–§R4), `PROJECT.md`, `fase-3.md`
- **Test Catalog Total**: 72 fully specified test cases across Tiers 1–4

## 2. Test Catalog Summary Matrix
| Endpoint / Feature | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feat) | Tier 4 (Real-World) | Total Tests |
|--------------------|-------------------|-------------------|---------------------|---------------------|-------------|
| `GET /api/dashboard` | 6 | 6 | — | — | 12 |
| `GET /api/courses/:id/contents` | 6 | 6 | — | — | 12 |
| `GET /api/courses/:id/grades` | 6 | 6 | — | — | 12 |
| `GET /api/health` | 6 | 6 | — | — | 12 |
| `GET /api/files/proxy` | 6 | 6 | — | — | 12 |
| Cross-Feature Combinations | — | — | 6 | — | 6 |
| Real-World Student Scenarios | — | — | — | 6 | 6 |
| **Total Test Count** | **30** | **30** | **6** | **6** | **72** |

## 3. Traceability to Requirements
- **R1 Consolidated Read Endpoints**: Covered by T1-DASH, T1-CONT, T1-GRAD, T1-HLTH, T2-DASH, T2-CONT, T2-GRAD, T2-HLTH, T3-XFEAT-01, T3-XFEAT-03, T4-SCEN-01, T4-SCEN-02, T4-SCEN-04.
- **R2 Secure Resource Proxy**: Covered by T1-PROX, T2-PROX, T3-XFEAT-02, T4-SCEN-03, T4-SCEN-05.
- **R3 Shared Schemas & Documentation**: Validated by schema matching in all 72 tests.
- **R4 Test Suite & Mutation Testing**: Full suite runnable via `bun test`; sets benchmark for killing 12 induced mutants in `scripts/mutation-test.ts`.

## 4. Implementation Guidelines for Development Track
1. Execute `bun test` in `apps/worker` to observe test failures (Red).
2. Implement route handlers in `apps/worker/src/routes/` to satisfy schemas and allowlist rules.
3. Verify all 72 tests pass with 0 failures (Green).
4. Run mutation testing (`bun run ./scripts/mutation-test.ts`) to confirm mutant kill rate of 100%.
```

---

## 5. Verification Method

To independently verify the test design, specifications, and underlying repository state:

1. **Verify Existing Tests and Baseline**:
   ```powershell
   bun test apps/worker/src/sync/phase2.test.ts
   ```
   *Expected Result*: 4 passed, 0 failed.

2. **Verify Monorepo TypeScript Consistency**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected Result*: Exits with code 0.

3. **Verify Web App Build**:
   ```powershell
   bun run build:web
   ```
   *Expected Result*: Build completes with exit code 0.

4. **Verify D1 Migrations Integrity**:
   Inspect `apps/worker/migrations/0001_initial_schema.sql` and `0002_phase2_sync_metadata.sql` to verify table structures (`courses`, `synced_items`, `sync_state`, `sync_runs`) referenced by the test setups.
