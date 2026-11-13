# Fase 3 — API de Lectura (BFF) y Proxy Seguro

**Estado:** Completada ✅  
**Objetivo:** Exponer las rutas REST en Hono que alimentarán todas las vistas de la PWA leyendo exclusivamente desde D1, además de un proxy seguro para descargar recursos sin exponer el `wstoken` al cliente.

---

## Lista de Actividades

- [x] Construir `GET /api/dashboard` (resumen consolidado de materias, tareas próximas, recientes y calificaciones desde D1).
- [x] Construir `GET /api/courses/:id/contents` (cacheado en D1 o sincronizado bajo demanda controlada para recursos del curso).
- [x] Construir `GET /api/courses/:id/grades` (calificaciones normalizadas por materia desde D1).
- [x] Enriquecer `GET /api/health` con historial reciente de `sync_runs`, tasa de fallos y subpeticiones consumidas.
- [x] Implementar `GET /api/files/proxy` (RF-04):
  - [x] Validar URL objetivo con allowlist estricta de host (`catedig.itlalaguna.edu.mx`) y prefijo `/webservice/pluginfile.php` para mitigar SSRF.
  - [x] Inyectar `MOODLE_TOKEN` únicamente en el servidor al hacer el stream hacia el cliente.
- [x] Revisar y validar esquemas de entrada/salida con Zod en `packages/shared`.

---

## Notas

### Decisiones Técnicas Implementadas (Milestones M1–M3)
1. **Migración D1 (`0003_phase3_course_contents.sql`)**:
   - Se creó la tabla `course_contents` con clave foránea `course_id REFERENCES courses(id) ON DELETE CASCADE`, almacenando `sections_json TEXT` y `updated_at INTEGER`. Aplicada localmente mediante `bun run d1:migrate:local`.
2. **Esquemas Compartidos y Blindaje SSRF (`packages/shared/src/index.ts`)**:
   - Se definieron 24 esquemas Zod y tipos TypeScript para respuestas BFF (`DashboardResponseSchema`, `CourseContentsResponseSchema`, `CourseGradesResponseSchema`, `EnhancedHealthResponseSchema`, `ApiErrorResponseSchema`) y validación de entrada (`FileProxyQuerySchema`).
   - `FileProxyQuerySchema` aplica análisis estricto WHATWG URL (solo `https:`, host exacto `catedig.itlalaguna.edu.mx`, puerto `443` o vacío, sin *userinfo*, prefijo `/webservice/pluginfile.php`) y decodificación iterativa anti-traversal y anti-doble codificación.
3. **Modularización de Routers (`apps/worker/src/routes/`)**:
   - `dashboard.ts`: Consolida materias inscritas, tareas próximas (`due_date >= now AND deleted_at IS NULL`), actividad reciente acotada a máximo 15 items ordenados `timemodified DESC`, y calificaciones actuales. Valida salida contra `DashboardResponseSchema`.
   - `courses.ts`: Expone `GET /api/courses`, `GET /api/courses/:id/contents` (con fallback seguro `{ course_id, sections: [], synced_at: null }` y tolerancia a JSON corrupto) y `GET /api/courses/:id/grades` (preservando `grade_num: null`).
   - `health.ts`: Consulta `sync_state` y últimos 15 `sync_runs`. Calcula `failure_rate` y telemetría de subpeticiones (`max_budget: 45`, `last_used`, `avg_recent`, `max_recent`) con protección contra división por cero.
   - `items.ts` y `sync.ts`: Preservan consulta de ítems y trigger manual con rate limit de 30 s.
   - `proxy.ts` (Milestone M3): Implementa `GET /api/files/proxy`. Valida con `FileProxyQuerySchema`, elimina parámetros `token`/`wstoken` forjados por el cliente, inyecta `MOODLE_TOKEN` en servidor, ejecuta `fetch` con `redirect: 'manual'` y timeout de 15 s, rechaza códigos `3xx`/`4xx`/`5xx` del origen con `502 Bad Gateway` sin filtrar trazas ni tokens, filtra cabeceras mediante allowlist segura (`set-cookie` excluida) y añade `x-content-type-options: nosniff`.
4. **Concurrencia en D1 y Garantía RNF-02**:
   - Se utilizó `Promise.all` para lecturas D1 concurrentes. Cero llamadas salientes a Moodle en todas las rutas de lectura, verificado en tests con `createForbiddenFetchGuard`.

### Contingencia en Teamwork y Cierre
- El equipo `teamwork` completó M1 (`packages/shared`), M2 (rutas de lectura + migración `0003`) y la suite de pruebas E2E, deteniéndose por límite de cuota (`429 RESOURCE_EXHAUSTED`) con `proxy.ts` en stub `501`.
- Se completó directamente `apps/worker/src/routes/proxy.ts` (M3), se aplicó la migración `0003` en D1 local y se creó el runner de pruebas de mutación en `scripts/run-mutation-tests.ts` (`bun run test:mutation`).

### Verificación Final Aprobada
- `bun test`: **333 pass, 0 fail** (910 aserciones en 11 archivos, incluyendo Tiers 1–4 E2E y 120 pruebas hostiles SSRF).
- `bun run test:mutation`: **10/10 mutantes eliminados (100%)** en `proxy.ts`, `dashboard.ts`, `courses.ts` y `health.ts`.
- `bunx tsc --noEmit -p apps/worker/tsconfig.json`: 0 errores.
- `bun run build:shared` y `bun run build:web`: compilación exitosa sin errores.
