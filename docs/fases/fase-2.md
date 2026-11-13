# Fase 2 — Endurecimiento del Motor de Sincronización

**Estado:** Completada ✅  
**Objetivo:** Incorporar calificaciones, avisos de foros, prórrogas individuales y blindar el motor contra límites de subpeticiones, caídas de Moodle y fallos silenciosos.

---

## Lista de Actividades

- [x] Añadir métodos en `MoodleClient`: `getGradeItems` (`gradereport_user_get_grade_items`), `getForumsByCourses` (`mod_forum_get_forums_by_courses`), `getForumDiscussions` (`mod_forum_get_forum_discussions`) y `getSubmissionStatus` (`mod_assign_get_submission_status`).
- [x] Implementar polling escalonado (§4.4 de `plan.md`):
  - [x] Caché de cursos (`core_enrol_get_users_courses`) cada ~6 horas.
  - [x] Calificaciones y foros cada ~30 minutos (rotando por `grades_synced_at ASC` y `forums_synced_at ASC`).
- [x] Normalizar calificaciones en campo numérico `grade_num` (`REAL`) para evitar falsos positivos entre `"85.00000"` y `"85.00"`.
- [x] Indexar avisos de foros usando clave `discussion_<id>` (id de la discusión, nunca del foro).
- [x] Consultar `mod_assign_get_submission_status` para reflejar prórrogas individuales, entregas grupales y estado real (`pending`, `draft`, `submitted`, `graded`).
- [x] Implementar jitter aleatorio y circuit breaker ante fallos repetidos de Moodle.
- [x] Implementar corte preventivo de subpeticiones al acercarse a 45 cerrando el ciclo con `status = 'partial'` y reanudando en el siguiente ciclo.
- [x] Probar el *dead man's switch* (RF-10) forzando un fallo y verificando la alerta en Telegram tras >30 min sin sync exitoso.

---

## Notas

- **Migración D1 `0002_phase2_sync_metadata.sql`:** Se añadieron columnas para polling escalonado por materia (`grades_synced_at`, `forums_synced_at`), estado de entrega (`submission_status`, `status_synced_at`), banderas anti-inundación para nuevos tipos (`grades_seeded`, `forums_seeded`), caché de usuario/cursos (`moodle_user_id`, `courses_refreshed_at`) y estado de resiliencia (`circuit_open_until`, `dead_man_alerted`).
- **Error resuelto (`mod_forum_get_forum_discussions` -> `invalidparameter`):** Al probar contra `catedig.itlalaguna.edu.mx` se detectó que enviar `sortorder: 0` provoca `Invalid parameter value detected` en Moodle. Se eliminó `sortorder` para usar el valor por defecto del servidor y se añadió el nombre de `wsfunction` en los mensajes de `MoodleError`.
- **Verificación real contra D1 local y Moodle:**
  - Primer ciclo completo de Fase 2 indexó `28` tareas (con `submission_status` real: `5` pendientes, `2` entregadas) y `36` ítems de calificación en `8` subpeticiones sin inundar Telegram.
  - Ciclo en estado estable (*steady-state* con cachés vigentes) consumió solo **1 subpetición** (`status: 'ok'`).
- **Pruebas automatizadas y build:** `bun test` (`4 pass, 0 fail` en `apps/worker/src/sync/phase2.test.ts` cubriendo normalización numérica, formato Telegram, corte por presupuesto, circuit breaker y *dead man's switch*), `bunx tsc --noEmit -p apps/worker/tsconfig.json`, `bun run build:shared` y `bun run build:web` aprobaron sin errores.
