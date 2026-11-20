import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  ProgressBar,
  Skeleton,
  SkeletonItem,
  Subtitle2,
  Title2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  BookOpen20Regular,
  CheckboxChecked20Regular,
  ChevronRight20Regular,
  Clock20Regular,
  Megaphone20Regular,
  Open16Regular,
  Ribbon20Regular,
  Warning20Regular,
} from '@fluentui/react-icons';
import type { DashboardResponse, SyncedItem } from '@better-moodle/shared';
import {
  formatCountdown,
  formatRelativeTime,
  formatUnixDate,
  getMoodleDeepLink,
} from '../lib/format';

interface OverviewViewProps {
  dashboard: DashboardResponse | undefined;
  allAssignments: SyncedItem[];
  isLoading: boolean;
  compactMode?: boolean;
  onSelectCourse: (courseId: number) => void;
  onNavigateTasks: () => void;
}

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    minWidth: 0,
  },
  pageCompact: {
    gap: '14px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    '@media (min-width: 640px)': {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    },
  },
  kpiCard: {
    padding: '16px',
    gap: '4px',
    minWidth: 0,
  },
  kpiTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
  },
  kpiSub: {
    color: tokens.colorNeutralForeground3,
  },
  kpiUrgentValue: {
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '24px',
    '@media (min-width: 1024px)': {
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
    },
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: 0,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    minWidth: 0,
  },
  subGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '16px',
    '@media (min-width: 640px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minWidth: 0,
  },
  courseCard: {
    padding: '14px',
    gap: '10px',
    minWidth: 0,
    width: '100%',
    textAlign: 'left',
  },
  courseRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '10px',
    minWidth: 0,
  },
  courseInfo: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  courseTitle: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  courseShort: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressRow: {
    display: 'flex',
    justifyContent: 'space-between',
    color: tokens.colorNeutralForeground3,
    marginBottom: '4px',
  },
  itemCard: {
    padding: '14px',
    minWidth: 0,
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    minWidth: 0,
  },
  itemMain: {
    minWidth: 0,
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px',
    minWidth: 0,
  },
  truncateBadge: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  truncateText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mutedText: {
    color: tokens.colorNeutralForeground3,
  },
  gradeCard: {
    padding: '12px',
    minWidth: 0,
  },
  announcementCard: {
    padding: '12px',
    minWidth: 0,
    textDecorationLine: 'none',
    color: 'inherit',
  },
  announcementMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginTop: '4px',
    color: tokens.colorNeutralForeground3,
  },
  emptyCard: {
    padding: '20px',
    color: tokens.colorNeutralForeground3,
  },
  skeletonGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '16px',
    '@media (min-width: 768px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
});

export function OverviewView({
  dashboard,
  allAssignments,
  isLoading,
  compactMode,
  onSelectCourse,
  onNavigateTasks,
}: OverviewViewProps) {
  const styles = useStyles();

  if (isLoading) {
    return (
      <Skeleton aria-label="Cargando resumen">
        <div className={styles.skeletonGrid}>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className={styles.kpiCard}>
              <SkeletonItem size={16} style={{ width: '40%' }} />
              <SkeletonItem size={28} style={{ width: '25%' }} />
              <SkeletonItem size={12} style={{ width: '65%' }} />
            </Card>
          ))}
        </div>
      </Skeleton>
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const courses = dashboard?.courses ?? [];
  const upcoming = dashboard?.upcoming_assignments ?? [];
  const pendingCount = allAssignments.filter(
    (a) =>
      a.submission_status !== 'submitted' &&
      a.submission_status !== 'graded' &&
      (!a.due_date || a.due_date >= nowSec),
  ).length;
  const urgentCount = upcoming.filter(
    (a) => a.due_date && a.due_date - nowSec <= 48 * 3600,
  ).length;
  const announcements = (dashboard?.recent_activity ?? []).filter(
    (a) => a.item_type === 'announcement',
  );
  const recentGrades = (dashboard?.current_grades ?? [])
    .filter((g) => g.grade_num !== null)
    .slice(0, 5);

  return (
    <div className={mergeClasses(styles.page, compactMode && styles.pageCompact)}>
      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <Card className={styles.kpiCard} appearance="filled-alternative">
          <div className={styles.kpiTop}>
            <Caption1>Materias</Caption1>
            <BookOpen20Regular />
          </div>
          <Title2>{courses.length}</Title2>
          <Caption1 className={styles.kpiSub}>Sincronizadas en D1</Caption1>
        </Card>

        <Card
          className={styles.kpiCard}
          appearance="filled-alternative"
          onClick={onNavigateTasks}
        >
          <div className={styles.kpiTop}>
            <Caption1>Pendientes</Caption1>
            <CheckboxChecked20Regular />
          </div>
          <Title2>{pendingCount}</Title2>
          <Caption1 className={styles.kpiSub}>Ver lista de tareas →</Caption1>
        </Card>

        <Card
          className={styles.kpiCard}
          appearance="filled-alternative"
          onClick={onNavigateTasks}
        >
          <div className={styles.kpiTop}>
            <Caption1>Urgentes (48h)</Caption1>
            <Warning20Regular />
          </div>
          <Title2 className={urgentCount > 0 ? styles.kpiUrgentValue : undefined}>
            {urgentCount}
          </Title2>
          <Caption1 className={styles.kpiSub}>Por vencer pronto</Caption1>
        </Card>

        <Card className={styles.kpiCard} appearance="filled-alternative">
          <div className={styles.kpiTop}>
            <Caption1>Calificaciones</Caption1>
            <Ribbon20Regular />
          </div>
          <Title2>{recentGrades.length}</Title2>
          <Caption1 className={styles.kpiSub}>Evaluadas recientes</Caption1>
        </Card>
      </div>

      {/* Main 2-column layout */}
      <div className={styles.mainGrid}>
        {/* Mis Materias */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Subtitle2 className={styles.sectionTitle}>
              <BookOpen20Regular />
              Mis Materias
            </Subtitle2>
          </div>

          {courses.length === 0 ? (
            <Card className={styles.emptyCard} appearance="outline">
              <Body1>No hay materias sincronizadas todavía.</Body1>
            </Card>
          ) : (
            <div className={styles.stack}>
              {courses.map((course) => (
                <Card
                  key={course.id}
                  className={styles.courseCard}
                  onClick={() => onSelectCourse(course.id)}
                >
                  <div className={styles.courseRow}>
                    <div className={styles.courseInfo}>
                      <Body1Strong className={styles.courseTitle}>
                        {course.fullname}
                      </Body1Strong>
                      <Caption1 className={styles.courseShort}>
                        {course.shortname}
                      </Caption1>
                    </div>
                    <ChevronRight20Regular />
                  </div>
                  {typeof course.progress === 'number' && (
                    <div>
                      <div className={styles.progressRow}>
                        <Caption1>Progreso</Caption1>
                        <Caption1>{Math.round(course.progress)}%</Caption1>
                      </div>
                      <ProgressBar
                        value={Math.min(100, Math.max(0, course.progress)) / 100}
                        thickness="medium"
                      />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Próximos Vencimientos + Calificaciones + Avisos */}
        <div className={styles.rightColumn}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <Subtitle2 className={styles.sectionTitle}>
                <Clock20Regular />
                Próximos Vencimientos
              </Subtitle2>
              <Button appearance="subtle" size="small" onClick={onNavigateTasks}>
                Ver todas
              </Button>
            </div>

            {upcoming.length === 0 ? (
              <Card className={styles.emptyCard} appearance="outline">
                <Body1>¡Todo despejado! No tienes entregas próximas pendientes.</Body1>
              </Card>
            ) : (
              <div className={styles.stack}>
                {upcoming.slice(0, 6).map((task) => {
                  const isUrgent =
                    Boolean(task.due_date) && (task.due_date as number) - nowSec <= 48 * 3600;
                  const isSubmitted =
                    task.submission_status === 'submitted' ||
                    task.submission_status === 'graded';

                  return (
                    <Card key={task.item_key} className={styles.itemCard}>
                      <div className={styles.itemRow}>
                        <div className={styles.itemMain}>
                          <div className={styles.badgeRow}>
                            <Badge
                              appearance="tint"
                              color="subtle"
                              className={styles.truncateBadge}
                            >
                              {task.course_name || `Curso #${task.course_id}`}
                            </Badge>
                            {isSubmitted ? (
                              <Badge appearance="tint" color="success">
                                Entregada
                              </Badge>
                            ) : isUrgent ? (
                              <Badge appearance="tint" color="warning">
                                {formatCountdown(task.due_date, nowSec)}
                              </Badge>
                            ) : (
                              <Caption1 className={styles.mutedText}>
                                {formatCountdown(task.due_date, nowSec)}
                              </Caption1>
                            )}
                          </div>
                          <Body1Strong className={styles.truncateText}>
                            {task.title}
                          </Body1Strong>
                          <Caption1 className={styles.mutedText}>
                            {formatUnixDate(task.due_date)}
                          </Caption1>
                        </div>

                        <Button
                          as="a"
                          appearance="secondary"
                          size="small"
                          href={getMoodleDeepLink({
                            item_key: task.item_key,
                            item_type: 'assignment',
                            url: task.url,
                            course_id: task.course_id,
                          })}
                          target="_blank"
                          rel="noreferrer"
                          icon={<Open16Regular />}
                          iconPosition="after"
                          style={{ flexShrink: 0 }}
                        >
                          Entregar
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <div className={styles.subGrid}>
            <section className={styles.section}>
              <Subtitle2 className={styles.sectionTitle}>
                <Ribbon20Regular />
                Calificaciones Recientes
              </Subtitle2>
              {recentGrades.length === 0 ? (
                <Card className={styles.emptyCard} appearance="outline">
                  <Caption1>Sin calificaciones registradas aún.</Caption1>
                </Card>
              ) : (
                <div className={styles.stack}>
                  {recentGrades.map((g) => (
                    <Card key={g.item_key} className={styles.gradeCard}>
                      <div className={styles.itemRow}>
                        <div className={styles.itemMain}>
                          <Body1Strong className={styles.truncateText}>
                            {g.title}
                          </Body1Strong>
                          <Caption1 className={mergeClasses(styles.truncateText, styles.mutedText)}>
                            {g.course_name || `Curso #${g.course_id}`}
                          </Caption1>
                        </div>
                        <Badge appearance="tint" color="informative" size="large">
                          {g.grade_num}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <Subtitle2 className={styles.sectionTitle}>
                <Megaphone20Regular />
                Últimos Avisos
              </Subtitle2>
              {announcements.length === 0 ? (
                <Card className={styles.emptyCard} appearance="outline">
                  <Caption1>Sin avisos en foros recientemente.</Caption1>
                </Card>
              ) : (
                <div className={styles.stack}>
                  {announcements.slice(0, 5).map((ann) => (
                    <Card
                      key={ann.item_key}
                      className={styles.announcementCard}
                      onClick={() =>
                        window.open(
                          getMoodleDeepLink({
                            item_key: ann.item_key,
                            item_type: 'announcement',
                            url: ann.url,
                            course_id: ann.course_id,
                          }),
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                    >
                      <Body1Strong className={styles.truncateText}>
                        {ann.title}
                      </Body1Strong>
                      <div className={styles.announcementMeta}>
                        <Caption1 className={styles.truncateText}>
                          {ann.course_name || `Curso #${ann.course_id}`}
                        </Caption1>
                        <Caption1 style={{ flexShrink: 0 }}>
                          {formatRelativeTime(ann.timemodified)}
                        </Caption1>
                      </div>
                    </Card>
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
