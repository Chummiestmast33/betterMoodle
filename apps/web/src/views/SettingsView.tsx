import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  Link,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Subtitle2,
  Switch,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  Alert20Regular,
  AlertOff20Regular,
  CheckmarkCircle20Regular,
  Open16Regular,
  Phone20Regular,
  Send20Regular,
  ShareIos20Regular,
  SquareAdd20Regular,
} from '@fluentui/react-icons';
import {
  fetchPushStatus,
  sendTestPush,
  subscribeWebPush,
  unsubscribeWebPush,
} from '../lib/api';
import {
  detectPushCapabilities,
  getExistingPushSubscription,
  subscribeBrowserPush,
} from '../lib/push';
import { useThemeMode, type ThemeMode } from '../lib/theme';

interface SettingsViewProps {
  compactMode: boolean;
  onToggleCompactMode: () => void;
}

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '768px',
    minWidth: 0,
  },
  card: {
    padding: '20px',
    gap: '14px',
    minWidth: 0,
  },
  cardHeaderRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  cardTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    flexGrow: 1,
  },
  headingWithIcon: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  iosSteps: {
    margin: '6px 0 0 0',
    paddingLeft: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  iosInline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    verticalAlign: 'middle',
  },
  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  prefRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  prefText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flexGrow: 1,
  },
  themeBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    paddingTop: '12px',
  },
  infoCard: {
    padding: '20px',
    gap: '8px',
    minWidth: 0,
  },
});

export function SettingsView({
  compactMode,
  onToggleCompactMode,
}: SettingsViewProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { themeMode, setThemeMode } = useThemeMode();

  const [caps, setCaps] = useState(() => detectPushCapabilities());
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const pushStatusQuery = useQuery({
    queryKey: ['push-status'],
    queryFn: fetchPushStatus,
  });

  useEffect(() => {
    setCaps(detectPushCapabilities());
    getExistingPushSubscription()
      .then(async (sub) => {
        if (!sub) {
          setActiveEndpoint(null);
          return;
        }
        setActiveEndpoint(sub.endpoint);
        // Asegurar sincronización con D1 si la base local o remota fue recreada
        await subscribeWebPush(sub.toJSON()).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: ['push-status'] });
      })
      .catch(() => setActiveEndpoint(null));
  }, [queryClient]);

  async function handleEnablePush() {
    if (!pushStatusQuery.data?.public_key) {
      setFeedback({
        type: 'err',
        text: 'El servidor no tiene configuradas las llaves VAPID aún.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const sub = await subscribeBrowserPush(pushStatusQuery.data.public_key);
      await subscribeWebPush(sub.toJSON());
      setActiveEndpoint(sub.endpoint);
      setCaps(detectPushCapabilities());
      setFeedback({
        type: 'ok',
        text: 'Notificaciones Web Push activadas en este dispositivo.',
      });
      void queryClient.invalidateQueries({ queryKey: ['push-status'] });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo activar Web Push.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisablePush() {
    setBusy(true);
    setFeedback(null);
    try {
      const sub = await getExistingPushSubscription();
      const endpoint = sub?.endpoint ?? activeEndpoint;
      if (sub) {
        await sub.unsubscribe();
      }
      if (endpoint) {
        await unsubscribeWebPush(endpoint);
      }
      setActiveEndpoint(null);
      setFeedback({
        type: 'ok',
        text: 'Suscripción eliminada de este dispositivo.',
      });
      void queryClient.invalidateQueries({ queryKey: ['push-status'] });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error al desactivar Web Push.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestPush() {
    setBusy(true);
    setFeedback(null);
    try {
      let res = await sendTestPush(activeEndpoint ?? undefined);

      // Si D1 no tenía registrada esta suscripción (ej. cambio/reinicio de BD local), re-registrar y reintentar
      if (res.sent === 0 && res.purged === 0 && res.failed === 0) {
        const existing = await getExistingPushSubscription();
        if (existing) {
          await subscribeWebPush(existing.toJSON());
          setActiveEndpoint(existing.endpoint);
          res = await sendTestPush(existing.endpoint);
        }
      }

      if (res.sent > 0) {
        setFeedback({
          type: 'ok',
          text: `Prueba enviada (${res.sent} entregadas, ${res.purged} expiradas purgadas, ${res.failed} fallidas).`,
        });
      } else if (res.purged > 0) {
        const existing = await getExistingPushSubscription();
        if (existing) {
          await existing.unsubscribe().catch(() => undefined);
        }
        setActiveEndpoint(null);
        setFeedback({
          type: 'err',
          text: 'La suscripción del navegador había expirado (410/404) y fue purgada. Pulsa "Activar notificaciones" nuevamente.',
        });
      } else if (res.failed > 0) {
        setFeedback({
          type: 'err',
          text: `No se pudo entregar al servicio Push (${res.failed} fallidas). Pulsa Desactivar y vuelve a activar las notificaciones.`,
        });
      } else {
        setFeedback({
          type: 'err',
          text: 'No se encontró ninguna suscripción registrada en D1 para este dispositivo. Pulsa Desactivar y vuelve a activarla.',
        });
      }

      void queryClient.invalidateQueries({ queryKey: ['push-status'] });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Error enviando notificación de prueba.',
      });
    } finally {
      setBusy(false);
    }
  }

  const iosNeedsInstall = caps.isIOS && !caps.isStandalone;
  const serverConfigured = pushStatusQuery.data?.configured ?? false;

  return (
    <div className={styles.page}>
      {/* Web Push */}
      <Card className={styles.card}>
        <div className={styles.cardHeaderRow}>
          <div className={styles.cardTitleGroup}>
            <Subtitle2>
              Notificaciones Web Push (Canal Secundario)
            </Subtitle2>
            <Caption1 className={styles.muted}>
              Recibe alertas agregadas directamente en este navegador o PWA instalada, además de Telegram.
            </Caption1>
          </div>
          <Badge
            appearance="tint"
            color={activeEndpoint ? 'success' : 'subtle'}
            size="medium"
          >
            {activeEndpoint ? 'Activo aquí' : 'Inactivo'}
          </Badge>
        </div>

        {iosNeedsInstall && (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle className={styles.headingWithIcon}>
                <Phone20Regular />
                iOS 16.4+ requiere instalar la PWA primero
              </MessageBarTitle>
              <div>
                Safari en iPhone/iPad solo habilita Web Push cuando abres la aplicación desde tu pantalla de inicio:
              </div>
              <ol className={styles.iosSteps}>
                <li>
                  <span className={styles.iosInline}>
                    Toca <strong>Compartir</strong> <ShareIos20Regular /> en Safari.
                  </span>
                </li>
                <li>
                  <span className={styles.iosInline}>
                    Selecciona <strong>Agregar a inicio</strong> <SquareAdd20Regular />.
                  </span>
                </li>
                <li>
                  Abre BetterMoodle desde el ícono instalado y vuelve aquí para activar las alertas.
                </li>
              </ol>
            </MessageBarBody>
          </MessageBar>
        )}

        {!caps.supported && !iosNeedsInstall && (
          <MessageBar intent="warning">
            <MessageBarBody>
              Este navegador o contexto no soporta Web Push (`PushManager` / Service Worker).
            </MessageBarBody>
          </MessageBar>
        )}

        {feedback && (
          <MessageBar intent={feedback.type === 'ok' ? 'success' : 'error'}>
            <MessageBarBody>{feedback.text}</MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.actionsRow}>
          {!activeEndpoint ? (
            <Button
              appearance="primary"
              disabled={busy || !caps.supported || iosNeedsInstall || !serverConfigured}
              icon={<Alert20Regular />}
              onClick={handleEnablePush}
            >
              Activar notificaciones en este dispositivo
            </Button>
          ) : (
            <>
              <Button
                appearance="primary"
                disabled={busy}
                icon={<Send20Regular />}
                onClick={handleTestPush}
              >
                Enviar prueba Push
              </Button>
              <Button
                appearance="secondary"
                disabled={busy}
                icon={<AlertOff20Regular />}
                onClick={handleDisablePush}
              >
                Desactivar
              </Button>
            </>
          )}
        </div>

        <Caption1 className={styles.muted}>
          Dispositivos suscritos en D1: {pushStatusQuery.data?.subscription_count ?? 0} · Estado servidor:{' '}
          {serverConfigured ? 'Llaves VAPID listas' : 'Sin llaves VAPID'}
        </Caption1>
      </Card>

      {/* Preferencias Locales */}
      <Card className={styles.card}>
        <Subtitle2>Preferencias de Interfaz</Subtitle2>

        <div className={styles.prefRow}>
          <div className={styles.prefText}>
            <Body1Strong>Modo compacto</Body1Strong>
            <Caption1 className={styles.muted}>
              Reduce el espaciado en listas para mostrar más tareas en pantalla.
            </Caption1>
          </div>
          <Switch
            checked={compactMode}
            onChange={() => onToggleCompactMode()}
            aria-label="Modo compacto"
          />
        </div>

        <div className={styles.themeBlock}>
          <Body1Strong>Apariencia (Fluent 2)</Body1Strong>
          <Caption1 className={styles.muted}>
            Por defecto sigue el tema de tu dispositivo.
          </Caption1>
          <RadioGroup
            layout="horizontal"
            value={themeMode}
            onChange={(_e, data) => setThemeMode(data.value as ThemeMode)}
            aria-label="Tema de la aplicación"
          >
            <Radio value="system" label="Sistema" />
            <Radio value="light" label="Claro" />
            <Radio value="dark" label="Oscuro" />
          </RadioGroup>
        </div>
      </Card>

      {/* Arquitectura & Enlace Institucional */}
      <Card className={styles.infoCard} appearance="filled-alternative">
        <div className={styles.headingWithIcon}>
          <CheckmarkCircle20Regular
            style={{ color: tokens.colorPaletteGreenForeground1, flexShrink: 0 }}
          />
          <Body1Strong>Modo Híbrido Activo (Lectura D1 + Deep-Links)</Body1Strong>
        </div>
        <Body1 className={styles.muted}>
          Todas las vistas leen desde Cloudflare D1 sin tocar Moodle directamente. Entregas y exámenes se abren en la plataforma oficial del ITL.
        </Body1>
        <div>
          <Link
            href="https://catedig.itlalaguna.edu.mx"
            target="_blank"
            rel="noreferrer"
            inline
          >
            Ir a catedig.itlalaguna.edu.mx <Open16Regular style={{ verticalAlign: 'middle' }} />
          </Link>
        </div>
      </Card>
    </div>
  );
}
