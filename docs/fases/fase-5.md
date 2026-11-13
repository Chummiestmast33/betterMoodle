# Fase 5 — Despliegue a Producción y Validación Real

**Estado:** Pendiente ⏳  
**Objetivo:** Publicar el Worker unificado (Static Assets + API + Cron) en Cloudflare y monitorear una semana completa de operación en dispositivos reales.

---

## Lista de Actividades

- [ ] Autenticar CLI con Cloudflare (`bunx wrangler login`).
- [ ] Crear la base de datos D1 remota (`bunx wrangler d1 create catedig-db`) y actualizar `database_id` en `apps/worker/wrangler.jsonc`.
- [ ] Aplicar migraciones en producción (`bun run d1:migrate:prod`).
- [ ] Cargar secretos de producción con `wrangler secret put` (`MOODLE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `VAPID_PRIVATE_KEY`, etc.).
- [ ] Auditar bundle de producción (`grep -r` sobre `apps/web/dist` para verificar que ningún secreto se filtró al frontend).
- [ ] Desplegar con `bun run build` y `bunx wrangler deploy --cwd apps/worker`.
- [ ] Monitorear logs en vivo con `bunx wrangler tail --cwd apps/worker`.
- [ ] Verificar funcionamiento en escritorio, Android e iOS (instalación PWA + Web Push + deep-links).
- [ ] Observar estabilidad durante 7 días continuos antes de evaluar Fase 6.

---

## Notas

- *Pendiente de iniciar.* Recordar revisar los límites vigentes de la capa gratuita de Cloudflare Workers y D1 antes de desplegar.
