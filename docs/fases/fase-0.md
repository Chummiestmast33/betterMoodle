# Fase 0 — Gate de Validación (Semáforo)

**Estado:** Completada 🟢  
**Objetivo:** Validar que `catedig.itlalaguna.edu.mx` expone el servicio móvil de Moodle (`moodle_mobile_app`) y verificar cuáles de las 7 funciones requeridas están habilitadas antes de construir la aplicación.

---

## Lista de Actividades

- [x] Verificar conectividad y respuesta de `POST /login/token.php` con `service=moodle_mobile_app`.
- [x] Crear script de validación [check-moodle-gate.ts](file:///c:/Users/corte/Downloads/betterMoodle/scripts/check-moodle-gate.ts).
- [x] Crear script [get-token.ts](file:///c:/Users/corte/Downloads/betterMoodle/scripts/get-token.ts) para extraer el `wstoken` completo sin censura.
- [x] Consultar `core_webservice_get_site_info` con el `wstoken` del usuario.
- [x] Confirmar las 7 funciones requeridas (`core_enrol_get_users_courses`, `mod_assign_get_assignments`, `mod_assign_get_submission_status`, `core_course_get_contents`, `gradereport_user_get_grade_items`, `mod_forum_get_forums_by_courses`, `mod_forum_get_forum_discussions`).
- [x] Evaluar resultado del semáforo: **🟢 VERDE**.

---

## Notas

- El servidor institucional `https://catedig.itlalaguna.edu.mx` tiene habilitado Moodle Mobile Web Services sin bloqueo por SSO/CAS en `login/token.php`.
- Todas las funciones requeridas en el plan v2 arrojaron disponibilidad completa, por lo que no fue necesario recortar requerimientos ni activar el Plan B.
- Se decidió mantener `get-token.ts` separado de `check-moodle-gate.ts` para permitir copiar fácilmente el `wstoken` en `.dev.vars` sin exponerlo por error en capturas del semáforo.
