import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  ProgressBar,
  Spinner,
  Subtitle2,
  Tab,
  TabList,
  Title3,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular,
  ArrowLeft20Regular,
  BookOpen20Regular,
  CheckboxChecked20Regular,
  ChevronRight20Regular,
  Document20Regular,
  FolderOpen20Regular,
  Megaphone20Regular,
  Open16Regular,
  Ribbon20Regular,
} from '@fluentui/react-icons';
import type { DashboardCourse, SyncedItem } from '@better-moodle/shared';
import { fetchCourseContents, fetchCourseGrades } from '../lib/api';
import {
  buildProxyFileUrl,
  formatFileSize,
  formatUnixDate,
  getMoodleDeepLink,
} from '../lib/format';

interface CourseDetailViewProps {
  courseId: number | null;
  courses: DashboardCourse[];
  items: SyncedItem[];
  compactMode?: boolean;
  onSelectCourse: (id: number) => void;
  onBack: () => void;
}

type CourseTab = 'contents' | 'grades' | 'activity';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0,
  },
  directoryHeader: {
    padding: '16px',
    minWidth: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  headerText: {
    minWidth: 0,
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  brandText: {
    color: tokens.colorBrandForeground1,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  coursesGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '12px',
    '@media (min-width: 768px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  courseCard: {
    padding: '16px',
    gap: '12px',
    minWidth: 0,
    width: '100%',
    textAlign: 'left',
  },
  courseCardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '10px',
    minWidth: 0,
  },
  courseTitle: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  courseShort: {
    color: tokens.colorBrandForeground1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    color: tokens.colorNeutralForeground3,
    marginBottom: '4px',
  },
  detailHeaderCard: {
    padding: '16px',
    gap: '12px',
    minWidth: 0,
  },
  detailHeaderTop: {
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
  backGroup: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    minWidth: 0,
    flexGrow: 1,
  },
  switcherGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    width: '100%',
    '@media (min-width: 640px)': {
      width: 'auto',
      flexShrink: 0,
    },
  },
  switcherSelectWrap: {
    minWidth: 0,
    flexGrow: 1,
    '@media (min-width: 640px)': {
      width: '240px',
      flexGrow: 0,
    },
  },
  switcherSelect: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  tabsDivider: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    paddingTop: '8px',
    minWidth: 0,
  },
  tabListWrap: {
    flexWrap: 'wrap',
    rowGap: '4px',
  },
  tabContent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  sectionCard: {
    padding: '0',
    overflow: 'hidden',
    minWidth: 0,
  },
  sectionCardCompact: {
    minWidth: 0,
  },
  sectionHeader: {
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingTop: '12px',
    paddingBottom: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  sectionTitle: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  moduleList: {
    display: 'flex',
    flexDirection: 'column',
  },
  moduleItem: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  moduleTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '10px',
    minWidth: 0,
  },
  moduleTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flexGrow: 1,
  },
  truncateText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  filesGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '8px',
    paddingLeft: '10px',
    borderLeftWidth: '2px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke2,
    '@media (min-width: 640px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  fileLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '10px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    color: 'inherit',
    textDecorationLine: 'none',
    minWidth: 0,
  },
  fileLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flexGrow: 1,
  },
  fileMeta: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    flexGrow: 1,
  },
  gradeRow: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    '@media (min-width: 640px)': {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  },
  gradeInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    flexGrow: 1,
  },
  gradeFeedback: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    overflowWrap: 'anywhere',
  },
  gradeRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  },
  activityGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '16px',
    '@media (min-width: 768px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  activityCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minWidth: 0,
  },
  colHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  activityCard: {
    padding: '14px',
    gap: '4px',
    minWidth: 0,
  },
  emptyCard: {
    padding: '24px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  loadingWrap: {
    padding: '28px',
    display: 'flex',
    justifyContent: 'center',
  },
});

export function CourseDetailView({
  courseId,
  courses,
  items,
  compactMode,
  onSelectCourse,
  onBack,
}: CourseDetailViewProps) {
  const styles = useStyles();
  const [tab, setTab] = useState<CourseTab>('contents');
  const activeCourseId = courseId ?? 0;
  const course =
    courseId !== null ? courses.find((c) => c.id === courseId) : undefined;

  const contentsQuery = useQuery({
    queryKey: ['course-contents', activeCourseId],
    queryFn: () => fetchCourseContents(activeCourseId),
    enabled: courseId !== null,
  });

  const gradesQuery = useQuery({
    queryKey: ['course-grades', activeCourseId],
    queryFn: () => fetchCourseGrades(activeCourseId),
    enabled: courseId !== null,
  });

  if (courseId === null) {
    return (
      <div className={styles.page}>
        <Card className={styles.directoryHeader}>
          <div className={styles.headerRow}>
            <BookOpen20Regular />
            <div className={styles.headerText}>
              <Title3>Mis Materias</Title3>
              <Caption1 className={styles.muted}>
                Selecciona una materia para ver sus recursos, calificaciones y avisos.
              </Caption1>
            </div>
          </div>
        </Card>

        {courses.length === 0 ? (
          <Card className={styles.emptyCard} appearance="outline">
            <Body1>No hay materias sincronizadas todavía.</Body1>
          </Card>
        ) : (
          <div className={styles.coursesGrid}>
            {courses.map((c) => {
              const pendingCount = items.filter(
                (i) =>
                  i.course_id === c.id &&
                  i.item_type === 'assignment' &&
                  i.submission_status !== 'submitted' &&
                  i.submission_status !== 'graded',
              ).length;

              return (
                <Card
                  key={c.id}
                  className={styles.courseCard}
                  onClick={() => {
                    setTab('contents');
                    onSelectCourse(c.id);
                  }}
                >
                  <div className={styles.courseCardTop}>
                    <div className={styles.headerText}>
                      <Caption1 className={styles.courseShort}>
                        {c.shortname}
                      </Caption1>
                      <Body1Strong className={styles.courseTitle}>
                        {c.fullname}
                      </Body1Strong>
                      <Caption1 className={styles.muted}>
                        {pendingCount > 0
                          ? `${pendingCount} ${
                              pendingCount === 1
                                ? 'tarea pendiente'
                                : 'tareas pendientes'
                            }`
                          : 'Sin tareas pendientes'}
                      </Caption1>
                    </div>
                    <ChevronRight20Regular />
                  </div>

                  {typeof c.progress === 'number' && (
                    <div>
                      <div className={styles.progressMeta}>
                        <Caption1>Progreso</Caption1>
                        <Caption1>{Math.round(c.progress)}%</Caption1>
                      </div>
                      <ProgressBar
                        value={Math.min(100, Math.max(0, c.progress)) / 100}
                        thickness="medium"
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const courseAssignments = items.filter(
    (i) => i.course_id === courseId && i.item_type === 'assignment',
  );
  const courseAnnouncements = items.filter(
    (i) => i.course_id === courseId && i.item_type === 'announcement',
  );

  return (
    <div className={styles.page}>
      <Card className={styles.detailHeaderCard}>
        <div className={styles.detailHeaderTop}>
          <div className={styles.backGroup}>
            <Button
              appearance="subtle"
              icon={<ArrowLeft20Regular />}
              onClick={onBack}
              aria-label="Volver a materias"
              title="Volver a materias"
            />
            <div className={styles.headerText}>
              <Caption1 className={styles.brandText}>
                {course?.shortname || `Curso #${courseId}`}
              </Caption1>
              <Title3 className={styles.courseTitle}>
                {course?.fullname || 'Detalle de Materia'}
              </Title3>
            </div>
          </div>

          <div className={styles.switcherGroup}>
            <div className={styles.switcherSelectWrap}>
              {(() => {
                const selectedCourseLabel = course
                  ? `${course.shortname} — ${course.fullname}`
                  : `Curso #${courseId}`;
                return (
                  <Dropdown
                    className={styles.switcherSelect}
                    value={selectedCourseLabel}
                    selectedOptions={[String(courseId)]}
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
                      if (data.optionValue) {
                        onSelectCourse(Number(data.optionValue));
                      }
                    }}
                    aria-label="Cambiar materia"
                    listbox={{ style: { maxWidth: 'min(92vw, 420px)' } }}
                  >
                    {courses.map((c) => {
                      const label = `${c.shortname} — ${c.fullname}`;
                      return (
                        <Option key={c.id} value={String(c.id)} text={label}>
                          {label}
                        </Option>
                      );
                    })}
                  </Dropdown>
                );
              })()}
            </div>

            <Button
              as="a"
              appearance="secondary"
              size="small"
              href={`https://catedig.itlalaguna.edu.mx/course/view.php?id=${courseId}`}
              target="_blank"
              rel="noreferrer"
              icon={<Open16Regular />}
              iconPosition="after"
              style={{ flexShrink: 0 }}
            >
              Moodle
            </Button>
          </div>
        </div>

        <div className={styles.tabsDivider}>
          <TabList
            className={styles.tabListWrap}
            selectedValue={tab}
            onTabSelect={(_e, data) => setTab(data.value as CourseTab)}
            size="small"
          >
            <Tab value="contents" icon={<FolderOpen20Regular />}>
              Recursos y Temario
            </Tab>
            <Tab value="grades" icon={<Ribbon20Regular />}>
              <span className={styles.tabContent}>
                <span>Calificaciones</span>
                <CounterBadge
                  count={gradesQuery.data?.grades.length ?? 0}
                  size="small"
                  appearance={tab === 'grades' ? 'filled' : 'ghost'}
                  color={tab === 'grades' ? 'brand' : 'informative'}
                  showZero
                />
              </span>
            </Tab>
            <Tab value="activity" icon={<CheckboxChecked20Regular />}>
              <span className={styles.tabContent}>
                <span>Tareas y Avisos</span>
                <CounterBadge
                  count={courseAssignments.length + courseAnnouncements.length}
                  size="small"
                  appearance={tab === 'activity' ? 'filled' : 'ghost'}
                  color={tab === 'activity' ? 'brand' : 'informative'}
                  showZero
                />
              </span>
            </Tab>
          </TabList>
        </div>
      </Card>

      {tab === 'contents' && (
        <div className={styles.page}>
          {contentsQuery.isLoading ? (
            <div className={styles.loadingWrap}>
              <Spinner label="Cargando recursos cacheados en D1..." />
            </div>
          ) : !contentsQuery.data?.sections.length ? (
            <Card className={styles.emptyCard} appearance="outline">
              <Body1>
                Aún no hay secciones o archivos cacheados para esta materia.
              </Body1>
              <Caption1 className={styles.muted}>
                Los recursos se indexan desde Moodle en segundo plano; puedes forzar una sincronización desde la pestaña Salud.
              </Caption1>
            </Card>
          ) : (
            contentsQuery.data.sections.map((section) => (
              <Card
                key={section.id}
                className={
                  compactMode ? styles.sectionCardCompact : styles.sectionCard
                }
              >
                <div className={styles.sectionHeader}>
                  <Body1Strong className={styles.sectionTitle}>
                    {section.name}
                  </Body1Strong>
                  <Caption1 className={styles.muted} style={{ flexShrink: 0 }}>
                    {section.modules.length}{' '}
                    {section.modules.length === 1 ? 'elemento' : 'elementos'}
                  </Caption1>
                </div>

                {section.modules.length === 0 ? (
                  <div style={{ padding: '12px 16px' }}>
                    <Caption1 className={styles.muted}>
                      Sección sin recursos publicados.
                    </Caption1>
                  </div>
                ) : (
                  <div className={styles.moduleList}>
                    {section.modules.map((mod) => (
                      <div key={mod.id} className={styles.moduleItem}>
                        <div className={styles.moduleTop}>
                          <div className={styles.moduleTitleGroup}>
                            <Badge appearance="tint" color="subtle" size="small">
                              {mod.modname}
                            </Badge>
                            <Body1Strong className={styles.truncateText}>
                              {mod.name}
                            </Body1Strong>
                          </div>

                          {mod.url && (
                            <Button
                              as="a"
                              appearance="subtle"
                              size="small"
                              href={mod.url}
                              target="_blank"
                              rel="noreferrer"
                              icon={<Open16Regular />}
                              iconPosition="after"
                              style={{ flexShrink: 0 }}
                            >
                              Abrir
                            </Button>
                          )}
                        </div>

                        {mod.contents && mod.contents.length > 0 && (
                          <div className={styles.filesGrid}>
                            {mod.contents.map((file, idx) => {
                              const downloadHref =
                                file.proxy_url || buildProxyFileUrl(file.fileurl);
                              return (
                                <a
                                  key={`${mod.id}-${idx}`}
                                  href={downloadHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.fileLink}
                                >
                                  <div className={styles.fileLeft}>
                                    <Document20Regular
                                      style={{
                                        color: tokens.colorBrandForeground1,
                                        flexShrink: 0,
                                      }}
                                    />
                                    <div className={styles.fileMeta}>
                                      <Caption1 className={styles.truncateText}>
                                        <strong>{file.filename}</strong>
                                      </Caption1>
                                      <Caption1 className={styles.muted}>
                                        {formatFileSize(file.filesize) ||
                                          file.mimetype ||
                                          'Archivo'}
                                      </Caption1>
                                    </div>
                                  </div>
                                  <ArrowDownload20Regular
                                    style={{ flexShrink: 0 }}
                                  />
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'grades' && (
        <Card className={styles.sectionCard}>
          {gradesQuery.isLoading ? (
            <div className={styles.loadingWrap}>
              <Spinner label="Cargando calificaciones..." />
            </div>
          ) : !gradesQuery.data?.grades.length ? (
            <div className={styles.emptyCard}>
              <Body1>
                No hay elementos de calificación registrados para esta materia.
              </Body1>
            </div>
          ) : (
            <div>
              {gradesQuery.data.grades.map((g) => (
                <div key={g.item_key} className={styles.gradeRow}>
                  <div className={styles.gradeInfo}>
                    <div className={styles.moduleTitleGroup}>
                      {g.itemtype && (
                        <Badge appearance="tint" color="subtle" size="small">
                          {g.itemtype === 'course'
                            ? 'Total'
                            : g.itemmodule || g.itemtype}
                        </Badge>
                      )}
                      <Body1Strong className={styles.courseTitle}>
                        {g.title}
                      </Body1Strong>
                    </div>
                    {g.feedback && (
                      <div
                        className={styles.gradeFeedback}
                        dangerouslySetInnerHTML={{ __html: g.feedback }}
                      />
                    )}
                    <Caption1 className={styles.muted}>
                      {typeof g.grademax === 'number'
                        ? `Rango: ${g.grademin ?? 0} – ${g.grademax}`
                        : ''}
                      {g.percentage_formatted ? ` (${g.percentage_formatted})` : ''}
                    </Caption1>
                  </div>

                  <div className={styles.gradeRight}>
                    <Badge
                      appearance="tint"
                      color={g.grade_num !== null ? 'informative' : 'subtle'}
                      size="large"
                    >
                      {g.grade_num !== null ? g.grade_num : '—'}
                    </Badge>
                    {g.url && (
                      <Button
                        as="a"
                        appearance="subtle"
                        size="small"
                        href={g.url}
                        target="_blank"
                        rel="noreferrer"
                        icon={<Open16Regular />}
                        title="Ver en Moodle"
                        aria-label="Ver en Moodle"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <div className={styles.activityGrid}>
          <div className={styles.activityCol}>
            <Subtitle2 className={styles.colHeading}>
              <CheckboxChecked20Regular />
              Tareas de la Materia
            </Subtitle2>
            {courseAssignments.length === 0 ? (
              <Card className={styles.emptyCard} appearance="outline">
                <Caption1>Sin tareas registradas.</Caption1>
              </Card>
            ) : (
              courseAssignments.map((a) => (
                <Card
                  key={a.item_key}
                  className={styles.activityCard}
                  onClick={() =>
                    window.open(
                      getMoodleDeepLink(a),
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <Body1Strong className={styles.courseTitle}>
                    {a.title}
                  </Body1Strong>
                  <Caption1 className={styles.muted}>
                    {formatUnixDate(a.due_date)}
                  </Caption1>
                </Card>
              ))
            )}
          </div>

          <div className={styles.activityCol}>
            <Subtitle2 className={styles.colHeading}>
              <Megaphone20Regular />
              Avisos y Foros
            </Subtitle2>
            {courseAnnouncements.length === 0 ? (
              <Card className={styles.emptyCard} appearance="outline">
                <Caption1>Sin discusiones o avisos en foros.</Caption1>
              </Card>
            ) : (
              courseAnnouncements.map((ann) => (
                <Card
                  key={ann.item_key}
                  className={styles.activityCard}
                  onClick={() =>
                    window.open(
                      getMoodleDeepLink(ann),
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <Body1Strong className={styles.courseTitle}>
                    {ann.title}
                  </Body1Strong>
                  <Caption1 className={styles.muted}>
                    {formatUnixDate(ann.timemodified)}
                  </Caption1>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
