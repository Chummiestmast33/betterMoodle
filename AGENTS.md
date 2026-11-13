# Instrucciones para Agentes (`AGENTS.md`) — BetterMoodle

Este archivo define las reglas obligatorias de trabajo, arquitectura y documentación para cualquier agente o desarrollador que trabaje en este repositorio.

---

## 1. Gestión por Fases (Regla Obligatoria)

Todo el desarrollo del proyecto sigue las fases definidas en `plan.md` y debe documentarse en la carpeta `docs/fases/` manteniendo **un archivo Markdown por cada fase** (`fase-0.md`, `fase-1.md`, `fase-2.md`, ..., `fase-6.md`).

### Estructura obligatoria de cada archivo de fase
Cada archivo `docs/fases/fase-X.md` **debe incluir**:
1. **Encabezado con estado:** Nombre de la fase, objetivo y estado actual (`Pendiente` | `En progreso` | `Completada`).
2. **Lista de actividades (Checklist):** Tareas concretas con checkboxes Markdown (`- [ ]` / `- [x]`).
   - Al completar una actividad o sub-tarea, **marca inmediatamente su checkbox como `[x]`** en el archivo correspondiente.
3. **Sección de Notas (`## Notas`):** Espacio dedicado para registrar:
   - Decisiones técnicas tomadas durante la fase.
   - Errores encontrados y cómo se resolvieron.
   - Criterios de salida verificados o pendientes de la siguiente fase.

> **Regla de continuidad:** Antes de iniciar trabajo en una fase, lee su archivo en `docs/fases/` y revisa el estado de la fase anterior. Al terminar cualquier bloque de trabajo, actualiza la lista de actividades y agrega notas relevantes.

---

## 2. Principios Arquitectónicos No Negociables

1. **La ruta de lectura nunca toca Moodle:**
   - Ningún endpoint interactivo (`/api/*`) debe hacer `fetch` hacia `catedig.itlalaguna.edu.mx` (excepto `/api/files/proxy` bajo allowlist estricta en Fase 3 y `/api/sync/manual` con rate limit).
   - Solo el Worker en `scheduled()` (o el trigger manual controlado) consulta Moodle y escribe en Cloudflare D1.
   - La PWA lee exclusivamente de D1.
2. **Mismo origen obligatorio (RNF-09):**
   - El frontend (`apps/web/dist`) y el backend (`/api/*`) se sirven desde el mismo Cloudflare Worker mediante Static Assets (`apps/worker/wrangler.jsonc`).
3. **Presupuesto de subpeticiones (RNF-05):**
   - Límite duro de Cloudflare Workers gratuitos (~50 subpeticiones por invocación). Cortar con `status = 'partial'` al acercarse a 45 subpeticiones.
   - Usar llamadas batch (`courseids[]`) y `DB.batch()` para escrituras en D1.
4. **Seguridad de credenciales (RNF-01):**
   - Nunca guardar ni loguear contraseñas ni tokens (`MOODLE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `ENCRYPTION_KEY`) en código, git ni respuestas al cliente.
   - Verificar que `.dev.vars` y `.env` permanezcan en `.gitignore`.

---

## 3. Convenciones del Monorepo

- **Gestor de paquetes y runtime local:** `bun` (`bun install`, `bun run ...`).
- **Validación de tipos:** Ejecutar `bunx tsc --noEmit -p apps/worker/tsconfig.json` y `bun run build:web` después de modificar código en `worker`, `web` o `shared`.
- **Migraciones D1:** Todo cambio de esquema SQL va en `apps/worker/migrations/` con numeración incremental (`0002_...sql`) y debe probarse localmente con `bun run d1:migrate:local`.
