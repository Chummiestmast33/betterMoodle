import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle, Bell, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';

export default function App() {
  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Error al conectar con la API');
      return res.json();
    },
  });

  const { data: coursesData, isLoading: loadingCourses } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const res = await fetch('/api/courses');
      if (!res.ok) throw new Error('Error al obtener cursos');
      return res.json();
    },
  });

  const { data: itemsData, isLoading: loadingItems } = useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const res = await fetch('/api/items');
      if (!res.ok) throw new Error('Error al obtener actividades');
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10 px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              BM
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">BetterMoodle</h1>
              <p className="text-xs text-slate-400">catedig.itlalaguna.edu.mx</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {loadingHealth ? 'Verificando...' : health?.status === 'ok' ? 'D1 Conectado' : 'Sin sincronizar'}
            </span>
            <a
              href="https://catedig.itlalaguna.edu.mx"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 border border-slate-800 rounded-md px-2.5 py-1 transition"
            >
              Moodle Oficial <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Status Banner */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base">Estado del Motor de Sincronización</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">Fase 1</span>
            </div>
            <p className="text-sm text-slate-400">
              {health?.syncState?.baseline_seeded === 1
                ? `Último sync exitoso: ${new Date(health.syncState.last_success_at).toLocaleTimeString()}`
                : 'Esperando primer ciclo de sincronización (Fase 0 y 1).'}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </section>

        {/* Grid de contenido */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Materias */}
          <div className="md:col-span-1 space-y-4">
            <h3 className="font-semibold text-sm text-slate-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              Materias Inscritas
            </h3>

            {loadingCourses ? (
              <div className="p-4 bg-slate-900 rounded-lg text-sm text-slate-400">Cargando materias...</div>
            ) : coursesData?.courses?.length ? (
              <div className="space-y-2">
                {coursesData.courses.map((c: any) => (
                  <div key={c.id} className="p-3 bg-slate-900 border border-slate-800/80 rounded-lg hover:border-slate-700 transition">
                    <p className="text-sm font-medium text-slate-200">{c.fullname}</p>
                    <p className="text-xs text-slate-400">{c.shortname}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg text-center text-xs text-slate-400">
                No hay materias en caché aún. Se sincronizarán automáticamente al configurar el token.
              </div>
            )}
          </div>

          {/* Tareas y Actividades */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="font-semibold text-sm text-slate-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Próximas Tareas y Actividades
            </h3>

            {loadingItems ? (
              <div className="p-4 bg-slate-900 rounded-lg text-sm text-slate-400">Cargando actividades...</div>
            ) : itemsData?.items?.length ? (
              <div className="space-y-2">
                {itemsData.items.map((item: any) => (
                  <div key={item.item_key} className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-slate-400">
                        {item.due_date ? `Vence: ${new Date(item.due_date * 1000).toLocaleString()}` : 'Sin fecha límite'}
                      </p>
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        Abrir <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-lg text-center text-sm text-slate-400">
                <p>No hay tareas sincronizadas aún.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Ejecuta la Fase 0 para validar el token y activa el cron de Fase 1 para poblarlas.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
