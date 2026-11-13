import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  Download,
  ExternalLink,
  Award,
  FolderOpen,
  Megaphone,
  CheckSquare,
} from 'lucide-react';
import type { DashboardCourse, SyncedItem } from '@better-moodle/shared';
import { fetchCourseContents, fetchCourseGrades } from '../lib/api';
import {
  buildProxyFileUrl,
  formatFileSize,
  formatUnixDate,
  getMoodleDeepLink,
} from '../lib/format';

interface CourseDetailViewProps {
  courseId: number;
  courses: DashboardCourse[];
  items: SyncedItem[];
  onSelectCourse: (id: number) => void;
  onBack: () => void;
}

type CourseTab = 'contents' | 'grades' | 'activity';

export function CourseDetailView({
  courseId,
  courses,
  items,
  onSelectCourse,
  onBack,
}: CourseDetailViewProps) {
  const [tab, setTab] = useState<CourseTab>('contents');
  const course = courses.find((c) => c.id === courseId);

  const contentsQuery = useQuery({
    queryKey: ['course-contents', courseId],
    queryFn: () => fetchCourseContents(courseId),
  });

  const gradesQuery = useQuery({
    queryKey: ['course-grades', courseId],
    queryFn: () => fetchCourseGrades(courseId),
  });

  const courseAssignments = items.filter(
    (i) => i.course_id === courseId && i.item_type === 'assignment'
  );
  const courseAnnouncements = items.filter(
    (i) => i.course_id === courseId && i.item_type === 'announcement'
  );

  return (
    <div className="space-y-5">
      {/* Header & Course Switcher */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition shrink-0"
              aria-label="Volver al resumen"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-xs text-indigo-400 font-medium">
                {course?.shortname || `Curso #${courseId}`}
              </p>
              <h2 className="text-lg font-bold text-slate-100">
                {course?.fullname || 'Detalle de Materia'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={courseId}
              onChange={(e) => onSelectCourse(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortname} — {c.fullname}
                </option>
              ))}
            </select>
            <a
              href={`https://catedig.itlalaguna.edu.mx/course/view.php?id=${courseId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition shrink-0"
            >
              Moodle <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 border-t border-slate-800 pt-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('contents')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition shrink-0 ${
              tab === 'contents'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Recursos y Temario
          </button>

          <button
            type="button"
            onClick={() => setTab('grades')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition shrink-0 ${
              tab === 'grades'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Calificaciones ({gradesQuery.data?.grades.length ?? 0})
          </button>

          <button
            type="button"
            onClick={() => setTab('activity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition shrink-0 ${
              tab === 'activity'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Tareas y Avisos ({courseAssignments.length + courseAnnouncements.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'contents' && (
        <div className="space-y-4">
          {contentsQuery.isLoading ? (
            <div className="p-6 text-center text-sm text-slate-400">
              Cargando recursos cacheados en D1...
            </div>
          ) : !contentsQuery.data?.sections.length ? (
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
              <p className="text-sm text-slate-300">
                Aún no hay secciones o archivos cacheados para esta materia.
              </p>
              <p className="text-xs text-slate-500">
                Los recursos se indexan desde Moodle en segundo plano; puedes forzar una sincronización desde la pestaña Salud.
              </p>
            </div>
          ) : (
            contentsQuery.data.sections.map((section) => (
              <div
                key={section.id}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">{section.name}</h3>
                  <span className="text-[11px] text-slate-500">
                    {section.modules.length} {section.modules.length === 1 ? 'elemento' : 'elementos'}
                  </span>
                </div>

                {section.modules.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-500">Sección sin recursos publicados.</p>
                ) : (
                  <div className="divide-y divide-slate-800/70">
                    {section.modules.map((mod) => (
                      <div key={mod.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                {mod.modname}
                              </span>
                              <p className="text-sm font-medium text-slate-200 truncate">{mod.name}</p>
                            </div>
                          </div>

                          {mod.url && (
                            <a
                              href={mod.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              Abrir <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        {mod.contents && mod.contents.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2 border-l-2 border-slate-800">
                            {mod.contents.map((file, idx) => {
                              const downloadHref = file.proxy_url || buildProxyFileUrl(file.fileurl);
                              return (
                                <a
                                  key={`${mod.id}-${idx}`}
                                  href={downloadHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition group"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-300">
                                        {file.filename}
                                      </p>
                                      <p className="text-[10px] text-slate-500">
                                        {formatFileSize(file.filesize) || file.mimetype || 'Archivo'}
                                      </p>
                                    </div>
                                  </div>
                                  <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-300 shrink-0" />
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'grades' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {gradesQuery.isLoading ? (
            <div className="p-6 text-center text-sm text-slate-400">Cargando calificaciones...</div>
          ) : !gradesQuery.data?.grades.length ? (
            <div className="p-6 text-center text-sm text-slate-400">
              No hay elementos de calificación registrados para esta materia.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {gradesQuery.data.grades.map((g) => (
                <div
                  key={g.item_key}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      {g.itemtype && (
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {g.itemtype === 'course' ? 'Total' : g.itemmodule || g.itemtype}
                        </span>
                      )}
                      <p className="text-sm font-medium text-slate-100">{g.title}</p>
                    </div>
                    {g.feedback && (
                      <p
                        className="text-xs text-slate-400 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: g.feedback }}
                      />
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      {typeof g.grademax === 'number' && (
                        <span>
                          Rango: {g.grademin ?? 0} – {g.grademax}
                        </span>
                      )}
                      {g.percentage_formatted && <span>({g.percentage_formatted})</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-base font-bold px-3 py-1 rounded-lg border ${
                        g.grade_num !== null
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                          : 'bg-slate-950 text-slate-500 border-slate-800'
                      }`}
                    >
                      {g.grade_num !== null ? g.grade_num : '—'}
                    </span>
                    {g.url && (
                      <a
                        href={g.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-400 hover:text-indigo-300"
                        title="Ver en Moodle"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              Tareas de la Materia
            </h3>
            {courseAssignments.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                Sin tareas registradas.
              </div>
            ) : (
              <div className="space-y-2">
                {courseAssignments.map((a) => (
                  <a
                    key={a.item_key}
                    href={getMoodleDeepLink(a)}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition"
                  >
                    <p className="text-sm font-medium text-slate-100">{a.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatUnixDate(a.due_date)}</p>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-violet-400" />
              Avisos y Foros
            </h3>
            {courseAnnouncements.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                Sin discusiones o avisos en foros.
              </div>
            ) : (
              <div className="space-y-2">
                {courseAnnouncements.map((ann) => (
                  <a
                    key={ann.item_key}
                    href={getMoodleDeepLink(ann)}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-violet-500/40 transition"
                  >
                    <p className="text-sm font-medium text-slate-100">{ann.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatUnixDate(ann.timemodified)}</p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
