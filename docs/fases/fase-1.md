# Fase 1 — MVP de Alertas y Caché D1

**Estado:** Completada ✅  
**Objetivo:** Tener un Cloudflare Worker funcional con D1 local que sincronice materias y tareas desde Moodle, evite inundación en el primer run (`baseline_seeded`) y envíe notificaciones agregadas por Telegram.

---

## Lista de Actividades

- [x] Inicializar monorepo Bun (`apps/web`, `apps/worker`, `packages/shared`) y `.gitignore` protegiendo `.dev.vars` y `.env`.
- [x] Configurar `wrangler.jsonc` con binding `DB` (D1), Static Assets (`../web/dist`) y Cron Trigger (`*/5 * * * *`).
- [x] Crear y aplicar migración núcleo `0001_initial_schema.sql` (`courses`, `synced_items`, `sync_state`, `sync_runs`, `push_subscriptions`).
- [x] Configurar credenciales locales en `apps/worker/.dev.vars` (`MOODLE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
- [x] Implementar cliente Moodle tipado en `apps/worker/src/moodle/client.ts` (timeout 10 s, backoff exponencial, manejo de excepciones y contador de subpeticiones).
- [x] Implementar notificador agregado de Telegram en `apps/worker/src/notify/telegram.ts`.
- [x] Implementar motor de sincronización y diff en `apps/worker/src/sync/engine.ts` (`baseline_seeded`, tombstones y *dead man's switch*).
- [x] Conectar `scheduled()` y agregar endpoint `POST /api/sync/manual` en `apps/worker/src/index.ts`.
- [x] Probar localmente con `bun run dev` (`wrangler dev --test-scheduled`) y `curl "http://localhost:8787/__scheduled"`.
- [x] Verificar recepción de mensaje en Telegram y visualización de materias/tareas en `http://localhost:8787`.

---

## Notas

- **Error resuelto (Telegram 400 `chat not found`):** En las primeras dos pruebas el cron sincronizó D1 correctamente pero falló al enviar el mensaje a Telegram con error `400 Bad Request: chat not found`. Causa: la API de bots de Telegram impide que un bot escriba primero al usuario hasta que el usuario inicie el chat presionando **Start** (`/start`) en el bot. Tras enviar `/start`, la sincronización y alerta funcionaron correctamente.
- **Mismo origen:** El frontend en Vite se compila a `apps/web/dist` y lo sirve el mismo Worker bajo `http://localhost:8787`, cumpliendo desde Fase 1 con RNF-09.
- **Criterio de salida recomendado:** Mantener el cron en observación 48 h para confirmar cero falsos positivos antes o durante la Fase 2.
