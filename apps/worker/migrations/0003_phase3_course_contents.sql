-- 0003_phase3_course_contents.sql
-- Almacenamiento de secciones y recursos del curso para Fase 3 (BFF Read API)

CREATE TABLE IF NOT EXISTS course_contents (
  course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  sections_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
