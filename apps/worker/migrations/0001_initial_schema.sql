-- 0001_initial_schema.sql
-- Migraciones núcleo (Fase 1, monousuario)

-- Caché de materias: alimenta el dashboard sin tocar Moodle
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,             -- courseid de Moodle
  shortname TEXT NOT NULL,
  fullname TEXT NOT NULL,
  progress REAL,
  payload_json TEXT,
  refreshed_at INTEGER NOT NULL
);

-- Elementos sincronizados (tareas, calificaciones, avisos)
CREATE TABLE IF NOT EXISTS synced_items (
  item_key TEXT PRIMARY KEY,          -- assign_<cmid> | grade_<itemid> | discussion_<id>
  course_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,            -- assignment | grade | announcement
  title TEXT NOT NULL,
  url TEXT,
  due_date INTEGER,                   -- Unix timestamp
  grade_num REAL,                     -- normalizado numéricamente
  timemodified INTEGER NOT NULL,
  payload_json TEXT,
  first_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                  -- tombstone
);

CREATE INDEX IF NOT EXISTS idx_items_course ON synced_items(course_id);
CREATE INDEX IF NOT EXISTS idx_items_due ON synced_items(due_date) WHERE deleted_at IS NULL;

-- Estado global: evita la inundación de notificaciones del primer run
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  baseline_seeded INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sync_state (id, baseline_seeded, last_success_at, last_attempt_at, consecutive_failures) 
VALUES (1, 0, 0, 0, 0);

-- Observabilidad: registro de ejecuciones del cron
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,               -- ok | partial | error
  subrequests_used INTEGER,
  items_changed INTEGER,
  error TEXT
);

-- Suscripciones push (Web Push preparado para Fase 4)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
