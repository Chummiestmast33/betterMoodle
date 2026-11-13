import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, ShieldAlert, Cpu } from 'lucide-react';
import type { EnhancedHealthResponse } from '@better-moodle/shared';
import { triggerManualSync } from '../lib/api';
import { formatRelativeTime, formatUnixDate } from '../lib/format';

interface HealthViewProps {
  health: EnhancedHealthResponse | undefined;
  isLoading: boolean;
}

export function HealthView({ health, isLoading }: HealthViewProps) {
  const queryClient = useQueryClient();
  const [syncMessage, setSyncMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  if (isLoading || !health) {
    return <div className="p-8 text-center text-sm text-slate-400">Cargando telemetría de D1...</div>;
  }

  const state = health.sync_state;
  const sub = health.subrequests;
  const budgetPct = Math.min(100, Math.round((sub.last_used / sub.max_budget) * 100));

  const statusConfig =
    health.status === 'ok'
      ? { label: 'Operacional', icon: CheckCircle2, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
      : health.status === 'circuit_open'
      ? { label: 'Circuit Breaker Abierto', icon: ShieldAlert, cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }
      : { label: 'Degradado', icon: AlertTriangle, cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };

  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* Top Status & Manual Trigger */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusConfig.cls}`}
            >
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            <span className="text-xs text-slate-400">
              Último éxito: {formatRelativeTime(state?.last_success_at)}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Fallos consecutivos: <strong className="text-slate-200">{state?.consecutive_failures ?? 0}</strong> ·
            Tasa de error reciente: <strong className="text-slate-200">{Math.round(health.failure_rate * 100)}%</strong>
          </p>
        </div>

        <button
          type="button"
          disabled={syncMutation.isPending}
          onClick={() => {
            setSyncMessage(null);
            syncMutation.mutate();
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </div>

      {syncMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs ${
            syncMessage.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {syncMessage.text}
        </div>
      )}

      {/* Subrequest Budget Telemetry (RNF-05) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            Presupuesto de Subpeticiones del Worker (RNF-05)
          </h3>
          <span className="text-xs text-slate-400">
            Último ciclo: <strong className="text-slate-100">{sub.last_used}</strong> / {sub.max_budget}
          </span>
        </div>

        <div className="h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              budgetPct > 85 ? 'bg-amber-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${budgetPct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs pt-1">
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <p className="text-slate-500">Promedio reciente</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">{sub.avg_recent}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <p className="text-slate-500">Máximo reciente</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">{sub.max_recent}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <p className="text-slate-500">Semillas activas</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">
              Base: {state?.baseline_seeded ? 'Sí' : 'No'} · Notas: {state?.grades_seeded ? 'Sí' : 'No'}
            </p>
          </div>
        </div>
      </div>

      {/* Sync Runs History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">
            Últimas {health.recent_runs.length} Ejecuciones (`sync_runs`)
          </h3>
        </div>

        {health.recent_runs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No hay ejecuciones registradas aún.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium">Inicio</th>
                  <th className="px-4 py-2.5 font-medium">Subpeticiones</th>
                  <th className="px-4 py-2.5 font-medium">Cambios</th>
                  <th className="px-4 py-2.5 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {health.recent_runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-slate-400">{run.id}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          run.status === 'ok'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : run.status === 'partial'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">
                      {formatUnixDate(run.started_at)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{run.subrequests_used ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-300">{run.items_changed ?? 0}</td>
                    <td className="px-4 py-2.5 text-rose-300 max-w-xs truncate">
                      {run.error || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
