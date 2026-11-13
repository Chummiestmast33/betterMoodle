import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Smartphone,
  Send,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Share,
  PlusSquare,
} from 'lucide-react';
import {
  fetchPushStatus,
  subscribeWebPush,
  unsubscribeWebPush,
  sendTestPush,
} from '../lib/api';
import {
  detectPushCapabilities,
  getExistingPushSubscription,
  subscribeBrowserPush,
} from '../lib/push';

interface SettingsViewProps {
  compactMode: boolean;
  onToggleCompactMode: () => void;
}

export function SettingsView({ compactMode, onToggleCompactMode }: SettingsViewProps) {
  const queryClient = useQueryClient();
  const [caps, setCaps] = useState(() => detectPushCapabilities());
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const pushStatusQuery = useQuery({
    queryKey: ['push-status'],
    queryFn: fetchPushStatus,
  });

  useEffect(() => {
    setCaps(detectPushCapabilities());
    getExistingPushSubscription()
      .then((sub) => setActiveEndpoint(sub?.endpoint ?? null))
      .catch(() => setActiveEndpoint(null));
  }, []);

  async function handleEnablePush() {
    if (!pushStatusQuery.data?.public_key) {
      setFeedback({ type: 'err', text: 'El servidor no tiene configuradas las llaves VAPID aún.' });
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
      setFeedback({ type: 'ok', text: 'Suscripción eliminada de este dispositivo.' });
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
      const res = await sendTestPush(activeEndpoint ?? undefined);
      setFeedback({
        type: 'ok',
        text: `Prueba enviada (${res.sent} entregadas, ${res.purged} expiradas purgadas, ${res.failed} fallidas).`,
      });
      void queryClient.invalidateQueries({ queryKey: ['push-status'] });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error enviando notificación de prueba.',
      });
    } finally {
      setBusy(false);
    }
  }

  const iosNeedsInstall = caps.isIOS && !caps.isStandalone;
  const serverConfigured = pushStatusQuery.data?.configured ?? false;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Web Push Section */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" />
              Notificaciones Web Push (Canal Secundario)
            </h2>
            <p className="text-xs text-slate-400">
              Recibe alertas agregadas directamente en este navegador o PWA instalada, además de Telegram.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 ${
              activeEndpoint
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {activeEndpoint ? 'Activo aquí' : 'Inactivo'}
          </span>
        </div>

        {/* iOS 16.4+ Standalone Guardrail (RNF-04) */}
        {iosNeedsInstall && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <Smartphone className="w-4 h-4" />
              iOS 16.4+ requiere instalar la PWA primero
            </div>
            <p>
              Safari en iPhone/iPad solo habilita Web Push cuando abres la aplicación desde tu pantalla de inicio:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-amber-100/90">
              <li className="inline-flex items-center gap-1.5">
                Toca el botón <strong>Compartir</strong> <Share className="w-3.5 h-3.5 inline" /> en Safari.
              </li>
              <li className="block">
                Selecciona <strong>Agregar a inicio</strong> <PlusSquare className="w-3.5 h-3.5 inline" />.
              </li>
              <li>Abre BetterMoodle desde el ícono instalado y vuelve aquí para activar las alertas.</li>
            </ol>
          </div>
        )}

        {!caps.supported && !iosNeedsInstall && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            Este navegador o contexto no soporta Web Push (`PushManager` / Service Worker).
          </div>
        )}

        {feedback && (
          <div
            className={`p-3 rounded-lg border text-xs ${
              feedback.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {!activeEndpoint ? (
            <button
              type="button"
              disabled={busy || !caps.supported || iosNeedsInstall || !serverConfigured}
              onClick={handleEnablePush}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition"
            >
              <Bell className="w-3.5 h-3.5" />
              Activar notificaciones en este dispositivo
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleTestPush}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold transition"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar prueba Push
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDisablePush}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold transition"
              >
                <BellOff className="w-3.5 h-3.5" />
                Desactivar
              </button>
            </>
          )}
        </div>

        <p className="text-[11px] text-slate-500">
          Dispositivos suscritos en D1: {pushStatusQuery.data?.subscription_count ?? 0} · Estado servidor:{' '}
          {serverConfigured ? 'Llaves VAPID listas' : 'Sin llaves VAPID'}
        </p>
      </section>

      {/* Preferencias Locales */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-100">Preferencias de Interfaz</h2>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-slate-200">Modo compacto</p>
            <p className="text-xs text-slate-400">
              Reduce el espaciado en listas para mostrar más tareas en pantalla.
            </p>
          </div>
          <input
            type="checkbox"
            checked={compactMode}
            onChange={onToggleCompactMode}
            className="w-4 h-4 accent-indigo-500"
          />
        </label>
      </section>

      {/* Arquitectura & Enlace Institucional */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-2 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Modo Híbrido Activo (Lectura D1 + Deep-Links)
        </div>
        <p>
          Todas las vistas leen desde Cloudflare D1 sin tocar Moodle directamente. Entregas y exámenes se abren en la plataforma oficial del ITL.
        </p>
        <a
          href="https://catedig.itlalaguna.edu.mx"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 pt-1"
        >
          Ir a catedig.itlalaguna.edu.mx <ExternalLink className="w-3 h-3" />
        </a>
      </section>
    </div>
  );
}
