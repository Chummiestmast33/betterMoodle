import type { MoodleClient } from '../moodle/client';
import type { CourseSection, CourseModule, CourseResourceFile } from '@better-moodle/shared';

const CONTENTS_CACHE_SEC = 21600; // 6 horas

interface CourseContentSyncRow {
  id: number;
  updated_at: number | null;
}

function normalizeFile(raw: any): CourseResourceFile | null {
  if (!raw || typeof raw !== 'object' || !raw.filename || !raw.fileurl) {
    return null;
  }

  // Limpiar cualquier query token si Moodle llegara a incluir uno
  let cleanUrl = String(raw.fileurl);
  let proxyUrl: string | undefined;
  try {
    const parsed = new URL(cleanUrl);
    parsed.searchParams.delete('token');
    parsed.searchParams.delete('wstoken');
    cleanUrl = parsed.toString();

    if (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'catedig.itlalaguna.edu.mx' &&
      parsed.pathname.startsWith('/webservice/pluginfile.php')
    ) {
      proxyUrl = `/api/files/proxy?url=${encodeURIComponent(cleanUrl)}`;
    }
  } catch {
    // Mantener cleanUrl tal cual si no es URL absoluta
  }

  return {
    filename: String(raw.filename),
    fileurl: cleanUrl,
    filesize: typeof raw.filesize === 'number' ? raw.filesize : null,
    filepath: raw.filepath ? String(raw.filepath) : null,
    mimetype: raw.mimetype ? String(raw.mimetype) : null,
    timemodified: typeof raw.timemodified === 'number' ? raw.timemodified : null,
    proxy_url: proxyUrl,
  };
}

function normalizeSections(rawSections: unknown[]): CourseSection[] {
  if (!Array.isArray(rawSections)) return [];

  return rawSections
    .filter((s): s is Record<string, any> => Boolean(s && typeof s === 'object'))
    .map((s) => {
      const rawModules = Array.isArray(s.modules) ? s.modules : [];
      const modules: CourseModule[] = rawModules
        .filter((m): m is Record<string, any> => Boolean(m && typeof m === 'object' && m.id && m.name))
        .map((m) => {
          const rawFiles = Array.isArray(m.contents) ? m.contents : [];
          const contents = rawFiles
            .map(normalizeFile)
            .filter((f): f is CourseResourceFile => f !== null);

          return {
            id: Number(m.id),
            name: String(m.name),
            instance: typeof m.instance === 'number' ? m.instance : undefined,
            modname: String(m.modname || 'resource'),
            modplural: m.modplural ? String(m.modplural) : undefined,
            description: m.description ? String(m.description) : null,
            url: m.url ? String(m.url) : null,
            visible: typeof m.visible === 'number' ? m.visible : undefined,
            contents: contents.length > 0 ? contents : undefined,
          };
        });

      return {
        id: Number(s.id ?? 0),
        name: String(s.name || 'General'),
        visible: typeof s.visible === 'number' ? s.visible : undefined,
        summary: s.summary ? String(s.summary) : null,
        section: typeof s.section === 'number' ? s.section : undefined,
        modules,
      };
    });
}

export async function syncCourseContents(
  db: D1Database,
  client: MoodleClient,
  now: number,
  force = false
): Promise<{ partial: boolean; syncedCount: number }> {
  const staleThreshold = now - CONTENTS_CACHE_SEC;

  const query = force
    ? 'SELECT c.id, cc.updated_at FROM courses c LEFT JOIN course_contents cc ON cc.course_id = c.id ORDER BY COALESCE(cc.updated_at, 0) ASC'
    : `SELECT c.id, cc.updated_at
       FROM courses c
       LEFT JOIN course_contents cc ON cc.course_id = c.id
       WHERE cc.updated_at IS NULL OR cc.updated_at < ?
       ORDER BY COALESCE(cc.updated_at, 0) ASC`;

  const rows = force
    ? await db.prepare(query).all<CourseContentSyncRow>()
    : await db.prepare(query).bind(staleThreshold).all<CourseContentSyncRow>();

  if (rows.results.length === 0) {
    return { partial: false, syncedCount: 0 };
  }

  let syncedCount = 0;
  let partial = false;

  for (const row of rows.results) {
    if (client.remainingBudget <= 3) {
      partial = true;
      break;
    }

    const rawSections = await client.getCourseContents(row.id);
    const sections = normalizeSections(rawSections);

    await db
      .prepare(
        `INSERT INTO course_contents (course_id, sections_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(course_id) DO UPDATE SET
           sections_json = excluded.sections_json,
           updated_at = excluded.updated_at`
      )
      .bind(row.id, JSON.stringify(sections), now)
      .run();

    syncedCount++;
  }

  if (syncedCount < rows.results.length) {
    partial = true;
  }

  return { partial, syncedCount };
}
