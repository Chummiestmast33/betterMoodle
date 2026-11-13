# Reporte de Investigación y Handoff — Explorer 3 (Package Exports, Backward Compatibility y TypeScript Build Integration)

**Agente:** `teamwork_explorer_m1_3`  
**Destinatario:** Sub-Orquestador M1 (`dc71187e-54b6-4d3f-84a5-374f2e0f0356`)  
**Fecha:** 2026-11-12T20:42:00Z  
**Alcance:** Milestone M1 — Exportación de paquetes, compatibilidad hacia atrás del 100%, estructura de barrel en `packages/shared`, configuración de `tsconfig.json` en el monorepo y verificación de builds en consumidores (`apps/worker` y `apps/web`).

---

## 1. Observation (Observaciones Directas)

### 1.1. Estado y Esquemas Existentes en `packages/shared/src/index.ts`
El archivo actual contiene 78 líneas y exporta exactamente 7 esquemas Zod y sus 7 tipos TypeScript inferidos:
1. `CourseSchema` / `Course` (líneas 3–12): Entidad base de curso de D1 (`id`, `shortname`, `fullname`, `progress`, `payload_json`, `refreshed_at`).
2. `SyncedItemTypeSchema` / `SyncedItemType` (líneas 14–15): Enum `'assignment' | 'grade' | 'announcement'`.
3. `SubmissionStatusSchema` / `SubmissionStatus` (líneas 17–18): Enum `'pending' | 'draft' | 'submitted' | 'graded'`.
4. `SyncedItemSchema` / `SyncedItem` (líneas 20–37): Entidad base de item de D1 (`item_key`, `course_id`, `item_type`, `title`, `url`, `due_date`, `grade_num`, `submission_status`, `status_synced_at`, `timemodified`, `payload_json`, `first_seen_at`, `updated_at`, `deleted_at`).
5. `SyncStateSchema` / `SyncState` (líneas 39–53): Estado singleton del motor (`id`, `baseline_seeded`, `last_success_at`, `last_attempt_at`, `consecutive_failures`, `moodle_user_id`, `courses_refreshed_at`, `grades_seeded`, `forums_seeded`, `circuit_open_until`, `dead_man_alerted`).
6. `SyncRunSchema` / `SyncRun` (líneas 55–65): Registro de ejecución de sincronización (`id`, `started_at`, `finished_at`, `status: 'ok' | 'partial' | 'error'`, `subrequests_used`, `items_changed`, `error`).
7. `MoodleTokenResponseSchema` / `MoodleTokenResponse` (líneas 67–78): Unión de token exitoso o error Moodle.

### 1.2. Configuración de `package.json` en `packages/shared`
- **Archivo:** `packages/shared/package.json`:
  ```json
  {
    "name": "@better-moodle/shared",
    "version": "0.1.0",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "scripts": {
      "build": "bun build ./src/index.ts --outdir ./dist"
    },
    "dependencies": {
      "zod": "^3.24.1"
    }
  }
  ```
- **Symlinks en Monorepo Bun:**
  Tanto `apps/worker/node_modules/@better-moodle/shared` como `apps/web/node_modules/@better-moodle/shared` son symlinks de workspace apuntando directamente a `packages/shared`.
- **Verificación de Importación en Consumidores:**
  - `bun --cwd apps/worker -e "import { CourseSchema } from '@better-moodle/shared'; console.log('Import successful:', CourseSchema != null)"` → **`Import successful: true`** (Exit code 0).
  - `bun --cwd apps/web -e "import { CourseSchema } from '@better-moodle/shared'; console.log('Web import successful:', CourseSchema != null)"` → **`Web import successful: true`** (Exit code 0).

### 1.3. Diagnóstico de `tsconfig.json` en el Monorepo
- **Root `tsconfig.json`:**
  Configura `compilerOptions`: `target: "ESNext"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`. No contiene filtros `include`/`exclude`.
- **`apps/worker/tsconfig.json`:**
  Extiende `../../tsconfig.json`. Agrega `"types": ["@cloudflare/workers-types"]`, `include: ["src/**/*"]`, `exclude: ["src/**/*.test.ts"]`.
  - Verificación actual: `bunx tsc --noEmit -p apps/worker/tsconfig.json` → **Exit code 0 (0 errores)**.
- **`apps/web/tsconfig.json`:**
  Extiende `../../tsconfig.json`. Agrega `"jsx": "react-jsx"`, `"lib": ["DOM", "DOM.Iterable", "ESNext"]`, `"noEmit": true`.
  - Verificación actual: `bun run build:web` (ejecuta `tsc -b && vite build`) → **Exit code 0 (2140 módulos transformados, 0 errores)**.
- **`packages/shared/tsconfig.json`:**
  Actualmente **NO EXISTE**.
  - Al ejecutar `bunx tsc --noEmit -p packages/shared/tsconfig.json` produce el error:
    `error TS5058: The specified path does not exist: 'packages/shared/tsconfig.json'.`
  - La creación de este archivo es una mejora clave de DX y tipado para permitir chequear `packages/shared` en aislamiento.

### 1.4. Hallazgo Crítico de Compatibilidad en Consumidor Frontend (`apps/web/src/App.tsx`)
Al inspeccionar `apps/web/src/App.tsx`:
- Líneas 74–75:
  ```tsx
  {health?.syncState?.baseline_seeded === 1
    ? `Último sync exitoso: ${new Date(health.syncState.last_success_at).toLocaleTimeString()}`
    : 'Esperando primer ciclo de sincronización (Fase 0 y 1).'}
  ```
- **Riesgo Detectado:** Si `GET /api/health` migra a `sync_state` (snake_case) sin mantener compatibilidad con `syncState` (camelCase), `health?.syncState` en la PWA devolverá `undefined` y la interfaz mostrará permanentemente el banner en estado "Esperando primer ciclo de sincronización".
- **Solución Requerida:** `EnhancedHealthResponseSchema` debe declarar tanto `sync_state` como el alias retrocompatible opcional `syncState`, y `lastRun` junto con `recent_runs`.

---

## 2. Logic Chain (Cadena Lógica)

1. **Preservación 100% de Esquemas Existentes (Premisa 1):**
   - Los 7 esquemas y tipos existentes modelan el estado interno de SQLite D1 y el resultado del login de Moodle.
   - Ninguno debe modificarse en nombres ni en estructura para evitar romper el motor de sincronización (`apps/worker/src/sync/`), las migraciones o futuras referencias.
   - Los nuevos esquemas de Fase 3 corresponden a contratos API REST (filtros de ruta, query params y payloads de respuesta). Se nombran de forma ortogonal (e.g. `DashboardCourseSchema` vs `CourseSchema`, `DashboardResponseSchema`, `EnhancedHealthResponseSchema`).

2. **Resolución de Módulos sin Compilación Intermedia (Premisa 2):**
   - `packages/shared/package.json` expone `"main": "./src/index.ts"` y `"types": "./src/index.ts"`.
   - Con `"moduleResolution": "bundler"` en el root `tsconfig.json`, TypeScript en `apps/worker` y `apps/web` resuelve directamente el archivo fuente TypeScript a través de los symlinks del workspace.
   - No hay necesidad de compilar a `dist/` para que los consumidores consuman los tipos o esquemas durante el desarrollo o el typechecking con `tsc`.
   - `bun run build:shared` genera `packages/shared/dist/index.js` en 29ms para empaquetado autónomo si se requiere.

3. **Arquitectura del Barrel en `packages/shared/src/index.ts` (Premisa 3):**
   - Una única fuente de verdad consolidada en `packages/shared/src/index.ts` (~240 líneas en total) es superior a fragmentar en 7 micro-archivos de 20 líneas:
     - Evita problemas de rutas relativas o re-exportaciones circulares.
     - Simplifica las importaciones directas en `apps/worker` y `apps/web`: `import { DashboardResponseSchema, type DashboardResponse } from '@better-moodle/shared';`.
     - Facilita la auditoría y mantenimiento continuo.

4. **Coerción de Parámetros de Ruta en Hono (Premisa 4):**
   - En Hono, los parámetros de URL como `:id` siempre se leen como cadenas (`string`).
   - Por tanto, `CourseContentsParamsSchema` y `CourseGradesParamsSchema` deben usar obligatoriamente `z.coerce.number().int().positive()`. Esto previene fallos de tipado al validar `c.req.param()`.

5. **Mitigación de Regresión en Frontend (Premisa 5):**
   - Al incorporar `syncState: SyncStateSchema.nullable().optional()` y `lastRun: SyncRunSchema.nullable().optional()` dentro de `EnhancedHealthResponseSchema`, garantizamos que `apps/web/src/App.tsx` siga funcionando sin requerir cambios simultáneos en el frontend.

---

## 3. Caveats (Advertencias y Limitaciones)

1. **Falta de `packages/shared/tsconfig.json` actual:**
   - Actualmente `packages/shared` compila porque los consumidores (`worker` y `web`) resuelven sus tipos dentro de sus propios contextos de compilación.
   - Se provee en este reporte la configuración recomendada de `packages/shared/tsconfig.json` para que el agente implementador pueda crearlo sin riesgos.
2. **Normalización de Hostname en `FileProxyQuerySchema`:**
   - El host de Moodle (`catedig.itlalaguna.edu.mx`) debe normalizarse con `.toLowerCase()` antes de la comparación para evitar rechazos accidentales si el cliente envía encabezados o URLs en mayúsculas.
3. **Comportamiento de `bun build` vs `tsc`:**
   - `bun build` empaqueta el JS sin emitir `.d.ts`. Dado que `types` en `package.json` apunta a `./src/index.ts`, `tsc` en los proyectos dependientes usa directamente el código fuente TS, lo cual es el estándar moderno de monorepos Bun/Vite.

---

## 4. Conclusion (Diseño Final y Especificación Completa)

### 4.1. Catálogo de Esquemas y Tipos a Exportar (23 Esquemas + 23 Tipos)

| # | Categoría | Zod Schema | TypeScript Type | Propósito |
|---|---|---|---|---|
| 1 | DB Base | `CourseSchema` | `Course` | Fila tabla D1 `courses` (Preservado) |
| 2 | DB Base | `SyncedItemTypeSchema` | `SyncedItemType` | Enum `'assignment' \| 'grade' \| 'announcement'` (Preservado) |
| 3 | DB Base | `SubmissionStatusSchema` | `SubmissionStatus` | Enum `'pending' \| 'draft' \| 'submitted' \| 'graded'` (Preservado) |
| 4 | DB Base | `SyncedItemSchema` | `SyncedItem` | Fila tabla D1 `synced_items` (Preservado) |
| 5 | DB Base | `SyncStateSchema` | `SyncState` | Fila singleton tabla D1 `sync_state` (Preservado) |
| 6 | DB Base | `SyncRunSchema` | `SyncRun` | Fila tabla D1 `sync_runs` (Preservado) |
| 7 | DB Base | `MoodleTokenResponseSchema` | `MoodleTokenResponse` | Respuesta API token Moodle (Preservado) |
| 8 | Dashboard | `DashboardCourseSchema` | `DashboardCourse` | Materia para vista consolidada |
| 9 | Dashboard | `UpcomingAssignmentSchema` | `UpcomingAssignment` | Tarea pendiente con fecha límite |
| 10 | Dashboard | `RecentActivityItemSchema` | `RecentActivityItem` | Noticia/tarea reciente modificada |
| 11 | Dashboard | `DashboardGradeSchema` | `DashboardGrade` | Resumen de calificación en dashboard |
| 12 | Dashboard | `DashboardResponseSchema` | `DashboardResponse` | Payload completo `GET /api/dashboard` |
| 13 | Contenidos | `CourseContentsParamsSchema` | `CourseContentsParams` | Validador params `:id` (`GET /api/courses/:id/contents`) |
| 14 | Contenidos | `CourseResourceFileSchema` | `CourseResourceFile` | Archivo descargable / URL proxied |
| 15 | Contenidos | `CourseModuleSchema` | `CourseModule` | Recurso, tarea o foro dentro de sección |
| 16 | Contenidos | `CourseSectionSchema` | `CourseSection` | Sección temática de la materia |
| 17 | Contenidos | `CourseContentsResponseSchema` | `CourseContentsResponse` | Payload completo `GET /api/courses/:id/contents` |
| 18 | Calificaciones | `CourseGradesParamsSchema` | `CourseGradesParams` | Validador params `:id` (`GET /api/courses/:id/grades`) |
| 19 | Calificaciones | `GradeItemDetailSchema` | `GradeItemDetail` | Calificación detallada por actividad |
| 20 | Calificaciones | `CourseGradesResponseSchema` | `CourseGradesResponse` | Payload completo `GET /api/courses/:id/grades` |
| 21 | Salud | `SubrequestMetricsSchema` | `SubrequestMetrics` | Métricas de presupuesto de subpeticiones |
| 22 | Salud | `EnhancedHealthResponseSchema` | `EnhancedHealthResponse` | Payload enriquecido `GET /api/health` |
| 23 | Proxy / Error | `FileProxyQuerySchema` | `FileProxyQuery` | Validación estricta anti-SSRF `GET /api/files/proxy` |
| 24 | Proxy / Error | `ApiErrorResponseSchema` | `ApiErrorResponse` | Payload estándar de error HTTP |

---

### 4.2. Código Drop-in para `packages/shared/src/index.ts`

El siguiente bloque de código debe ser aplicado directamente por el agente implementador en `packages/shared/src/index.ts`:

```typescript
import { z } from 'zod';

// ============================================================================
// 1. BASE DATABASE ENTITIES & SYNC MODELS (100% PRESERVED BACKWARD COMPATIBLE)
// ============================================================================

export const CourseSchema = z.object({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  progress: z.number().nullable().optional(),
  payload_json: z.string().nullable().optional(),
  refreshed_at: z.number()
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
  subrequests_used: z.number().optional(),
  items_changed: z.number().optional(),
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

// ============================================================================
// 2. DASHBOARD SCHEMAS & TYPES (GET /api/dashboard)
// ============================================================================

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
  course_name: z.string().optional(),
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
  course_name: z.string().optional(),
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
  course_name: z.string().optional(),
  title: z.string(),
  grade_num: z.number().nullable(),
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

// ============================================================================
// 3. COURSE CONTENTS SCHEMAS & TYPES (GET /api/courses/:id/contents)
// ============================================================================

export const CourseContentsParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});
export type CourseContentsParams = z.infer<typeof CourseContentsParamsSchema>;

export const CourseResourceFileSchema = z.object({
  filename: z.string(),
  fileurl: z.string(),
  filesize: z.number().nullable().optional(),
  mimetype: z.string().nullable().optional(),
  timemodified: z.number().nullable().optional(),
  proxy_url: z.string().optional()
});
export type CourseResourceFile = z.infer<typeof CourseResourceFileSchema>;

export const CourseModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  instance: z.number().optional(),
  modname: z.string(),
  url: z.string().nullable().optional(),
  contents: z.array(CourseResourceFileSchema).optional()
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const CourseSectionSchema = z.object({
  id: z.number(),
  name: z.string(),
  visible: z.number().optional(),
  summary: z.string().optional(),
  modules: z.array(CourseModuleSchema)
});
export type CourseSection = z.infer<typeof CourseSectionSchema>;

export const CourseContentsResponseSchema = z.object({
  course_id: z.number(),
  sections: z.array(CourseSectionSchema),
  synced_at: z.number().nullable()
});
export type CourseContentsResponse = z.infer<typeof CourseContentsResponseSchema>;

// ============================================================================
// 4. COURSE GRADES SCHEMAS & TYPES (GET /api/courses/:id/grades)
// ============================================================================

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
  feedback: z.string().nullable().optional(),
  timemodified: z.number(),
  url: z.string().nullable().optional()
});
export type GradeItemDetail = z.infer<typeof GradeItemDetailSchema>;

export const CourseGradesResponseSchema = z.object({
  course_id: z.number(),
  grades: z.array(GradeItemDetailSchema)
});
export type CourseGradesResponse = z.infer<typeof CourseGradesResponseSchema>;

// ============================================================================
// 5. ENHANCED HEALTH SCHEMAS & TYPES (GET /api/health)
// ============================================================================

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
  syncState: SyncStateSchema.nullable().optional(), // Alias de retrocompatibilidad para apps/web/src/App.tsx
  recent_runs: z.array(SyncRunSchema),
  lastRun: SyncRunSchema.nullable().optional(), // Alias de retrocompatibilidad
  failure_rate: z.number(),
  subrequests: SubrequestMetricsSchema
});
export type EnhancedHealthResponse = z.infer<typeof EnhancedHealthResponseSchema>;

// ============================================================================
// 6. SECURE FILE PROXY SCHEMAS & TYPES (GET /api/files/proxy)
// ============================================================================

export const FileProxyQuerySchema = z.object({
  url: z.string().url().refine((val) => {
    try {
      const parsed = new URL(val);
      return (
        parsed.protocol === 'https:' &&
        parsed.hostname.toLowerCase() === 'catedig.itlalaguna.edu.mx' &&
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

// ============================================================================
// 7. API ERROR SCHEMAS & TYPES (Standard Error Responses)
// ============================================================================

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional()
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
```

---

### 4.3. Configuración Recomendada de `packages/shared/tsconfig.json`

Crear el archivo `packages/shared/tsconfig.json` con la siguiente configuración estándar:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext"]
  },
  "include": ["src/**/*"]
}
```

---

## 5. Verification Method (Método de Verificación Independiente)

El implementador y orquestador pueden verificar de forma determinista la correcta integración ejecutando:

1. **Construcción y empaquetado de `packages/shared`:**
   ```bash
   bun run build:shared
   ```
   *Criterio de éxito:* Sale con código 0 y genera `packages/shared/dist/index.js`.

2. **Verificación de tipado en `apps/worker`:**
   ```bash
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Criterio de éxito:* Sale con código 0 y 0 errores.

3. **Verificación de build de producción en `apps/web`:**
   ```bash
   bun run build:web
   ```
   *Criterio de éxito:* Sale con código 0, compila con Vite y `tsc -b` sin errores de tipo.

4. **Verificación independiente de tipos en `packages/shared` (tras crear su tsconfig):**
   ```bash
   bunx tsc --noEmit -p packages/shared/tsconfig.json
   ```
   *Criterio de éxito:* Sale con código 0 y 0 errores.

5. **Prueba de importación en tiempo de ejecución:**
   ```bash
   bun --cwd apps/worker -e "import { DashboardResponseSchema, CourseContentsParamsSchema, FileProxyQuerySchema } from '@better-moodle/shared'; console.log('All schemas loaded cleanly!');"
   ```
   *Criterio de éxito:* Imprime `All schemas loaded cleanly!` y sale con código 0.

6. **Condiciones de Invalidación:**
   - Si se altera el nombre o campos de alguno de los primeros 7 esquemas (`CourseSchema`, `SyncedItemSchema`, etc.), se invalidaría la compatibilidad hacia atrás.
   - Si se omite `syncState` en `EnhancedHealthResponseSchema`, `apps/web/src/App.tsx` sufrirá regresión visual en la interfaz de usuario.
