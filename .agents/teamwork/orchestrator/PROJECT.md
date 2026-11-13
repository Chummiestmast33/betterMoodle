# Project: BetterMoodle — Phase 3 (BFF Read API and Secure Proxy)

## Architecture
- **Monorepo Structure**:
  - `packages/shared`: Zod validation schemas and TypeScript types shared across worker and web.
  - `apps/worker`: Cloudflare Worker built on Hono (`Hono<{ Bindings: Env }>`), serving REST API and scheduled cron. Single origin with static assets (`apps/web/dist`).
  - `apps/web`: React PWA consuming BFF endpoints.
- **Data Flow & Boundaries**:
  - Read path: All `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health` queries read strictly from Cloudflare D1. Zero outbound network calls to Moodle (RNF-02).
  - Secure Proxy: `GET /api/files/proxy` validates target URL against strict host (`catedig.itlalaguna.edu.mx`) and path prefix (`/webservice/pluginfile.php`), injects `MOODLE_TOKEN` server-side, streams response to client with `redirect: 'manual'`, zero token leakage (RF-04, RNF-01).
  - Background Sync: Scheduled cron (`*/5 * * * *`) is the sole writer to D1 from Moodle.
- **Code Layout**:
  - `packages/shared/src/index.ts`: Shared entity, request, response, and error schemas.
  - `apps/worker/migrations/0003_phase3_course_contents.sql`: Table for course contents cache.
  - `apps/worker/src/index.ts`: Worker entry point mounting modular routes and scheduled handler.
  - `apps/worker/src/routes/dashboard.ts`: `GET /api/dashboard`.
  - `apps/worker/src/routes/courses.ts`: `GET /api/courses`, `GET /api/courses/:id/contents`, `GET /api/courses/:id/grades`.
  - `apps/worker/src/routes/health.ts`: `GET /api/health`.
  - `apps/worker/src/routes/proxy.ts`: `GET /api/files/proxy`.
  - `apps/worker/src/routes/items.ts`: `GET /api/items`.
  - `apps/worker/src/routes/sync.ts`: `POST /api/sync/manual`.
  - `apps/worker/test/`: Unit, integration, and mutation tests.
  - `scripts/mutation-test.ts`: Mutation test runner.
  - `docs/fases/fase-3.md`: Phase 3 tracking and technical notes.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Shared Zod Schemas | Define & export schemas and types for dashboard, contents, grades, health, proxy, and errors | M1 | Survey / R3 |
| 2 | D1 Migration `0003` | Create `course_contents` table for caching course section contents | M2 | Survey / R1 |
| 3 | Modular Hono Routers | Extract routes from `src/index.ts` to `src/routes/` and export `app` | M2 | Survey / R1 |
| 4 | Dashboard BFF Endpoint | `GET /api/dashboard` consolidated courses, upcoming assignments, recent items, and grades strictly from D1 | M2 | Survey / R1 |
| 5 | Course Contents Endpoint | `GET /api/courses/:id/contents` reading sections and resources strictly from D1 | M2 | Survey / R1 |
| 6 | Course Grades Endpoint | `GET /api/courses/:id/grades` normalized grade items from D1 | M2 | Survey / R1 |
| 7 | Enhanced Health Endpoint | `GET /api/health` with sync_state, sync_runs history, failure_rate, and subrequest metrics | M2 | Survey / R1 |
| 8 | Secure File Proxy | `GET /api/files/proxy` with strict allowlist (host + path prefix), SSRF mitigation, and server token injection | M3 | Survey / R2 |
| 9 | Automated Test Suite | `bun test` in `apps/worker` covering read endpoints, SSRF rejection, token injection, and error states | M4 | Survey / R4 |
| 10 | Mutation Testing Harness | Automated mutation testing killing 12 induced mutants across proxy and read endpoints | M4 | Survey / R4 |
| 11 | Phase 3 Documentation | Update `docs/fases/fase-3.md` with checked tasks and comprehensive `## Notas` | M4 | Survey / R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Shared Zod Schemas | Define and export all Phase 3 schemas and types in `packages/shared/src/index.ts` | none | DONE |
| 2 | D1 Read BFF Endpoints | Create `0003_phase3_course_contents.sql` and implement modular Hono read routes in `apps/worker` | M1 | IN_PROGRESS |
| 3 | Secure Resource Proxy | Implement `GET /api/files/proxy` in `apps/worker/src/routes/proxy.ts` with strict SSRF defense | M1 | PLANNED |
| 4 | Testing, Mutation Testing & Docs | Implement test suites, mutation runner, and update `docs/fases/fase-3.md` | M2, M3 | PLANNED |

## Interface Contracts
### `packages/shared` ↔ `apps/worker`
- `DashboardResponse`: `{ courses: DashboardCourse[], upcoming_assignments: UpcomingAssignment[], recent_activity: RecentActivityItem[], current_grades: DashboardGrade[] }`
- `CourseContentsResponse`: `{ course_id: number, sections: CourseSection[], synced_at: number | null }`
- `CourseGradesResponse`: `{ course_id: number, grades: GradeItemDetail[] }`
- `EnhancedHealthResponse`: `{ status: 'ok' | 'degraded' | 'error' | 'circuit_open', timestamp: number, sync_state?: SyncState | null, recent_runs: SyncRun[], failure_rate: number, subrequests: SubrequestMetrics }`
- `FileProxyQuery`: `{ url: string }` where URL is valid HTTPS with host `catedig.itlalaguna.edu.mx` and path starting with `/webservice/pluginfile.php`.
- `ApiErrorResponse`: `{ error: string, code?: string, details?: unknown }`

### `apps/worker` ↔ Cloudflare D1
- `courses`: `id`, `shortname`, `fullname`, `progress`, `refreshed_at`
- `synced_items`: `item_key`, `course_id`, `item_type`, `title`, `url`, `due_date`, `grade_num`, `submission_status`, `timemodified`, `deleted_at`
- `course_contents`: `course_id`, `sections_json`, `updated_at`
- `sync_state`: `id = 1`, `baseline_seeded`, `last_success_at`, `consecutive_failures`, `circuit_open_until`
- `sync_runs`: `id`, `started_at`, `finished_at`, `status`, `subrequests_used`, `items_changed`, `error`
