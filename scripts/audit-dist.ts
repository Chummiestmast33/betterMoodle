import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT_DIR = process.cwd();
const DIST_DIR = join(ROOT_DIR, 'apps', 'web', 'dist');
const DEV_VARS_PATH = join(ROOT_DIR, 'apps', 'worker', '.dev.vars');

const FORBIDDEN_TOKEN_NAMES = [
  'MOODLE_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'VAPID_PRIVATE_JWK',
  'ENCRYPTION_KEY',
];

const REQUIRED_DIST_FILES = [
  'index.html',
  'manifest.webmanifest',
  'registerSW.js',
  'sw.js',
  'robots.txt',
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      out.push(...collectFiles(fullPath));
    } else if (st.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function parseDevVars(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function extractSecretValues(vars: Record<string, string>): Array<{ label: string; value: string }> {
  const secretKeys = [
    'MOODLE_TOKEN',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'VAPID_PRIVATE_JWK',
    'ENCRYPTION_KEY',
  ];

  const targets: Array<{ label: string; value: string }> = [];
  for (const key of secretKeys) {
    const val = vars[key];
    if (!val || val.length < 6) continue;
    targets.push({ label: `valor de ${key}`, value: val });

    if (key === 'VAPID_PRIVATE_JWK') {
      try {
        const parsed = JSON.parse(val) as { d?: unknown };
        if (typeof parsed.d === 'string' && parsed.d.length >= 6) {
          targets.push({ label: 'clave privada "d" de VAPID_PRIVATE_JWK', value: parsed.d });
        }
      } catch {
        // Ignorar si no es JSON válido aquí; push-secrets lo valida estrictamente
      }
    }
  }
  return targets;
}

async function main() {
  const errors: string[] = [];

  if (!existsSync(DIST_DIR)) {
    console.error(`❌ No existe ${DIST_DIR}. Ejecuta "bun run build" antes de auditar.`);
    process.exit(1);
  }

  for (const rel of REQUIRED_DIST_FILES) {
    const p = join(DIST_DIR, rel);
    if (!existsSync(p)) {
      errors.push(`Falta activo requerido en dist/: ${rel}`);
    }
  }

  const indexHtmlPath = join(DIST_DIR, 'index.html');
  if (existsSync(indexHtmlPath)) {
    const html = readFileSync(indexHtmlPath, 'utf8');
    const cssMatch = html.match(/href=["'](\/assets\/[^"']+\.css)["']/i);
    if (!cssMatch) {
      errors.push('dist/index.html no referencia ninguna hoja de estilos compilada (/assets/*.css).');
    } else {
      const cssRel = cssMatch[1].replace(/^\//, '');
      if (!existsSync(join(DIST_DIR, cssRel))) {
        errors.push(`La hoja de estilos referenciada en index.html no existe en dist/: ${cssRel}`);
      }
    }
  }

  const secretValues = existsSync(DEV_VARS_PATH)
    ? extractSecretValues(parseDevVars(readFileSync(DEV_VARS_PATH, 'utf8')))
    : [];

  const textExtRe = /\.(js|mjs|cjs|css|html|json|webmanifest|txt|svg|map)$/i;
  const distFiles = collectFiles(DIST_DIR);

  for (const filePath of distFiles) {
    if (!textExtRe.test(filePath)) continue;
    const relPath = relative(ROOT_DIR, filePath);
    const content = readFileSync(filePath, 'utf8');

    for (const tokenName of FORBIDDEN_TOKEN_NAMES) {
      if (content.includes(tokenName)) {
        errors.push(`Nombre de secreto prohibido "${tokenName}" detectado en ${relPath}`);
      }
    }

    for (const item of secretValues) {
      if (content.includes(item.value)) {
        errors.push(`Posible fuga de ${item.label} detectada en ${relPath}`);
      }
    }
  }

  // Verificar que archivos sensibles no estén versionados en Git
  try {
    const gitProc = Bun.spawnSync(['git', 'ls-files', '--error-unmatch', 'apps/worker/.dev.vars'], {
      cwd: ROOT_DIR,
      stdout: 'ignore',
      stderr: 'ignore',
    });
    if (gitProc.exitCode === 0) {
      errors.push('apps/worker/.dev.vars está versionado en Git (.gitignore comprometido).');
    }

    const envProc = Bun.spawnSync(['git', 'ls-files', '.env'], {
      cwd: ROOT_DIR,
      stdout: 'pipe',
      stderr: 'ignore',
    });
    if (envProc.stdout.toString().trim().length > 0) {
      errors.push('Se encontró un archivo .env rastreado en Git.');
    }
  } catch {
    // Ignorar si git no está disponible
  }

  if (errors.length > 0) {
    console.error('❌ Auditoría pre-despliegue falló:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`✅ Auditoría dist/ superada (${distFiles.length} archivos revisados, 0 fugas de secretos, CSS y PWA íntegros).`);
}

main();
