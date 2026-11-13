import {
  BookOpen,
  Clock,
  Award,
  Megaphone,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { DashboardResponse, SyncedItem } from '@better-moodle/shared';
import {
  formatCountdown,
  formatUnixDate,
  formatRelativeTime,
  getMoodleDeepLink,
} from '../lib/format';

interface OverviewViewProps {
  dashboard: DashboardResponse | undefined;
  allAssignments: SyncedItem[];
  isLoading: boolean;
  onSelectCourse: (courseId: number) => void;
  onNavigateTasks: () => void;
}

export function OverviewView({
  dashboard,
  allAssignments,
  isLoading,
  onSelectCourse,
  onNavigateTasks,
}: OverviewViewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 bg-slate-900/80 border border-slate-800 rounded-xl" />
        ))}
      </div>
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const courses = dashboard?.courses ?? [];
  const upcoming = dashboard?.upcoming_assignments ?? [];
  const pendingCount = allAssignments.filter(
    (a) => a.submission_status !== 'submitted' && a.submission_status !== 'graded' && (!a.due_date || a.due_date >= nowSec)
  ).length;
  const urgentCount = upcoming.filter((a) => a.due_date && a.due_date - nowSec <= 48 * 3600).length;
  const announcements = (dashboard?.recent_activity ?? []).filter((a) => a.item_type === 'announcement');
  const recentGrades = (dashboard?.current_grades ?? []).filter((g) => g.grade_num !== null).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Materias</span>
            <BookOpen className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{courses.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Sincronizadas en D1</p>
        </div>

        <button
          type="button"
          onClick={onNavigateTasks}
          className="text-left bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 transition"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pendientes</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{pendingCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Ver lista de tareas →</p>
        </button>

        <button
          type="button"
          onClick={onNavigateTasks}
          className="text-left bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-xl p-4 transition"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Urgentes (48h)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-300">{urgentCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Por vencer pronto</p>
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Calificaciones</span>
            <Award className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{recentGrades.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Evaluadas recientes</p>
        </div>
      </div>

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Materias */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            Mis Materias
          </h2>
          {courses.length === 0 ? (
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
              No hay materias sincronizadas todavía.
            </div>
          ) : (
            <div className="space-y-2.5">
              {courses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onSelectCourse(course.id)}
                  className="w-full text-left p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/90 transition group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-300 transition">
                        {course.fullname}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{course.shortname}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 shrink-0 mt-0.5" />
                  </div>
                  {typeof course.progress === 'number' && (
                    <div className="mt-2.5">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Progreso</span>
                        <span>{Math.round(course.progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, course.progress))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right: Próximos Vencimientos + Avisos + Calificaciones */}
        <div className="lg:col-span-2 space-y-6">
          {/* Próximas entregas */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Próximos Vencimientos
              </h2>
              <button
                type="button"
                onClick={onNavigateTasks}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Ver todas
              </button>
            </div>

            {upcoming.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                ¡Todo despejado! No tienes entregas próximas pendientes.
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 6).map((task) => {
                  const isUrgent = task.due_date && task.due_date - nowSec <= 48 * 3600;
                  const isSubmitted =
                    task.submission_status === 'submitted' || task.submission_status === 'graded';
                  return (
                    <div
                      key={task.item_key}
                      className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {task.course_name || `Curso #${task.course_id}`}
                          </span>
                          {isSubmitted ? (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                              Entregada
                            </span>
                          ) : isUrgent ? (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                              {formatCountdown(task.due_date, nowSec)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {formatCountdown(task.due_date, nowSec)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-100 mt-1 truncate">
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-400">{formatUnixDate(task.due_date)}</p>
                      </div>
                      <a
                        href={getMoodleDeepLink({
                          item_key: task.item_key,
                          item_type: 'assignment',
                          url: task.url,
                          course_id: task.course_id,
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium transition"
                      >
                        Entregar <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Calificaciones y Avisos recientes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Award className="w-4 h-4 text-cyan-400" />
                Calificaciones Recientes
              </h2>
              {recentGrades.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                  Sin calificaciones registradas aún.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentGrades.map((g) => (
                    <div
                      key={g.item_key}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{g.title}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {g.course_name || `Curso #${g.course_id}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-lg">
                        {g.grade_num}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-violet-400" />
                Últimos Avisos
              </h2>
              {announcements.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                  Sin avisos en foros recientemente.
                </div>
              ) : (
                <div className="space-y-2">
                  {announcements.slice(0, 5).map((ann) => (
                    <a
                      key={ann.item_key}
                      href={getMoodleDeepLink({
                        item_key: ann.item_key,
                        item_type: 'announcement',
                        url: ann.url,
                        course_id: ann.course_id,
                      })}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-violet-500/40 transition"
                    >
                      <p className="text-xs font-medium text-slate-200 truncate">{ann.title}</p>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                        <span className="truncate">{ann.course_name || `Curso #${ann.course_id}`}</span>
                        <span>{formatRelativeTime(ann.timemodified)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
