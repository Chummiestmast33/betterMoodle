import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Body1Strong,
  Button,
  Caption1,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Tab,
  TabList,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSync20Regular,
  BookOpen20Filled,
  BookOpen20Regular,
  CheckboxChecked20Filled,
  CheckboxChecked20Regular,
  HeartPulse20Filled,
  HeartPulse20Regular,
  Home20Filled,
  Home20Regular,
  Navigation20Regular,
  Settings20Filled,
  Settings20Regular,
} from '@fluentui/react-icons';
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

const useStyles = makeStyles({
  root: {
    minHeight: '100vh',
    overflowX: 'clip',
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    boxShadow: tokens.shadow2,
  },
  headerInner: {
    maxWidth: '1152px',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingTop: '10px',
    paddingBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  brandBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
    backgroundColor: 'transparent',
    ...shorthands.border('none'),
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
    color: 'inherit',
  },
  brandText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  brandSubtitle: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  desktopNav: {
    display: 'none',
    '@media (min-width: 1024px)': {
      display: 'flex',
      alignItems: 'center',
      minWidth: 0,
    },
  },
  tabletHamburgerNav: {
    display: 'none',
    '@media (min-width: 768px) and (max-width: 1023px)': {
      display: 'flex',
      alignItems: 'center',
    },
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  statusBadge: {
    display: 'none',
    '@media (min-width: 640px)': {
      display: 'inline-flex',
    },
  },
  main: {
    maxWidth: '1152px',
    width: '100%',
    minWidth: 0,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingTop: '24px',
    paddingBottom: '92px',
    '@media (min-width: 768px)': {
      paddingBottom: '40px',
    },
  },
  mainCompact: {
    paddingTop: '16px',
  },
  errorBanner: {
    marginBottom: '16px',
  },
  mobileNav: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    boxShadow: tokens.shadow8,
    paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
    '@media (min-width: 768px)': {
      display: 'none',
    },
  },
  mobileNavBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    paddingTop: '8px',
    paddingBottom: '6px',
    backgroundColor: 'transparent',
    ...shorthands.border('none'),
    cursor: 'pointer',
    color: tokens.colorNeutralForeground3,
    fontFamily: 'inherit',
  },
  mobileNavBtnActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  mobileNavLabel: {
    fontSize: '11px',
    lineHeight: '14px',
  },
});

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  shortLabel: string;
  renderIcon: (active: boolean) => React.ReactElement;
}> = [
  {
    id: 'overview',
    label: 'Resumen',
    shortLabel: 'Resumen',
    renderIcon: (active) => (active ? <Home20Filled /> : <Home20Regular />),
  },
  {
    id: 'tasks',
    label: 'Tareas',
    shortLabel: 'Tareas',
    renderIcon: (active) =>
      active ? <CheckboxChecked20Filled /> : <CheckboxChecked20Regular />,
  },
  {
    id: 'course',
    label: 'Materias',
    shortLabel: 'Materias',
    renderIcon: (active) => (active ? <BookOpen20Filled /> : <BookOpen20Regular />),
  },
  {
    id: 'health',
    label: 'Salud',
    shortLabel: 'Salud',
    renderIcon: (active) =>
      active ? <HeartPulse20Filled /> : <HeartPulse20Regular />,
  },
  {
    id: 'settings',
    label: 'Configuración',
    shortLabel: 'Config',
    renderIcon: (active) => (active ? <Settings20Filled /> : <Settings20Regular />),
  },
];

export function App() {
  const styles = useStyles();
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

  const navigate = useCallback((view: AppView, courseId?: number | null) => {
    setActiveView(view);
    if (view === 'course') {
      setSelectedCourseId(typeof courseId === 'number' ? courseId : null);
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

  return (
    <div className={styles.root}>
      {/* Top navigation bar */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button
            type="button"
            onClick={() => navigate('overview')}
            className={styles.brandBtn}
          >
            <Avatar
              name="Better Moodle"
              initials="BM"
              color="brand"
              shape="square"
              size={36}
            />
            <div className={styles.brandText}>
              <Body1Strong>BetterMoodle</Body1Strong>
              <Caption1 className={styles.brandSubtitle}>
                ITL · CATEDIG Monitor
              </Caption1>
            </div>
          </button>

          {/* Desktop nav (>= 1024px) */}
          <nav aria-label="Navegación principal" className={styles.desktopNav}>
            <TabList
              selectedValue={activeView}
              onTabSelect={(_e, data) => navigate(data.value as AppView)}
              size="medium"
            >
              {NAV_ITEMS.map((item) => (
                <Tab key={item.id} value={item.id} icon={item.renderIcon(activeView === item.id)}>
                  {item.label}
                </Tab>
              ))}
            </TabList>
          </nav>

          {/* Tablet / half-screen hamburger menu (768px - 1023px) */}
          <div className={styles.tabletHamburgerNav}>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  icon={<Navigation20Regular />}
                  aria-label="Abrir menú de navegación"
                >
                  {NAV_ITEMS.find((i) => i.id === activeView)?.label ?? 'Menú'}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {NAV_ITEMS.map((item) => (
                    <MenuItem
                      key={item.id}
                      icon={item.renderIcon(activeView === item.id)}
                      onClick={() => navigate(item.id)}
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>

          <div className={styles.headerActions}>
            {health && (
              <Badge
                className={styles.statusBadge}
                appearance="tint"
                shape="rounded"
                color={
                  health.status === 'ok'
                    ? 'success'
                    : health.status === 'circuit_open'
                    ? 'danger'
                    : 'warning'
                }
              >
                {health.status === 'ok'
                  ? 'Al día'
                  : health.status === 'circuit_open'
                  ? 'Circuit Breaker'
                  : 'Caché degradada'}
              </Badge>
            )}
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowSync20Regular />}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Cargando...' : 'Recargar'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main
        className={mergeClasses(
          styles.main,
          compactMode && styles.mainCompact,
        )}
      >
        {error && (
          <MessageBar intent="error" className={styles.errorBanner}>
            <MessageBarBody>{error}</MessageBarBody>
            <MessageBarActions>
              <Button size="small" onClick={handleRefresh}>
                Reintentar
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}

        {activeView === 'overview' && (
          <OverviewView
            dashboard={dashboard}
            allAssignments={assignments}
            isLoading={isLoading}
            compactMode={compactMode}
            onSelectCourse={(courseId) => navigate('course', courseId)}
            onNavigateTasks={() => navigate('tasks')}
          />
        )}

        {activeView === 'tasks' && (
          <TasksView
            assignments={assignments}
            courses={courses}
            isLoading={isLoading}
            compactMode={compactMode}
          />
        )}

        {activeView === 'course' && (
          <CourseDetailView
            courseId={selectedCourseId}
            courses={courses}
            items={items}
            compactMode={compactMode}
            onSelectCourse={(courseId) => navigate('course', courseId)}
            onBack={() => navigate('course', null)}
          />
        )}

        {activeView === 'health' && (
          <HealthView
            health={health}
            isLoading={isLoading}
            compactMode={compactMode}
          />
        )}

        {activeView === 'settings' && (
          <SettingsView
            compactMode={compactMode}
            onToggleCompactMode={handleToggleCompactMode}
          />
        )}
      </main>

      {/* Mobile bottom navigation */}
      <nav aria-label="Navegación móvil" className={styles.mobileNav}>
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              className={mergeClasses(
                styles.mobileNavBtn,
                active && styles.mobileNavBtnActive,
              )}
            >
              <span aria-hidden="true">{item.renderIcon(active)}</span>
              <span className={styles.mobileNavLabel}>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
