# Test Suite Integration & File Proxy Security Fix Investigation Report

**Agent:** `teamwork_explorer_m1_it2_3` (Explorer Archetype: Test Suite & Security Validation Investigator)  
**Parent / Sub-Orchestrator:** `dc71187e-54b6-4d3f-84a5-374f2e0f0356`  
**Milestone:** M1 — Iteration 2 (Shared Zod Schemas & Security Remediation)  
**Date:** 2026-11-12T22:46:00Z  

---

## 1. Observation

### 1.1. Test Suites in `packages/shared/test/`

Two co-located automated test suites exist in `packages/shared/test/`:

1. **`packages/shared/test/file-proxy-ssrf.test.ts`** (206 lines)
   - Executed via:
     ```bash
     bun test packages/shared/test/file-proxy-ssrf.test.ts
     ```
   - Test structure: 70 total tests across 8 categories:
     - Category 1: Non-HTTPS Protocols (9 tests — all pass)
     - Category 2: Hostname Spoofing & SSRF Targets (12 tests — all pass)
     - Category 3: Port Manipulation (5 tests — all pass)
     - Category 4: Embedded Credentials / Userinfo (5 tests — all pass)
     - Category 5: Path Prefix Bypasses (9 tests — all pass)
     - Category 6: Directory Traversal / Dot-Dot Attacks (10 tests — **7 pass, 3 fail**)
     - Category 7: Control Characters, Null Bytes & Malformed Inputs (15 tests — **13 pass, 2 fail**)
     - Category 8: Legitimate Moodle Pluginfile URLs (10 tests — all pass)
   - Verbatim failures:
     ```
     5 tests failed:
     (fail) Adversarial Verification: FileProxyQuerySchema SSRF & Edge Case Stress-Test > Category 6: Directory Traversal / Dot-Dot Attacks > Reject Inline traversal segment: https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/sub/.. [2.74ms]
     (fail) Adversarial Verification: FileProxyQuerySchema SSRF & Edge Case Stress-Test > Category 6: Directory Traversal / Dot-Dot Attacks > Reject Query param traversal file=/../../: https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php?file=/../../../../etc/passwd [1.24ms]
     (fail) Adversarial Verification: FileProxyQuerySchema SSRF & Edge Case Stress-Test > Category 6: Directory Traversal / Dot-Dot Attacks > Reject Query param traversal preview=../../: https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?preview=../../etc/shadow [1.01ms]
     (fail) Adversarial Verification: FileProxyQuerySchema SSRF & Edge Case Stress-Test > Category 7: Control Characters, Null Bytes & Malformed Inputs > Reject Encoded null byte %00 in query: "https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?file=%00evil" [0.94ms]
     (fail) Adversarial Verification: FileProxyQuerySchema SSRF & Edge Case Stress-Test > Category 7: Control Characters, Null Bytes & Malformed Inputs > Reject CRLF injection in query (encoded %0d%0a): "https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/doc.pdf?x=%0d%0aSet-Cookie:evil=1" [2.00ms]

      65 pass
      5 fail
      84 expect() calls
     Ran 70 tests across 1 file. [822.00ms]
     ```

2. **`packages/shared/test/adversarial-schemas.test.ts`** (894 lines)
   - Executed via:
     ```bash
     bun test packages/shared/test/adversarial-schemas.test.ts
     ```
   - Test structure: 81 total tests across 7 comprehensive test suites:
     - Suite 1: Route Params Coercion (`CourseContentsParamsSchema`, `CourseGradesParamsSchema`)
     - Suite 2: `SyncRunSchema` & D1 Null Values / Lifecycle States
     - Suite 3: `EnhancedHealthResponseSchema` & `SubrequestMetricsSchema`
     - Suite 4: `GradeItemDetailSchema` & `CourseGradesResponseSchema`
     - Suite 5: `CourseContentsResponseSchema` & Deep Tree Hierarchy
     - Suite 6: `DashboardResponseSchema` & Sub-Models
     - Suite 7: Database Entities, `SyncState`, `MoodleToken`, `ApiErrorResponseSchema`
   - Execution result:
     ```
      81 pass
      0 fail
      138 expect() calls
     Ran 81 tests across 1 file. [2.65s]
     ```

### 1.2. Aggregate Shared Test Suite Execution

Running `bun test packages/shared` executes both test files concurrently:
```bash
bun test packages/shared
```
Verbatim result:
```
 146 pass
 5 fail
 222 expect() calls
Ran 151 tests across 2 files. [428.00ms]
```

### 1.3. Impact Analysis on Monorepo Builds & Typechecking

1. **Worker Typechecking (`bunx tsc --noEmit -p apps/worker/tsconfig.json`)**:
   - Exit Code: `0`
   - Errors: 0
   - Confirms that types and schemas exported by `@better-moodle/shared` are strictly type-safe and satisfy all consumer requirements.

2. **Shared Package Build (`bun run build:shared`)**:
   - Exit Code: `0`
   - Bundles 11 modules into `./dist/index.js` in 489ms with 0 errors.

3. **Web Frontend Build (`bun run build:web`)**:
   - Exit Code: `0`
   - Vite v6.4.6 transforms 2,140 modules and outputs production bundle in `apps/web/dist` with 0 errors.

4. **Worker Test Suite Status**:
   - `apps/worker/test/harness-empirical.test.ts`: **37 pass, 0 fail** (165 `expect()` calls in 131ms).
   - `apps/worker/src/sync/phase2.test.ts`: **4 pass, 0 fail** (22 `expect()` calls in 106ms).
   - `apps/worker/test/e2e.test.ts`: 45 pass, 68 fail.
     - Reason: The 68 failures are HTTP 404s for `/api/dashboard`, `/api/courses/:id/contents`, `/api/courses/:id/grades`, and `/api/files/proxy`. These routes belong to Milestones M2/M3 (Worker Read API and Proxy implementation) and are NOT yet implemented in `apps/worker/src/index.ts`. They are unaffected by M1 shared schema updates.

---

## 2. Logic Chain

1. **Root Cause Analysis of the 5 Failures**:
   In `packages/shared/src/index.ts`, lines 266–275 currently state:
   ```typescript
   // 6. Protección anti-path traversal (en crudo y decodificado)
   const decodedPath = decodeURIComponent(pathname);
   if (pathname.includes('..') || decodedPath.includes('..')) {
     return false;
   }
   // 7. Bloqueo de caracteres de control y bytes nulos
   if (/[\x00-\x1F\x7F]/.test(val) || /[\x00-\x1F\x7F]/.test(decodedPath)) {
     return false;
   }
   ```
2. **Mechanism 1 (WHATWG Normalization of Path Segments)**:
   When input is `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/sub/..`, the constructor `new URL(val)` canonicalizes the path to `/webservice/pluginfile.php/`. Consequently, `pathname` and `decodedPath` no longer contain `..`, even though the raw string `val` explicitly includes `..`.
3. **Mechanism 2 (Query String Blindspot for Path Traversal)**:
   For payloads like `?file=/../../../../etc/passwd` or `?preview=../../etc/shadow`, the traversal sequences exist inside `parsed.search`, while `parsed.pathname` is `/webservice/pluginfile.php`. Because Rule 6 only inspects `pathname`, traversal attempts in query parameters pass unchecked.
4. **Mechanism 3 (Query String Blindspot for Encoded Control Characters)**:
   For payloads like `?file=%00evil` and `?x=%0d%0aSet-Cookie:evil=1`, the raw URL `val` contains printable ASCII characters (`%`, `0`, `0`, etc.). Rule 7 tests `val` (which matches no control char) and `decodedPath` (which decodes only `pathname`, ignoring query string). The percent-encoded control bytes (`\x00`, `\r\n`) in query parameters are never decoded and evaluated, bypassing Rule 7.
5. **Deduction & Solution Formulation**:
   By decoding the full URL string `val` (and guarding against double-encoding) and checking both raw `val`, `decodedVal`, `doubleDecodedVal`, and `pathname` for `..` and `[\x00-\x1F\x7F]`:
   - Inline and trailing traversal segments in any part of the URL are immediately rejected.
   - Query string traversals (`file=/../../`) are rejected.
   - Encoded null bytes (`%00`) and CRLF characters (`%0d%0a`) in both path and query strings are unmasked upon decoding and rejected.
   - Legitimate query parameters (`?forcedownload=1`) and legitimate path parameters with spaces (`%20`) remain 100% valid because `%20` decodes to ` ` (ASCII 0x20, not in 0x00–0x1F or 0x7F) and contains no `..`.

---

## 3. Caveats

- **Scope Boundary**: Milestones M2 and M3 will implement `/api/dashboard`, `/api/courses/:id/*`, and `/api/files/proxy` in `apps/worker`. The 68 failing tests in `apps/worker/test/e2e.test.ts` are expected until M2/M3 and should not be used as a blocker for M1 Iteration 2.
- **URI Error Handling**: In JavaScript, `decodeURIComponent` throws `URIError` when encountering invalid percent sequences (e.g. `%zz`). The enclosing `try { ... } catch { return false; }` block handles this safely by rejecting invalid sequences.
- **No Source Code Changes Made**: In accordance with the Explorer archetype rules, no source files were modified during this investigation.

---

## 4. Conclusion & Recommended Fix Strategy

### 4.1. Proposed Implementation for Worker 1

In `packages/shared/src/index.ts`, replace lines 266–275:

#### Before:
```typescript
      // 6. Protección anti-path traversal (en crudo y decodificado)
      const decodedPath = decodeURIComponent(pathname);
      if (pathname.includes('..') || decodedPath.includes('..')) {
        return false;
      }
      // 7. Bloqueo de caracteres de control y bytes nulos
      if (/[\x00-\x1F\x7F]/.test(val) || /[\x00-\x1F\x7F]/.test(decodedPath)) {
        return false;
      }
```

#### After:
```typescript
      // 6. Protección anti-path traversal (en crudo y decodificado sobre toda la URL y pathname)
      let decodedVal = val;
      try {
        decodedVal = decodeURIComponent(val);
      } catch {
        return false;
      }
      let doubleDecodedVal = decodedVal;
      try {
        doubleDecodedVal = decodeURIComponent(decodedVal);
      } catch {
        // Ignorar si el segundo nivel no tiene codificación URI válida
      }

      if (
        val.includes('..') ||
        decodedVal.includes('..') ||
        doubleDecodedVal.includes('..') ||
        pathname.includes('..')
      ) {
        return false;
      }

      // 7. Bloqueo de caracteres de control y bytes nulos (en crudo y decodificado sobre toda la URL)
      if (
        /[\x00-\x1F\x7F]/.test(val) ||
        /[\x00-\x1F\x7F]/.test(decodedVal) ||
        /[\x00-\x1F\x7F]/.test(doubleDecodedVal)
      ) {
        return false;
      }
```

### 4.2. Proof of Fix Effectiveness
Empirical validation in Bun runtime confirmed:
- **100% of the 5 failing vectors are rejected** (`true`):
  1. `.../webservice/pluginfile.php/sub/..` -> Rejected
  2. `.../webservice/pluginfile.php?file=/../../../../etc/passwd` -> Rejected
  3. `.../webservice/pluginfile.php/123/doc.pdf?preview=../../etc/shadow` -> Rejected
  4. `.../webservice/pluginfile.php/123/doc.pdf?file=%00evil` -> Rejected
  5. `.../webservice/pluginfile.php/123/doc.pdf?x=%0d%0aSet-Cookie:evil=1` -> Rejected
- **100% of the 10 legitimate Moodle pluginfile URLs are accepted** (`true`):
  1. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php` -> Accepted
  2. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/` -> Accepted
  3. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_assign/intro/doc.pdf` -> Accepted
  4. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/456/mod_resource/content/1/Lecture_Notes.pdf` -> Accepted
  5. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/789/mod_forum/post/42/image.png` -> Accepted
  6. `https://catedig.itlalaguna.edu.mx:443/webservice/pluginfile.php/123/mod_assign/intro/doc.pdf` -> Accepted
  7. `https://CATEDIG.ITLALAGUNA.EDU.MX/webservice/pluginfile.php/123/mod_assign/intro/doc.pdf` -> Accepted
  8. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/123/mod_folder/content/0/file%20with%20spaces.docx` -> Accepted
  9. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/999/mod_assign/intro/test.pdf?forcedownload=1` -> Accepted
  10. `https://catedig.itlalaguna.edu.mx/webservice/pluginfile.php/555/user/icon/f1` -> Accepted

---

## 5. Verification Method & Acceptance Criteria for Milestone M1 Iteration 2

### 5.1. Exact Verification Commands

1. **Run Shared Package Test Suites**:
   ```bash
   bun test packages/shared
   ```
   *Expected Result*: 151 pass, 0 fail across 2 files (`file-proxy-ssrf.test.ts` and `adversarial-schemas.test.ts`).

2. **Run Individual SSRF Stress Test Suite**:
   ```bash
   bun test packages/shared/test/file-proxy-ssrf.test.ts
   ```
   *Expected Result*: 70 pass, 0 fail (100% pass rate).

3. **Run Schemas Adversarial Test Suite**:
   ```bash
   bun test packages/shared/test/adversarial-schemas.test.ts
   ```
   *Expected Result*: 81 pass, 0 fail (100% pass rate).

4. **Verify TypeScript Compilation**:
   ```bash
   bunx tsc --noEmit -p apps/worker/tsconfig.json
   ```
   *Expected Result*: Exit code 0, 0 type errors.

5. **Verify Shared Package Build**:
   ```bash
   bun run build:shared
   ```
   *Expected Result*: Exit code 0, cleanly bundled.

6. **Verify Web Frontend Production Build**:
   ```bash
   bun run build:web
   ```
   *Expected Result*: Exit code 0, Vite build completes with 0 errors.

### 5.2. Iteration 2 Acceptance Criteria Checklist

- [ ] **AC-1**: `packages/shared/src/index.ts` lines 266–275 updated with full URL and multi-tier decode inspection.
- [ ] **AC-2**: `bun test packages/shared/test/file-proxy-ssrf.test.ts` yields 70 pass, 0 fail.
- [ ] **AC-3**: `bun test packages/shared/test/adversarial-schemas.test.ts` yields 81 pass, 0 fail.
- [ ] **AC-4**: `bun test packages/shared` yields 151 pass, 0 fail.
- [ ] **AC-5**: `bunx tsc --noEmit -p apps/worker/tsconfig.json` exits code 0 with 0 errors.
- [ ] **AC-6**: `bun run build:shared` succeeds with exit code 0.
- [ ] **AC-7**: `bun run build:web` succeeds with exit code 0.
