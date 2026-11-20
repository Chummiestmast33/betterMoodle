# Fase 5 — Despliegue a Producción y Validación Real

**Estado:** En progreso 🔄 (Desplegada en producción, pendiente validación en dispositivos y observación de 7 días)  
**Objetivo:** Publicar el Worker unificado (Static Assets + API + Cron) en Cloudflare (`*.workers.dev`) y monitorear una semana completa de operación en dispositivos reales.

---

## Lista de Actividades

- [x] Autenticar CLI con Cloudflare (`bun --cwd apps/worker wrangler login` — cuenta `cortezrodriguezpablo@gmail.com`).
- [x] Crear la base de datos D1 remota (`bun --cwd apps/worker wrangler d1 create catedig-db`, UUID `80d817b5-da14-44b4-8a5b-9a8e2e1ec0cf`) y actualizar `database_id` en `apps/worker/wrangler.jsonc`.
- [x] Aplicar migraciones en producción (`bun run d1:migrate:prod` — `0001`, `0002`, `0003` aplicadas y confirmadas).
- [x] Cargar secretos de producción con `wrangler secret put` / `wrangler secret bulk` (`MOODLE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `VAPID_PRIVATE_JWK`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`) mediante `bun run secrets:push`.
- [x] Configurar endurecimiento de producción (`run_worker_first: ["/api/*"]`, sin CORS abierto `*`, `robots.txt` y cabecera `X-Robots-Tag: noindex, nofollow`) y auditar bundle de producción (`bun run audit:dist`).
- [x] Desplegar con `bun run deploy` (`https://better-moodle-worker.better-moodle-worker.workers.dev`, Cron `*/5 * * * *`).
- [x] Verificar sembrado inicial en producción (`baseline_seeded = 1`) y lectura/proxy en remoto (`bun run tail` disponible para monitoreo continuo).
- [ ] Verificar funcionamiento en escritorio, Android e iOS 16.4+ (instalación PWA + Web Push + deep-links + proxy de archivos).
- [ ] Observar estabilidad durante 7 días continuos antes de evaluar Fase 6.

---

## Notas

- **Pre-despliegue implementado:**
  - Se agregó `run_worker_first: ["/api/*"]` y `observability.enabled = true` en `apps/worker/wrangler.jsonc` para evitar que `single-page-application` intercepte `/api/files/proxy` o `/api/health`.
  - Se eliminó CORS abierto `*` en `apps/worker/src/index.ts`, manteniendo arquitectura estricta de mismo origen (RNF-09) más `X-Robots-Tag: noindex, nofollow` y `apps/web/public/robots.txt`.
  - Se creó `scripts/audit-dist.ts` (`bun run audit:dist`) y `scripts/push-secrets.ts` (`bun run secrets:push` mediante `wrangler secret bulk` por `stdin` en una operación atómica y silenciosa).
- **Despliegue y verificación en vivo (19/11/2026):**
  - URL desplegada: `https://better-moodle-worker.better-moodle-worker.workers.dev` (Version ID: `76ee92dd-6f25-4cf5-b18a-e127f368089f`, Cron `*/5 * * * *`).
  - D1 remota `catedig-db` (`80d817b5-da14-44b4-8a5b-9a8e2e1ec0cf`, región `WNAM`) con migraciones `0001`, `0002`, `0003` aplicadas.
  - Primer sync real ejecutado en producción (`POST /api/sync/manual`): HTTP `200`, `status: "ok"`, `coursesCount: 3`, `subrequestsUsed: 21`, `baselineSeeded: true` (sin spam inicial).
  - `/api/health`: `status: "ok"`, `baseline_seeded: 1`, cabecera `X-Robots-Tag: noindex, nofollow`, sin `Access-Control-Allow-Origin`.
  - `/api/dashboard`: HTTP `200`, `courses: 3`, `upcoming_assignments: 3`, `current_grades: 36`, `recent_activity: 15`.
  - `/api/courses/127/contents` (`SisOpAD2026`): `sections: 8`, `files: 16`.
  - `/api/files/proxy`: HTTP `200`, `content-type: application/pdf`, `20525` bytes transmitidos desde Moodle sin token en `proxy_url`.
  - `/api/push/status`: HTTP `200`, `configured: true`, llave pública VAPID expuesta y sin fuga de `VAPID_PRIVATE_JWK`.
  - `/` + `/assets/index-tOhIwY9Z.css` + `/robots.txt`: HTTP `200`.
- **Opcional (Cloudflare Access):** En el panel de Cloudflare Zero Trust (`Access > Applications`) puedes proteger `better-moodle-worker.better-moodle-worker.workers.dev` con autenticación por correo gratuito si deseas restringir acceso adicional durante la semana de prueba.
- **Límites capa gratuita Cloudflare:** Workers (100k req/día, tope 50 subpeticiones/invocación; Cron `*/5 * * * *` = 288 req/día, usando ~21 subpeticiones en ciclo completo); D1 (5M lecturas/día, 100k escrituras/día, 5 GB).
