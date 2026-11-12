# Plan de Desarrollo v2 — Cliente PWA y Sistema de Alertas para Moodle (`catedig.itlalaguna.edu.mx`)

**Versión:** 2.0 · **Fecha:** 13 de noviembre de 2026 · **Estado:** borrador de ingeniería
**Delta respecto a v1:** ver §7.3 (Registro de cambios)

---

## 1. Visión General del Proyecto

Construir una Progressive Web App rápida, estética y responsiva que actúe como interfaz moderna sobre el Moodle institucional, acompañada de un worker de sincronización que avise ante nuevas tareas, avisos o calificaciones.

### 1.1. Tesis del proyecto

El retraso de las notificaciones institucionales **no es un problema de interfaz**: es el cron de notificaciones de Moodle y su cola de correo. Al leer directamente por Web Services, este sistema **se salta esa cola por completo**. Esa es la ventaja medible; la estética es secundaria.

### 1.2. Estrategia Arquitectónica: Modelo Híbrido

| Dominio | Responsable | Alcance |
| --- | --- | --- |
| Lectura, organización y alertas | PWA + Cloudflare | Materias, recursos, calendario de tareas, calificaciones, notificaciones |
| Escritura crítica | Moodle oficial (deep-links) | Entregas, cuestionarios, foros: se abre la actividad exacta (`cmid`) en el sitio institucional |

No se reimplementan motores de evaluación, cuestionarios cronometrados ni verificación antiplagio.

### 1.3. Principio de arquitectura (nuevo, vinculante)

> **La ruta de lectura nunca toca Moodle.** Solo el cron escribe en D1. La PWA lee exclusivamente de D1.

Consecuencias: el RNF de rendimiento se vuelve alcanzable, las caídas del servidor universitario son invisibles para el usuario, y las peticiones interactivas no consumen el presupuesto de subpeticiones.

### 1.4. Alcance por etapas

- **Fases 0–5:** un solo usuario (tú). Es el producto completo y útil.
- **Fase 6:** multiusuario por invitación. **Condicionada** a los pre-requisitos de §7.2. No se inicia hasta cerrarlos.

---

## 2. Stack Tecnológico y Runtime

Ecosistema TypeScript de punta a punta. Bun en desarrollo local, Cloudflare en producción.

| Capa | Tecnología | Justificación / cambio respecto a v1 |
| --- | --- | --- |
| Entorno de desarrollo | **WSL2 + Ubuntu** | Bun y Wrangler se instalan en WSL, no en PowerShell. El código vive en `~/` (ext4), nunca en `/mnt/c` ni en OneDrive. |
| Runtime y CLI | Bun + Wrangler | TS nativo, instalación rápida. `wrangler dev` emula `workerd` y D1 local. |
| Frontend | React 19 + Vite + TS | HMR y `vite-plugin-pwa` (Workbox). |
| UI | Tailwind + shadcn/ui + Lucide | Modo oscuro, componentes accesibles. |
| Estado cliente | TanStack Query | Caché y revalidación. **No sustituye** la caché de servidor en D1. |
| Backend / BFF + Cron | Workers + Hono | API REST y Cron Triggers. |
| Base de datos | Cloudflare D1 (SQLite) | Fuente de verdad de la UI y estado de sincronización. **SQL crudo en v1**; Drizzle es opcional y posterior. |
| Alertas — canal primario | **Telegram Bot** | Se implementa primero: sin VAPID, sin Service Worker, sin rarezas de iOS. |
| Alertas — canal secundario | Web Push (`pushforge`) | Se añade en Fase 4, una vez que el motor de sync es fiable. |
| Hosting | **Un solo Worker con Static Assets** | PWA y `/api/*` en el **mismo origen**. Requisito para que la cookie de sesión funcione (RNF-09). |
| Validación | Zod | Esquemas compartidos cliente/servidor. |

---

## 3. Requerimientos del Sistema

### 3.1. Requerimientos Funcionales

| ID | Requerimiento | Detalle de implementación | Fase |
| --- | --- | --- | --- |
| **RF-01** | Obtención de token | `POST /login/token.php` con `service=moodle_mobile_app`. **Bloqueado por el gate de Fase 0.** | 0 |
| **RF-02** | Panel de materias | Lee de D1 (`courses`), no de Moodle. Progreso, nombre corto, docente, accesos. | 3–4 |
| **RF-03** | Gestión y filtrado de tareas | Estados: pendiente / próxima / entregada / vencida. **Las prórrogas individuales y entregas grupales requieren `mod_assign_get_submission_status`; `duedate` base no las refleja.** Tareas eliminadas por el docente se marcan con tombstone, no desaparecen en silencio. | 2–4 |
| **RF-04** | Explorador y descarga de recursos | `core_course_get_contents`. **Descarga vía proxy del Worker** (`/api/files/proxy`), que inyecta el token en servidor. El token **nunca** se anexa a una URL entregada al cliente. *(Corrige la contradicción de v1.)* | 3–4 |
| **RF-05** | Calificaciones | `gradereport_user_get_grade_items`. **Normalización numérica** (`REAL`), nunca comparación de cadenas: `"85.00000"` no es igual a `"85.00"`. | 2–4 |
| **RF-06** | Deep-links al Moodle oficial | `.../mod/assign/view.php?id=CMID`, `.../mod/quiz/view.php?id=CMID`. | 4 |
| **RF-07** | Detección de cambios (polling) | Cada 5 min con jitter. Detecta: tareas nuevas, cambios de fecha límite, calificaciones nuevas y **avisos en foros** (`mod_forum_get_forums_by_courses` + `mod_forum_get_forum_discussions`, explícitos). Primer run silencioso (`baseline_seeded`). Backoff exponencial ante 429/5xx. Presupuesto de subpeticiones (§4.4). | 2 |
| **RF-08** | Notificaciones | **Agregadas**: un mensaje por ciclo y dispositivo ("3 tareas nuevas, 1 calificación"), no una por ítem. Telegram primero, Web Push después. Purga de suscripciones con `410`/`404`. | 1 / 4 |
| **RF-09** | Instalabilidad PWA y offline | `manifest.webmanifest` + Service Worker (`injectManifest`). **Diferido a v1.1**: la caché de TanStack Query ya cubre lectura degradada. | 4 |
| **RF-10** | Panel de salud del sync | Vista de último sync exitoso, fallos consecutivos y errores. **Dead man's switch**: sin sync exitoso en >30 min, alerta por Telegram. | 2 |
| **RF-11** | Inicio de sesión institucional delegado | Formulario, Worker valida allowlist, intercambia credenciales en Moodle, descarta la contraseña, cifra el `wstoken`, emite cookie JWT `HttpOnly`. | 6 |
| **RF-12** | Control de acceso por invitación | Endpoints de rol `admin` para alta/baja en `allowed_users` y desactivación de usuarios. Revocar de la allowlist desactiva al usuario y borra sus tokens. | 6 |
| **RF-13** | Cierre de sesión y reautenticación | Logout borra cookie e invalida la sesión en servidor. `invalidtoken` de Moodle, `is_active = 0`, `401` al cliente y redirección a login. | 6 |

### 3.2. Requerimientos No Funcionales

| ID | Requerimiento | Criterio verificable |
| --- | --- | --- |
| **RNF-01** | Seguridad de credenciales | La contraseña no se persiste ni se registra en logs. Monousuario: `wstoken` en `wrangler secret`. Multiusuario: cifrado en D1 (RNF-07). |
| **RNF-02** | Rendimiento | Carga <1.5 s **medida contra D1**, no contra Moodle. Ninguna ruta interactiva hace `fetch` al servidor universitario. |
| **RNF-03** | Respeto al servidor | Cron de al menos 5 min (`*/5 * * * *`) + jitter aleatorio. Backoff exponencial con techo. Circuit breaker tras N fallos. |
| **RNF-04** | Multiplataforma | Mobile-first. Web Push en iOS 16.4 o superior, solo con la PWA instalada en pantalla de inicio y permiso solicitado desde un gesto del usuario. |
| **RNF-05** | Costo cero y presupuesto | Capa gratuita. **Tope duro de ~50 subpeticiones por invocación** (verificar límites vigentes; los 500 MB de D1 citados en v1 son de la alpha). El cron debe contabilizar y detenerse antes del tope. |
| **RNF-06** | Calidad y mantenibilidad | Monorepo TS estricto, Zod, tipos compartidos. |
| **RNF-07** | Cifrado en reposo | `wstoken` cifrado con **AES-256-GCM** (Web Crypto). IV de 12 bytes único por cifrado. `ENCRYPTION_KEY` = 32 bytes aleatorios en base64, **no una passphrase**. Columna `key_version` para permitir rotación. |
| **RNF-08** | Aislamiento por usuario | `user_id` se deriva **exclusivamente** del JWT verificado en el middleware. Jamás de parámetros del cliente. Toda query lo incluye. |
| **RNF-09** | Mismo origen | PWA y API bajo el mismo dominio. Con `pages.dev` + `workers.dev` separados, `SameSite=Strict` **impide el envío de la cookie** y el login no funciona. |
| **RNF-10** | Anti fuerza bruta | `/api/auth/login`: máx. 5 intentos por usuario cada 15 min + límite por IP. Moodle bloquea cuentas tras N fallos: un ataque a través del proxy **bloquea la cuenta del compañero**. Respuesta de error genérica para no filtrar la allowlist. |
| **RNF-11** | No fallo silencioso | Todo fallo de sync se registra en `sync_runs` y se alerta. Un sistema de avisos que deja de avisar sin decirlo es peor que no tenerlo. |

---

## 4. Arquitectura y Diseño de Datos

### 4.1. Diagrama de flujo

```text
+-------------------------------------------------------------------+
|                    USUARIO (PWA React + Vite)                     |
|   Dashboard / Tareas / Calificaciones / Salud del sync            |
+---------------------------------+---------------------------------+
                                  | HTTPS (cookie HttpOnly en Fase 6)
                                  | SOLO LECTURA: nunca toca Moodle
                                  v
+-------------------------------------------------------------------+
|            CLOUDFLARE EDGE (mismo origen: assets + API)           |
|                                                                   |
|   +---------------------------+     +-------------------------+   |
|   |  Worker (Hono)            |     |  D1 (SQLite)            |   |
|   |  GET /api/*  ------------ | --> |  courses                |   |
|   |                           |     |  synced_items           |   |
|   |  scheduled() ------------ | --> |  sync_state / sync_runs |   |
|   |  (unico que habla Moodle) |     |  push_subscriptions     |   |
|   +-------------+-------------+     +-------------------------+   |
|                 |                                                 |
|                 +--> Telegram Bot API / Web Push (agregado)       |
+-----------------|-------------------------------------------------+
                  | REST /webservice/rest/server.php (cada 5 min)
                  v
+-------------------------------------------------------------------+
|          MOODLE OFICIAL (catedig.itlalaguna.edu.mx)               |
|   Servicio: moodle_mobile_app / Entregas via deep-link            |
+-------------------------------------------------------------------+
```

### 4.2. Esquema núcleo (Fase 1, monousuario)

```sql
-- Cache de materias: alimenta el dashboard sin tocar Moodle
CREATE TABLE courses (
  id INTEGER PRIMARY KEY,             -- courseid de Moodle
  shortname TEXT NOT NULL,
  fullname TEXT NOT NULL,
  progress REAL,
  payload_json TEXT,
  refreshed_at INTEGER NOT NULL
);

-- Elementos sincronizados. Se conservan title / due_date / grade para poder
-- construir la UI desde D1 (el esquema multiusuario propuesto los eliminaba).
CREATE TABLE synced_items (
  item_key TEXT PRIMARY KEY,          -- assign_<cmid> | grade_<itemid> | discussion_<id>
  course_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,            -- assignment | grade | announcement
  title TEXT NOT NULL,
  url TEXT,
  due_date INTEGER,                   -- Unix
  grade_num REAL,                     -- normalizado numericamente
  timemodified INTEGER NOT NULL,
  payload_json TEXT,
  first_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                  -- tombstone
);
CREATE INDEX idx_items_course ON synced_items(course_id);
CREATE INDEX idx_items_due ON synced_items(due_date) WHERE deleted_at IS NULL;

-- Estado global: evita la inundacion de notificaciones del primer run
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  baseline_seeded INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sync_state (id) VALUES (1);

-- Observabilidad: sin esto no puedes responder "por que no me aviso?"
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,               -- ok | partial | error
  subrequests_used INTEGER,
  items_changed INTEGER,
  error TEXT
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
```

**Nota sobre claves:** `discussion_<id>` usa el id de la **discusión**, no el de la instancia del foro. El ejemplo `forum_310` de v1 nunca habría detectado un aviso nuevo.

### 4.3. Migración multiusuario (Fase 6, condicionada)

```sql
CREATE TABLE allowed_users (
  username TEXT PRIMARY KEY,          -- numero de control
  invited_by TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,                -- UUID
  moodle_user_id INTEGER UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL REFERENCES allowed_users(username) ON DELETE CASCADE,
  fullname TEXT NOT NULL,
  encrypted_wstoken TEXT NOT NULL,    -- base64( ciphertext || tag )
  token_iv TEXT NOT NULL,             -- base64, 12 bytes, unico por cifrado
  key_version INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'guest', -- admin | guest
  is_active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,  -- invalida JWT ya emitidos
  last_sync_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Aislamiento: user_id pasa a formar parte de la clave logica
ALTER TABLE synced_items ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX ux_items_user ON synced_items(user_id, item_key);

ALTER TABLE courses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sync_state ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sync_runs ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- UNIQUE global de endpoint era incorrecto: debe ser por usuario
ALTER TABLE push_subscriptions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX ux_push_user_endpoint ON push_subscriptions(user_id, endpoint);

-- Rate limiting de login (RNF-10)
CREATE TABLE login_attempts (
  username TEXT NOT NULL,
  ip TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_attempts ON login_attempts(username, attempted_at);
```

### 4.4. Presupuesto de subpeticiones (crítico)

`gradereport_user_get_grade_items` es **por materia**, no por usuario. Con 8 materias:

| Llamada | Ingenuo | Escalonado |
| --- | --- | --- |
| `core_enrol_get_users_courses` (caché 6 h) | 1 | ~0.01 |
| `mod_assign_get_assignments` (batch `courseids[]`) | 1 | 1 |
| `gradereport_user_get_grade_items` (cada 30 min) | 8 | 1.33 |
| `mod_forum_get_forums_by_courses` (cada 30 min) | 1 | 0.17 |
| `mod_forum_get_forum_discussions` (cada 30 min) | 8 | 1.33 |
| Push agregado (solo si hay cambios) | ~1 | ~1 |
| **Total por usuario** | **~20** | **~4.8** |
| **Usuarios por ciclo (tope 50)** | **2** | **~10** |

**Conclusiones operativas:**

- El "10 a 12 usuarios por ciclo" de la propuesta original **solo se sostiene con polling escalonado**. Con el esquema ingenuo el cron truena en el segundo usuario.
- `mod_assign_get_assignments` y `mod_forum_get_forums_by_courses` aceptan arreglos `courseids[]`: **una llamada para todas las materias**. No iterar.
- Round-robin: `ORDER BY last_sync_at ASC LIMIT N`, con `N` calculado del presupuesto, no fijado a mano.
- Contador de subpeticiones en el handler; al acercarse a 45, cerrar el ciclo con `status = partial` y continuar en el siguiente.
- Con 20 usuarios y 10 por ciclo, cada quien recibe tareas cada ~10 min, no cada 5. **Compromiso explícito, no un bug.**
- Escrituras a D1 con `DB.batch()`, nunca `await` secuencial en un bucle.

---

## 5. Plan de Implementación

### Fase 0 — Gate de validación (semáforo, no fase)

**Todo el plan depende de esto. Se ejecuta antes de escribir código de aplicación.**

```bash
# 1. Existe el endpoint y el servicio movil?
curl -s -X POST "https://catedig.itlalaguna.edu.mx/login/token.php" \
  -d "username=TU_CONTROL" --data-urlencode "password=TU_PASS" \
  -d "service=moodle_mobile_app"

# 2. Que funciones permite realmente el token?
curl -s -X POST "https://catedig.itlalaguna.edu.mx/webservice/rest/server.php" \
  -d "wstoken=TOKEN" -d "wsfunction=core_webservice_get_site_info" \
  -d "moodlewsrestformat=json" | jq '.userid, .functions[].name'
```

| Semáforo | Condición | Acción |
| --- | --- | --- |
| Verde | Token válido + están las 7 funciones requeridas | Continuar a Fase 1 |
| Amarillo | Token válido, faltan funciones (p. ej. calificaciones o foros) | Recortar los RF afectados y documentarlo |
| Rojo | `servicenotfound`, servicios deshabilitados, o login institucional por SSO/LDAP/CAS | **Plan B**: userstyle (Stylus) + puente sobre el export de calendario con `authtoken` |

Funciones a verificar en la lista: `core_enrol_get_users_courses`, `mod_assign_get_assignments`, `mod_assign_get_submission_status`, `core_course_get_contents`, `gradereport_user_get_grade_items`, `mod_forum_get_forums_by_courses`, `mod_forum_get_forum_discussions`.

Entorno: Bun y Wrangler **dentro de WSL**, proyecto en `~/proyectos/catedig-plus`.

### Fase 1 — MVP de alertas (sin PWA)

Objetivo: "avísame cuando hay tarea o nota nueva". Es el 80 % del valor.

1. `wrangler init` de un solo Worker. `wrangler d1 create catedig-db`.
2. Migraciones núcleo (§4.2).
3. `wrangler secret put MOODLE_TOKEN` y `TELEGRAM_BOT_TOKEN`.
4. Cliente Moodle tipado: manejo de `exception` / `errorcode`, timeout, backoff.
5. Handler `scheduled`: consulta, normaliza, diff contra D1, **un mensaje agregado a Telegram**.
6. `baseline_seeded = 0` en el primer run: pobla sin notificar.
7. Prueba local: `wrangler dev --test-scheduled` y `curl "http://localhost:8787/__scheduled"`.

**Criterio de salida:** recibes un aviso real de una tarea publicada en 5 min o menos, sin falsos positivos durante 48 h.

### Fase 2 — Endurecimiento del motor

- Foros y calificaciones escalonados (§4.4).
- Tombstones para ítems eliminados.
- `mod_assign_get_submission_status` para prórrogas individuales.
- `sync_runs` + dead man's switch (RF-10).
- Jitter, backoff, circuit breaker.
- Contador de subpeticiones y modo `partial`.

### Fase 3 — API de lectura (BFF)

Rutas Hono que **solo leen D1**: `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, `/api/health`.

`/api/files/proxy`: allowlist estricta de host + prefijo `/webservice/pluginfile.php` (mitiga SSRF).

`/api/sync/manual`: con rate limit propio.

### Fase 4 — PWA

Vite + React + Tailwind + shadcn. Vistas: Resumen, Tareas (lista ordenada; Kanban es v1.1), Materia, Configuración, Salud.

Web Push: llaves VAPID, `injectManifest`, listeners `push` y `notificationclick`.

**Un solo Worker con Static Assets** para servir `dist` y `/api` en el mismo origen.

### Fase 5 — Despliegue y validación real

`wrangler deploy`, `wrangler tail`. Verificación en escritorio, Android e iOS (agregar a pantalla de inicio antes de pedir permiso de notificaciones).

Vigilar una semana completa antes de considerar Fase 6.

### Fase 6 — Multiusuario (condicionada a §7.2)

**Alternativa A: login delegado (la propuesta original)**

```text
[PWA login] --(usuario+pass)--> [Worker /api/auth/login]
                                      |
                    +-----------------+------------------+
                    v (1) allowlist + rate limit         v (2) POST login/token.php
              [allowed_users]                      [Moodle catedig]
                    |                                    |
                    +-----------------+------------------+
                                      v (3) descarta pass, cifra wstoken (AES-GCM)
                                 [users en D1]
                                      |
[PWA dashboard] <--(4) cookie HttpOnly + Secure + SameSite
```

- La contraseña **se descarta de memoria**; nunca a D1, nunca a logs, nunca a `wrangler tail`.
- `core_webservice_get_site_info` provee `moodle_user_id` y `fullname`.
- El JWT lleva `user_id`, `role` y `session_version`. **Toda petición carga la fila de `users` y rechaza si `is_active = 0`**: sin esa comprobación no puedes revocar sesiones.
- `invalidtoken`, `is_active = 0`, el cron deja de intentar, el usuario debe reautenticarse.

**Alternativa B: token aportado por el usuario (menor riesgo, recomendada)**

Cada invitado obtiene su propio `wstoken` con un script local documentado y lo pega en la app. **Tu Worker jamás ve una contraseña ajena.** Más fricción en el alta, pero elimina de raíz el manejo de credenciales de terceros.

---

## 6. Checklist de Seguridad y Operación

**Credenciales**
- [ ] `.dev.vars` y `.env` en `.gitignore`.
- [ ] `MOODLE_TOKEN` y `ENCRYPTION_KEY` ausentes del bundle (`grep -r` sobre `dist`).
- [ ] Ninguna contraseña en logs ni en cuerpos registrados.
- [ ] `ENCRYPTION_KEY` son 32 bytes aleatorios, no una passphrase; `key_version` presente.

**Autenticación**
- [ ] El `user_id` se deriva del JWT verificado, jamás de un parámetro del cliente.
- [ ] Cookie `HttpOnly` + `Secure` + `SameSite`, y **PWA y API en el mismo origen**.
- [ ] Cada petición comprueba `is_active`; existe revocación por `session_version`.
- [ ] `/api/auth/login` con rate limit por usuario y por IP, y error genérico.

**Superficie de ataque**
- [ ] `/api/files/proxy` con allowlist de host y prefijo de ruta.
- [ ] Ninguna ruta `/api/*` hace `fetch` a Moodle.

**Operación**
- [ ] Cron de al menos 5 min con jitter; backoff y circuit breaker activos.
- [ ] Contador de subpeticiones con corte antes de 45.
- [ ] `baseline_seeded` evita la inundación del primer run.
- [ ] Dead man's switch probado (forzar un fallo y verificar la alerta).
- [ ] Push agregado, no por ítem.
- [ ] Suscripciones `410`/`404` purgadas.

**Funcional**
- [ ] Los deep-links abren la actividad correcta por `cmid`.
- [ ] Las prórrogas individuales se reflejan en la fecha mostrada.
- [ ] Las claves de avisos usan id de discusión, no de foro.

---

## 7. Riesgos y Registro de Decisiones

### 7.1. Riesgos abiertos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| SSO institucional invalida `login/token.php` | **Total** | Gate de Fase 0; Plan B documentado |
| WAF bloquea IPs de Cloudflare | Alto | Polling cortés, jitter, aviso previo a TI |
| Fallo silencioso antes de exámenes | Alto | RF-10 + dead man's switch |
| Fecha límite incorrecta por prórroga | Alto | `mod_assign_get_submission_status` |
| Límites de la capa gratuita cambian | Medio | Verificar docs vigentes antes de Fase 1 |
| Manejo de credenciales de terceros | **Crítico** | §7.2 |

### 7.2. Pre-requisitos de la Fase 6 (no negociables)

Pasar de "mis datos con mis credenciales" a "un servicio que recibe las contraseñas institucionales de mis compañeros" cambia la naturaleza del proyecto, no solo su escala:

1. **Aviso y visto bueno de TI / coordinación del ITL.** No es pedir permiso para una interfaz: es informar que un servicio estudiantil intermediará credenciales institucionales.
2. **Revisión de la política de uso aceptable** respecto a servicios de terceros y datos académicos.
3. **Consentimiento explícito e informado** de cada invitado sobre qué se almacena y por cuánto tiempo.
4. **Preferencia por la Alternativa B** (token aportado), que evita el problema en lugar de mitigarlo.
5. **Datos de terceros:** solo los del propio usuario. Nunca exponer calificaciones ajenas, ni siquiera al rol `admin`.

Mientras estos puntos no estén cerrados, el proyecto permanece monousuario.

### 7.3. Registro de cambios respecto a v1

| # | Cambio | Origen |
| --- | --- | --- |
| 1 | Fase 0 convertida en gate con semáforo y Plan B | Revisión |
| 2 | Lectura exclusivamente desde D1 (RNF-02 ahora alcanzable) | Revisión |
| 3 | Push agregado; presupuesto de subpeticiones explícito | Revisión |
| 4 | `baseline_seeded`, tombstones, `grade_num` numérico | Revisión |
| 5 | Foros añadidos al motor; clave `discussion_<id>` | Revisión |
| 6 | RF-04 corregido: proxy en servidor, token nunca en el cliente | Revisión |
| 7 | Telegram primero; PWA y Kanban diferidos | Revisión |
| 8 | `sync_runs`, dead man's switch, backoff y jitter | Revisión |
| 9 | Renumeración RF-11..13 / RNF-07..11 por colisión de IDs | Integración |
| 10 | Cálculo de subpeticiones corregido: ~2 usuarios/ciclo ingenuo, ~10 con escalonado | Integración |
| 11 | Mismo origen obligatorio para la cookie de sesión (RNF-09) | Integración |
| 12 | `synced_items` conserva `title`, `due_date` y calificación | Integración |
| 13 | `key_version`, `session_version`, rate limit de login, `UNIQUE(user_id, endpoint)` | Integración |
| 14 | Fase 6 condicionada y Alternativa B de token aportado | Integración |