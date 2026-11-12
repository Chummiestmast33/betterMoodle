/**
 * Script de validación de Fase 0 (Gate de Validación - Semáforo)
 * Verifica si Moodle Mobile WebServices está activo y qué funciones permite.
 * 
 * Uso:
 *   bun ./scripts/check-moodle-gate.ts <control/usuario> <contraseña>
 *   o directamente con token existente:
 *   bun ./scripts/check-moodle-gate.ts --token <wstoken>
 */

const MOODLE_URL = process.env.MOODLE_URL || 'https://catedig.itlalaguna.edu.mx';

const REQUIRED_FUNCTIONS = [
  'core_enrol_get_users_courses',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'core_course_get_contents',
  'gradereport_user_get_grade_items',
  'mod_forum_get_forums_by_courses',
  'mod_forum_get_forum_discussions',
];

async function main() {
  const args = process.argv.slice(2);
  let token = '';

  console.log('='.repeat(60));
  console.log('  BetterMoodle - Fase 0: Gate de Validación de WebServices');
  console.log('  Destino:', MOODLE_URL);
  console.log('='.repeat(60));

  if (args[0] === '--token' && args[1]) {
    token = args[1];
    console.log('\n[1/2] Usando wstoken provisto directamente...');
  } else if (args.length >= 2) {
    const [username, password] = args;
    console.log(`\n[1/2] Solicitando wstoken para usuario: ${username}...`);

    try {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);
      params.append('service', 'moodle_mobile_app');

      const res = await fetch(`${MOODLE_URL}/login/token.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await res.json() as any;

      if (data.error || data.errorcode) {
        console.error('\n❌ ERROR al solicitar token:');
        console.error(`   Código: ${data.errorcode}`);
        console.error(`   Mensaje: ${data.error}`);
        console.log('\nSEMÁFORO: 🔴 ROJO');
        console.log('El endpoint o servicio móvil rechazó las credenciales o está deshabilitado.');
        process.exit(1);
      }

      if (data.token) {
        token = data.token;
        console.log('✅ Token obtenido con éxito!');
        console.log(`   wstoken: ${token.substring(0, 8)}****************`);
      } else {
        console.error('❌ Respuesta inesperada de login/token.php:', data);
        process.exit(1);
      }
    } catch (err: any) {
      console.error('❌ Error de red conectando con Moodle:', err.message);
      process.exit(1);
    }
  } else {
    console.log('\nModo de uso:');
    console.log('  bun ./scripts/check-moodle-gate.ts <NUM_CONTROL> <PASSWORD>');
    console.log('  o');
    console.log('  bun ./scripts/check-moodle-gate.ts --token <WSTOKEN>');
    console.log('\nProbando accesibilidad básica del endpoint...');

    const res = await fetch(`${MOODLE_URL}/login/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'service=moodle_mobile_app',
    });
    const info = await res.json() as any;
    if (info.errorcode === 'missingparam') {
      console.log('✅ Endpoint login/token.php activo y respondiendo correctamente en Moodle.');
      console.log('Proporciona tus credenciales o token para completar la validación del semáforo.');
    }
    return;
  }

  // Paso 2: Verificar funciones permitidas
  console.log('\n[2/2] Consultando core_webservice_get_site_info...');
  try {
    const params = new URLSearchParams();
    params.append('wstoken', token);
    params.append('wsfunction', 'core_webservice_get_site_info');
    params.append('moodlewsrestformat', 'json');

    const res = await fetch(`${MOODLE_URL}/webservice/rest/server.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const siteInfo = await res.json() as any;

    if (siteInfo.exception) {
      console.error('❌ Excepción al invocar site_info:');
      console.error(`   ${siteInfo.message} (${siteInfo.errorcode})`);
      console.log('\nSEMÁFORO: 🔴 ROJO');
      process.exit(1);
    }

    console.log(`✅ Conexión establecida con Moodle de: ${siteInfo.fullname} (ID: ${siteInfo.userid})`);
    console.log(`   Versión Moodle: ${siteInfo.release || 'Desconocida'}`);
    console.log(`   Sitio: ${siteInfo.sitename}`);

    const availableFunctions = new Set((siteInfo.functions || []).map((f: any) => f.name));
    console.log(`\nFunciones disponibles en este token: ${availableFunctions.size}`);

    console.log('\nEvaluando funciones requeridas para BetterMoodle:');
    const missing: string[] = [];

    for (const fn of REQUIRED_FUNCTIONS) {
      const has = availableFunctions.has(fn);
      console.log(`  ${has ? '✅' : '❌'} ${fn}`);
      if (!has) missing.push(fn);
    }

    console.log('\n' + '='.repeat(60));
    if (missing.length === 0) {
      console.log('  SEMÁFORO: 🟢 VERDE');
      console.log('  Todas las funciones requeridas están activas.');
      console.log('  Listo para avanzar con la sincronización y alertas (Fase 1).');
    } else {
      console.log('  SEMÁFORO: 🟡 AMARILLO');
      console.log(`  Faltan ${missing.length} funciones (${missing.join(', ')}).`);
      console.log('  Se deben recortar los módulos afectados según §5 (Plan de Implementación).');
    }
    console.log('='.repeat(60));
  } catch (err: any) {
    console.error('❌ Error consultando WebServices:', err.message);
  }
}

main().catch(console.error);
