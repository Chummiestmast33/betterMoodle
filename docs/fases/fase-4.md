# Fase 4 — Interfaz PWA Completa y Web Push

**Estado:** Completada ✅  
**Objetivo:** Construir la experiencia completa de usuario en React 19 + Tailwind, con deep-links al Moodle oficial, instalabilidad PWA y notificaciones Web Push secundarias.

---

## Lista de Actividades

- [x] Diseñar navegación y vistas principales en `apps/web`:
  - [x] Vista **Resumen** (`apps/web/src/views/OverviewView.tsx`: pendientes urgentes, últimos avisos y calificaciones recientes).
  - [x] Vista **Tareas** (`apps/web/src/views/TasksView.tsx`: filtros por estado `pendiente`, `próxima`, `entregada`, `vencida` y ordenación por fecha límite).
  - [x] Vista **Materia** (`apps/web/src/views/CourseDetailView.tsx`: recursos descargables vía `/api/files/proxy`, desglose de calificaciones y avisos, sincronizando `course_contents` cada 6 horas).
  - [x] Vista **Salud del Sync** (`apps/web/src/views/HealthView.tsx`: último sync exitoso, historial de `sync_runs`, presupuesto de subpeticiones y botón de sync manual).
  - [x] Vista **Configuración** (`apps/web/src/views/SettingsView.tsx`: activación de notificaciones Web Push, prueba de envío y modo compacto persistido en `localStorage`).
- [x] Verificar **deep-links** a Moodle oficial por `cmid` (`apps/web/src/lib/format.ts`: `/mod/assign/view.php?id=CMID`, `/mod/forum/discuss.php?d=ID`, URLs directas de módulos/quizzes cuando están disponibles y `/course/view.php?id=ID`).
- [x] Configurar `vite-plugin-pwa` (`manifest.webmanifest` + Service Worker `apps/web/src/sw.ts` con estrategia `injectManifest`, íconos en `apps/web/public/icons/` y metadatos Apple en `apps/web/index.html`).
- [x] Implementar Web Push (canal secundario):
  - [x] Generar llaves VAPID en `apps/worker/.dev.vars` mediante `bun run vapid:generate` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT`; pendiente subir a producción con `wrangler secret put` en Fase 5/6).
  - [x] Endpoints `GET /api/push/status`, `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe` y `POST /api/push/test` en `apps/worker/src/routes/push.ts`.
  - [x] Listeners `push` y `notificationclick` en `apps/web/src/sw.ts` con soporte para navegación por `?view=...`.
  - [x] Purga automática de suscripciones expiradas (`410` / `404`) en `apps/worker/src/notify/webpush.ts` usando `@pushforge/builder`.
- [x] Implementar UX mobile-first (barra inferior móvil + cabecera responsiva en `apps/web/src/App.tsx`) e instrucciones guiadas para iOS 16.4+ (en `apps/web/src/lib/push.ts` y `SettingsView.tsx`, exigiendo modo standalone/pantalla de inicio y gesto explícito del usuario antes de solicitar permiso).

---

## Notas

- La vista Kanban de tareas quedó diferida para v1.1 según `plan.md`; en v1 se priorizó la lista ordenada por fecha límite con filtros rápidos por estado.
- **Web Push en Workers:** Se utilizó `@pushforge/builder@2.0.5` (`buildPushHTTPRequest`), compatible nativamente con Web Crypto en Cloudflare Workers y Bun, evitando dependencias de Node (`web-push` / `node:crypto`). El formato esperado de `VAPID_PRIVATE_JWK` es JSON JWK ECDSA P-256 generado con `bun run vapid:generate`.
- **Sincronización de contenidos (`apps/worker/src/sync/contents.ts`):** Se integró `syncCourseContents` al motor de sincronización con caché de 6 horas (`21600s`), corte temprano por presupuesto de subpeticiones (`remainingBudget <= 3`), eliminación de parámetros `token`/`wstoken` en URLs de Moodle y generación automática de `proxy_url` hacia `/api/files/proxy`.
- **Resolución de compilación:** Se corrigió la importación `@better-moodle/shared` y el uso de propiedades reales de `SyncedItem` (`item_type`) y `EnhancedHealthResponse` (`status`) en `apps/web/src/App.tsx`, además de conectar `App.tsx` con `@tanstack/react-query` (`useQuery`) para que las invalidaciones desde `HealthView` refresquen automáticamente todas las vistas.
- **Verificación ejecutada:**
  - `bun test` -> `339 pass, 0 fail` (941 assertions across 12 files, incluyendo `apps/worker/test/phase4.test.ts`).
  - `bun run test:mutation` -> `10/10` mutantes eliminados.
  - `bunx tsc --noEmit -p apps/worker/tsconfig.json` -> exit 0.
  - `bun run build:shared` -> exit 0.
  - `bun run build:web` -> exit 0 (`dist/manifest.webmanifest`, `dist/registerSW.js`, `dist/sw.js` con 12 entradas en precache).
- **Pendiente de verificación en dispositivo real (al desplegar HTTPS en Fase 5/6):** Probar instalación "Agregar a pantalla de inicio" y entrega real de Web Push en iOS 16.4+ Safari y Android Chrome, además de cargar los secretos `VAPID_*` con `wrangler secret put`.
