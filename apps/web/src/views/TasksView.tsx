import { useState, useMemo } from 'react';
import { Search, ExternalLink, Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { DashboardCourse, SyncedItem } from '@better-moodle/shared';
import {
  classifyTaskStatus,
  formatCountdown,
  formatUnixDate,
  getMoodleDeepLink,
  type TaskFilterState,
} from '../lib/format';

interface TasksViewProps {
  assignments: SyncedItem[];
  courses: DashboardCourse[];
  isLoading: boolean;
}

const FILTER_TABS: Array<{ id: TaskFilterState; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'upcoming', label: 'Próximas (72h)' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'submitted', label: 'Entregadas' },
  { id: 'overdue', label: 'Vencidas' },
];

const STATUS_BADGE: Record<Exclude<TaskFilterState, 'all'>, { label: string; cls: string }> = {
  upcoming: {
    label: 'Próxima',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  pending: {
    label: 'Pendiente',
    cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  },
  submitted: {
    label: 'Entregada',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  overdue: {
    label: 'Vencida',
    cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
};

export function TasksView({ assignments, courses, isLoading }: TasksViewProps) {
  const [filter, setFilter] = useState<TaskFilterState>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const nowSec = Math.floor(Date.now() / 1000);
  const courseMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of courses) {
      map.set(c.id, c.shortname || c.fullname);
    }
    return map;
  }, [courses]);

  const counts = useMemo(() => {
    const tally: Record<TaskFilterState, number> = {
      all: assignments.length,
      pending: 0,
      upcoming: 0,
      submitted: 0,
      overdue: 0,
    };
    for (const item of assignments) {
      const status = classifyTaskStatus(item, nowSec);
      tally[status]++;
    }
    return tally;
  }, [assignments, nowSec]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments
      .filter((item) => {
        if (courseFilter !== 'all' && String(item.course_id) !== courseFilter) return false;
        if (filter !== 'all' && classifyTaskStatus(item, nowSec) !== filter) return false;
        if (q && !item.title.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const aDue = a.due_date ?? Number.MAX_SAFE_INTEGER;
        const bDue = b.due_date ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
  }, [assignments, courseFilter, filter, search, nowSec]);

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-slate-400">Cargando tareas desde D1...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] ${
                    active ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarea por nombre..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Todas las materias</option>
            {courses.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.shortname} — {c.fullname}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-900/60 border border-slate-800 text-sm text-slate-400">
          No hay tareas que coincidan con los filtros actuales.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((task) => {
            const status = classifyTaskStatus(task, nowSec);
            const badge = STATUS_BADGE[status];
            const courseLabel = courseMap.get(task.course_id) || `Curso #${task.course_id}`;

            return (
              <div
                key={task.item_key}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {courseLabel}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {task.submission_status === 'graded' && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Calificada
                      </span>
                    )}
                  </div>

                  <p className="text-sm sm:text-base font-medium text-slate-100">{task.title}</p>

                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {formatUnixDate(task.due_date)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {status === 'overdue' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      {formatCountdown(task.due_date, nowSec)}
                    </span>
                  </div>
                </div>

                <a
                  href={getMoodleDeepLink(task)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                >
                  Abrir en Moodle <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
