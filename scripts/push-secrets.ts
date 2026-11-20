import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const DEV_VARS_PATH = join(ROOT_DIR, 'apps', 'worker', '.dev.vars');
const WORKER_DIR = join(ROOT_DIR, 'apps', 'worker');

const REQUIRED_SECRETS = [
  'MOODLE_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'VAPID_PRIVATE_JWK',
  'VAPID_PUBLIC_KEY',
  'VAPID_SUBJECT',
] as const;

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

function validateVars(vars: Record<string, string>): void {
  for (const key of REQUIRED_SECRETS) {
    const val = vars[key];
    if (!val || val.trim().length === 0 || val.startsWith('tu_')) {
      throw new Error(`Falta un valor válido para "${key}" en apps/worker/.dev.vars`);
    }
  }

  let parsedJwk: { kty?: unknown; crv?: unknown; d?: unknown };
  try {
    parsedJwk = JSON.parse(vars.VAPID_PRIVATE_JWK) as {
      kty?: unknown;
      crv?: unknown;
      d?: unknown;
    };
  } catch {
    throw new Error('VAPID_PRIVATE_JWK en apps/worker/.dev.vars no es un JSON válido.');
  }

  if (parsedJwk.kty !== 'EC' || typeof parsedJwk.d !== 'string' || parsedJwk.d.length < 10) {
    throw new Error(
      'VAPID_PRIVATE_JWK no contiene una clave privada EC P-256 válida (falta "kty":"EC" o "d").'
    );
  }
}

async function main() {
  if (!existsSync(DEV_VARS_PATH)) {
    console.error('❌ No se encontró apps/worker/.dev.vars');
    process.exit(1);
  }

  const vars = parseDevVars(readFileSync(DEV_VARS_PATH, 'utf8'));
  validateVars(vars);

  const whoami = Bun.spawnSync(['bun', '--cwd', WORKER_DIR, 'wrangler', 'whoami'], {
    cwd: ROOT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const whoamiOut = whoami.stdout.toString();
  if (whoami.exitCode !== 0 || whoamiOut.includes('You are not authenticated')) {
    console.error('❌ Wrangler no está autenticado. Ejecuta primero: bun --cwd apps/worker wrangler login');
    process.exit(1);
  }

  const payload: Record<string, string> = {};
  for (const key of REQUIRED_SECRETS) {
    payload[key] = vars[key];
  }

  console.log('Subiendo secretos en lote a Cloudflare Workers (wrangler secret bulk)...');
  const proc = Bun.spawn(['bun', '--cwd', WORKER_DIR, 'wrangler', 'secret', 'bulk'], {
    cwd: ROOT_DIR,
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    throw new Error(`Falló wrangler secret bulk (exit ${exitCode}): ${stderr || stdout}`.trim());
  }

  for (const key of REQUIRED_SECRETS) {
    console.log(`  ✅ ${key} sincronizado`);
  }
  console.log('✅ Todos los secretos se cargaron correctamente sin exponer valores.');
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
