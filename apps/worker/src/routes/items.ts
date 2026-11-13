import { Hono } from 'hono';
import type { Env } from '../types';

export const itemsRouter = new Hono<{ Bindings: Env }>();

// Tareas y Actividades (RF-03, RF-05) - Lee exclusivamente de D1
itemsRouter.get('/', async (c) => {
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

    return c.json({ items: results ?? [] }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error consultando items';
    return c.json({ error: message, status: 'error' }, 500);
  }
});
