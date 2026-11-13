# Reporte de Investigación y Handoff — Explorer 1 (Survey: Schemas, Types y D1 Database)

**Agente:** `teamwork_explorer_survey_1`  
**Destinatario:** Orquestador (`dafd4987-d9e1-4c9b-b5a2-cf6be1636891`)  
**Fecha:** 2026-11-12T20:34:00Z  
**Alcance:** Investigación técnica de `packages/shared`, migraciones D1 (`apps/worker/migrations/`), estructuras de datos existentes, gaps de esquemas Zod/TypeScript y diseño para los endpoints de la Fase 3.

---

## 1. Observation (Observaciones Directas)

### 1.1. Estado Actual de `packages/shared`
- **Archivo:** `packages/shared/package.json`
  - Dependencias: `"zod": "^3.24.1"` (línea 10).
  - Main/types: `"main": "./src/index.ts"`, `"types": "./src/index.ts"`.
  - Script: `"build": "bun build ./src/index.ts --outdir ./dist"`.
- **Archivo:** `packages/shared/src/index.ts` (78 líneas totales)
  - Exporta actualmente 7 esquemas y tipos Zod de entidades de base de datos base:
    - `CourseSchema` / `Course` (líneas 3-12)
    - `SyncedItemTypeSchema` / `SyncedItemType` (`'assignment' | 'grade' | 'announcement'`, líneas 14-15)
    - `SubmissionStatusSchema` / `SubmissionStatus` (`'pending' | 'draft' | 'submitted' | 'graded'`, líneas 17-18)
    - `SyncedItemSchema` / `SyncedItem` (líneas 20-37)
    - `SyncStateSchema` / `SyncState` (líneas 39-53)
    - `SyncRunSchema` / `SyncRun` (`status: 'ok' | 'partial' | 'error'`, líneas 55-65)
    - `MoodleTokenResponseSchema` / `MoodleTokenResponse` (líneas 67-78)
- **Consumo actual por aplicaciones:**
  - Búsqueda en monorepo: `Get-ChildItem -Path @('apps\worker\src', 'apps\web\src') -Recurse -File | Select-String "@better-moodle/shared"` arrojó **0 resultados**.
  - Aunque `apps/worker/package.json` y `apps/web/package.json` declaran `"@better-moodle/shared": "workspace:*"`, **ningún archivo de código importa actualmente el paquete**. Las aplicaciones usan queries SQL ad-hoc y tipos `any`.

### 1.2. Estructura y Migraciones D1 (`apps/worker/migrations/`)
- **Migración 1:** `apps/worker/migrations/0001_initial_schema.sql`
  - Crea `courses` (`id INTEGER PRIMARY KEY`, `shortname`, `fullname`, `progress`, `payload_json`, `refreshed_at`).
  - Crea `synced_items` (`item_key TEXT PRIMARY KEY`, `course_id`, `item_type`, `title`, `url`, `due_date`, `grade_num REAL`, `timemodified`, `payload_json`, `first_seen_at`, `updated_at`, `deleted_at`).
  - Crea `sync_state` (`id CHECK (id = 1)`, `baseline_seeded`, `last_success_at`, `last_attempt_at`, `consecutive_failures`).
  - Crea `sync_runs` (`id AUTOINCREMENT`, `started_at`, `finished_at`, `status`, `subrequests_used`, `items_changed`, `error`).
  - Crea `push_subscriptions`.
- **Migración 2:** `apps/worker/migrations/0002_phase2_sync_metadata.sql`
  - Añade columnas a `courses`: `grades_synced_at`, `forums_synced_at`.
  - Añade columnas a `synced_items`: `submission_status`, `status_synced_at`.
  - Añade columnas a `sync_state`: `moodle_user_id`, `courses_refreshed_at`, `grades_seeded`, `forums_seeded`, `circuit_open_until`, `dead_man_alerted`.
  - Crea índice: `idx_items_type_status ON synced_items(item_type, deleted_at)`.
- **Inspección de datos reales en base local D1 (`catedig-db-local`):**
  - Comando: `bunx wrangler d1 execute catedig-db --local --config apps/worker/wrangler.jsonc --command "..."`
  - Conteo de filas activas:
    - `courses`: **3** cursos (ID 11 "Tele", ID 96 "GrafC17A", ID 127 "SisOpAD2026").
    - `synced_items`: **64** elementos (`28` tipo `assignment` con `submission_status` en 7 de ellos; `36` tipo `grade` con `grade_num` normalizado en 3 de ellos).
    - `sync_runs`: **7** registros de ejecuciones cron/manual (`status` 'ok' y 'error').
    - `sync_state`: **1** fila (`baseline_seeded: 1`, `consecutive_failures: 0`, `moodle_user_id: 835`).
- **Estado de contenidos de curso (`core_course_get_contents`):**
  - La función está validada en Fase 0 (`scripts/check-moodle-gate.ts`, línea 17; `docs/fases/fase-0.md`, línea 14).
  - Sin embargo, en el motor de sincronización (`apps/worker/src/sync/engine.ts`), **no existe aún llamada ni guardado de contenidos de curso en D1**. No hay columna ni tabla para `course_contents`.

### 1.3. Endpoints Existentes en `apps/worker/src/index.ts`
- `GET /api/health` (líneas 9-26): Devuelve `{ status, timestamp, syncState, lastRun }`. Falta historial reciente de runs, subrequest metrics y failure rate requeridos por R1.
- `GET /api/courses` (líneas 29-38): Devuelve `{ courses: results }`.
- `GET /api/items` (líneas 41-60): Devuelve `{ items: results }` filtrando por query `type`.
- `POST /api/sync/manual` (líneas 63-84): Sincronización manual con limitador de 30s.

---

## 2. Logic Chain (Cadena Lógica)

1. **Premisa 1 (Requerimientos Fase 3):**
   `ORIGINAL_REQUEST.md` exige:
   - `GET /api/dashboard`: Consolidado de materias, tareas próximas, actividad reciente y calificaciones actuales.
   - `GET /api/courses/:id/contents`: Contenidos y recursos leídos estrictamente de D1.
   - `GET /api/courses/:id/grades`: Calificaciones normalizadas de la materia desde D1.
   - `GET /api/health`: Enriquecido con historial reciente de `sync_runs`, tasa de fallos (`failure_rate`) y métricas de subpeticiones.
   - `GET /api/files/proxy`: Proxy con validación de URL (host `catedig.itlalaguna.edu.mx`, prefijo `/webservice/pluginfile.php`), inyección segura de `MOODLE_TOKEN` en servidor y bloqueo SSRF.
   - Esquemas Zod y tipos TypeScript exportados en `packages/shared` para request params/queries y response payloads.

2. **Premisa 2 (Reglas Arquitectónicas de `AGENTS.md`):**
   - Regla 2.1: *La ruta de lectura nunca toca Moodle.* Ningún endpoint interactivo puede hacer fetch a Moodle, excepto `/api/files/proxy` y `/api/sync/manual`.
   - Regla 2.2: *Mismo origen obligatorio (RNF-09).*
   - Regla 3: *Migraciones D1 en `apps/worker/migrations/` con numeración incremental.*

3. **Inferencia sobre el modelo de datos en D1 para `GET /api/dashboard`:**
   - La tabla `courses` contiene las materias inscritas (`id`, `shortname`, `fullname`, `progress`).
   - La tabla `synced_items` contiene todas las tareas (`item_type = 'assignment'`) con `due_date`, `submission_status`, y las discusiones/avisos (`item_type = 'announcement'`) y calificaciones (`item_type = 'grade'`).
   - Por tanto, `GET /api/dashboard` puede construirse leyendo 100% de D1 mediante consultas paralelas (`Promise.all` o `db.batch`) sin tocar Moodle.

4. **Inferencia sobre `GET /api/courses/:id/grades`:**
   - En `synced_items`, las calificaciones ya se guardan con `course_id`, `item_type = 'grade'`, `grade_num` (`REAL`), `title`, `timemodified`, y `payload_json` (que almacena `MoodleGradeItem` con `grademin`, `grademax`, `feedback`, `gradeformatted`).
   - Por tanto, `GET /api/courses/:id/grades` se alimenta directamente filtrando `synced_items WHERE course_id = ? AND item_type = 'grade' AND deleted_at IS NULL`.

5. **Inferencia sobre `GET /api/courses/:id/contents` y almacenamiento en D1:**
   - Actualmente D1 no almacena las secciones ni recursos de `core_course_get_contents`.
   - Si se guarda en la tabla `courses` como columna `contents_json TEXT`, cada `SELECT * FROM courses` en la app cargará blobs pesados (50–150 KB de JSON) innecesariamente en memoria de SQLite.
   - Por ende, la solución técnica óptima y limpia es crear una tabla desacoplada vía migración `0003_phase3_course_contents.sql`:
     ```sql
     CREATE TABLE IF NOT EXISTS course_contents (
       course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
       sections_json TEXT NOT NULL,
       updated_at INTEGER NOT NULL
     );
     ```
   - El endpoint lee de `course_contents`. Si aún no hay contenido para ese curso, devuelve `{ course_id: id, sections: [], synced_at: null }` con HTTP 200 (o 404 si el curso no existe en `courses`).

6. **Inferencia sobre `GET /api/files/proxy`:**
   - El endpoint recibe query param `url`.
   - Debe parsear la URL y comprobar estrictamente:
     1. Protocolo: `https:`
     2. Host: estrictamente `catedig.itlalaguna.edu.mx`
     3. Pathname: inicia con `/webservice/pluginfile.php`
   - Inyecta `MOODLE_TOKEN` del worker (`env.MOODLE_TOKEN`) como search param `token` hacia Moodle.
   - Retransmite el stream del body al cliente, purgando cualquier header sensible (como `Set-Cookie` o referencias al token).

7. **Inferencia sobre `packages/shared`:**
   - Debe expandir `packages/shared/src/index.ts` (o módulos internos re-exportados) con los esquemas de validación de entrada (params/query) y payloads de respuesta para cada uno de los 5 endpoints.

---

## 3. Caveats (Advertencias y Limitaciones)

1. **Estado de sincronización de contenidos (`core_course_get_contents`):**
   - Aunque `core_course_get_contents` fue verificado en Fase 0, el motor `engine.ts` de Fase 2 no lo ejecuta en el cron para no agotar el presupuesto de 45 subpeticiones si hay muchos cursos.
   - En Fase 3, el endpoint `GET /api/courses/:id/contents` debe leer de D1 (devolviendo `sections: []` si no se ha sincronizado aún). Si se implementa sync bajo demanda o escalonado, debe respetar estrictamente el límite de subpeticiones y ejecutarse en background o en scheduled, nunca bloqueando una lectura de usuario.
2. **Estructura de `sync_runs` para `/api/health`:**
   - Si no hay ejecuciones registradas en `sync_runs`, los cálculos de `failure_rate` y promedio de subpeticiones deben contemplar división por cero y devolver 0.
3. **Herramienta de Mutation Testing en Bun:**
   - Bun actualmente no cuenta con soporte nativo directo para Stryker sin configuración adicional de transpilador. Se recomienda un harness de pruebas de mutación basado en ejecución de suites con operadores invertidos o mutantes controlados en `apps/worker` usando `bun test`.

---

## 4. Conclusion (Conclusiones y Especificación de Esquemas)

A continuación se definen los esquemas exactos que deben implementarse y exportarse en `packages/shared`:

### 4.1. Esquemas para `GET /api/dashboard`
```typescript
// Materia resumida para dashboard
export const DashboardCourseSchema = z.object({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  progress: z.number().nullable().optional(),
  refreshed_at: z.number()
});
export type DashboardCourse = z.infer<typeof DashboardCourseSchema>;

// Tarea próxima
export const UpcomingAssignmentSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().optional(),
  title: z.string(),
  url: z.string().nullable().optional(),
  due_date: z.number(),
  submission_status: SubmissionStatusSchema.nullable().optional(),
  timemodified: z.number()
});
export type UpcomingAssignment = z.infer<typeof UpcomingAssignmentSchema>;

// Actividad reciente (tareas modificadas, avisos de foros)
export const RecentActivityItemSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().optional(),
  item_type: SyncedItemTypeSchema,
  title: z.string(),
  url: z.string().nullable().optional(),
  timemodified: z.number(),
  updated_at: z.number().optional()
});
export type RecentActivityItem = z.infer<typeof RecentActivityItemSchema>;

// Resumen de calificaciones para dashboard
export const DashboardGradeSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().optional(),
  title: z.string(),
  grade_num: z.number().nullable(),
  timemodified: z.number(),
  url: z.string().nullable().optional()
});
export type DashboardGrade = z.infer<typeof DashboardGradeSchema>;

// Payload consolidado de respuesta GET /api/dashboard
export const DashboardResponseSchema = z.object({
  courses: z.array(DashboardCourseSchema),
  upcoming_assignments: z.array(UpcomingAssignmentSchema),
  recent_activity: z.array(RecentActivityItemSchema),
  current_grades: z.array(DashboardGradeSchema)
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
```

### 4.2. Esquemas para `GET /api/courses/:id/contents`
```typescript
// Parámetros de ruta
export const CourseContentsParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});
export type CourseContentsParams = z.infer<typeof CourseContentsParamsSchema>;

// Archivo de recurso de módulo
export const CourseResourceFileSchema = z.object({
  filename: z.string(),
  fileurl: z.string(),
  filesize: z.number().nullable().optional(),
  mimetype: z.string().nullable().optional(),
  timemodified: z.number().nullable().optional(),
  proxy_url: z.string().optional()
});
export type CourseResourceFile = z.infer<typeof CourseResourceFileSchema>;

// Módulo dentro de una sección (recurso, tarea, foro, cuestionario)
export const CourseModuleSchema = z.object({
  id: z.number(), // cmid
  name: z.string(),
  instance: z.number().optional(),
  modname: z.string(), // 'resource' | 'assign' | 'forum' | 'quiz' | 'folder' | 'page' | 'url'
  url: z.string().nullable().optional(),
  contents: z.array(CourseResourceFileSchema).optional()
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

// Sección temática de la materia
export const CourseSectionSchema = z.object({
  id: z.number(),
  name: z.string(),
  visible: z.number().optional(),
  summary: z.string().optional(),
  modules: z.array(CourseModuleSchema)
});
export type CourseSection = z.infer<typeof CourseSectionSchema>;

// Respuesta GET /api/courses/:id/contents
export const CourseContentsResponseSchema = z.object({
  course_id: z.number(),
  sections: z.array(CourseSectionSchema),
  synced_at: z.number().nullable()
});
export type CourseContentsResponse = z.infer<typeof CourseContentsResponseSchema>;
```

### 4.3. Esquemas para `GET /api/courses/:id/grades`
```typescript
// Parámetros de ruta
export const CourseGradesParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});
export type CourseGradesParams = z.infer<typeof CourseGradesParamsSchema>;

// Ítem de calificación individual normalizado
export const GradeItemDetailSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  title: z.string(),
  grade_num: z.number().nullable(),
  grade_formatted: z.string().nullable().optional(),
  grademin: z.number().nullable().optional(),
  grademax: z.number().nullable().optional(),
  feedback: z.string().nullable().optional(),
  timemodified: z.number(),
  url: z.string().nullable().optional()
});
export type GradeItemDetail = z.infer<typeof GradeItemDetailSchema>;

// Respuesta GET /api/courses/:id/grades
export const CourseGradesResponseSchema = z.object({
  course_id: z.number(),
  grades: z.array(GradeItemDetailSchema)
});
export type CourseGradesResponse = z.infer<typeof CourseGradesResponseSchema>;
```

### 4.4. Esquemas para `GET /api/health`
```typescript
// Métricas de subpeticiones
export const SubrequestMetricsSchema = z.object({
  last_used: z.number(),
  max_budget: z.number(),
  avg_recent: z.number(),
  max_recent: z.number()
});
export type SubrequestMetrics = z.infer<typeof SubrequestMetricsSchema>;

// Respuesta enriquecida GET /api/health
export const EnhancedHealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error', 'circuit_open']),
  timestamp: z.number(),
  sync_state: SyncStateSchema.nullable().optional(),
  recent_runs: z.array(SyncRunSchema),
  failure_rate: z.number(),
  subrequests: SubrequestMetricsSchema
});
export type EnhancedHealthResponse = z.infer<typeof EnhancedHealthResponseSchema>;
```

### 4.5. Esquemas para `GET /api/files/proxy` y Errores
```typescript
// Validación de query params para el proxy seguro
export const FileProxyQuerySchema = z.object({
  url: z.string().url().refine((val) => {
    try {
      const parsed = new URL(val);
      return (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'catedig.itlalaguna.edu.mx' &&
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

// Respuesta de error estándar para la API
export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional()
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
```

### 4.6. Migración D1 recomendada
Para dar soporte limpio a `GET /api/courses/:id/contents`, se recomienda crear la migración incremental:
`apps/worker/migrations/0003_phase3_course_contents.sql`:
```sql
-- 0003_phase3_course_contents.sql
-- Almacenamiento en caché de secciones y recursos por materia (Fase 3)
CREATE TABLE IF NOT EXISTS course_contents (
  course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  sections_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 5. Verification Method (Método de Verificación Independiente)

Para verificar independientemente este diagnóstico y los hallazgos:

1. **Verificar esquemas y tipado TypeScript:**
   ```bash
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   bun run build:shared
   bun run build:web
   ```
2. **Inspeccionar base de datos D1 local:**
   ```bash
   bunx wrangler d1 execute catedig-db --local --config apps/worker/wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE type='table'"
   bunx wrangler d1 execute catedig-db --local --config apps/worker/wrangler.jsonc --command "SELECT id, shortname, fullname FROM courses"
   bunx wrangler d1 execute catedig-db --local --config apps/worker/wrangler.jsonc --command "SELECT item_type, count(*) FROM synced_items GROUP BY item_type"
   ```
3. **Condición de invalidación:**
   Si Moodle cambia el host del pluginfile o el path prefix (`/webservice/pluginfile.php`), o si la PWA requiere campos de calificación no contemplados en `MoodleGradeItem`, los esquemas `FileProxyQuerySchema` y `GradeItemDetailSchema` deberán actualizarse.
