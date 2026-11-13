# Handoff Report — Explorer M1 (Schema-Database Alignment & Zod Types)

**Agente:** `teamwork_explorer_m1_1`  
**Destinatario:** Sub-orquestador M1 (`dc71187e-54b6-4d3f-84a5-374f2e0f0356`)  
**Fecha:** 2026-11-12T20:42:30Z  
**Misión:** Investigar la alineación esquemas-base de datos para Milestone M1 (Esquemas Zod Compartidos y Tipos TypeScript) cubriendo Dashboard, Course Contents, Course Grades, Health, Secure Proxy y ApiError.

---

## 1. Observation (Observaciones Directas)

### 1.1. Tablas D1 Existentes y Tipos SQLite Reales (`PRAGMA table_info`)
Se ejecutó `bunx wrangler d1 execute catedig-db --local --config apps/worker/wrangler.jsonc --command "PRAGMA table_info(...)"`:

1. **Tabla `courses`:**
   - `id`: `INTEGER` (PK, Moodle course ID, non-null)
   - `shortname`: `TEXT NOT NULL`
   - `fullname`: `TEXT NOT NULL`
   - `progress`: `REAL` (nullable en SQLite: `null` cuando no hay seguimiento de progreso, o float p.ej. `8.333333333333332`, `71.42857142857143`)
   - `payload_json`: `TEXT` (nullable)
   - `refreshed_at`: `INTEGER NOT NULL` (Unix timestamp en segundos)
   - `grades_synced_at`: `INTEGER NOT NULL DEFAULT 0`
   - `forums_synced_at`: `INTEGER NOT NULL DEFAULT 0`

2. **Tabla `synced_items`:**
   - `item_key`: `TEXT PRIMARY KEY` (`assign_<cmid>` | `grade_<itemid>` | `discussion_<id>`)
   - `course_id`: `INTEGER NOT NULL`
   - `item_type`: `TEXT NOT NULL` (`'assignment' | 'grade' | 'announcement'`)
   - `title`: `TEXT NOT NULL`
   - `url`: `TEXT` (nullable)
   - `due_date`: `INTEGER` (nullable, Unix timestamp en segundos)
   - `grade_num`: `REAL` (nullable: numérico flotante p.ej. `100.0` o `null` si aún no calificado o si no aplica)
   - `timemodified`: `INTEGER NOT NULL` (Unix timestamp en segundos)
   - `payload_json`: `TEXT` (nullable: contiene JSON de `MoodleAssignment`, `MoodleGradeItem` o discusión)
   - `first_seen_at`: `INTEGER NOT NULL`
   - `updated_at`: `INTEGER NOT NULL`
   - `deleted_at`: `INTEGER` (nullable tombstone)
   - `submission_status`: `TEXT` (nullable: `'pending' | 'draft' | 'submitted' | 'graded'` o `null` previo al sync)
   - `status_synced_at`: `INTEGER NOT NULL DEFAULT 0`

3. **Tabla `sync_runs`:**
   - `id`: `INTEGER PRIMARY KEY AUTOINCREMENT`
   - `started_at`: `INTEGER NOT NULL`
   - `finished_at`: `INTEGER` (nullable)
   - `status`: `TEXT NOT NULL` (`'ok' | 'partial' | 'error'`)
   - `subrequests_used`: `INTEGER` (nullable en SQLite cuando el run falla antes de inicializar el cliente)
   - `items_changed`: `INTEGER` (nullable en SQLite cuando el run aborta)
   - `error`: `TEXT` (nullable)

4. **Tabla `sync_state`:**
   - `id`: `INTEGER PRIMARY KEY CHECK (id = 1)`
   - `baseline_seeded`: `INTEGER NOT NULL DEFAULT 0`
   - `last_success_at`: `INTEGER NOT NULL DEFAULT 0`
   - `last_attempt_at`: `INTEGER NOT NULL DEFAULT 0`
   - `consecutive_failures`: `INTEGER NOT NULL DEFAULT 0`
   - `moodle_user_id`: `INTEGER` (nullable)
   - `courses_refreshed_at`: `INTEGER NOT NULL DEFAULT 0`
   - `grades_seeded`: `INTEGER NOT NULL DEFAULT 0`
   - `forums_seeded`: `INTEGER NOT NULL DEFAULT 0`
   - `circuit_open_until`: `INTEGER NOT NULL DEFAULT 0`
   - `dead_man_alerted`: `INTEGER NOT NULL DEFAULT 0`

### 1.2. Hallazgo de Incompatibilidad en `packages/shared/src/index.ts` Existente
En `packages/shared/src/index.ts` (líneas 60-61):
```typescript
export const SyncRunSchema = z.object({
  // ...
  subrequests_used: z.number().optional(),
  items_changed: z.number().optional(),
  error: z.string().nullable().optional()
});
```
- **Error latente detectado:** En SQLite D1, cuando una fila en `sync_runs` tiene `NULL` en `subrequests_used` o `items_changed`, D1 devuelve `{ subrequests_used: null, items_changed: null }`. En Zod, `.optional()` solo acepta `undefined` y rechaza `null`. Debe corregirse a `z.number().nullable().optional()`.

### 1.3. Contenido de `payload_json` en Calificaciones (`synced_items`)
Inspección de fila viva en `synced_items` (`item_key = 'grade_2469'`):
```json
{
  "id": 2469,
  "itemname": "Examen Unidad 1",
  "itemtype": "mod",
  "itemmodule": "assign",
  "graderaw": 100,
  "gradeformatted": "100.00",
  "grademin": 0,
  "grademax": 100,
  "percentageformatted": "100.00 %",
  "feedback": "<p>Buen trabajo...</p>",
  "feedbackformat": 1
}
```
Esto confirma que campos como `grademin`, `grademax`, `grade_formatted`, `percentage_formatted` y `feedback` provienen de `payload_json` y pueden ser `null` o `undefined` dependiendo de la actividad de Moodle.

---

## 2. Logic Chain (Cadena Lógica)

1. **Alineación de Tipos D1 a Zod:**
   - En SQLite y el driver D1 de Cloudflare Workers, toda columna que no tenga `NOT NULL` puede devolver `null` en JavaScript.
   - En Zod, un campo que proviene de un `SELECT` SQL de columna nullable DEBE usar `.nullable()`. Si además puede no ser seleccionado u omitido, debe usar `.nullable().optional()`.
   - `courses.progress` es `REAL` nullable $\rightarrow$ `z.number().nullable().optional()`.
   - `synced_items.grade_num` es `REAL` nullable $\rightarrow$ `z.number().nullable()`.
   - `synced_items.due_date` es `INTEGER` nullable $\rightarrow$ `z.number()` en tareas próximas (porque la consulta filtra `WHERE due_date IS NOT NULL`) o `z.number().nullable().optional()`.
   - `synced_items.submission_status` es `TEXT` nullable $\rightarrow$ `SubmissionStatusSchema.nullable().optional()`.

2. **Dashboard (`GET /api/dashboard`):**
   - Agrupa 4 consultas a D1: `courses`, `upcoming_assignments`, `recent_activity`, `current_grades`.
   - Todas leen estrictamente de D1 (tablas `courses` y `synced_items`).
   - Las consultas de items hacen `LEFT JOIN courses c ON s.course_id = c.id` para obtener `course_name` (`c.shortname`). Al ser un LEFT JOIN, `course_name` debe ser `z.string().nullable().optional()`.

3. **Course Contents (`GET /api/courses/:id/contents`):**
   - El parámetro `:id` proviene de la URL `/api/courses/:id/contents` como string $\rightarrow$ `z.coerce.number().int().positive()`.
   - Las secciones y módulos contienen arrays de recursos (`contents`). Cada archivo contiene `filename`, `fileurl`, `filesize`, `mimetype`, `timemodified`, y de forma opcional `proxy_url` generada por el backend hacia `/api/files/proxy`.
   - Si no se ha sincronizado aún el contenido del curso, se devuelve `{ course_id: id, sections: [], synced_at: null }`. Por tanto, `synced_at` debe ser `z.number().nullable()`.

4. **Course Grades (`GET /api/courses/:id/grades`):**
   - El parámetro `:id` usa `CourseGradesParamsSchema` (`z.coerce.number().int().positive()`).
   - El array de calificaciones devuelve `GradeItemDetailSchema` con `grade_num` (`number | null`), `grade_formatted` (`string | null`), `grademin`, `grademax`, `feedback`, `timemodified` y `url`.

5. **Proxy Seguro (`GET /api/files/proxy?url=...`):**
   - Debe prevenir SSRF con validación estricta en Zod `refine()`:
     - `protocol === 'https:'`
     - `hostname === 'catedig.itlalaguna.edu.mx'`
     - `(port === '' || port === '443')`
     - `username === '' && password === ''` (sin credenciales incrustadas)
     - `pathname.startsWith('/webservice/pluginfile.php')`

---

## 3. Caveats (Advertencias y Suposiciones)

1. **Tabla `course_contents` en D1:**  
   Para dar soporte de lectura pura en D1 a `GET /api/courses/:id/contents` sin saturar la tabla `courses` con JSON masivos, se recomienda formalmente la migración `apps/worker/migrations/0003_phase3_course_contents.sql`. Los esquemas Zod diseñados aquí son 100% compatibles tanto con esa tabla como con almacenamiento directo.
2. **Campos nulos vs indefinidos en SQLite D1:**  
   Si una consulta hace `SELECT progress FROM courses`, y la columna es NULL, D1 devuelve `{ progress: null }`. Si el esquema tuviera `z.number().optional()`, fallaría la validación. Por ello, todos los campos nullables de D1 fueron explícitamente tipados con `.nullable()`.

---

## 4. Conclusion (Diseño y Código de Esquemas para Implementación)

El archivo `packages/shared/src/index.ts` debe reemplazarse/actualizarse con la siguiente implementación completa y validada:

```typescript
import { z } from 'zod';

// ==========================================
// 1. Entidades de Base de Datos Base (D1)
// ==========================================

export const CourseSchema = z.object({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  progress: z.number().nullable().optional(),
  payload_json: z.string().nullable().optional(),
  refreshed_at: z.number(),
  grades_synced_at: z.number().optional(),
  forums_synced_at: z.number().optional()
});
export type Course = z.infer<typeof CourseSchema>;

export const SyncedItemTypeSchema = z.enum(['assignment', 'grade', 'announcement']);
export type SyncedItemType = z.infer<typeof SyncedItemTypeSchema>;

export const SubmissionStatusSchema = z.enum(['pending', 'draft', 'submitted', 'graded']);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const SyncedItemSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  item_type: SyncedItemTypeSchema,
  title: z.string(),
  url: z.string().nullable().optional(),
  due_date: z.number().nullable().optional(),
  grade_num: z.number().nullable().optional(),
  submission_status: SubmissionStatusSchema.nullable().optional(),
  status_synced_at: z.number().optional(),
  timemodified: z.number(),
  payload_json: z.string().nullable().optional(),
  first_seen_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number().nullable().optional()
});
export type SyncedItem = z.infer<typeof SyncedItemSchema>;

export const SyncStateSchema = z.object({
  id: z.number(),
  baseline_seeded: z.number(),
  last_success_at: z.number(),
  last_attempt_at: z.number(),
  consecutive_failures: z.number(),
  moodle_user_id: z.number().nullable().optional(),
  courses_refreshed_at: z.number().optional(),
  grades_seeded: z.number().optional(),
  forums_seeded: z.number().optional(),
  circuit_open_until: z.number().optional(),
  dead_man_alerted: z.number().optional()
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export const SyncRunSchema = z.object({
  id: z.number().optional(),
  started_at: z.number(),
  finished_at: z.number().nullable().optional(),
  status: z.enum(['ok', 'partial', 'error']),
  subrequests_used: z.number().nullable().optional(),
  items_changed: z.number().nullable().optional(),
  error: z.string().nullable().optional()
});
export type SyncRun = z.infer<typeof SyncRunSchema>;

export const MoodleTokenResponseSchema = z.union([
  z.object({
    token: z.string(),
    privatetoken: z.string().nullable().optional()
  }),
  z.object({
    error: z.string(),
    errorcode: z.string()
  })
]);
export type MoodleTokenResponse = z.infer<typeof MoodleTokenResponseSchema>;


// ==========================================
// 2. Dashboard Endpoints (GET /api/dashboard)
// ==========================================

export const DashboardCourseSchema = z.object({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  progress: z.number().nullable().optional(),
  refreshed_at: z.number()
});
export type DashboardCourse = z.infer<typeof DashboardCourseSchema>;

export const UpcomingAssignmentSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().nullable().optional(),
  title: z.string(),
  url: z.string().nullable().optional(),
  due_date: z.number(),
  submission_status: SubmissionStatusSchema.nullable().optional(),
  timemodified: z.number()
});
export type UpcomingAssignment = z.infer<typeof UpcomingAssignmentSchema>;

export const RecentActivityItemSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().nullable().optional(),
  item_type: SyncedItemTypeSchema,
  title: z.string(),
  url: z.string().nullable().optional(),
  timemodified: z.number(),
  updated_at: z.number().optional()
});
export type RecentActivityItem = z.infer<typeof RecentActivityItemSchema>;

export const DashboardGradeSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().nullable().optional(),
  title: z.string(),
  grade_num: z.number().nullable(),
  grade_formatted: z.string().nullable().optional(),
  timemodified: z.number(),
  url: z.string().nullable().optional()
});
export type DashboardGrade = z.infer<typeof DashboardGradeSchema>;

export const DashboardResponseSchema = z.object({
  courses: z.array(DashboardCourseSchema),
  upcoming_assignments: z.array(UpcomingAssignmentSchema),
  recent_activity: z.array(RecentActivityItemSchema),
  current_grades: z.array(DashboardGradeSchema)
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;


// ==========================================
// 3. Course Contents (GET /api/courses/:id/contents)
// ==========================================

export const CourseContentsParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});
export type CourseContentsParams = z.infer<typeof CourseContentsParamsSchema>;

export const CourseResourceFileSchema = z.object({
  filename: z.string(),
  fileurl: z.string(),
  filesize: z.number().nullable().optional(),
  filepath: z.string().nullable().optional(),
  mimetype: z.string().nullable().optional(),
  timemodified: z.number().nullable().optional(),
  proxy_url: z.string().optional()
});
export type CourseResourceFile = z.infer<typeof CourseResourceFileSchema>;

export const CourseModuleSchema = z.object({
  id: z.number(), // cmid
  name: z.string(),
  instance: z.number().optional(),
  modname: z.string(), // 'resource' | 'assign' | 'forum' | 'quiz' | 'folder' | 'page' | 'url' | 'label'
  modplural: z.string().optional(),
  description: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  visible: z.number().optional(),
  contents: z.array(CourseResourceFileSchema).optional()
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const CourseSectionSchema = z.object({
  id: z.number(),
  name: z.string(),
  visible: z.number().optional(),
  summary: z.string().nullable().optional(),
  section: z.number().optional(),
  modules: z.array(CourseModuleSchema)
});
export type CourseSection = z.infer<typeof CourseSectionSchema>;

export const CourseContentsResponseSchema = z.object({
  course_id: z.number(),
  sections: z.array(CourseSectionSchema),
  synced_at: z.number().nullable()
});
export type CourseContentsResponse = z.infer<typeof CourseContentsResponseSchema>;


// ==========================================
// 4. Course Grades (GET /api/courses/:id/grades)
// ==========================================

export const CourseGradesParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});
export type CourseGradesParams = z.infer<typeof CourseGradesParamsSchema>;

export const GradeItemDetailSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  title: z.string(),
  grade_num: z.number().nullable(),
  grade_formatted: z.string().nullable().optional(),
  grademin: z.number().nullable().optional(),
  grademax: z.number().nullable().optional(),
  percentage_formatted: z.string().nullable().optional(),
  feedback: z.string().nullable().optional(),
  itemtype: z.string().nullable().optional(),
  itemmodule: z.string().nullable().optional(),
  weight_formatted: z.string().nullable().optional(),
  timemodified: z.number(),
  url: z.string().nullable().optional()
});
export type GradeItemDetail = z.infer<typeof GradeItemDetailSchema>;

export const CourseGradesResponseSchema = z.object({
  course_id: z.number(),
  grades: z.array(GradeItemDetailSchema)
});
export type CourseGradesResponse = z.infer<typeof CourseGradesResponseSchema>;


// ==========================================
// 5. Health Endpoints (GET /api/health)
// ==========================================

export const SubrequestMetricsSchema = z.object({
  last_used: z.number(),
  max_budget: z.number(),
  avg_recent: z.number(),
  max_recent: z.number()
});
export type SubrequestMetrics = z.infer<typeof SubrequestMetricsSchema>;

export const EnhancedHealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error', 'circuit_open']),
  timestamp: z.number(),
  sync_state: SyncStateSchema.nullable().optional(),
  recent_runs: z.array(SyncRunSchema),
  failure_rate: z.number(),
  subrequests: SubrequestMetricsSchema
});
export type EnhancedHealthResponse = z.infer<typeof EnhancedHealthResponseSchema>;


// ==========================================
// 6. Secure Proxy & Errors (GET /api/files/proxy)
// ==========================================

export const FileProxyQuerySchema = z.object({
  url: z.string().url().refine((val) => {
    try {
      const parsed = new URL(val);
      return (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'catedig.itlalaguna.edu.mx' &&
        (parsed.port === '' || parsed.port === '443') &&
        parsed.username === '' &&
        parsed.password === '' &&
        parsed.pathname.startsWith('/webservice/pluginfile.php')
      );
    } catch {
      return false;
    }
  }, {
    message: 'URL rechazada: debe ser HTTPS, host catedig.itlalaguna.edu.mx y ruta /webservice/pluginfile.php'
  })
});
export type FileProxyQuery = z.infer<typeof FileProxyQuerySchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional()
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
```

---

## 5. Verification Method (Método de Verificación Independiente)

1. **Compilación de `@better-moodle/shared`:**
   ```bash
   bun run build:shared
   ```
   *Criterio de éxito:* `index.js` empaquetado exitosamente en `packages/shared/dist/`.
2. **Validación de tipos de TypeScript en Worker:**
   ```bash
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Criterio de éxito:* 0 errores de compilación.
3. **Validación de tipos y build de Frontend:**
   ```bash
   bun run build:web
   ```
   *Criterio de éxito:* Vite genera el bundle de producción sin advertencias de tipos.
4. **Verificación de suites de test existentes:**
   ```bash
   bun test apps/worker
   ```
   *Criterio de éxito:* 4 tests pasados con 0 fallas.
