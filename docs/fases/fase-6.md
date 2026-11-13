# Fase 6 — Multiusuario por Invitación (Condicionada)

**Estado:** Bloqueada / Condicionada a §7.2 🚧  
**Objetivo:** Escalar el servicio a compañeros invitados de forma segura mediante aislamiento estricto por `user_id` y cifrado en reposo.

---

## Pre-requisitos No Negociables (§7.2 de `plan.md`)

> **No iniciar implementación de código hasta cerrar todos estos puntos:**

- [ ] Aviso y visto bueno de TI / coordinación del ITL.
- [ ] Revisión de la política de uso aceptable respecto a servicios de terceros y datos académicos.
- [ ] Documento de consentimiento explícito e informado para cada invitado.
- [ ] Decisión formal entre **Alternativa A** (login delegado) y **Alternativa B** (token aportado por el usuario — recomendada).

---

## Lista de Actividades Técnicas

- [ ] Crear migración multiusuario (`allowed_users`, `users`, `login_attempts`, columna `user_id` en tablas núcleo, índice `UNIQUE(user_id, endpoint)` en `push_subscriptions`).
- [ ] Implementar cifrado AES-256-GCM (Web Crypto) para `wstoken` con IV único de 12 bytes, `ENCRYPTION_KEY` (32 bytes base64) y soporte de rotación mediante `key_version`.
- [ ] Implementar autenticación basada en cookie JWT `HttpOnly` + `Secure` + `SameSite=Strict` bajo el mismo origen.
- [ ] Middleware de sesión: derivar `user_id` exclusivamente del JWT verificado y validar `is_active = 1` + `session_version` en D1 en cada petición.
- [ ] Endpoints de control de acceso para rol `admin` (alta/baja en `allowed_users`, revocación inmediata).
- [ ] Rate limiting por usuario e IP en `/api/auth/login` con mensajes de error genéricos (RNF-10).
- [ ] Adaptar el motor de sincronización a **round-robin** (`ORDER BY last_sync_at ASC LIMIT N`) calculado según presupuesto de subpeticiones (<45).

---

## Notas

- Preferir **Alternativa B (token aportado)** para evitar intermediar contraseñas institucionales en el Worker.
- Nunca exponer datos o calificaciones de un usuario a otro, ni siquiera al rol `admin`.
