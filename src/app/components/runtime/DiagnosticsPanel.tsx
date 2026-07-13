import React, { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRuntimeStore } from "../../runtime/runtime.store";
import { selectHeaderStatus } from "../../runtime/selectors";
import { readMemoryPressureRatio } from "../../render/render.policy";
import { metricsService } from "../../services/metrics.service";
import { runtimeTelemetry } from "../../telemetry/runtime.telemetry";
import { runtimeProfiling } from "../../telemetry/runtime.profiling";
import { getRuntimeCleanupStats } from "../../runtime/runtime.cleanup-registry";
import { swClientService } from "../../services/sw-client.service";
import { getManagedCacheNames } from "../../cache/cache.policy";
import { db } from "../../storage/db";
import { queueService } from "../../offline/queue.service";
import { syncCircuitBreaker } from "../../sync/sync.circuit";
import { syncEngine } from "../../sync/sync-engine";
import { scenarioEngine, type SimulationState } from "../../chaos/scenario.engine";
import { authLifecycle } from "../../auth/auth.lifecycle";
import { networkService } from "../../network/network.service";
import { Shield, RefreshCw, Activity, Cpu, Power, AlertTriangle, AlertOctagon, Trash2, Wifi, WifiOff, Users, Database } from "lucide-react";
import { syncMonitorConfig } from "../../config/sync-monitor.config";

interface DiagnosticsSnapshot {
  metricsCount: number;
  cacheEntries: number;
  swControlled: boolean;
  swPending: boolean;
  heapMb: number | null;
  observers: number;
  listeners: number;
  timers: number;
  dlqSize: number;
  quarantineSize: number;
}

export const DiagnosticsPanel: React.FC = () => {
  console.count("Diag render");
  
  // Zustand States
  const header = useRuntimeStore(useShallow(selectHeaderStatus));
  const tier = useRuntimeStore((s) => s.runtimeTier);
  const authPhase = useRuntimeStore((s) => s.authPhase);
  const lockedReason = useRuntimeStore((s) => s.lockedReason);
  const health = useRuntimeStore((s) => s.healthLevel);
  const healthScore = useRuntimeStore((s) => s.healthScore);
  const currentUser = useRuntimeStore((s) => s.currentUser);
  const syncing = useRuntimeStore((s) => s.syncing);
  const lastSyncAt = useRuntimeStore((s) => s.lastSyncAt);

  // Component States
  const [mountTime] = useState<number>(Date.now());
  const [uptime, setUptime] = useState<number>(0);
  const [snap, setSnap] = useState<DiagnosticsSnapshot | null>(null);
  const [simState, setSimState] = useState<SimulationState>(scenarioEngine.getState());
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [backendMetrics, setBackendMetrics] = useState<any>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const memRatio = readMemoryPressureRatio();
  const counters = runtimeTelemetry.getCounters();
  const profiling = runtimeProfiling.getLastSample();
  const telemetryStats = runtimeTelemetry.getSyncPerformanceStats();

  // Scenario Engine state listener
  useEffect(() => {
    return scenarioEngine.subscribe(() => {
      setSimState({ ...scenarioEngine.getState() });
    });
  }, []);

  // Update uptime counter every second
  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(Math.floor((Date.now() - mountTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [mountTime]);

  const refresh = useCallback(async () => {
    setIsUpdating(true);
    let cacheEntries = 0;
    try {
      if ("caches" in window) {
        for (const name of getManagedCacheNames()) {
          const cache = await caches.open(name);
          cacheEntries += (await cache.keys()).length;
        }
      }

      const report = await metricsService.getMetricsReport();
      const mem = (performance as any).memory;
      const cleanup = getRuntimeCleanupStats();

      // Query local Dexie queue databases for DLQ and Quarantine sizes
      const dlqSize = await db.movementsQueue.where("syncStatus").equals("DEAD_LETTER").count();
      const deadItems = await db.movementsQueue.where("syncStatus").equals("DEAD_LETTER").toArray();
      const quarantineSize = deadItems.filter(item => item.syncErrorMessage?.includes("[QUARANTINE]")).length;

      setSnap({
        metricsCount: report.totalLogs,
        cacheEntries,
        swControlled: !!navigator.serviceWorker?.controller,
        swPending: swClientService.hasPendingRefresh(),
        heapMb: mem?.usedJSHeapSize
          ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10
          : null,
        observers: cleanup.observers,
        listeners: cleanup.listeners,
        timers: cleanup.timers,
        dlqSize,
        quarantineSize
      });

      // Fetch server sync metrics (Manual / 60s background refresh)
      try {
        const res = await fetch("/api/sync/metrics");
        if (res.ok) {
          const data = await res.json();
          setBackendMetrics(data.data);
          setMetricsError(null);
        } else {
          setMetricsError(`Status ${res.status}: ${res.statusText}`);
        }
      } catch (err: any) {
        setMetricsError(err.message || "Error al conectar con la API de métricas");
      }
    } catch (e) {
      console.warn("Failed to fetch diagnostics snapshot", e);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Poll every 60 seconds maximum to prevent server load (Neon database protection)
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // RESET ACTIONS
  const handleClearAuthSnapshot = async () => {
    if (window.confirm("🚨 CRÍTICO: ¿Deseas eliminar el snapshot de sesión local? Esto forzará un cierre de sesión inmediato, pero conservará la cola de movimientos pendientes.")) {
      await authLifecycle.onLogoutLocal();
      alert("Snapshot eliminado. Redirigiendo a inicio...");
      window.location.reload();
    }
  };

  const handleClearQueue = async () => {
    if (window.confirm("⚠️ ADVERTENCIA: ¿Deseas vaciar por completo la cola local de movimientos pendientes? Esta acción eliminará registros no sincronizados.")) {
      await db.movementsQueue.clear();
      await queueService.refreshQueueCounts();
      void refresh();
      alert("Cola vaciada correctamente.");
    }
  };

  const handleClearDLQ = async () => {
    if (window.confirm("¿Deseas vaciar los registros de error permanente (DEAD_LETTER)?")) {
      await db.movementsQueue.where("syncStatus").equals("DEAD_LETTER").delete();
      await queueService.refreshQueueCounts();
      void refresh();
      alert("DLQ vaciado correctamente.");
    }
  };

  const handleClearQuarantine = async () => {
    if (window.confirm("¿Deseas eliminar todas las anomalías y elementos corruptos en cuarentena del dispositivo?")) {
      const items = await db.movementsQueue.where("syncStatus").equals("DEAD_LETTER").toArray();
      const targets = items.filter(it => it.syncErrorMessage?.includes("[QUARANTINE]"));
      for (const it of targets) {
        if (it.id) await db.movementsQueue.delete(it.id);
      }
      await queueService.refreshQueueCounts();
      void refresh();
      alert("Elementos en cuarentena eliminados.");
    }
  };

  const handleResetCircuitBreaker = () => {
    syncCircuitBreaker.recordSuccess();
    alert("Interruptor restablecido a CERRADO (operativo).");
  };

  const handleResetTelemetry = () => {
    runtimeTelemetry.resetPerformanceStats();
    alert("Buffers y métricas de telemetría en memoria reinicializados.");
  };

  const handleClearIndexedDBParcial = async () => {
    if (window.confirm("¿Deseas purgar el historial de logs de métricas y la caché optimista de stock? (Esto NO afecta la cola de movimientos ni las credenciales)")) {
      await db.stockCache.clear();
      await db.metricsLog.clear();
      void refresh();
      alert("Caché local purgada.");
    }
  };

  const handleForzarRelogin = () => {
    authLifecycle.releaseLockForReauth();
  };

  // Helper formatting values
  const avgLatency = telemetryStats.durations.length > 0
    ? (telemetryStats.durations.reduce((a, b) => a + b, 0) / telemetryStats.durations.length).toFixed(0) + "ms"
    : "—";

  const isProduction = import.meta.env.PROD;

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full space-y-4 text-xs font-sans pb-24 text-gray-200">
      
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <h2 className="text-sm font-black uppercase text-gray-100 tracking-wider">
              PANEL DE DIAGNÓSTICO INDUSTRIAL
            </h2>
            <p className="text-[10px] text-gray-500 font-mono">Uptime: {uptime}s | Uptime Runtime</p>
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={isUpdating}
          className="p-2 bg-gray-800 active:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* WARNING PANEL IF SIMULATORS ARE ACTIVE */}
      {(simState.backendOffline || simState.timeout || simState.auth401 || simState.snapshotMismatch || simState.slowNetwork) && (
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-3.5 flex items-start gap-2.5 animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="font-bold text-amber-300 text-[11px] uppercase tracking-wide">Simulaciones de Fallo Activas</h4>
            <p className="text-gray-400 leading-relaxed text-[10px]">
              El sistema se encuentra operando bajo condiciones sintéticas forzadas para pruebas operacionales. 
              Desactiva las simulaciones en la sección inferior para recuperar la operación estándar.
            </p>
            <button
              onClick={() => scenarioEngine.resetAll()}
              className="px-2.5 py-1 bg-amber-900/50 hover:bg-amber-800 text-amber-200 font-bold uppercase rounded text-[9px] border border-amber-700/60"
            >
              Desactivar Todo
            </button>
          </div>
        </div>
      )}

      {/* ALERTS FOR SYNC SYSTEM THRESHOLDS */}
      {(() => {
        const pendingAlert = header.pending > syncMonitorConfig.maxPendingQueueSize;
        const failedAlert = backendMetrics && backendMetrics.retries24h > syncMonitorConfig.maxFailedPerHour;
        const conflictAlert = backendMetrics && backendMetrics.replays24h > syncMonitorConfig.maxConflictsPerHour;

        if (pendingAlert || failedAlert || conflictAlert) {
          return (
            <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-3.5 flex items-start gap-2.5 animate-fadeIn">
              <AlertOctagon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-red-400 text-[11px] uppercase tracking-wide">ALERTA OPERATIVA: Umbrales Excedidos</h4>
                <div className="text-gray-300 text-[10px] space-y-1 mt-1 font-mono">
                  {pendingAlert && (
                    <div>• Cola local excedida: <span className="text-red-400 font-bold">{header.pending}</span> movimientos en espera (máx: {syncMonitorConfig.maxPendingQueueSize}).</div>
                  )}
                  {failedAlert && (
                    <div>• Tasa de reintentos fallidos excedida: <span className="text-red-400 font-bold">{backendMetrics.retries24h}</span> fallos en últimas 24h (máx por hora: {syncMonitorConfig.maxFailedPerHour}).</div>
                  )}
                  {conflictAlert && (
                    <div>• Replays / colisiones excedidas: <span className="text-red-400 font-bold">{backendMetrics.replays24h}</span> replays en últimas 24h (máx por hora: {syncMonitorConfig.maxConflictsPerHour}).</div>
                  )}
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* TWO COLUMN GRID FOR METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* RUNTIME MONITORING */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-2.5">
          <h3 className="font-black text-[11px] text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800 pb-1.5">
            <Cpu className="w-4 h-4" /> ESTADO DEL RUNTIME
          </h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 font-mono text-[11px]">
            <div className="text-gray-500">Tier Runtime:</div>
            <div className="font-bold text-gray-200">{tier}</div>
            
            <div className="text-gray-500">Auth Phase:</div>
            <div className={`font-bold uppercase ${authPhase === "ONLINE_AUTH" ? "text-green-400" : "text-amber-400"}`}>{authPhase}</div>
            
            {lockedReason && (
              <>
                <div className="text-gray-500">Motivo Lock:</div>
                <div className="font-bold text-red-400">{lockedReason}</div>
              </>
            )}

            <div className="text-gray-500">Health Level:</div>
            <div className={`font-bold ${health === "NORMAL" ? "text-green-400" : health === "WARNING" ? "text-amber-400" : "text-red-400"}`}>
              {health} ({healthScore}/100)
            </div>

            <div className="text-gray-500">Red:</div>
            <div className={`font-bold uppercase ${header.online ? "text-green-400" : "text-amber-400 animate-pulse"}`}>
              {header.online ? "ONLINE" : "OFFLINE"}
            </div>

            <div className="text-gray-500">Sincronización:</div>
            <div className="font-bold">{syncing ? "EJECUTANDO..." : "ESPERANDO (IDLE)"}</div>

            <div className="text-gray-500">Schema Snapshot:</div>
            <div className="font-bold">v1 (signed)</div>
          </div>
        </section>

        {/* SYNC QUEUE STATISTICS */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-2.5">
          <h3 className="font-black text-[11px] text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800 pb-1.5">
            <Activity className="w-4 h-4" /> INTEGRIDAD Y COLAS
          </h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 font-mono text-[11px]">
            <div className="text-gray-500">Cola Activa:</div>
            <div className={`font-bold ${header.pending > 0 ? "text-blue-400" : "text-gray-400"}`}>
              {header.pending} movimientos
            </div>

            <div className="text-gray-500">Registros DLQ:</div>
            <div className={`font-bold ${snap?.dlqSize && snap.dlqSize > 0 ? "text-red-400 animate-pulse" : "text-gray-400"}`}>
              {snap?.dlqSize ?? "…"} fallados
            </div>

            <div className="text-gray-500">En Cuarentena:</div>
            <div className={`font-bold ${snap?.quarantineSize && snap.quarantineSize > 0 ? "text-amber-400 font-bold" : "text-gray-400"}`}>
              {snap?.quarantineSize ?? "…"} corruptos
            </div>

            <div className="text-gray-500">Circuit Breaker:</div>
            <div className={`font-bold uppercase ${syncCircuitBreaker.isOpen() ? "text-red-400 animate-pulse" : "text-green-400"}`}>
              {syncCircuitBreaker.getState()}
            </div>

            <div className="text-gray-500">Reintento Cola:</div>
            <div className="font-bold text-gray-300">
              {syncEngine.hasScheduledSync() ? "ACTIVO (RETRY)" : "INACTIVO"}
            </div>

            <div className="text-gray-500">Último Ping Exitoso:</div>
            <div className="font-bold text-gray-300 text-[10px] break-all truncate">
              {networkService.lastSuccessfulPing ? new Date(networkService.lastSuccessfulPing).toLocaleTimeString() : "SIN DATOS"}
            </div>

            <div className="text-gray-500">Última Sync:</div>
            <div className="font-bold text-gray-300 text-[10px] break-all truncate">
              {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "—"}
            </div>
          </div>
        </section>
      </div>

      {/* PRODUCTION SYNC METRICS (SERVER-SIDE & SYSTEM STATUS) */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-3 shadow-lg">
        <h3 className="font-black text-[11px] text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800 pb-1.5">
          <Activity className="w-4 h-4 shrink-0" /> MÉTRICAS EN PRODUCCIÓN Y MONITOREO
        </h3>
        
        {metricsError ? (
          <div className="bg-red-950/20 border border-red-900/40 p-3 rounded-lg text-red-300 font-mono text-[10px] uppercase">
            ⚠️ Error de Telemetría: {metricsError}
          </div>
        ) : backendMetrics ? (
          <div className="space-y-3 font-mono text-[11px]">
            {/* Grid statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Sincronizados (Synced)</div>
                <div className="text-sm font-bold text-green-400 mt-0.5">{backendMetrics.counts?.SYNCED ?? 0}</div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Rechazados (Failed)</div>
                <div className={`text-sm font-bold mt-0.5 ${backendMetrics.counts?.FAILED > 0 ? "text-red-400 animate-pulse" : "text-gray-400"}`}>{backendMetrics.counts?.FAILED ?? 0}</div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Conflictos (Conflict)</div>
                <div className={`text-sm font-bold mt-0.5 ${backendMetrics.counts?.CONFLICT > 0 ? "text-orange-400 animate-pulse" : "text-gray-400"}`}>{backendMetrics.counts?.CONFLICT ?? 0}</div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Velocidad Latencia DB</div>
                <div className="text-sm font-bold text-blue-400 mt-0.5">{backendMetrics.databaseLatencyMs ?? 0}ms</div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Promedio Sync (24h)</div>
                <div className="text-sm font-bold text-blue-400 mt-0.5">{backendMetrics.avgSyncTimeMs ?? 0}ms</div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Reintentos (24h)</div>
                <div className="text-sm font-bold text-gray-300 mt-0.5">{backendMetrics.retries24h ?? 0}</div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Replays (24h)</div>
                <div className="text-sm font-bold text-gray-300 mt-0.5">{backendMetrics.replays24h ?? 0}</div>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg">
                <div className="text-gray-500 text-[9px] uppercase font-sans">Uptime Servidor</div>
                <div className="text-sm font-bold text-gray-300 mt-0.5">{Math.round(backendMetrics.uptime ?? 0)}s</div>
              </div>
            </div>

            {/* Diagnostics system info */}
            <div className="flex justify-between items-center bg-gray-950 border border-gray-850/60 p-2 rounded-lg text-[10px] text-gray-500 font-sans">
              <div>Build Versión: <span className="font-bold text-gray-300">{backendMetrics.buildVersion ?? "N/A"}</span></div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 font-semibold uppercase text-[9px] tracking-wider">Telemetría Conectada</span>
              </div>
            </div>

            {/* Last 10 errors list */}
            {backendMetrics.lastErrors && backendMetrics.lastErrors.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <h4 className="text-[10px] font-black text-red-400 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Últimos Fallos en Servidor
                </h4>
                <div className="max-h-[140px] overflow-y-auto border border-gray-850 rounded-xl divide-y divide-gray-850 no-scrollbar">
                  {backendMetrics.lastErrors.map((err: any) => (
                    <div key={err.id} className="p-2 bg-slate-950/20 text-[10px] leading-relaxed flex flex-col gap-0.5">
                      <div className="flex justify-between font-bold text-gray-400">
                        <span className="text-red-400">ID: {err.clientGeneratedId}</span>
                        <span className="text-[9px] text-gray-500 font-mono">{new Date(err.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-gray-300 font-mono text-[9px] break-words">{err.errorMessage}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 italic text-[11px]">Cargando telemetría de producción desde el servidor...</p>
        )}
      </section>

      {/* CURRENT USER DETAILS */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-2.5">
        <h3 className="font-black text-[11px] text-purple-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800 pb-1.5">
          <Users className="w-4 h-4" /> USUARIO CONFIGURADO
        </h3>
        {currentUser ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px]">
            <div><span className="text-gray-500">Nombre:</span> <span className="font-bold text-gray-200">{currentUser.nombre}</span></div>
            <div><span className="text-gray-500">E-mail:</span> <span className="font-bold text-gray-200">{currentUser.email}</span></div>
            <div><span className="text-gray-500">ID Usuario:</span> <span className="font-bold text-gray-400 text-[10px]">{currentUser.id}</span></div>
            <div><span className="text-gray-500">Versión Sesión:</span> <span className="font-bold text-gray-300">{currentUser.sessionVersion}</span></div>
            <div className="md:col-span-2 pt-1">
              <span className="text-gray-500">Permisos Activos:</span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {currentUser.permisos.map(p => (
                  <span key={p} className="bg-purple-950/40 text-purple-300 border border-purple-900/50 px-2 py-0.5 rounded text-[9px] font-bold">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 italic">No hay ninguna sesión de usuario cargada en memoria.</p>
        )}
      </section>

      {/* TELEMETRY AVERAGES AND RUNTIME FOOTPRINT */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-2.5">
        <h3 className="font-black text-[11px] text-blue-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800 pb-1.5">
          <Database className="w-4 h-4" /> TELEMETRÍA Y USO DE RECURSOS
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-[11px]">
          <div>
            <div className="text-gray-500 text-[10px] uppercase">JS Heap</div>
            <div className="text-sm font-bold text-gray-200 mt-0.5">{snap?.heapMb ? `${snap.heapMb} MB` : "n/d"}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Memoria Ratio</div>
            <div className="text-sm font-bold text-gray-200 mt-0.5">{memRatio != null ? `${(memRatio * 100).toFixed(0)}%` : "n/d"}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Reconexiones</div>
            <div className="text-sm font-bold text-gray-200 mt-0.5">{telemetryStats.reconnects}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Latencia Sync</div>
            <div className="text-sm font-bold text-blue-400 mt-0.5">{avgLatency}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Intentos Sync</div>
            <div className="text-sm font-bold text-gray-300 mt-0.5">{telemetryStats.attempts}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Fallos Sync</div>
            <div className="text-sm font-bold text-red-400 mt-0.5">{telemetryStats.failures}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Listeners Reg</div>
            <div className="text-sm font-bold text-gray-300 mt-0.5">{snap?.listeners ?? 0}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Timers Activos</div>
            <div className="text-sm font-bold text-gray-300 mt-0.5">{snap?.timers ?? 0}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Long Tasks (5m)</div>
            <div className="text-sm font-bold text-gray-300 mt-0.5">{counters.longTasks5m.count()}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Storms (5m)</div>
            <div className="text-sm font-bold text-gray-300 mt-0.5">{counters.renderStorms5m.count()}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Throughput Sync</div>
            <div className="text-sm font-bold text-blue-400 mt-0.5">
              {profiling?.syncThroughputPerMin ? `${profiling.syncThroughputPerMin.toFixed(1)}/m` : "0.0/m"}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Velo. Crecimiento</div>
            <div className="text-sm font-bold text-amber-400 mt-0.5">
              {profiling?.queueGrowthVelocity ? `${profiling.queueGrowthVelocity.toFixed(1)}/m` : "0.0/m"}
            </div>
          </div>
        </div>
      </section>

      {/* RUNTIME RESET TOOLING (ONLY DEV/STAGING) */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-3">
        <h3 className="font-black text-[11px] text-red-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800 pb-1.5">
          <Trash2 className="w-4 h-4" /> HERRAMIENTAS DE RESTABLECIMIENTO (RESET)
        </h3>
        
        {isProduction ? (
          <div className="bg-red-950/10 border border-red-900/30 p-2.5 rounded-lg text-red-400 font-bold text-[10px] uppercase text-center">
            ⚠️ Panel de restablecimiento bloqueado en entornos de producción.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            <button
              onClick={handleClearAuthSnapshot}
              className="py-2.5 px-3 bg-red-950/20 text-red-300 border border-red-900/50 hover:bg-red-900/30 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <Power className="w-3.5 h-3.5 text-red-400" />
              <span>Limpiar Auth Snapshot</span>
            </button>

            <button
              onClick={handleClearQueue}
              className="py-2.5 px-3 bg-red-950/20 text-red-300 border border-red-900/50 hover:bg-red-900/30 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Vaciar Cola Sync</span>
            </button>

            <button
              onClick={handleClearDLQ}
              className="py-2.5 px-3 bg-red-950/20 text-red-300 border border-red-900/50 hover:bg-red-900/30 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
              <span>Limpiar DLQ</span>
            </button>

            <button
              onClick={handleClearQuarantine}
              className="py-2.5 px-3 bg-red-950/20 text-red-300 border border-red-900/50 hover:bg-red-900/30 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>Limpiar Cuarentena</span>
            </button>

            <button
              onClick={handleResetCircuitBreaker}
              className="py-2.5 px-3 bg-indigo-950/20 text-indigo-300 border border-indigo-900/50 hover:bg-indigo-900/30 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reset Circuit Breaker</span>
            </button>

            <button
              onClick={handleResetTelemetry}
              className="py-2.5 px-3 bg-indigo-950/20 text-indigo-300 border border-indigo-900/50 hover:bg-indigo-900/30 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reset Telemetría</span>
            </button>

            <button
              onClick={handleClearIndexedDBParcial}
              className="py-2.5 px-3 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-750 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <Database className="w-3.5 h-3.5 text-gray-400" />
              <span>Limpiar Caché Parcial</span>
            </button>

            <button
              onClick={handleForzarRelogin}
              className="py-2.5 px-3 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-750 font-bold rounded-lg transition active:scale-95 text-left text-[10px] flex items-center gap-2"
            >
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span>Forzar Re-login</span>
            </button>
          </div>
        )}
      </section>

      {/* TESTING SCENARIO ENGINE (ONLY DEV/STAGING) */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-3">
        <h3 className="font-black text-[11px] text-amber-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800 pb-1.5">
          <Activity className="w-4 h-4" /> MOTOR DE ESCENARIOS DE PRUEBA (TEST SCENARIOS)
        </h3>

        {isProduction ? (
          <div className="bg-amber-950/10 border border-amber-900/30 p-2.5 rounded-lg text-amber-400 font-bold text-[10px] uppercase text-center">
            ⚠️ Simuladores de contingencia bloqueados en entornos de producción.
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Toggles grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              
              {/* Simulate Offline */}
              <button
                onClick={() => scenarioEngine.toggleOffline()}
                className={`py-2 px-3 border rounded-lg font-bold transition flex items-center justify-between text-[10px] ${
                  simState.backendOffline 
                    ? "bg-amber-500/20 text-amber-300 border-amber-500" 
                    : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-750"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {simState.backendOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                  Simular Offline
                </span>
                <span className="text-[9px] uppercase">{simState.backendOffline ? "ON" : "OFF"}</span>
              </button>

              {/* Simulate Timeout */}
              <button
                onClick={() => scenarioEngine.toggleTimeout()}
                className={`py-2 px-3 border rounded-lg font-bold transition flex items-center justify-between text-[10px] ${
                  simState.timeout 
                    ? "bg-amber-500/20 text-amber-300 border-amber-500" 
                    : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-750"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Simular Timeout
                </span>
                <span className="text-[9px] uppercase">{simState.timeout ? "ON" : "OFF"}</span>
              </button>

              {/* Simulate Slow Network */}
              <button
                onClick={() => scenarioEngine.toggleSlowNetwork()}
                className={`py-2 px-3 border rounded-lg font-bold transition flex items-center justify-between text-[10px] ${
                  simState.slowNetwork 
                    ? "bg-amber-500/20 text-amber-300 border-amber-500" 
                    : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-750"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Simular Red Lenta (3s)
                </span>
                <span className="text-[9px] uppercase">{simState.slowNetwork ? "ON" : "OFF"}</span>
              </button>

              {/* Simulate 401 Unauthorized */}
              <button
                onClick={() => scenarioEngine.toggle401()}
                className={`py-2 px-3 border rounded-lg font-bold transition flex items-center justify-between text-[10px] ${
                  simState.auth401 
                    ? "bg-amber-500/20 text-amber-300 border-amber-500" 
                    : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-750"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Simular Error 401
                </span>
                <span className="text-[9px] uppercase">{simState.auth401 ? "ON" : "OFF"}</span>
              </button>

              {/* Simulate Snapshot Mismatch */}
              <button
                onClick={() => scenarioEngine.toggleSnapshotMismatch()}
                className={`py-2 px-3 border rounded-lg font-bold transition flex items-center justify-between text-[10px] ${
                  simState.snapshotMismatch 
                    ? "bg-amber-500/20 text-amber-300 border-amber-500" 
                    : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-750"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Snapshot Mismatch
                </span>
                <span className="text-[9px] uppercase">{simState.snapshotMismatch ? "ON" : "OFF"}</span>
              </button>
            </div>

            {/* Instant Event Action buttons */}
            <div className="pt-2.5 border-t border-gray-850 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  scenarioEngine.simulateReconnectStorm();
                  alert("Reconnect Storm simulada. Revisa la consola.");
                }}
                className="py-1.5 px-3 bg-gray-800 hover:bg-gray-750 active:scale-95 text-gray-300 rounded-md font-bold text-[9px] uppercase border border-gray-700 transition"
              >
                Simular Reconnect Storm
              </button>

              <button
                onClick={async () => {
                  await scenarioEngine.simulateQueueCorruption();
                  await queueService.refreshQueueCounts();
                  void refresh();
                  alert("Cola corrompida. Haz clic en 'Escanear integridad' para enviar a cuarentena.");
                }}
                className="py-1.5 px-3 bg-gray-800 hover:bg-gray-750 active:scale-95 text-gray-300 rounded-md font-bold text-[9px] uppercase border border-gray-700 transition"
              >
                Simular Corrupción en Cola
              </button>

              <button
                onClick={async () => {
                  await scenarioEngine.simulateDuplicateReplay();
                  await queueService.refreshQueueCounts();
                  void refresh();
                  alert("Movimientos duplicados inyectados en IndexedDB. Al sincronizar se gatillará el conflicto de colisión 409.");
                }}
                className="py-1.5 px-3 bg-gray-800 hover:bg-gray-750 active:scale-95 text-gray-300 rounded-md font-bold text-[9px] uppercase border border-gray-700 transition"
              >
                Simular Duplicate Replay
              </button>
            </div>
          </div>
        )}
      </section>

      {/* BULLETPROOF INTEGRITY MANUAL INITIATOR */}
      <button
        type="button"
        onClick={async () => {
          const count = await import("../../offline/queue.integrity").then(m => m.detectAndQuarantineCorruption());
          await queueService.refreshQueueCounts();
          void refresh();
          if (count > 0) {
            alert(`🚨 Escaneo completado. Se detectaron y cuarentenaron ${count} movimientos corruptos.`);
          } else {
            alert("✅ Escaneo completado. No se detectaron anomalías en la cola de IndexedDB.");
          }
        }}
        className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-wide flex items-center justify-center gap-2 shadow-md hover:shadow-indigo-900/10 active:scale-[0.98] transition-all"
      >
        <Shield className="w-4 h-4 shrink-0" />
        <span>ESCANEAR INTEGRIDAD DE COLA</span>
      </button>

    </div>
  );
};

export default DiagnosticsPanel;
