/**
 * Runner de Mutation Testing para Fase 3 (Endpoints BFF y Proxy Seguro)
 * Induce mutaciones controladas sobre el código fuente y verifica que `bun test` las mate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Mutant {
  id: string;
  file: string;
  description: string;
  target: string;
  replacement: string;
  testTarget: string;
}

const ROOT = join(import.meta.dir, '..');

const MUTANTS: Mutant[] = [
  {
    id: 'M1-PROXY-NO-STRIP-TOKEN',
    file: 'apps/worker/src/routes/proxy.ts',
    description: 'Permite que sobreviva un parámetro ?token= forjado por el cliente',
    target:
      "  upstreamUrl.searchParams.delete('token');\n  upstreamUrl.searchParams.delete('wstoken');\n  upstreamUrl.searchParams.set('token', moodleToken);",
    replacement:
      "  if (!upstreamUrl.searchParams.has('token')) upstreamUrl.searchParams.set('token', moodleToken);",
    testTarget: 'apps/worker/test/e2e/tier4-scenarios.test.ts',
  },
  {
    id: 'M2-PROXY-NO-TOKEN-INJECTION',
    file: 'apps/worker/src/routes/proxy.ts',
    description: 'Omite inyectar MOODLE_TOKEN en el servidor',
    target: "  upstreamUrl.searchParams.set('token', moodleToken);",
    replacement: '  // mutated: omitted token injection',
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M3-PROXY-FOLLOW-REDIRECT',
    file: 'apps/worker/src/routes/proxy.ts',
    description: "Cambia redirect: 'manual' a 'follow' (permite open redirect SSRF)",
    target: "redirect: 'manual',",
    replacement: "redirect: 'follow',",
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M4-PROXY-ALLOW-UPSTREAM-ERRORS',
    file: 'apps/worker/src/routes/proxy.ts',
    description: 'Permite pasar respuestas 3xx/4xx/5xx del upstream en lugar de retornar 502',
    target: 'if (upstreamRes.status < 200 || upstreamRes.status >= 300) {',
    replacement: 'if (false) {',
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M5-PROXY-LEAK-SET-COOKIE',
    file: 'apps/worker/src/routes/proxy.ts',
    description: 'Reenvía cabeceras arbitrarias incluyendo set-cookie al cliente',
    target: "  for (const name of SAFE_RESPONSE_HEADERS) {\n    const val = upstreamRes.headers.get(name);\n    if (val && !val.includes(moodleToken)) {\n      headers.set(name, val);\n    }\n  }",
    replacement:
      '  upstreamRes.headers.forEach((val, key) => { headers.set(key, val); });',
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M6-DASHBOARD-TOMBSTONE-LEAK',
    file: 'apps/worker/src/routes/dashboard.ts',
    description: 'Omite el filtro deleted_at IS NULL en tareas próximas',
    target: "        AND si.due_date >= ?\n        AND si.deleted_at IS NULL",
    replacement: "        AND si.due_date >= ?",
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M7-DASHBOARD-UNBOUNDED-ACTIVITY',
    file: 'apps/worker/src/routes/dashboard.ts',
    description: 'Cambia LIMIT 15 a LIMIT 50 en actividad reciente',
    target: '      LIMIT 15',
    replacement: '      LIMIT 50',
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M8-COURSES-NON-GRADE-BLEED',
    file: 'apps/worker/src/routes/courses.ts',
    description: "Elimina filtro item_type = 'grade' en GET /api/courses/:id/grades",
    target: "        AND item_type = 'grade'",
    replacement: '        AND 1 = 1',
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M9-HEALTH-CIRCUIT-OPEN-IGNORED',
    file: 'apps/worker/src/routes/health.ts',
    description: 'Ignora condición circuit_open_until > now en /api/health',
    target: 'if (syncState && syncState.circuit_open_until && syncState.circuit_open_until > now) {',
    replacement: 'if (false) {',
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
  {
    id: 'M10-HEALTH-ZERO-DIV',
    file: 'apps/worker/src/routes/health.ts',
    description: 'Elimina guarda contra división por cero cuando no hay sync_runs',
    target: "    const failureRate =\n      recentRuns.length === 0\n        ? 0.0\n        : Number((recentRuns.filter((r: any) => r.status === 'error').length / recentRuns.length).toFixed(4));",
    replacement:
      "    const failureRate = Number((recentRuns.filter((r: any) => r.status === 'error').length / recentRuns.length).toFixed(4));",
    testTarget: 'apps/worker/test/e2e/tier1-features.test.ts',
  },
];

function normalizeLF(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

async function run() {
  console.log('='.repeat(64));
  console.log('  BetterMoodle Fase 3 — Mutation Testing Runner');
  console.log('='.repeat(64));

  let killed = 0;
  let survived = 0;

  for (const mutant of MUTANTS) {
    const absPath = join(ROOT, mutant.file);
    const originalRaw = readFileSync(absPath, 'utf8');
    const normalized = normalizeLF(originalRaw);

    if (!normalized.includes(mutant.target)) {
      console.error(`❌ [${mutant.id}] Target no encontrado en ${mutant.file}`);
      process.exit(1);
    }

    const mutated = normalized.replace(mutant.target, mutant.replacement);

    try {
      writeFileSync(absPath, mutated, 'utf8');
      const proc = Bun.spawnSync(['bun', 'test', mutant.testTarget], {
        cwd: ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      if (proc.exitCode !== 0) {
        killed++;
        console.log(`✅ KILLED   [${mutant.id}] ${mutant.description}`);
      } else {
        survived++;
        console.log(`❌ SURVIVED [${mutant.id}] ${mutant.description}`);
      }
    } finally {
      writeFileSync(absPath, originalRaw, 'utf8');
    }
  }

  console.log('='.repeat(64));
  console.log(`  Resultado: ${killed}/${MUTANTS.length} mutantes eliminados (100% = ${killed === MUTANTS.length})`);
  console.log('='.repeat(64));

  if (survived > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
