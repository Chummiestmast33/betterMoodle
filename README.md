# BetterMoodle (`catedig-plus`)

> **Cliente PWA moderno y motor de sincronización de alertas para el Moodle institucional del ITL (`catedig.itlalaguna.edu.mx`).**

---

## 1. Visión y Principio de Arquitectura

El objetivo principal de **BetterMoodle** no es solo mejorar la estética de la plataforma universitaria, sino **eliminar la latencia crítica de avisos**:
Moodle institucional procesa notificaciones y correos a través de un cron interno con colas que suelen retrasar los avisos por horas. Al conectarse directamente a la API de **Moodle Mobile Web Services**, este sistema detecta cambios en tiempo real y notifica inmediatamente por Telegram.

### Principio Vinculante (Lectura Zero-Touch)
> **La ruta interactiva de lectura nunca toca el servidor de Moodle.** 
> Solo el Cron Worker consulta la API de Moodle y actualiza Cloudflare D1. La PWA lee de forma exclusiva e instantánea de la base de datos D1 en el Edge de Cloudflare (<1.5 s de respuesta garantizada, inmune a caídas del servidor universitario).
>
> Para acciones de escritura crítica (envío de tareas, cuestionarios, foros), el sistema utiliza **deep-links** directos al Moodle oficial con el identificador de módulo (`cmid`).

---

## 2. Stack Tecnológico

| Capa | Tecnología | Propósito |
| --- | --- | --- |
| **Runtime & Gestor** | [Bun](https://bun.sh/) (v1.3+) | Monorepo de alto rendimiento, ejecución de TypeScript y gestión de paquetes. |
| **Backend & Cron** | [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono](https://hono.dev/) | API REST ultraligera y tareas programadas (`crons: ["*/5 * * * *"]`). |
| **Base de Datos** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) | Base de datos relacional serverless para caché de materias, tareas y observabilidad. |
| **Frontend PWA** | React 19 + [Vite](https://vite.dev/) + TypeScript | Single Page Application y PWA responsiva optimizada para móvil y escritorio. |
| **Estilos & UI** | Tailwind CSS + Lucide Icons | Interfaz moderna, modo oscuro por defecto y diseño adaptativo. |
| **Estado Cliente** | [TanStack Query](https://tanstack.com/query) (React Query) | Gestión de caché, estados de carga y sincronización en la UI. |
| **Alertas Primarias** | Telegram Bot API | Notificaciones push inmediatas sin depender de permisos complejos de navegador. |
| **Validación** | [Zod](https://zod.dev/) | Validación de esquemas y tipos compartidos cliente/servidor. |

---

## 3. Estructura del Monorepo

```text
betterMoodle/
├── apps/
│   ├── web/                     # Aplicación Frontend (React 19 + Vite + Tailwind)
│   │   ├── src/
│   │   │   ├── App.tsx          # Dashboard, panel de materias y estado
│   │   │   ├── main.tsx         # Punto de entrada de React con QueryClient
│   │   │   └── index.css        # Directivas de Tailwind CSS
│   │   ├── vite.config.ts       # Proxy local a /api y configuración de build
│   │   └── package.json
│   │
│   └── worker/                  # Cloudflare Worker (Hono + Cron + D1)
│       ├── migrations/
│       │   └── 0001_initial_schema.sql  # Esquema D1 (courses, synced_items, sync_state, sync_runs)
│       ├── src/
│       │   └── index.ts         # Endpoints /api/health, /api/courses, /api/items y scheduled()
│       ├── wrangler.jsonc       # Configuración de Cloudflare Workers, Assets y D1
│       ├── .dev.vars.example    # Plantilla de variables de entorno y secretos
│       └── package.json
│
├── packages/
│   └── shared/                  # Paquete de tipos compartidos y validación con Zod
│       ├── src/
│       │   └── index.ts         # Modelos: Course, SyncedItem, SyncState, SyncRun
│       └── package.json
│
├── scripts/
│   └── check-moodle-gate.ts     # Script de validación de Fase 0 (Semáforo de WebServices)
│
├── .gitignore                   # Protección estricta de secretos (.dev.vars, .env)
├── package.json                 # Monorepo root con Bun workspaces
├── tsconfig.json                # Configuración global de TypeScript
└── plan.md                      # Plan de desarrollo y arquitectura v2
```

---

## 4. Estado de Herramientas y Requisitos

Todas las herramientas principales ya se encuentran verificadas e instaladas en el entorno:

- [x] **Bun**: v1.3.14 (instalado)
- [x] **Node.js**: v24.18.0 (instalado)
- [x] **Wrangler**: v4.161.0 (instalado como CLI en el proyecto)
- [x] **Git**: v2.53.0 (repositorio inicializado)
- [x] **Dependencias**: 340 paquetes instalados en el monorepo
- [x] **D1 Migrations**: Migración `0001_initial_schema.sql` aplicada con éxito localmente
- [x] **Web Build**: Build de Vite para producción verificado (`dist/`)

---

## 5. Guía de Puesta en Marcha (Paso a Paso)

### Paso 1: Instalar dependencias (ya completado)
```bash
bun install
```

### Paso 2: Fase 0 — Gate de Validación (Semáforo de WebServices)
Antes de continuar con el desarrollo de la sincronización de tareas, se debe validar que el endpoint de Moodle de tu cuenta permita el servicio móvil:

```bash
# Validar conectando con tus credenciales institucionales:
bun run gate:check <NUMERO_DE_CONTROL> <CONTRASENA>

# O si ya tienes un wstoken generado:
bun run gate:check --token <TU_WSTOKEN>
```

#### Criterio del Semáforo:
- 🟢 **Verde**: Token válido y las 7 funciones requeridas disponibles (`core_enrol_get_users_courses`, `mod_assign_get_assignments`, `mod_assign_get_submission_status`, `core_course_get_contents`, `gradereport_user_get_grade_items`, `mod_forum_get_forums_by_courses`, `mod_forum_get_forum_discussions`).
- 🟡 **Amarillo**: Token válido pero faltan funciones secundarias (calificaciones o foros). Se adaptan los módulos.
- 🔴 **Rojo**: El servicio móvil está deshabilitado en el servidor institucional. Se activa el **Plan B** (userstyle Stylus + puente de calendario `authtoken`).

### Paso 3: Configurar variables locales
Copia el archivo de ejemplo en `apps/worker`:

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Edita `apps/worker/.dev.vars` con tus credenciales:
```env
MOODLE_TOKEN=tu_wstoken_obtenido_en_fase_0
MOODLE_URL=https://catedig.itlalaguna.edu.mx
TELEGRAM_BOT_TOKEN=tu_token_de_botfather
TELEGRAM_CHAT_ID=tu_chat_id
```

### Paso 4: Ejecutar migraciones D1 locales
```bash
bun run d1:migrate:local
```

### Paso 5: Compilar el Frontend e Iniciar el Entorno
```bash
# 1. Compilar el frontend para que Cloudflare Workers sirva los Static Assets
bun run build:web

# 2. Iniciar el servidor local de desarrollo del Worker (API + Frontend en el mismo origen: http://localhost:8787)
bun run dev
```

Abre tu navegador en: [http://localhost:8787](http://localhost:8787)

Para desarrollo con Hot Module Replacement (HMR) en el cliente:
```bash
bun run dev:web
```
(Se ejecutará en `http://localhost:3000` con proxy automático a `/api` en el puerto `8787`).

---

## 6. Probar el Cron Trigger Localmente

Cloudflare Workers permite simular la ejecución del Cron Trigger sin esperar los 5 minutos:

```bash
# Con el worker corriendo en modo dev (wrangler dev --test-scheduled):
curl "http://localhost:8787/__scheduled"
```

Esto disparará el evento `scheduled` en `apps/worker/src/index.ts` para ejecutar el ciclo de sincronización y registrar el estado en `sync_runs`.

---

## 7. Despliegue en Cloudflare (Producción)

Cuando estés listo para desplegar en tu cuenta de Cloudflare:

1. **Autenticar Wrangler con tu cuenta:**
   ```bash
   bunx wrangler login
   ```

2. **Crear la base de datos D1 remota:**
   ```bash
   bunx wrangler d1 create catedig-db
   ```
   *Copia el `database_id` devuelto y actualízalo en `apps/worker/wrangler.jsonc`.*

3. **Aplicar migraciones en producción:**
   ```bash
   bun run d1:migrate:prod
   ```

4. **Configurar los secretos de producción:**
   ```bash
   bunx wrangler secret put MOODLE_TOKEN --cwd apps/worker
   bunx wrangler secret put TELEGRAM_BOT_TOKEN --cwd apps/worker
   bunx wrangler secret put TELEGRAM_CHAT_ID --cwd apps/worker
   ```

5. **Construir y desplegar:**
   ```bash
   bun run build
   bunx wrangler deploy --cwd apps/worker
   ```

---

## 8. Seguridad y Reglas Críticas

1. **Nunca subir secretos:** `.dev.vars`, `.env`, y las carpetas `.wrangler/` están estrictamente ignoradas por Git en `.gitignore`.
2. **Presupuesto de Subpeticiones (Hard Cap de 50):** El Cron Worker debe respetar el límite gratuito de Cloudflare Workers; las consultas a materias se realizan en lote con `courseids[]` para no exceder las subpeticiones.
3. **Mismo Origen Obligatorio (RNF-09):** Frontend y Backend residen bajo el mismo Worker utilizando **Static Assets**, garantizando compatibilidad con cookies de sesión `HttpOnly` y `SameSite=Strict`.
