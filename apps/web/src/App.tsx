import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDashboard, fetchHealth, fetchItems } from './lib/api';
import { CourseDetailView } from './views/CourseDetailView';
import { HealthView } from './views/HealthView';
import { OverviewView } from './views/OverviewView';
import { SettingsView } from './views/SettingsView';
import { TasksView } from './views/TasksView';

type AppView = 'overview' | 'tasks' | 'course' | 'health' | 'settings';

const COMPACT_STORAGE_KEY = 'bm_compact_mode';

function parseInitialView(): { view: AppView; courseId: number | null } {
  if (typeof window === 'undefined') {
    return { view: 'overview', courseId: null };
  }
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get('view');
  const rawCourseId = params.get('courseId');
  const parsedCourseId =
    rawCourseId && /^\d+$/.test(rawCourseId) ? Number(rawCourseId) : null;

  if (
    rawView === 'overview' ||
    rawView === 'tasks' ||
    rawView === 'course' ||
    rawView === 'health' ||
    rawView === 'settings'
  ) {
    return { view: rawView, courseId: parsedCourseId };
  }

  return { view: 'overview', courseId: parsedCourseId };
}

function readCompactPreference(): boolean {
  try {
    return window.localStorage.getItem(COMPACT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  shortLabel: string;
  icon: string;
}> = [
  { id: 'overview', label: 'Resumen', shortLabel: 'Resumen', icon: '◈' },
  { id: 'tasks', label: 'Tareas', shortLabel: 'Tareas', icon: '☑' },
  { id: 'course', label: 'Materias', shortLabel: 'Materias', icon: '☰' },
  { id: 'health', label: 'Salud', shortLabel: 'Salud', icon: '♡' },
  { id: 'settings', label: 'Configuración', shortLabel: 'Config', icon: '⚙' },
];

export function App() {
  const queryClient = useQueryClient();
  const initial = useMemo(() => parseInitialView(), []);
  const [activeView, setActiveView] = useState<AppView>(initial.view);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(
    initial.courseId,
  );
  const [compactMode, setCompactMode] = useState<boolean>(() =>
    readCompactPreference(),
  );

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });

  const itemsQuery = useQuery({
    queryKey: ['items'],
    queryFn: () => fetchItems(),
  });

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  const dashboard = dashboardQuery.data;
  const items = itemsQuery.data?.items ?? [];
  const health = healthQuery.data;
  const isLoading =
    dashboardQuery.isLoading || itemsQuery.isLoading || healthQuery.isLoading;
  const isRefreshing =
    dashboardQuery.isFetching || itemsQuery.isFetching || healthQuery.isFetching;
  const errorObj = dashboardQuery.error ?? itemsQuery.error ?? healthQuery.error;
  const error =
    errorObj instanceof Error
      ? errorObj.message
      : errorObj
      ? 'No se pudo cargar la información desde la caché local.'
      : null;

  useEffect(() => {
    if (selectedCourseId === null && dashboard?.courses[0]) {
      setSelectedCourseId(dashboard.courses[0].id);
    }
  }, [selectedCourseId, dashboard]);

  const navigate = useCallback((view: AppView, courseId?: number) => {
    setActiveView(view);
    if (typeof courseId === 'number') {
      setSelectedCourseId(courseId);
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', view);
      if (view === 'course' && typeof courseId === 'number') {
        url.searchParams.set('courseId', String(courseId));
      } else {
        url.searchParams.delete('courseId');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore history errors in restricted contexts
    }
  }, []);

  const handleToggleCompactMode = useCallback(() => {
    setCompactMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COMPACT_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const assignments = useMemo(
    () => items.filter((item) => item.item_type === 'assignment'),
    [items],
  );

  const courses = dashboard?.courses ?? [];
  const effectiveCourseId = selectedCourseId ?? courses[0]?.id ?? 0;

  return (
    <div
      className={`min-h-screen bg-slate-950 text-slate-100 ${
        compactMode ? 'text-[13px] leading-snug' : 'text-sm'
      }`}
    >
      {/* Top navigation bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('overview')}
            className="flex items-center gap-2.5 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-base font-bold text-sky-400 ring-1 ring-sky-500/30">
              BM
            </span>
            <div>
              <span className="block text-sm font-semibold tracking-tight text-white">
                BetterMoodle
              </span>
              <span className="block text-[11px] text-slate-400">
                ITL · CATEDIG Monitor
              </span>
            </div>
          </button>

          {/* Desktop nav */}
          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-1 md:flex"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {health && (
              <span
                className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
                  health.status === 'ok'
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                    : health.status === 'circuit_open'
                    ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'
                    : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    health.status === 'ok'
                      ? 'bg-emerald-400'
                      : health.status === 'circuit_open'
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                  }`}
                />
                {health.status === 'ok'
                  ? 'Al día'
                  : health.status === 'circuit_open'
                  ? 'Circuit Breaker'
                  : 'Caché degradada'}
              </span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              {isRefreshing ? 'Cargando...' : 'Recargar'}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main
        className={`mx-auto max-w-6xl px-4 pb-24 md:pb-10 ${
          compactMode ? 'pt-4' : 'pt-6'
        }`}
      >
        {error && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <span>{error}</span>
            <button
              type="button"
              onClick={handleRefresh}
              className="shrink-0 rounded-md bg-rose-500/20 px-2.5 py-1 font-medium text-rose-100 hover:bg-rose-500/30"
            >
              Reintentar
            </button>
          </div>
        )}

        {activeView === 'overview' && (
          <OverviewView
            dashboard={dashboard}
            allAssignments={assignments}
            isLoading={isLoading}
            onSelectCourse={(courseId) => navigate('course', courseId)}
            onNavigateTasks={() => navigate('tasks')}
          />
        )}

        {activeView === 'tasks' && (
          <TasksView
            assignments={assignments}
            courses={courses}
            isLoading={isLoading}
          />
        )}

        {activeView === 'course' && (
          <CourseDetailView
            courseId={effectiveCourseId}
            courses={courses}
            items={items}
            onSelectCourse={(courseId) => navigate('course', courseId)}
            onBack={() => navigate('overview')}
          />
        )}

        {activeView === 'health' && (
          <HealthView health={health} isLoading={isLoading} />
        )}

        {activeView === 'settings' && (
          <SettingsView
            compactMode={compactMode}
            onToggleCompactMode={handleToggleCompactMode}
          />
        )}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur md:hidden"
      >
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  active ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-base leading-none" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default App;
