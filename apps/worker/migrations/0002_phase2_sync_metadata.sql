-- 0002_phase2_sync_metadata.sql
-- Metadatos para polling escalonado, estado de entrega, circuit breaker y dead man's switch (Fase 2)

ALTER TABLE courses ADD COLUMN grades_synced_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE courses ADD COLUMN forums_synced_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE synced_items ADD COLUMN submission_status TEXT;
ALTER TABLE synced_items ADD COLUMN status_synced_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sync_state ADD COLUMN moodle_user_id INTEGER;
ALTER TABLE sync_state ADD COLUMN courses_refreshed_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN grades_seeded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN forums_seeded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN circuit_open_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN dead_man_alerted INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_items_type_status ON synced_items(item_type, deleted_at);
