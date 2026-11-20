import { useMemo, useState } from 'react';
import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  CounterBadge,
  Dropdown,
  Option,
  SearchBox,
  Spinner,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  CalendarLtr16Regular,
  CheckmarkCircle16Regular,
  Clock16Regular,
  ErrorCircle16Regular,
  Open16Regular,
} from '@fluentui/react-icons';
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
  compactMode?: boolean;
}

const FILTER_TABS: Array<{ id: TaskFilterState; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'upcoming', label: 'Próximas (72h)' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'submitted', label: 'Entregadas' },
  { id: 'overdue', label: 'Vencidas' },
];

const STATUS_BADGE: Record<
  Exclude<TaskFilterState, 'all'>,
  { label: string; color: 'warning' | 'brand' | 'success' | 'danger' }
> = {
  upcoming: { label: 'Próxima', color: 'warning' },
  pending: { label: 'Pendiente', color: 'brand' },
  submitted: { label: 'Entregada', color: 'success' },
  overdue: { label: 'Vencida', color: 'danger' },
};

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0,
  },
  filterCard: {
    padding: '16px',
    gap: '12px',
    minWidth: 0,
  },
  tabsWrap: {
    minWidth: 0,
  },
  tabList: {
    flexWrap: 'wrap',
    rowGap: '4px',
  },
  tabContent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  controlsRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minWidth: 0,
    '@media (min-width: 640px)': {
      flexDirection: 'row',
      alignItems: 'center',
    },
  },
  searchBox: {
    flexGrow: 1,
    minWidth: 0,
    width: '100%',
  },
  courseSelectWrap: {
    width: '100%',
    minWidth: 0,
    '@media (min-width: 640px)': {
      width: '280px',
      flexShrink: 0,
    },
  },
  courseDropdown: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minWidth: 0,
  },
  taskCard: {
    padding: '16px',
    minWidth: 0,
  },
  taskCardCompact: {
    padding: '12px',
  },
  taskRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: 0,
    '@media (min-width: 640px)': {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  },
  taskMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
    flexGrow: 1,
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px',
    minWidth: 0,
  },
  courseBadge: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  taskTitle: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '14px',
    color: tokens.colorNeutralForeground3,
  },
  metaItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
  },
  emptyCard: {
    padding: '32px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  loadingWrap: {
    padding: '32px',
    display: 'flex',
    justifyContent: 'center',
  },
});

export function TasksView({
  assignments,
  courses,
  isLoading,
  compactMode,
}: TasksViewProps) {
  const styles = useStyles();
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
        if (courseFilter !== 'all' && String(item.course_id) !== courseFilter) {
          return false;
        }
        if (filter !== 'all' && classifyTaskStatus(item, nowSec) !== filter) {
          return false;
        }
        if (q && !item.title.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const aDue = a.due_date ?? Number.MAX_SAFE_INTEGER;
        const bDue = b.due_date ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
  }, [assignments, courseFilter, filter, search, nowSec]);

  const selectedCourseLabel = useMemo(() => {
    if (courseFilter === 'all') return 'Todas las materias';
    const found = courses.find((c) => String(c.id) === courseFilter);
    return found ? `${found.shortname} — ${found.fullname}` : 'Todas las materias';
  }, [courseFilter, courses]);

  if (isLoading) {
    return (
      <div className={styles.loadingWrap}>
        <Spinner label="Cargando tareas desde D1..." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Card className={styles.filterCard}>
        <div className={styles.tabsWrap}>
          <TabList
            className={styles.tabList}
            selectedValue={filter}
            onTabSelect={(_e, data) => setFilter(data.value as TaskFilterState)}
            size="small"
          >
            {FILTER_TABS.map((tab) => (
              <Tab key={tab.id} value={tab.id}>
                <span className={styles.tabContent}>
                  <span>{tab.label}</span>
                  <CounterBadge
                    count={counts[tab.id]}
                    size="small"
                    appearance={filter === tab.id ? 'filled' : 'ghost'}
                    color={filter === tab.id ? 'brand' : 'informative'}
                    showZero
                  />
                </span>
              </Tab>
            ))}
          </TabList>
        </div>

        <div className={styles.controlsRow}>
          <SearchBox
            className={styles.searchBox}
            value={search}
            onChange={(_e, data) => setSearch(data.value)}
            placeholder="Buscar tarea por nombre..."
            aria-label="Buscar tarea por nombre"
          />

          <div className={styles.courseSelectWrap}>
            <Dropdown
              className={styles.courseDropdown}
              value={selectedCourseLabel}
              selectedOptions={[courseFilter]}
              button={{
                children: (
                  <span
                    style={{
                      display: 'block',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedCourseLabel}
                  </span>
                ),
              }}
              onOptionSelect={(_e, data) => {
                if (typeof data.optionValue === 'string') {
                  setCourseFilter(data.optionValue);
                }
              }}
              aria-label="Filtrar por materia"
              listbox={{ style: { maxWidth: 'min(92vw, 420px)' } }}
            >
              <Option value="all" text="Todas las materias">
                Todas las materias
              </Option>
              {courses.map((c) => {
                const label = `${c.shortname} — ${c.fullname}`;
                return (
                  <Option key={c.id} value={String(c.id)} text={label}>
                    {label}
                  </Option>
                );
              })}
            </Dropdown>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className={styles.emptyCard} appearance="outline">
          <Body1>No hay tareas que coincidan con los filtros actuales.</Body1>
        </Card>
      ) : (
        <div className={styles.list}>
          {filtered.map((task) => {
            const status = classifyTaskStatus(task, nowSec);
            const badge = STATUS_BADGE[status];
            const courseLabel =
              courseMap.get(task.course_id) || `Curso #${task.course_id}`;

            return (
              <Card
                key={task.item_key}
                className={
                  compactMode ? styles.taskCardCompact : styles.taskCard
                }
              >
                <div className={styles.taskRow}>
                  <div className={styles.taskMain}>
                    <div className={styles.badges}>
                      <Badge
                        appearance="tint"
                        color="subtle"
                        className={styles.courseBadge}
                      >
                        {courseLabel}
                      </Badge>
                      <Badge appearance="tint" color={badge.color}>
                        {badge.label}
                      </Badge>
                      {task.submission_status === 'graded' && (
                        <Badge
                          appearance="tint"
                          color="informative"
                          icon={<CheckmarkCircle16Regular />}
                        >
                          Calificada
                        </Badge>
                      )}
                    </div>

                    <Body1Strong className={styles.taskTitle}>
                      {task.title}
                    </Body1Strong>

                    <div className={styles.metaRow}>
                      <Caption1 className={styles.metaItem}>
                        <CalendarLtr16Regular />
                        {formatUnixDate(task.due_date)}
                      </Caption1>
                      <Caption1 className={styles.metaItem}>
                        {status === 'overdue' ? (
                          <ErrorCircle16Regular />
                        ) : (
                          <Clock16Regular />
                        )}
                        {formatCountdown(task.due_date, nowSec)}
                      </Caption1>
                    </div>
                  </div>

                  <Button
                    as="a"
                    appearance="primary"
                    size="small"
                    href={getMoodleDeepLink(task)}
                    target="_blank"
                    rel="noreferrer"
                    icon={<Open16Regular />}
                    iconPosition="after"
                    style={{ flexShrink: 0 }}
                  >
                    Abrir en Moodle
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
