# Handoff Report — Review & Adversarial Challenge: Milestone M1 Iteration 2 (FileProxyQuerySchema Remediation)

**Reviewer / Adversarial Critic:** `teamwork_reviewer_m1_it2_2`  
**Parent / Sub-Orchestrator:** `dc71187e-54b6-4d3f-84a5-374f2e0f0356`  
**State Folder:** `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_reviewer_m1_it2_2`  
**Target File Reviewed:** `packages/shared/src/index.ts` (lines 249–310)  
**Date:** 2026-11-12T22:57:00Z  
**Verdict:** **APPROVE**  
**Integrity Attestation:** **PASSED** (0 integrity violations detected: no hardcoding, no facades, no shortcuts, no fabricated logs).

---

## 1. Observation

### 1.1. Code Inspection: `packages/shared/src/index.ts`
Lines 249–310 define `FileProxyQuerySchema`:
```typescript
export const FileProxyQuerySchema = z.object({
  url: z.string().url('URL inválida').refine((val) => {
    try {
      const parsed = new URL(val);
      // 1. Protocolo estrictamente HTTPS
      if (parsed.protocol !== 'https:') return false;
      // 2. Hostname exactamente catedig.itlalaguna.edu.mx (en minúsculas)
      if (parsed.hostname.toLowerCase() !== 'catedig.itlalaguna.edu.mx') return false;
      // 3. Puerto estrictamente estándar HTTPS (443 o vacío)
      if (parsed.port !== '' && parsed.port !== '443') return false;
      // 4. Sin credenciales de usuario (userinfo)
      if (parsed.username || parsed.password) return false;
      // 5. Pathname delimitado que empiece con /webservice/pluginfile.php
      const pathname = parsed.pathname;
      if (pathname !== '/webservice/pluginfile.php' && !pathname.startsWith('/webservice/pluginfile.php/')) {
        return false;
      }
      // 6. Rechazo explícito de secuencias peligrosas de doble codificación y anidamiento
      // Bloquea %252e (.), %252f (/), %255c (\), %2500 (null), %250d/%250a (CRLF), %2525 (anidado)
      if (/%25(?:2e|2f|5c|00|0d|0a|1f|7f|25)/i.test(val)) {
        return false;
      }
      // 7. Decodificación de primer nivel sobre la URL completa (detecta percent-encoding malformado)
      let decodedVal: string;
      try {
        decodedVal = decodeURIComponent(val);
      } catch {
        return false;
      }
      // 8. Decodificación iterativa profunda (hasta 3 niveles para revelar evasiones encubiertas)
      const stages: string[] = [val, decodedVal];
      let current = decodedVal;
      for (let i = 0; i < 3; i++) {
        try {
          const next = decodeURIComponent(current);
          if (next === current) break;
          stages.push(next);
          current = next;
        } catch {
          // Si una decodificación posterior falla, indica un '%' literal seguido de caracteres no hexadecimales
          // (ej. "eval_100%.pdf"). Esto es seguro y detiene la iteración sin rechazar la URL.
          break;
        }
      }
      // 9. Verificación estricta anti-traversal, control chars y backslashes en todas las etapas
      for (const stage of stages) {
        if (stage.includes('..')) return false;
        if (/[\x00-\x1F\x7F]/.test(stage)) return false;
        if (stage.includes('\\')) return false;
      }
      // Doble verificación sobre pathname de WHATWG
      if (pathname.includes('..') || pathname.includes('\\')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, {
    message: 'URL rechazada: debe ser HTTPS, host catedig.itlalaguna.edu.mx y ruta /webservice/pluginfile.php'
  })
});
export type FileProxyQuery = z.infer<typeof FileProxyQuerySchema>;
```

### 1.2. Verification Commands and Outputs

1. **`bun test packages/shared`**
   ```
   151 pass
   0 fail
   222 expect() calls
   Ran 151 tests across 2 files. [136.00ms]
   ```

2. **`bunx tsc --noEmit -p packages/shared/tsconfig.json`**
   ```
   Exit code: 0
   (0 type errors)
   ```

3. **`bunx tsc --noEmit -p apps/worker/tsconfig.json`**
   ```
   Exit code: 0
   (0 type errors)
   ```

4. **`bun run build:web`**
   ```
   $ bun --filter @better-moodle/web build
   @better-moodle/web build: vite v6.4.6 building for production...
   @better-moodle/web build: transforming...
   @better-moodle/web build: ✓ 2140 modules transformed.
   @better-moodle/web build: rendering chunks...
   @better-moodle/web build: computing gzip size...
   @better-moodle/web build: dist/index.html                   0.54 kB │ gzip:  0.35 kB
   @better-moodle/web build: dist/assets/index-CKP1Y6UY.css   10.88 kB │ gzip:  2.89 kB
   @better-moodle/web build: dist/assets/index-Dz-10sJl.js   275.28 kB │ gzip: 84.91 kB
   @better-moodle/web build: ✓ built in 7.14s
   @better-moodle/web build: Exited with code 0
   ```

### 1.3. Adversarial Stress-Test Observations
We subjected `FileProxyQuerySchema` to live adversarial vectors via Bun runtime execution:
```
PASS https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/eval_100%25.pdf
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%zz
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%E0%A4
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/sub/..
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php?file=/../../../../etc/passwd
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?preview=../../etc/shadow
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?file=%00evil
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%0d%0aSet-Cookie:evil=1
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/%252e%252e/secret
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/%25252e%25252e/secret
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/%2e%2e/secret
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/..%2fsecret
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/foo%5cbar
FAIL https://catedig.itlalaguna.edu.mx:80/webservice/pluginfile.php
FAIL https://catedig.itlalaguna.edu.mx:8443/webservice/pluginfile.php
FAIL https://sub.catedig.itlalaguna.edu.mx/webservice/pluginfile.php
FAIL https://catedig.itlalaguna.edu.mx.attacker.com/webservice/pluginfile.php
FAIL https://attacker.com/webservice/pluginfile.php
FAIL http://catedig.itlalaguna.edu.mx/webservice/pluginfile.php
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php.evil
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%c0%ae%c0%ae
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%e0%80%ae
FAIL https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/%25%32%35%25%32%35%25%32%65%25%32%65
PASS https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/Tesis%20Final%20(Revisi%C3%B3n).pdf
PASS https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_folder/content/0/%C3%A1%C3%A9%C3%AD%C3%B3%C3%BA%C3%B1.pdf
```

---

## 2. Logic Chain

1. **Security Design of Multi-Stage Decoding & Regex (Task 1)**:
   - *Observation 1.1 shows step 6*: `/%25(?:2e|2f|5c|00|0d|0a|1f|7f|25)/i.test(val)` immediately rejects double-encoded payload indicators (`.`, `/`, `\`, null bytes, CRLF, control characters, and nested `%25`) regardless of case (`/i`).
   - *Observation 1.1 shows step 8*: Iterative decoding (bounded to 3 iterations) decodes nested layers, collecting all intermediate string representations in `stages`.
   - *Observation 1.1 shows step 9*: Every stage (raw `val`, stage 1, and subsequent decoded stages) is checked against `stage.includes('..')`, `/[\x00-\x1F\x7F]/.test(stage)`, and `stage.includes('\\')`.
   - *Inference*: This architecture directly prevents bypasses where WHATWG normalization removes `..` from `parsed.pathname`, or where query parameters hide traversal sequences (`?file=/../../`), or where percent encoding masks control characters or directory separators.

2. **Safe Handling of `URIError` on Malformed Percent Sequences (Task 2)**:
   - *Observation 1.1 shows step 7*: The first decoding attempt is wrapped in `try { decodedVal = decodeURIComponent(val); } catch { return false; }`.
   - *Observation 1.3 shows*: Malformed inputs `%zz`, `%`, `%E0%A4`, and overlong UTF-8 `%c0%ae%c0%ae` throw `URIError` inside `decodeURIComponent`, which is cleanly caught and causes the refinement to return `false` without unhandled exceptions or crashes.
   - *Observation 1.1 shows step 8*: In iterative decoding (levels 2-4), `try { next = decodeURIComponent(current); ... } catch { break; }` catches `URIError`. If legitimate URLs contain an unescaped literal `%` after stage 1 (e.g. `eval_100%25.pdf` decoded once into `eval_100%.pdf`), the `URIError` terminates iterative decoding safely rather than rejecting the valid request or crashing.
   - *Observation 1.3 confirms*: `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/eval_100%25.pdf` successfully passes validation, while attacks remain blocked.

3. **Integrity and Non-Regression**:
   - Zero test hardcoding or dummy implementations exist in `packages/shared/src/index.ts`.
   - All 151 unit and adversarial tests across `packages/shared` pass (`bun test packages/shared`).
   - TypeScript compilation passes with 0 errors in both `packages/shared` and downstream consumer `apps/worker`.
   - Monorepo production web build succeeds with exit code 0.

---

## 3. Caveats

1. **Monorepo Milestone Scope**:
   - Worker endpoints (`/api/dashboard`, `/api/courses/:id/*`, `/api/health`, `/api/files/proxy`) are scheduled for Milestones M2 and M3. This review covers Milestone M1 (shared schemas and types in `packages/shared/src/index.ts`).
2. **Upstream Server Normalization**:
   - The validation in `FileProxyQuerySchema` is strictly client/middleware side validation prior to outbound fetch. The destination server (`catedig.itlalaguna.edu.mx`) performs its own internal Moodle authentication and file resolution; our schema provides comprehensive defense-in-depth against SSRF, traversal, and header injection.

---

## 4. Conclusion

The remediation in `packages/shared/src/index.ts` for `FileProxyQuerySchema` is robust, mathematically sound, free of ReDoS or resource exhaustion vulnerabilities, and completely solves the 5 edge-case failures observed in Iteration 1. Safe handling of `URIError` is confirmed. No integrity violations exist. The work product is **APPROVED**.

---

## 5. Verification Method

To independently verify:
```bash
# 1. Run all shared unit & adversarial test suites (151 tests)
bun test packages/shared

# 2. Run TypeScript compilation on shared and worker packages
bunx tsc --noEmit -p packages/shared/tsconfig.json
bunx tsc --noEmit -p apps/worker/tsconfig.json

# 3. Verify web production build
bun run build:web
```
**Invalidation Conditions**:
- Any failure in `bun test packages/shared`.
- Any compilation error in `tsc`.
- Non-zero exit code on `bun run build:web`.
- Any unhandled `URIError` thrown when parsing malformed percent-encoded inputs.
