import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Spinner,
  Subtitle2,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSync20Regular,
  CheckmarkCircle16Regular,
  DeveloperBoard20Regular,
  HeartPulse20Regular,
  ShieldError16Regular,
  Warning16Regular,
} from '@fluentui/react-icons';
import type { EnhancedHealthResponse } from '@better-moodle/shared';
import { triggerManualSync } from '../lib/api';
import { formatRelativeTime, formatUnixDate } from '../lib/format';

interface HealthViewProps {
  health: EnhancedHealthResponse | undefined;
  isLoading: boolean;
  compactMode?: boolean;
}

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    minWidth: 0,
  },
  pageCompact: {
    gap: '14px',
  },
  statusCard: {
    padding: '18px',
    minWidth: 0,
  },
  statusTop: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    '@media (min-width: 640px)': {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  },
  statusLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  budgetCard: {
    padding: '18px',
    gap: '12px',
    minWidth: 0,
  },
  budgetTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '10px',
    '@media (min-width: 640px)': {
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    },
  },
  metricTile: {
    padding: '12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  tableCard: {
    padding: 0,
    overflow: 'hidden',
    minWidth: 0,
  },
  tableHeader: {
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingTop: '12px',
    paddingBottom: '12px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  desktopTableWrap: {
    display: 'none',
    overflowX: 'auto',
    '@media (min-width: 640px)': {
      display: 'block',
    },
  },
  mobileRunsList: {
    display: 'flex',
    flexDirection: 'column',
    '@media (min-width: 640px)': {
      display: 'none',
    },
  },
  mobileRunRow: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  mobileRunTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  mobileRunError: {
    color: tokens.colorPaletteRedForeground1,
    overflowWrap: 'anywhere',
  },
  errorCell: {
    color: tokens.colorPaletteRedForeground1,
    maxWidth: '240px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  loadingWrap: {
    padding: '32px',
    display: 'flex',
    justifyContent: 'center',
  },
  emptyBody: {
    padding: '24px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

export function HealthView({ health, isLoading, compactMode }: HealthViewProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [syncMessage, setSyncMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const syncMutation = useMutation({
    mutationFn: triggerManualSync,
    onSuccess: (res) => {
      setSyncMessage({
        type: 'ok',
        text: `Sync completado (${res.status}): ${res.coursesCount} materias, ${res.itemsChanged} novedades, ${res.subrequestsUsed} subpeticiones.`,
      });
      void queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      setSyncMessage({ type: 'err', text: err.message });
    },
  });

  if (isLoading) {
    return (
      <div className={styles.loadingWrap}>
        <Spinner label="Cargando telemetría de D1..." />
      </div>
    );
  }

  if (!health) {
    return (
      <Card className={styles.statusCard} appearance="outline">
        <Body1>Telemetría de D1 no disponible en este momento.</Body1>
      </Card>
    );
  }

  const state = health.sync_state;
  const sub = health.subrequests;
  const budgetRatio = sub.max_budget > 0 ? Math.min(1, sub.last_used / sub.max_budget) : 0;
  const budgetPct = Math.round(budgetRatio * 100);

  const statusConfig =
    health.status === 'ok'
      ? {
          label: 'Operacional',
          color: 'success' as const,
          icon: <CheckmarkCircle16Regular />,
        }
      : health.status === 'circuit_open'
      ? {
          label: 'Circuit Breaker Abierto',
          color: 'danger' as const,
          icon: <ShieldError16Regular />,
        }
      : {
          label: 'Degradado',
          color: 'warning' as const,
          icon: <Warning16Regular />,
        };

  return (
    <div className={compactMode ? styles.pageCompact : styles.page}>
      <Card className={styles.statusCard}>
        <div className={styles.statusTop}>
          <div className={styles.statusLeft}>
            <div className={styles.badgeRow}>
              <Badge
                appearance="tint"
                color={statusConfig.color}
                icon={statusConfig.icon}
                size="large"
              >
                {statusConfig.label}
              </Badge>
              <Caption1 className={styles.muted}>
                Último éxito: {formatRelativeTime(state?.last_success_at)}
              </Caption1>
            </div>
            <Caption1 className={styles.muted}>
              Fallos consecutivos: <strong>{state?.consecutive_failures ?? 0}</strong> ·
              Tasa de error reciente: <strong>{Math.round(health.failure_rate * 100)}%</strong>
            </Caption1>
          </div>

          <Button
            appearance="primary"
            disabled={syncMutation.isPending}
            icon={
              syncMutation.isPending ? (
                <Spinner size="tiny" />
              ) : (
                <ArrowSync20Regular />
              )
            }
            onClick={() => {
              setSyncMessage(null);
              syncMutation.mutate();
            }}
            style={{ flexShrink: 0 }}
          >
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar ahora'}
          </Button>
        </div>
      </Card>

      {syncMessage && (
        <MessageBar intent={syncMessage.type === 'ok' ? 'success' : 'error'}>
          <MessageBarBody>{syncMessage.text}</MessageBarBody>
        </MessageBar>
      )}

      <Card className={styles.budgetCard}>
        <div className={styles.budgetTop}>
          <Subtitle2 className={styles.sectionTitle}>
            <DeveloperBoard20Regular />
            Presupuesto de Subpeticiones del Worker (RNF-05)
          </Subtitle2>
          <Caption1 className={styles.muted}>
            Último ciclo: <strong>{sub.last_used}</strong> / {sub.max_budget}
          </Caption1>
        </div>

        <ProgressBar
          value={budgetRatio}
          thickness="large"
          color={budgetPct > 85 ? 'warning' : 'brand'}
        />

        <div className={styles.metricsGrid}>
          <div className={styles.metricTile}>
            <Caption1 className={styles.muted}>Promedio reciente</Caption1>
            <Body1Strong>{sub.avg_recent}</Body1Strong>
          </div>
          <div className={styles.metricTile}>
            <Caption1 className={styles.muted}>Máximo reciente</Caption1>
            <Body1Strong>{sub.max_recent}</Body1Strong>
          </div>
          <div className={styles.metricTile}>
            <Caption1 className={styles.muted}>Semillas activas</Caption1>
            <Body1Strong>
              Base: {state?.baseline_seeded ? 'Sí' : 'No'} · Notas:{' '}
              {state?.grades_seeded ? 'Sí' : 'No'}
            </Body1Strong>
          </div>
        </div>
      </Card>

      <Card className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <HeartPulse20Regular />
          <Subtitle2>
            Últimas {health.recent_runs.length} Ejecuciones (sync_runs)
          </Subtitle2>
        </div>

        {health.recent_runs.length === 0 ? (
          <div className={styles.emptyBody}>
            <Body1>No hay ejecuciones registradas aún.</Body1>
          </div>
        ) : (
          <>
            <div className={styles.mobileRunsList}>
              {health.recent_runs.map((run) => (
                <div key={run.id} className={styles.mobileRunRow}>
                  <div className={styles.mobileRunTop}>
                    <div className={styles.badgeRow}>
                      <Caption1 className={styles.muted}>#{run.id}</Caption1>
                      <Badge
                        appearance="tint"
                        color={
                          run.status === 'ok'
                            ? 'success'
                            : run.status === 'partial'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {run.status}
                      </Badge>
                    </div>
                    <Caption1 className={styles.muted}>
                      {formatUnixDate(run.started_at)}
                    </Caption1>
                  </div>
                  <Caption1 className={styles.muted}>
                    Subpeticiones: <strong>{run.subrequests_used ?? '—'}</strong> · Cambios:{' '}
                    <strong>{run.items_changed ?? 0}</strong>
                  </Caption1>
                  {run.error && (
                    <Caption1 className={styles.mobileRunError}>{run.error}</Caption1>
                  )}
                </div>
              ))}
            </div>

            <div className={styles.desktopTableWrap}>
              <Table
                size="small"
                style={{ tableLayout: 'auto' }}
                aria-label="Historial de ejecuciones de sync"
              >
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>#</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Inicio</TableHeaderCell>
                    <TableHeaderCell>Subpeticiones</TableHeaderCell>
                    <TableHeaderCell>Cambios</TableHeaderCell>
                    <TableHeaderCell>Detalle</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health.recent_runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{run.id}</TableCell>
                      <TableCell>
                        <Badge
                          appearance="tint"
                          color={
                            run.status === 'ok'
                              ? 'success'
                              : run.status === 'partial'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell style={{ whiteSpace: 'nowrap' }}>
                        {formatUnixDate(run.started_at)}
                      </TableCell>
                      <TableCell>{run.subrequests_used ?? '—'}</TableCell>
                      <TableCell>{run.items_changed ?? 0}</TableCell>
                      <TableCell className={styles.errorCell}>
                        {run.error || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
