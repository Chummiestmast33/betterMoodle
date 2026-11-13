# Reporte de Investigación y Handoff — Explorer M1_2: Validación Zod, Coerción y Allowlist SSRF

**Agente:** `teamwork_explorer_m1_2`  
**Destinatario:** Sub-Orquestador M1 (`dc71187e-54b6-4d3f-84a5-374f2e0f0356`)  
**Fecha:** 2026-11-12T20:43:00Z  
**Alcance:** Diseño exhaustivo de esquemas Zod, prevención de SSRF en `FileProxyQuerySchema`, análisis de coerción de parámetros de ruta (`CourseContentsParamsSchema`, `CourseGradesParamsSchema`), estructura estándar de salud (`EnhancedHealthResponseSchema`, `SubrequestMetricsSchema`), errores de API (`ApiErrorResponseSchema`) y recomendaciones de mutation testing.

---

## 1. Observation (Observaciones Directas)

### 1.1. Estado Actual de `packages/shared/src/index.ts`
- **Archivo:** `packages/shared/src/index.ts` (líneas 1-78)
  - Actualmente exporta 7 entidades base de sincronización:
    - `CourseSchema` / `Course` (líneas 3-12)
    - `SyncedItemTypeSchema` / `SyncedItemType` (líneas 14-15)
    - `SubmissionStatusSchema` / `SubmissionStatus` (líneas 17-18)
    - `SyncedItemSchema` / `SyncedItem` (líneas 20-37)
    - `SyncStateSchema` / `SyncState` (líneas 39-53)
    - `SyncRunSchema` / `SyncRun` (líneas 55-65)
    - `MoodleTokenResponseSchema` / `MoodleTokenResponse` (líneas 67-78)
  - **Carencia:** No existen esquemas para parámetros de consulta/ruta ni payloads de respuesta de los endpoints de la Fase 3 (`/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`, `/api/files/proxy`).

### 1.2. Comportamiento Observado del Parser WHATWG `URL` en Bun v1.3.14
Se ejecutaron pruebas directas con comandos de shell evaluando URLs contra el parser nativo WHATWG `new URL(val)`:
1. **Comportamiento de `host` vs `hostname` y puertos:**
   - Para `https://catedig.itlalaguna.edu.mx:8080/webservice/pluginfile.php`:
     - `parsed.hostname` = `'catedig.itlalaguna.edu.mx'`
     - `parsed.port` = `'8080'`
     - `parsed.host` = `'catedig.itlalaguna.edu.mx:8080'`
   - Para `https://catedig.itlalaguna.edu.mx:443/...`:
     - `parsed.hostname` = `'catedig.itlalaguna.edu.mx'`
     - `parsed.port` = `''`
     - `parsed.host` = `'catedig.itlalaguna.edu.mx'`
   - *Hallazgo crítico:* Si un esquema solo valida `parsed.hostname === 'catedig.itlalaguna.edu.mx'`, un atacante puede especificar puertos arbitrarios como `:8080`, `:22` o `:8443` para atacar servicios internos en la misma red o eludir proxies. Se debe validar estrictamente `(parsed.port === '' || parsed.port === '443')` o verificar que `parsed.host === 'catedig.itlalaguna.edu.mx'`.

2. **Vulnerabilidad de Prefijo en Pathname (`startsWith` sin delimitador):**
   - Para `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php_evil`:
     - `parsed.pathname` = `'/webservice/pluginfile.php_evil'`
     - `pathname.startsWith('/webservice/pluginfile.php')` evalúa a `true` (falso positivo peligroso).
   - Para `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php.bak`:
     - `pathname.startsWith('/webservice/pluginfile.php')` evalúa a `true`.
   - *Hallazgo crítico:* Para evitar el bypass de prefijo, la validación debe requerir que `parsed.pathname === '/webservice/pluginfile.php' || parsed.pathname.startsWith('/webservice/pluginfile.php/')`.

3. **Normalización de Path Traversal en el parser:**
   - Para `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/../../admin`:
     - `parsed.pathname` se normaliza automáticamente a `'/admin'`, por lo que falla `startsWith('/webservice/pluginfile.php')`.
   - Para `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%2e%2e/admin`:
     - Bun normaliza `%2e%2e` a `/webservice/admin`, bloqueando el prefijo.
   - Para `%252e%252e` (doble codificación): `decodeURIComponent(parsed.pathname)` revela `%2e%2e`.
   - *Medida de defensa en profundidad:* Validar que ni `parsed.pathname` ni `decodeURIComponent(parsed.pathname)` contengan `..` ni caracteres de control (`[\x00-\x1F\x7F]`).

4. **Credenciales en URL (Userinfo):**
   - Para `https://user:pass@catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1`:
     - `parsed.username` = `'user'`, `parsed.password` = `'pass'`.
     - *Hallazgo:* Deben rechazarse explícitamente URLs con `username` o `password` (`!parsed.username && !parsed.password`).

### 1.3. Comportamiento Observado en Coerción de Números en Zod (`z.coerce.number()`)
Se ejecutaron pruebas de coerción con Bun:
- `{"id": "123"}` -> éxito, coerciona a número entero `123`.
- `{"id": "0"}` -> `.positive()` rechaza correctamente con mensaje *"Number must be greater than 0"*.
- `{"id": "-5"}` -> `.positive()` rechaza correctamente.
- `{"id": "12.34"}` -> `.int()` rechaza correctamente con mensaje *"Expected integer, received float"*.
- `{"id": "abc"}` -> rechaza con mensaje *"Expected number, received nan"*.
- `{"id": ""}` o `{"id": "   "}` -> `Number("")` es 0; `.positive()` lo rechaza.
- `{"id": true}` -> `Number(true)` es 1; `z.coerce.number()` lo acepta como `1` (comportamiento JS nativo).
- `{"id": "0x10"}` -> `Number("0x10")` es 16 en base hexadecimal.

---

## 2. Logic Chain (Cadena Lógica)

1. **Requerimiento R2 (Proxy Seguro y Mitigación de SSRF):**
   - El endpoint `GET /api/files/proxy?url=...` actúa como un túnel HTTP hacia Moodle para no filtrar el token en el cliente.
   - Todo proxy abierto es un vector primario de Server-Side Request Forgery (SSRF) hacia infraestructura interna de Cloudflare, metadatos (`169.254.169.254`), localhost (`127.0.0.1`, `[::1]`) o servidores de terceros.
   - La allowlist debe verificar en tiempo de validación:
     1. Protocolo estrictamente `https:` (sin `http:`, `file:`, `javascript:`, etc.).
     2. Hostname estrictamente `catedig.itlalaguna.edu.mx` en minúsculas.
     3. Puerto restringido a estándar HTTPS (puerto vacío o `'443'`).
     4. Ausencia total de credenciales embebidas (`username` o `password`).
     5. Pathname delimitado: exactamente `'/webservice/pluginfile.php'` o comenzando con `'/webservice/pluginfile.php/'`.
     6. Ausencia de secuencias de escape de directorio `..` tanto en la URL cruda como en `decodeURIComponent`.
     7. Ausencia de bytes nulos (`\0` o `%00`) y caracteres de control ASCII.

2. **Preservación de Parámetros y Manejo de Tokens en Proxy:**
   - Las URLs devueltas por Moodle para archivos (por ejemplo `core_course_get_contents`) contienen sufijos de consulta válidos como `?forcedownload=1`.
   - Si un cliente intenta enviar un parámetro `token` o `wstoken` en la URL enviada al proxy, el servidor nunca debe reutilizarlo.
   - En la implementación del Worker, el handler debe eliminar cualquier `token` o `wstoken` de `searchParams` y fijar server-side `searchParams.set('token', env.MOODLE_TOKEN)`.
   - Al realizar el `fetch` saliente a Moodle, debe usarse `{ redirect: 'manual' }` o validar el header `Location` resultante para evitar que un redirect en Moodle conduzca a SSRF secundario.

3. **Requerimiento R1 (Métricas de Salud y Tasa de Fallos en `/api/health`):**
   - La tabla `sync_runs` en D1 registra las ejecuciones (`status: 'ok' | 'partial' | 'error'`, `subrequests_used`, `items_changed`).
   - Si el sistema se acaba de inicializar y `sync_runs` está vacío, `recent_runs.length === 0`.
   - La división `failure_count / recent_runs.length` causaría `0 / 0 = NaN`. Por tanto, el cálculo debe proteger contra división por cero retornando `0`.
   - El estado de salud se clasifica en 4 valores:
     - `'circuit_open'`: Si `sync_state.circuit_open_until > Math.floor(Date.now() / 1000)`.
     - `'error'`: Si `consecutive_failures >= 3` o si la base de datos no responde.
     - `'degraded'`: Si `consecutive_failures > 0` pero menor a 3, o si el último run tuvo status `'partial'`, o si `failure_rate > 0.25`.
     - `'ok'`: Sin fallos activos, circuito cerrado y ejecuciones recientes correctas.
   - Las métricas de subpeticiones (`SubrequestMetricsSchema`) contrastan el uso reciente contra el presupuesto máximo (`max_budget = 45`), reportando `last_used`, `max_budget`, `avg_recent` y `max_recent`.

4. **Estandarización de Errores de API (`ApiErrorResponseSchema`):**
   - Hono y los clientes PWA requieren una forma homogénea para serializar errores HTTP (400, 403, 404, 429, 500).
   - Estructura: `{ error: string, code?: string, details?: unknown, status?: string }`.
   - Permite devolver mensajes legibles al usuario, códigos de error legibles por máquina (`SSRF_BLOCKED`, `COURSE_NOT_FOUND`, `RATE_LIMITED`), y en `details` la lista de issues de Zod cuando falla la validación.

5. **Coerción de Parámetros de Ruta (`CourseContentsParamsSchema`, `CourseGradesParamsSchema`):**
   - En Hono, los parámetros de ruta `c.req.param('id')` son de tipo `string`.
   - Usar `z.coerce.number().int().positive()` es el estándar idiomático de Zod y Hono.
   - Como refuerzo ante inyecciones exóticas (e.g. `0x10`), puede emplearse validación de dígitos decimales positivos `/^[1-9]\d*$/` con transformación a número.

---

## 3. Caveats (Advertencias y Limitaciones)

1. **Subrequest Budget de Cloudflare Workers (RNF-05):**
   - El endpoint `/api/files/proxy` realiza una subpetición saliente (`fetch`) hacia Moodle.
   - En Cloudflare Workers gratuitos, cada invocación de worker tiene un límite de 50 subpeticiones. Una petición al proxy consume 1 subpetición, por lo que está ampliamente dentro del presupuesto de subpeticiones individuales.
2. **Streaming de Archivos Grandes en Proxy:**
   - El worker debe transmitir el body directamente al cliente como stream (`res.body`), con cabeceras `Content-Type`, `Content-Length`, `Content-Disposition`, eliminando cualquier header de autenticación (`Set-Cookie`) que provenga de Moodle.
3. **Casos sin registros previos en D1:**
   - Tanto `sync_state` como `sync_runs` pueden ser `null` o listas vacías en entornos recién desplegados. Los esquemas `EnhancedHealthResponseSchema` definen `sync_state: SyncStateSchema.nullable().optional()`, y los cálculos deben asumir valores predeterminados seguros (`failure_rate: 0`, `last_used: 0`, `avg_recent: 0`, `max_recent: 0`).

---

## 4. Conclusion (Especificación Completa de Esquemas para `packages/shared`)

A continuación se presenta el código completo y validado que debe integrarse en `packages/shared/src/index.ts`:

### 4.1. Código Completo de Nuevos Esquemas Zod

```typescript
// ============================================================================
// FASE 3: ESQUEMAS PARA READ API (BFF) Y SECURE PROXY
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Dashboard (GET /api/dashboard)
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// 2. Course Contents (GET /api/courses/:id/contents)
// ----------------------------------------------------------------------------

export const CourseContentsParamsSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'El ID de curso debe ser un entero positivo' })
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
  description: z.string().nullable().optional(),
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

// ----------------------------------------------------------------------------
// 3. Course Grades (GET /api/courses/:id/grades)
// ----------------------------------------------------------------------------

export const CourseGradesParamsSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'El ID de curso debe ser un entero positivo' })
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

// ----------------------------------------------------------------------------
// 4. Health & Subrequests (GET /api/health)
// ----------------------------------------------------------------------------

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
  failure_rate: z.number().min(0).max(1),
  subrequests: SubrequestMetricsSchema
});
export type EnhancedHealthResponse = z.infer<typeof EnhancedHealthResponseSchema>;

// ----------------------------------------------------------------------------
// 5. Secure Resource Proxy (GET /api/files/proxy)
// ----------------------------------------------------------------------------

export const FileProxyQuerySchema = z.object({
  url: z.string().url('URL inválida').refine((val) => {
    try {
      const parsed = new URL(val);
      // 1. Protocolo estrictamente HTTPS
      if (parsed.protocol !== 'https:') return false;
      // 2. Hostname exactamente catedig.itlalaguna.edu.mx
      if (parsed.hostname.toLowerCase() !== 'catedig.itlalaguna.edu.mx') return false;
      // 3. Puerto estrictamente estándar HTTPS (sin port spoofing)
      if (parsed.port !== '' && parsed.port !== '443') return false;
      // 4. Sin credenciales en URL
      if (parsed.username || parsed.password) return false;
      // 5. Pathname delimitado a pluginfile.php
      const pathname = parsed.pathname;
      if (pathname !== '/webservice/pluginfile.php' && !pathname.startsWith('/webservice/pluginfile.php/')) {
        return false;
      }
      // 6. Protección anti directory-traversal (crudo y decodificado)
      const decodedPath = decodeURIComponent(pathname);
      if (decodedPath.includes('..') || pathname.includes('..')) return false;
      // 7. Bloqueo de caracteres de control y bytes nulos
      if (/[\x00-\x1F\x7F]/.test(decodedPath) || /[\x00-\x1F\x7F]/.test(val)) return false;

      return true;
    } catch {
      return false;
    }
  }, {
    message: 'URL rechazada: debe ser HTTPS, host catedig.itlalaguna.edu.mx y ruta /webservice/pluginfile.php'
  })
});
export type FileProxyQuery = z.infer<typeof FileProxyQuerySchema>;

// ----------------------------------------------------------------------------
// 6. Standard API Errors
// ----------------------------------------------------------------------------

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
  status: z.string().optional()
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
```

### 4.2. Matriz de Casos de Prueba y Mutation Testing (R4)

Para la implementación de tests en `apps/worker` y el cumplimiento de mutation testing, se diseñó la siguiente matriz de mutantes y aserciones requeridas:

| Componente | Mutante Inducido | Vector / Entrada de Prueba | Resultado Esperado | Test que Mata al Mutante |
|---|---|---|---|---|
| `FileProxyQuerySchema` | Aceptar protocolo `http:` | `http://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/1` | Rechazado con 400 | `test('rechaza URLs sin HTTPS')` |
| `FileProxyQuerySchema` | Relajar host con `includes` | `https://catedig.itlalaguna.edu.mx.evil.com/webservice/...` | Rechazado con 400 | `test('rechaza dominios maliciosos con sufijo falso')` |
| `FileProxyQuerySchema` | Ignorar puerto | `https://catedig.itlalaguna.edu.mx:8080/webservice/...` | Rechazado con 400 | `test('rechaza puertos no estándar')` |
| `FileProxyQuerySchema` | Prefijo sin slash delimitador | `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php_evil` | Rechazado con 400 | `test('rechaza prefijo sin delimitador de ruta')` |
| `FileProxyQuerySchema` | Deshabilitar check traversal | `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%2e%2e/admin` | Rechazado con 400 | `test('rechaza path traversal codificado')` |
| `FileProxyQuerySchema` | Permitir userinfo | `https://admin:pass@catedig.itlalaguna.edu.mx/webservice/...` | Rechazado con 400 | `test('rechaza URLs con userinfo embebido')` |
| `Proxy Endpoint` | No purgar token del cliente | `url=...?token=stolen_token` | Petición a Moodle usa `env.MOODLE_TOKEN` | `test('sobrescribe token cliente con server token')` |
| `Proxy Endpoint` | Fuga de token en cabeceras | Respuesta exitosa / error | Ningún header ni body contiene `env.MOODLE_TOKEN` | `test('garantiza zero token leak')` |
| `Health Endpoint` | División por cero si 0 runs | Base de datos D1 sin filas en `sync_runs` | `failure_rate: 0`, HTTP 200 | `test('calcula métricas de salud con 0 runs sin NaN')` |
| `Health Endpoint` | Estado con circuito abierto | `sync_state.circuit_open_until = now + 300` | `status: 'circuit_open'` | `test('reporta circuit_open cuando está activo')` |
| `Params Coercion` | Aceptar ID negativo | `GET /api/courses/-1/contents` | HTTP 400 con error de validación | `test('rechaza IDs de curso negativos')` |
| `Params Coercion` | Aceptar ID cero | `GET /api/courses/0/contents` | HTTP 400 | `test('rechaza ID de curso 0')` |
| `Params Coercion` | Aceptar no numérico | `GET /api/courses/abc/contents` | HTTP 400 | `test('rechaza ID de curso alfanumérico')` |

---

## 5. Verification Method (Método de Verificación Independiente)

Para verificar independientemente este diseño y los esquemas propuestos:

1. **Prueba de compilación e importación de esquemas en Bun:**
   Ejecutar en la raíz del monorepo:
   ```bash
   bun --cwd packages/shared -e "
     import * as schemas from './src/index';
     console.log('Exported keys:', Object.keys(schemas));
   "
   ```
2. **Validación de tipos estáticos en el monorepo:**
   ```bash
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   bun run build:web
   ```
3. **Ejecución de suite de validación de vectores SSRF:**
   ```bash
   bun test
   ```
4. **Condición de Invalidación:**
   Si la autoridad del dominio de Moodle cambia (`catedig.itlalaguna.edu.mx` a otro host de ITL) o si la ruta de `pluginfile.php` cambia de prefijo, la allowlist en `FileProxyQuerySchema` deberá actualizarse con la nueva tupla autorizada.
