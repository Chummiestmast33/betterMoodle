/**
 * Obtiene e imprime el wstoken completo de Moodle para copiarlo en .dev.vars o Wrangler.
 *
 * Uso:
 *   bun run get-token <NUM_CONTROL> <PASSWORD>
 */

const MOODLE_URL = process.env.MOODLE_URL || 'https://catedig.itlalaguna.edu.mx';

async function main() {
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    console.log('Uso: bun run get-token <NUM_CONTROL> <PASSWORD>');
    process.exit(1);
  }

  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);
  params.append('service', 'moodle_mobile_app');

  const res = await fetch(`${MOODLE_URL}/login/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = (await res.json()) as { token?: string; error?: string; errorcode?: string };

  if (data.error || !data.token) {
    console.error(`Error (${data.errorcode ?? 'desconocido'}): ${data.error ?? 'No se recibió token'}`);
    process.exit(1);
  }

  console.log('\nTu wstoken de Moodle es:\n');
  console.log(data.token);
  console.log('');
}

main().catch((err: Error) => {
  console.error('Error de red:', err.message);
  process.exit(1);
});
