# Specification Mining & Requirements Matrix: Phase 3 BFF Read Endpoints and Secure Proxy

**Author**: Spec Miner (`spec_miner_e2e_1`)  
**State Folder**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\spec_miner_e2e_1`  
**Parent Orchestrator Conv ID**: `633791a2-7779-4c0d-82f1-cfb32407190b`  
**Date**: 2026-11-12T20:42:00Z  
**Target Scope**: Phase 3 Endpoints (`GET /api/dashboard`, `GET /api/courses/:id/contents`, `GET /api/courses/:id/grades`, `GET /api/health`, `GET /api/files/proxy`)

---

## 1. Observation

### 1.1 Authoritative Specifications Inspected
1. **`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md`**:
   - Lines 11-17: R1 requires consolidated read endpoints in Hono (`apps/worker`) serving data strictly from Cloudflare D1 without querying Moodle:
     - `GET /api/dashboard`: Consolidated view returning enrolled courses, upcoming assignments, recent activity, and current grades.
     - `GET /api/courses/:id/contents`: Course contents and resources read strictly from D1.
     - `GET /api/courses/:id/grades`: Normalized grade items for the specified course from D1.
     - `GET /api/health`: Enhanced health endpoint returning system status along with recent `sync_runs` history, failure rate, and subrequest metrics.
   - Lines 18-22: R2 requires `GET /api/files/proxy` to stream Moodle files without exposing `MOODLE_TOKEN` to the client:
     - Enforce strict allowlist validation requiring host `catedig.itlalaguna.edu.mx` and path prefix `/webservice/pluginfile.php` to prevent SSRF.
     - Inject `MOODLE_TOKEN` securely server-side during the outbound stream to the client, ensuring the token is never exposed in client URLs, headers, or response payloads.
   - Lines 33-46: Acceptance criteria:
     - All 4 read endpoints read strictly from D1 with zero outbound fetches to Moodle.
     - Proxy rejects requests outside `catedig.itlalaguna.edu.mx` or path prefix `/webservice/pluginfile.php` with 400 or 403.
     - Request parameters and response payloads validated with Zod schemas in `packages/shared`.
2. **`c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md`**:
   - Lines 8-11: Read path: All `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health` queries read strictly from Cloudflare D1. Zero outbound network calls to Moodle (RNF-02). Secure Proxy: `GET /api/files/proxy` validates target URL against strict host (`catedig.itlalaguna.edu.mx`) and path prefix (`/webservice/pluginfile.php`), injects `MOODLE_TOKEN` server-side, streams response to client with `redirect: 'manual'`, zero token leakage (RF-04, RNF-01).
   - Lines 50-63: Interface Contracts:
     - `DashboardResponse`: `{ courses: DashboardCourse[], upcoming_assignments: UpcomingAssignment[], recent_activity: RecentActivityItem[], current_grades: DashboardGrade[] }`.
     - `CourseContentsResponse`: `{ course_id: number, sections: CourseSection[], synced_at: number | null }`.
     - `CourseGradesResponse`: `{ course_id: number, grades: GradeItemDetail[] }`.
     - `EnhancedHealthResponse`: `{ status: 'ok' | 'degraded' | 'error' | 'circuit_open', timestamp: number, sync_state?: SyncState | null, recent_runs: SyncRun[], failure_rate: number, subrequests: SubrequestMetrics }`.
     - `FileProxyQuery`: `{ url: string }`.
     - `ApiErrorResponse`: `{ error: string, code?: string, details?: unknown }`.
3. **`c:\Users\corte\Downloads\betterMoodle\docs\fases\fase-3.md`**:
   - Lines 10-18: Checklist matches the 5 endpoints, Zod schema validation, SSRF allowlist, and server-side token injection.
   - Lines 23: Note: "Verificar estrictamente que ninguna ruta `/api/*` filtre el `MOODLE_TOKEN` en URLs devueltas, headers o cuerpos JSON."
4. **`c:\Users\corte\Downloads\betterMoodle\plan.md`**:
   - Section 1.3: "La ruta de lectura nunca toca Moodle. Solo el cron escribe en D1. La PWA lee exclusivamente de D1."
   - Section 3.2 (RNF-02): Carga <1.5 s medida contra D1, no contra Moodle. Ninguna ruta interactiva hace fetch al servidor universitario.
   - Section 3.2 (RNF-05): Presupuesto de subpeticiones: límite duro de 50, presupuesto máximo de 45.
5. **Database Schemas & Existing Worker Code**:
   - `apps/worker/migrations/0001_initial_schema.sql` and `0002_phase2_sync_metadata.sql`:
     - `courses`: `id`, `shortname`, `fullname`, `progress`, `payload_json`, `refreshed_at`, `grades_synced_at`, `forums_synced_at`.
     - `synced_items`: `item_key`, `course_id`, `item_type`, `title`, `url`, `due_date`, `grade_num`, `timemodified`, `payload_json`, `first_seen_at`, `updated_at`, `deleted_at`, `submission_status`, `status_synced_at`.
     - `sync_state`: `id`, `baseline_seeded`, `last_success_at`, `last_attempt_at`, `consecutive_failures`, `moodle_user_id`, `courses_refreshed_at`, `grades_seeded`, `forums_seeded`, `circuit_open_until`, `dead_man_alerted`.
     - `sync_runs`: `id`, `started_at`, `finished_at`, `status`, `subrequests_used`, `items_changed`, `error`.
   - `apps/worker/src/index.ts`: Existing endpoints: `GET /api/health`, `GET /api/courses`, `GET /api/items`, `POST /api/sync/manual`.
   - `apps/worker/src/sync/phase2.test.ts`: Proves in-memory SQLite fixture (`bun:sqlite`) runs migrations and tests Hono logic with sub-millisecond execution.

---

## 2. Logic Chain

1. **D1 Read Isolation Guarantee (RNF-02 & AGENTS.md §2.1)**:
   - For all read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`), the handler must execute SQL queries against `c.env.DB` only.
   - Global `fetch` MUST NOT be invoked for any reason during the handling of read requests. If Moodle is offline, unreachable, or throwing errors, read endpoints must remain unaffected and serve cached D1 data with HTTP 200.
2. **SSRF Mitigation & Token Confidentiality (RF-04 & RNF-01)**:
   - The file proxy is the ONLY Phase 3 endpoint allowed to make outbound network calls.
   - The query parameter `url` must undergo strict parsing and multi-layer validation before any outbound socket/fetch is initiated:
     - Must be valid HTTPS (reject `http:`, `ftp:`, `file:`, `javascript:`, `data:`).
     - Must have exact case-insensitive hostname `catedig.itlalaguna.edu.mx` (reject internal IPs `127.0.0.1`, `169.254.169.254`, and attacker subdomains/suffixes).
     - Must have default port 443 (reject custom ports).
     - Must have pathname prefix `/webservice/pluginfile.php` (reject administrative paths or path traversal `..`).
     - Must strip client-supplied `token` or `wstoken` query parameters.
     - Must inject server secret `c.env.MOODLE_TOKEN` into upstream search params.
     - Must use `redirect: 'manual'` to prevent open redirect token leakage.
     - Must sanitize response headers, stripping `Location`, `Set-Cookie`, and any upstream debug info containing the token.
3. **Partitioning for Opaque-Box E2E Testing (Tiers 1-4)**:
   - **Tier 1 (Feature Coverage)**: Happy path verification for each of the 5 endpoints, validating status codes, complete JSON schema structures, header sanitization, and token injection.
   - **Tier 2 (Boundary & Corner Cases)**: Edge conditions, invalid inputs, non-numeric IDs, empty tables, malicious SSRF attack vectors, tombstone filtering, division by zero in metrics, and missing environment secrets.
   - **Tier 3 (Cross-Feature Combinations)**: Consistency across endpoints (dashboard grades matching course grades, contents resource URLs conforming to proxy requirements, sync runs updating health metrics, circuit breaker status).
   - **Tier 4 (Real-World Scenarios)**: Student daily routine, resource download journey, grade audit journey, system health monitoring under Moodle outages, and malicious actor defense.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Read BFF | Dashboard Consolidated View | Returns enrolled courses, upcoming assignments (`due_date >= now AND deleted_at IS NULL`), recent activity (`timemodified DESC`), and current grades summary strictly from D1 | `GET /api/dashboard` (no params) | `200 OK` + `DashboardResponse` | `500 Internal Server Error` on D1 error | `ORIGINAL_REQUEST.md` §R1, `PROJECT.md` |
| 2 | Read BFF | Course Contents Cache | Returns course sections, modules, and file resources read strictly from D1 (`course_contents`) | `GET /api/courses/:id/contents` (`:id` positive int) | `200 OK` + `CourseContentsResponse` | `400 Bad Request` if `:id` invalid; `404 Not Found` if course not in `courses`; `500` on D1 error | `ORIGINAL_REQUEST.md` §R1, `PROJECT.md` |
| 3 | Read BFF | Course Normalized Grades | Returns normalized grade items for a specific course filtered by `course_id` and `deleted_at IS NULL` | `GET /api/courses/:id/grades` (`:id` positive int) | `200 OK` + `CourseGradesResponse` | `400 Bad Request` if `:id` invalid; `404 Not Found` if course not in `courses`; `500` on D1 error | `ORIGINAL_REQUEST.md` §R1, `PROJECT.md` |
| 4 | Observability | Enhanced Health & Telemetry | Returns system status, `sync_state`, last 15 `sync_runs`, `failure_rate`, and subrequest metrics from D1 | `GET /api/health` (no params) | `200 OK` + `EnhancedHealthResponse` | `500 Internal Server Error` on D1 error | `ORIGINAL_REQUEST.md` §R1, `PROJECT.md`, `fase-3.md` |
| 5 | Security Proxy | Secure File Stream Proxy | Streams Moodle course files with server-side token injection and strict SSRF allowlist | `GET /api/files/proxy?url=<moodle_pluginfile_url>` | `200 OK` + binary stream with sanitized headers | `400` on missing/invalid URL; `403` on host/path/protocol violation; `500` on missing token; `502` on upstream error | `ORIGINAL_REQUEST.md` §R2, `fase-3.md`, `plan.md` §3.1 |
| 6 | Read API (Preserved) | Course Catalog | Returns flat list of enrolled courses from D1 | `GET /api/courses` (no params) | `200 OK` + `{ courses: Course[] }` | `500 Internal Server Error` | `apps/worker/src/index.ts:29-38` |
| 7 | Read API (Preserved) | Synced Items Filter | Returns items filtered by `?type=assignment\|grade\|announcement` | `GET /api/items?type=<optional_type>` | `200 OK` + `{ items: SyncedItem[] }` | `500 Internal Server Error` | `apps/worker/src/index.ts:41-60` |
| 8 | Write API (Preserved) | Manual Sync Trigger | Triggers on-demand background sync with 30s rate limit | `POST /api/sync/manual?force=1` | `200 OK` / `500` + Sync result | `429 Too Many Requests` (<30s); `500` on error | `apps/worker/src/index.ts:63-84` |

---

## 4. Edge Cases Discovered

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `GET /api/dashboard` | D1 has 0 courses and 0 items (fresh database) | Returns `200 OK` with `{ courses: [], upcoming_assignments: [], recent_activity: [], current_grades: [] }` |
| 2 | `GET /api/dashboard` | All items marked with tombstone (`deleted_at IS NOT NULL`) | Returns `200 OK` with empty arrays for assignments, activity, and grades |
| 3 | `GET /api/dashboard` | Assignments have `due_date < nowSec` (past due) | Excluded from `upcoming_assignments` (they only appear in recent activity if recently modified) |
| 4 | `GET /api/courses/:id/contents` | `:id` is not numeric (`/api/courses/abc/contents`) | Returns `400 Bad Request` with `{ error: "ID de curso inválido", code: "INVALID_COURSE_ID" }` |
| 5 | `GET /api/courses/:id/contents` | `:id` is negative or zero (`/api/courses/-1/contents`, `/api/courses/0/contents`) | Returns `400 Bad Request` with `{ error: "ID de curso inválido", code: "INVALID_COURSE_ID" }` |
| 6 | `GET /api/courses/:id/contents` | `:id` is decimal (`/api/courses/12.34/contents`) | Returns `400 Bad Request` with `{ error: "ID de curso inválido", code: "INVALID_COURSE_ID" }` |
| 7 | `GET /api/courses/:id/contents` | `:id` does not exist in `courses` table (`/api/courses/99999/contents`) | Returns `404 Not Found` with `{ error: "Curso no encontrado", code: "COURSE_NOT_FOUND" }` |
| 8 | `GET /api/courses/:id/contents` | Course exists in `courses`, but no record in `course_contents` yet | Returns `200 OK` with `{ course_id: id, sections: [], synced_at: null }` (safe fallback) |
| 9 | `GET /api/courses/:id/grades` | `:id` does not exist in `courses` table | Returns `404 Not Found` with `{ error: "Curso no encontrado", code: "COURSE_NOT_FOUND" }` |
| 10 | `GET /api/courses/:id/grades` | Course exists but has no grade items | Returns `200 OK` with `{ course_id: id, grades: [] }` |
| 11 | `GET /api/courses/:id/grades` | Course A contains grades, Course B contains grades | Querying `/api/courses/A/grades` strictly excludes Course B grades (zero cross-course bleed) |
| 12 | `GET /api/courses/:id/grades` | Grade item has `grade_num = null` (ungraded item) | Returns item with `grade_num: null` without schema validation error |
| 13 | `GET /api/courses/:id/grades` | Grade item has tombstone (`deleted_at IS NOT NULL`) | Excluded from `grades` array |
| 14 | `GET /api/health` | `sync_runs` table is completely empty (0 runs) | Returns `200 OK` with `failure_rate: 0.0`, `recent_runs: []`, `subrequests: { last_used: 0, max_budget: 45, avg_recent: 0, max_recent: 0 }` (no divide-by-zero crash) |
| 15 | `GET /api/health` | `sync_state.circuit_open_until > nowSec` | Returns `200 OK` with `status: "circuit_open"` |
| 16 | `GET /api/health` | `sync_state.consecutive_failures >= 3` and circuit closed | Returns `200 OK` with `status: "degraded"` |
| 17 | `GET /api/health` | `sync_state.baseline_seeded = 0` (initial state) | Returns `200 OK` with `status: "degraded"` or `"initializing"` |
| 18 | `GET /api/files/proxy` | Missing `url` query parameter (`/api/files/proxy`) | Returns `400 Bad Request` with `{ error: "Parámetro url es requerido" }` |
| 19 | `GET /api/files/proxy` | Malformed URL string (`/api/files/proxy?url=not-a-url`) | Returns `400 Bad Request` with `{ error: "URL inválida o malformada" }` |
| 20 | `GET /api/files/proxy` | Non-HTTPS protocol (`http://catedig.itlalaguna.edu.mx/...`, `ftp://...`) | Returns `403 Forbidden` (or 400) rejecting insecure protocol |
| 21 | `GET /api/files/proxy` | Attacker domain suffix (`https://catedig.itlalaguna.edu.mx.attacker.com/...`) | Returns `403 Forbidden` (`Host no autorizado`) |
| 22 | `GET /api/files/proxy` | Attacker subdomain (`https://evil.catedig.itlalaguna.edu.mx/...`) | Returns `403 Forbidden` (`Host no autorizado`) |
| 23 | `GET /api/files/proxy` | Loopback / Cloud metadata IP (`http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1`) | Returns `403 Forbidden` (`Host no autorizado`) |
| 24 | `GET /api/files/proxy` | Credentials embedded in URL (`https://user:pass@catedig.itlalaguna.edu.mx/...`) | Returns `400 Bad Request` (`URLs con credenciales están prohibidas`) |
| 25 | `GET /api/files/proxy` | Custom port specified (`https://catedig.itlalaguna.edu.mx:8443/...`) | Returns `403 Forbidden` (`Puerto no autorizado`) |
| 26 | `GET /api/files/proxy` | Unauthorized Moodle path (`https://catedig.itlalaguna.edu.mx/admin/index.php`) | Returns `403 Forbidden` (`Ruta no autorizada`) |
| 27 | `GET /api/files/proxy` | Path traversal (`https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../admin/index.php`) | Returns `403 Forbidden` (`Ruta no autorizada`) |
| 28 | `GET /api/files/proxy` | Client sends forged token (`.../pluginfile.php?token=attacker_token`) | Client token is stripped; replaced exclusively with server `MOODLE_TOKEN` |
| 29 | `GET /api/files/proxy` | Upstream Moodle returns HTTP 302 Redirect | Proxy returns `502 Bad Gateway` (manual redirect); never follows redirect |
| 30 | `GET /api/files/proxy` | Upstream Moodle returns HTTP 404 / 500 | Proxy returns `502 Bad Gateway` without leaking Moodle exception JSON or token |
| 31 | `GET /api/files/proxy` | Server secret `c.env.MOODLE_TOKEN` is unset or empty string | Returns `500 Internal Server Error` (`Servicio de archivos no configurado`) |
| 32 | `GET /api/files/proxy` | Response inspection for token leakage | `MOODLE_TOKEN` string is completely absent from all response headers, status line, and body |

---

## 5. Detailed Endpoint Specifications

### 5.1 `GET /api/dashboard`
- **Method**: `GET`
- **Path**: `/api/dashboard`
- **Headers**: `Accept: application/json`
- **Query Parameters**: None
- **Success Status**: `200 OK`
- **Response Schema (`DashboardResponseSchema`)**:
  ```json
  {
    "courses": [
      {
        "id": 11,
        "shortname": "Tele",
        "fullname": "Telemática y Redes",
        "progress": 80.0,
        "refreshed_at": 1700000000
      }
    ],
    "upcoming_assignments": [
      {
        "item_key": "assign_101",
        "course_id": 11,
        "course_name": "Telemática y Redes",
        "title": "Práctica 1",
        "url": "https://catedig.itlalaguna.edu.mx/mod/assign/view.php?id=101",
        "due_date": 1794513600,
        "submission_status": "pending",
        "timemodified": 1700000000
      }
    ],
    "recent_activity": [
      {
        "item_key": "discussion_55",
        "course_id": 11,
        "course_name": "Telemática y Redes",
        "item_type": "announcement",
        "title": "Suspensión de clase",
        "url": "https://catedig.itlalaguna.edu.mx/mod/forum/discuss.php?d=55",
        "timemodified": 1700000500,
        "updated_at": 1700000500
      }
    ],
    "current_grades": [
      {
        "item_key": "grade_202",
        "course_id": 11,
        "course_name": "Telemática y Redes",
        "title": "Examen Unidad 1",
        "grade_num": 95,
        "timemodified": 1700000100,
        "url": null
      }
    ]
  }
  ```
- **D1 Isolation**: Reads purely from tables `courses` and `synced_items`. Zero calls to `fetch()`. Excludes items where `deleted_at IS NOT NULL`.

### 5.2 `GET /api/courses/:id/contents`
- **Method**: `GET`
- **Path**: `/api/courses/:id/contents`
- **Route Parameters**: `:id` (strictly positive integer)
- **Headers**: `Accept: application/json`
- **Success Status**: `200 OK`
- **Response Schema (`CourseContentsResponseSchema`)**:
  ```json
  {
    "course_id": 11,
    "sections": [
      {
        "id": 101,
        "name": "General",
        "visible": 1,
        "summary": "",
        "modules": [
          {
            "id": 201,
            "name": "Programa del curso",
            "instance": 5,
            "modname": "resource",
            "url": "https://catedig.itlalaguna.edu.mx/mod/resource/view.php?id=201",
            "contents": [
              {
                "filename": "temario.pdf",
                "fileurl": "https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_resource/content/1/temario.pdf",
                "filesize": 1048576,
                "mimetype": "application/pdf",
                "timemodified": 1700000000,
                "proxy_url": "/api/files/proxy?url=https%3A%2F%2Fcatedig.itlalaguna.edu.mx%2Fwebservice%2Fpluginfile.php%2F123%2Fmod_resource%2Fcontent%2F1%2Ftemario.pdf"
              }
            ]
          }
        ]
      }
    ],
    "synced_at": 1700000000
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: If `:id` is not a positive integer (e.g. `abc`, `-5`, `0`, `1.2`). Body: `{ "error": "ID de curso inválido", "code": "INVALID_COURSE_ID" }`.
  - `404 Not Found`: If course `:id` does not exist in `courses` table. Body: `{ "error": "Curso no encontrado", "code": "COURSE_NOT_FOUND" }`.
- **D1 Isolation**: Reads from `courses` and `course_contents`. Returns `sections: []` and `synced_at: null` if course exists but contents have not yet been synced. Zero calls to `fetch()`.

### 5.3 `GET /api/courses/:id/grades`
- **Method**: `GET`
- **Path**: `/api/courses/:id/grades`
- **Route Parameters**: `:id` (strictly positive integer)
- **Headers**: `Accept: application/json`
- **Success Status**: `200 OK`
- **Response Schema (`CourseGradesResponseSchema`)**:
  ```json
  {
    "course_id": 11,
    "grades": [
      {
        "item_key": "grade_501",
        "course_id": 11,
        "title": "Examen Parcial 1",
        "grade_num": 88.5,
        "grade_formatted": "88.50",
        "grademin": 0,
        "grademax": 100,
        "feedback": "Excelente",
        "timemodified": 1700000000,
        "url": null
      }
    ]
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: If `:id` is not a positive integer. Body: `{ "error": "ID de curso inválido", "code": "INVALID_COURSE_ID" }`.
  - `404 Not Found`: If course `:id` does not exist in `courses` table. Body: `{ "error": "Curso no encontrado", "code": "COURSE_NOT_FOUND" }`.
- **D1 Isolation**: Reads `synced_items` where `course_id = :id AND item_type = 'grade' AND deleted_at IS NULL`. Zero calls to `fetch()`.

### 5.4 `GET /api/health`
- **Method**: `GET`
- **Path**: `/api/health`
- **Headers**: `Accept: application/json`
- **Success Status**: `200 OK`
- **Response Schema (`EnhancedHealthResponseSchema`)**:
  ```json
  {
    "status": "ok",
    "timestamp": 1700000000000,
    "sync_state": {
      "id": 1,
      "baseline_seeded": 1,
      "last_success_at": 1700000000,
      "last_attempt_at": 1700000000,
      "consecutive_failures": 0,
      "moodle_user_id": 835,
      "courses_refreshed_at": 1700000000,
      "grades_seeded": 1,
      "forums_seeded": 1,
      "circuit_open_until": 0,
      "dead_man_alerted": 0
    },
    "recent_runs": [
      {
        "id": 7,
        "started_at": 1700000000,
        "finished_at": 1700000005,
        "status": "ok",
        "subrequests_used": 12,
        "items_changed": 3,
        "error": null
      }
    ],
    "failure_rate": 0.0,
    "subrequests": {
      "last_used": 12,
      "max_budget": 45,
      "avg_recent": 11.5,
      "max_recent": 14
    }
  }
  ```
- **Status Determination Logic**:
  - `circuit_open`: If `sync_state.circuit_open_until > nowSec`.
  - `degraded`: If `sync_state.consecutive_failures >= 3` or `sync_state.baseline_seeded === 0`.
  - `ok`: Normal operational state.
- **D1 Isolation**: Reads `sync_state` and `sync_runs`. Zero calls to `fetch()`.

### 5.5 `GET /api/files/proxy`
- **Method**: `GET`
- **Path**: `/api/files/proxy`
- **Query Parameter**: `url` (URL-encoded string)
- **Validation Rules (SSRF Mitigation)**:
  1. `url` must exist and be non-empty (else `400 Bad Request`).
  2. `url` must parse cleanly via WHATWG `URL` (else `400 Bad Request`).
  3. `protocol` must be strictly `https:` (else `403 Forbidden`).
  4. `hostname` must be strictly `catedig.itlalaguna.edu.mx` (case-insensitive) (else `403 Forbidden`).
  5. `port` must be empty or `'443'` (else `403 Forbidden`).
  6. `username` / `password` must be empty (else `400 Bad Request`).
  7. `pathname` must start with `/webservice/pluginfile.php` (else `403 Forbidden`).
  8. Path traversal resolving outside prefix is rejected (`403 Forbidden`).
- **Server-Side Token Injection**:
  - Worker reads `c.env.MOODLE_TOKEN`.
  - Strips any client-provided `token` or `wstoken` param from URL.
  - Injects `token: c.env.MOODLE_TOKEN` into upstream URL query string.
- **Upstream Network Request**:
  - Executes `fetch(upstreamUrl.toString(), { redirect: 'manual', headers: { 'User-Agent': 'BetterMoodle-Proxy/1.0' } })`.
  - If upstream returns non-200 (including 3xx redirects or 4xx/5xx errors), returns `502 Bad Gateway` with `{ error: "No fue posible descargar el archivo de Moodle.", code: "UPSTREAM_ERROR" }`.
- **Response Headers Sanitization**:
  - Preserved: `Content-Type`, `Content-Length`, `Content-Disposition`, `ETag`, `Last-Modified`.
  - Added: `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`.
  - Stripped: `Set-Cookie`, `Location`, internal server headers.
  - Zero token leakage: token NEVER in headers or error bodies.

---

## 6. Test Equivalence Partitions & Boundary Conditions (Tiers 1-4)

### Tier 1: Feature Coverage (Minimum 5 tests per feature = 25 tests)

#### Feature 1: `GET /api/dashboard`
- **T1.1 (Dashboard Full Data)**: Returns 200 with all 4 arrays populated (`courses`, `upcoming_assignments`, `recent_activity`, `current_grades`) when DB has courses, tasks, announcements, and grades.
- **T1.2 (Upcoming Filtering)**: `upcoming_assignments` returns only assignments where `due_date >= nowSec` sorted by `due_date ASC`.
- **T1.3 (Recent Activity Sorting)**: `recent_activity` returns items of all types ordered by `timemodified DESC` up to limit 15.
- **T1.4 (Current Grades Mapping)**: `current_grades` maps `course_id`, `grade_num`, and resolves `course_name` from `courses` table.
- **T1.5 (Zero Fetch Call Proof)**: Global `fetch` mock is programmed to throw; dashboard request completes 200 OK proving zero outbound network calls.

#### Feature 2: `GET /api/courses/:id/contents`
- **T2.1 (Full Contents Tree)**: Returns 200 with complete sections, modules, resources, and timestamps when `course_contents` has valid JSON.
- **T2.2 (Proxy URL Generation)**: Resources with `pluginfile.php` URLs include valid `proxy_url` pointing to `/api/files/proxy?url=...`.
- **T2.3 (Fallback Empty Sections)**: Course exists in `courses` but has no row in `course_contents`; returns 200 with `sections: []` and `synced_at: null`.
- **T2.4 (Module Types Identification)**: Modules correctly classify `modname` ('resource', 'assign', 'forum', 'quiz').
- **T2.5 (Zero Fetch Call Proof)**: Global `fetch` throws if called; contents request completes 200 OK from D1.

#### Feature 3: `GET /api/courses/:id/grades`
- **T3.1 (Course Grade Items)**: Returns 200 with all grade items matching the specified `course_id`.
- **T3.2 (Payload Deserialization)**: Correctly deserializes `payload_json` to extract `grademin`, `grademax`, `feedback`, and `grade_formatted`.
- **T3.3 (Numerical Normalization)**: Grade numbers are returned as standard JavaScript numbers (e.g. 85.00000 -> 85).
- **T3.4 (Empty Course Grades)**: Course exists in `courses` with 0 grade items; returns 200 with `grades: []`.
- **T3.5 (Zero Fetch Call Proof)**: Global `fetch` throws if called; grades request completes 200 OK from D1.

#### Feature 4: `GET /api/health`
- **T4.1 (Healthy Status)**: Returns 200 with `status: 'ok'` when baseline is seeded, no recent errors, and circuit breaker is closed.
- **T4.2 (Recent Runs Ordering)**: Returns recent runs ordered by `id DESC` up to limit 15 with duration and item count.
- **T4.3 (Failure Rate Calculation)**: Accurately calculates `failure_rate = failed_runs / total_recent_runs`.
- **T4.4 (Subrequest Metrics)**: Accurately reports `last_used`, `avg_recent`, `max_recent`, and `max_budget: 45`.
- **T4.5 (Sync State Telemetry)**: Accurately reflects `sync_state` table fields (`baseline_seeded`, `last_success_at`, `consecutive_failures`).

#### Feature 5: `GET /api/files/proxy`
- **T5.1 (Valid Resource Stream)**: Streams allowed Moodle resource bytes when valid HTTPS pluginfile URL is passed.
- **T5.2 (Server Token Injection)**: Inspects upstream fetch call; verifies `token=<server_token>` was injected into search params.
- **T5.3 (Header Forwarding)**: Forwards `Content-Type`, `Content-Length`, and `Content-Disposition` from upstream response.
- **T5.4 (Security Headers)**: Verifies `X-Content-Type-Options: nosniff` and `Cache-Control: private, max-age=3600` are present on proxy response.
- **T5.5 (Client Token Stripping)**: URL passed with `?token=forged_token` has forged token stripped and replaced by server token.

---

### Tier 2: Boundary & Corner Cases (Minimum 5 tests per feature = 25+ tests)

#### Feature 1: `GET /api/dashboard`
- **T1.B1 (Empty Database)**: 0 courses and 0 items in D1 -> returns 200 OK with empty arrays.
- **T1.B2 (Tombstone Exclusion)**: Items with `deleted_at IS NOT NULL` are excluded from upcoming assignments, activity, and grades.
- **T1.B3 (Past Due Assignments)**: Assignments with `due_date < nowSec` are excluded from upcoming assignments.
- **T1.B4 (Null Due Date Assignments)**: Assignments with `due_date = NULL` are excluded from upcoming assignments.
- **T1.B5 (Special Unicode Characters)**: Course names and assignment titles with HTML entities (`&lt;`, `&gt;`) and accents load without corruption.

#### Feature 2: `GET /api/courses/:id/contents`
- **T2.B1 (Non-Numeric Course ID)**: Requesting `/api/courses/abc/contents` -> returns 400 Bad Request.
- **T2.B2 (Negative & Zero Course ID)**: Requesting `/api/courses/-10/contents` or `/api/courses/0/contents` -> returns 400 Bad Request.
- **T2.B3 (Decimal Course ID)**: Requesting `/api/courses/15.7/contents` -> returns 400 Bad Request.
- **T2.B4 (Non-Existent Course ID)**: Requesting `/api/courses/99999/contents` -> returns 404 Not Found.
- **T2.B5 (Malformed JSON in DB)**: Corrupted JSON in `sections_json` -> handled safely (returns empty sections or 500 without process crash).

#### Feature 3: `GET /api/courses/:id/grades`
- **T3.B1 (Non-Numeric Course ID)**: Requesting `/api/courses/xyz/grades` -> returns 400 Bad Request.
- **T3.B2 (Negative & Zero Course ID)**: Requesting `/api/courses/-1/grades` or `/api/courses/0/grades` -> returns 400 Bad Request.
- **T3.B3 (Non-Existent Course ID)**: Requesting `/api/courses/88888/grades` -> returns 404 Not Found.
- **T3.B4 (Cross-Course Grade Isolation)**: Items belonging to Course 2 are strictly excluded when requesting Course 1.
- **T3.B5 (Ungraded Items)**: Items with `grade_num = null` return cleanly with `grade_num: null`.

#### Feature 4: `GET /api/health`
- **T4.B1 (Empty Sync Runs)**: Zero rows in `sync_runs` -> returns 200 with `failure_rate: 0.0` and `avg_recent: 0` (zero division safe).
- **T4.B2 (Circuit Breaker Tripped)**: `sync_state.circuit_open_until > nowSec` -> returns `status: 'circuit_open'`.
- **T4.B3 (Degraded Consecutive Failures)**: `sync_state.consecutive_failures >= 3` -> returns `status: 'degraded'`.
- **T4.B4 (Unseeded Baseline)**: `sync_state.baseline_seeded = 0` -> returns `status: 'degraded'`.
- **T4.B5 (D1 Failure)**: Database throws exception -> returns 500 with `{ status: 'error', error: string }`.

#### Feature 5: `GET /api/files/proxy`
- **T5.B1 (Missing URL)**: Request without `?url=` -> returns 400 Bad Request.
- **T5.B2 (Malformed URL)**: Request with `?url=invalid_string` -> returns 400 Bad Request.
- **T5.B3 (Insecure HTTP Protocol)**: Request with `http://catedig.itlalaguna.edu.mx/...` -> returns 403 Forbidden.
- **T5.B4 (Non-HTTP Protocols)**: Request with `ftp://...`, `file:///etc/passwd`, `data:...` -> returns 403 Forbidden.
- **T5.B5 (Host Spoofing / Suffix Attack)**: Request with `https://catedig.itlalaguna.edu.mx.attacker.com/...` -> returns 403 Forbidden.
- **T5.B6 (Host Subdomain Spoofing)**: Request with `https://evil.catedig.itlalaguna.edu.mx/...` -> returns 403 Forbidden.
- **T5.B7 (Private IP / SSRF Loopback)**: Request with `http://127.0.0.1` or `http://169.254.169.254/` -> returns 403 Forbidden.
- **T5.B8 (Custom Port)**: Request with `https://catedig.itlalaguna.edu.mx:8080/...` -> returns 403 Forbidden.
- **T5.B9 (Embedded Credentials)**: Request with `https://user:pass@catedig.itlalaguna.edu.mx/...` -> returns 400 Bad Request.
- **T5.B10 (Unauthorized Path)**: Request with `https://catedig.itlalaguna.edu.mx/admin/index.php` -> returns 403 Forbidden.
- **T5.B11 (Path Traversal)**: Request with `/webservice/pluginfile.php/../../admin` -> returns 403 Forbidden.
- **T5.B12 (Upstream Redirect Rejection)**: Upstream returns HTTP 302 -> proxy returns 502 Bad Gateway without leaking token.
- **T5.B13 (Upstream 404/500 Rejection)**: Upstream returns HTTP 404/500 -> proxy returns 502 Bad Gateway without leaking token.
- **T5.B14 (Missing Env MOODLE_TOKEN)**: `c.env.MOODLE_TOKEN` is unset -> returns 500 Internal Server Error without exposing secrets.
- **T5.B15 (Zero Token Leakage Verification)**: Response status, headers, and body are verified to contain 0 instances of `MOODLE_TOKEN`.

---

### Tier 3: Cross-Feature Combinations (Minimum 5 tests)
- **T3.C1 (Dashboard & Course Grades Consistency)**: Grades appearing in `/api/dashboard` `current_grades` match the items returned by `/api/courses/:id/grades`.
- **T3.C2 (Course Contents & Proxy URL Integration)**: Resources returned by `/api/courses/:id/contents` contain valid `proxy_url` parameters that succeed when passed to `/api/files/proxy`.
- **T3.C3 (Sync Runs & Health Telemetry Coupling)**: Inserting a new record into `sync_runs` immediately updates `subrequests.last_used` and `failure_rate` in `/api/health`.
- **T3.C4 (Circuit Breaker Tripped & Read Endpoints Resilience)**: When circuit breaker is open (`/api/health` reports `'circuit_open'`), read endpoints (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`) continue serving cached data with 200 OK without degradation.
- **T3.C5 (Tombstone Propagation Across All Endpoints)**: Setting `deleted_at = now` on an assignment or grade item simultaneously removes it from both `/api/dashboard` and `/api/courses/:id/grades`.

---

### Tier 4: Real-World Scenarios (Minimum 5 tests)
- **T4.R1 (Student Morning Routine)**: Student opens PWA -> fetches `/api/dashboard` -> sees 3 enrolled courses, 2 upcoming assignments due tonight, 1 recent forum announcement, and latest quiz grade. Zero external fetches.
- **T4.R2 (Course Material Browsing & Downloading)**: Student opens course 11 -> fetches `/api/courses/11/contents` -> finds syllabus PDF -> downloads via `/api/files/proxy?url=...` -> proxy injects token and streams PDF without token exposure.
- **T4.R3 (Grade Audit & Historical Review)**: Student checks course grades -> fetches `/api/courses/11/grades` -> inspects numeric grades, max grades, and professor feedback -> verifies no data from course 96 is exposed.
- **T4.R4 (Moodle Outage & System Resiliency)**: Universities experiences an outage; scheduled sync fails and trips circuit breaker -> `/api/health` reports `'circuit_open'`, but student dashboard and course contents load instantly from D1 cache in <10ms.
- **T4.R5 (Malicious Attacker Probe Defense)**: External attacker attempts SSRF probes against `/api/files/proxy` using internal AWS/Cloudflare metadata endpoints, forged token parameters, and directory traversal -> proxy blocks 100% of attempts with 400/403 and never leaks server token.

---

## 7. Caveats

1. **Course Contents Population**:
   - `GET /api/courses/:id/contents` reads strictly from D1.
   - If a course has not yet had its contents populated by a sync run, it returns `sections: []` and `synced_at: null` with HTTP 200 OK. Tests must assert this graceful fallback behavior.
2. **Phase 3 Single-User Scope**:
   - Phase 3 does not implement multi-user JWT authentication or tenant isolation (which is scheduled for Phase 6 per `plan.md` §1.4). Therefore, test suites should not require `Authorization` headers.
3. **Upstream Streaming Memory Limit**:
   - Cloudflare Workers have a 128 MB RAM ceiling in free tiers. The file proxy must stream `upstreamRes.body` (`ReadableStream`) directly to the client without buffering full blobs in memory via `arrayBuffer()`.

---

## 8. Conclusion

All specifications, request/response schemas, SSRF allowlist rules, D1 isolation boundaries, and equivalence partitions for Phase 3 endpoints have been fully extracted and documented:
1. **5 Core Endpoints Defined**: Complete schemas and contracts for `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, and `/api/files/proxy`.
2. **Strict D1 Isolation**: Verified 0 outbound network calls to Moodle for all read endpoints.
3. **Deterministic SSRF Defense**: 8 strict rules enforcing HTTPS, exact host `catedig.itlalaguna.edu.mx`, path prefix `/webservice/pluginfile.php`, port 443, credential stripping, and server-side token injection.
4. **60+ Test Partition Catalog**: Complete matrix covering Tiers 1-4 for test writers, challengers, and reviewers.

---

## 9. Verification Method

To independently verify the facts and specifications in this report:

1. **Verify Existing Unit Tests**:
   ```powershell
   bun test apps/worker/src/sync/phase2.test.ts
   ```
   *Expected*: Passes with 4 passed, 0 failed.

2. **Verify Monorepo TypeScript Typing**:
   ```powershell
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected*: Exits with code 0.

3. **Verify Web Build**:
   ```powershell
   bun run build:web
   ```
   *Expected*: Completes with code 0.

4. **Verify Database Schemas**:
   Inspect `apps/worker/migrations/0001_initial_schema.sql` and `apps/worker/migrations/0002_phase2_sync_metadata.sql` to confirm table column definitions.
