import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  MOODLE_TOKEN?: string;
  MOODLE_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

const app = new Hono<{ Bindings: Env }>();

// API de Salud del Sistema y Estado del Sync (RF-10)
app.get('/api/health', async (c) => {
  try {
    const syncState = await c.env.DB.prepare('SELECT * FROM sync_state WHERE id = 1').first();
    const lastRun = await c.env.DB.prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1').first();
    
    return c.json({
      status: 'ok',
      timestamp: Date.now(),
      syncState,
      lastRun
    });
  } catch (error: any) {
    return c.json({
      status: 'error',
      error: error?.message ?? 'Error consultando D1'
    }, 500);
  }
});

// Panel de Materias (RF-02) - Lee exclusivamente de D1
app.get('/api/courses', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, shortname, fullname, progress, refreshed_at FROM courses ORDER BY fullname ASC'
    ).all();
    return c.json({ courses: results });
  } catch (error: any) {
    return c.json({ error: error?.message }, 500);
  }
});

// Tareas y Actividades (RF-03, RF-05) - Lee exclusivamente de D1
app.get('/api/items', async (c) => {
  const type = c.req.query('type');
  try {
    let query = 'SELECT * FROM synced_items WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (type) {
      query += ' AND item_type = ?';
      params.push(type);
    }

    query += ' ORDER BY due_date ASC, timemodified DESC';
    const stmt = c.env.DB.prepare(query);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return c.json({ items: results });
  } catch (error: any) {
    return c.json({ error: error?.message }, 500);
  }
});

// Export default para Cloudflare Workers
export default {
  fetch: app.fetch,

  // Manejador del Cron Trigger (RF-07)
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[CRON] Sync disparado a las: ${new Date(controller.scheduledTime).toISOString()}`);
    // En las siguientes fases, aquí se ejecuta el diff de Moodle hacia D1
  }
};
