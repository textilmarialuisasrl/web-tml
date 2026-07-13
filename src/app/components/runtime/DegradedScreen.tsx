import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRuntimeStore } from "../../runtime/runtime.store";
import { selectHeaderStatus } from "../../runtime/selectors";
import type { RuntimeTier } from "../../runtime/runtime.tiers";
import {
  reconnect,
  retryFailedSync,
  resetRuntimePartial,
  clearHttpCacheSafe,
  controlledSwReload,
  exitSafeMode,
  continueInDegradedMode,
} from "../../services/recovery.service";

type DegradedScreenMode = "fullscreen" | "panel" | "route";

interface DegradedScreenProps {
  mode: DegradedScreenMode;
  tier?: RuntimeTier;
  errorMessage?: string;
  onRetryRoute?: () => void;
}

const REASON_LABELS: Record<string, string> = {
  safe_mode: "Modo seguro activo",
  crash_threshold: "Reinicios fallidos repetidos",
  battery_saver: "Ahorro de batería",
  offline: "Sin conexión",
  network_2g: "Red muy lenta (2G)",
  network_slow_2g: "Red muy lenta",
  network_3g: "Red limitada (3G)",
  tab_hidden: "Pestaña en segundo plano",
  memory_pressure_high: "Memoria JS crítica",
  memory_pressure_med: "Memoria JS elevada",
  low_device_memory: "Dispositivo con poca RAM",
  timeline_visible_high: "Historial muy cargado",
  render_storm: "Demasiados renders seguidos",
};

export const DegradedScreen: React.FC<DegradedScreenProps> = ({
  mode,
  tier: tierProp,
  errorMessage,
  onRetryRoute,
}) => {
  const { online, pending, safeMode } = useRuntimeStore(useShallow(selectHeaderStatus));
  const runtimeTier = useRuntimeStore((s) => s.runtimeTier);
  const reasons = useRuntimeStore((s) => s.degradedReasons);
  const conflicts = useRuntimeStore((s) => s.conflicts);
  const failed = useRuntimeStore((s) => s.failed);
  const lastSyncAt = useRuntimeStore((s) => s.lastSyncAt);

  const tier = tierProp ?? runtimeTier;
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void> | void) => {
    setBusy(key);
    setStatus(null);
    try {
      await fn();
      setStatus("Listo.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const shellClass =
    mode === "fullscreen"
      ? "fixed inset-0 z-50 bg-gray-950 text-gray-100 flex flex-col p-4 overflow-y-auto"
      : mode === "route"
        ? "flex-1 flex flex-col p-4 bg-gray-950 text-gray-100 rounded-xl border border-gray-800"
        : "bg-gray-900 border border-amber-900/50 rounded-xl p-4 text-gray-100 space-y-3";

  return (
    <div className={shellClass} role="alert">
      <div className="space-y-1">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-300">
          {tier === "SAFE_MODE" ? "Modo seguro — runtime mínimo" : "Runtime reducido"}
        </h2>
        <p className="text-xs text-gray-400 leading-relaxed">
          La terminal sigue operativa. Los movimientos offline permanecen en IndexedDB (Dexie).
          {errorMessage ? ` Error: ${errorMessage}` : null}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-black/30 p-3 rounded-lg border border-gray-800">
        <span>Red: {online ? "ONLINE" : "OFFLINE"}</span>
        <span>Cola: {pending}</span>
        <span>Conflictos: {conflicts}</span>
        <span>Fallidos: {failed}</span>
        <span className="col-span-2">
          Última sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "—"}
        </span>
      </div>

      {reasons.length > 0 && (
        <ul className="text-[10px] text-gray-500 space-y-0.5 list-disc pl-4">
          {reasons.map((r) => (
            <li key={r}>{REASON_LABELS[r] ?? r}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("sync", retryFailedSync)}
          className="w-full py-3 rounded-lg bg-blue-700 text-white text-xs font-bold uppercase"
        >
          {busy === "sync" ? "…" : "Reintentar sincronización"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("net", async () => {
            const ok = await reconnect();
            if (!ok) throw new Error("Sin conexión al servidor");
          })}
          className="w-full py-3 rounded-lg bg-gray-800 border border-gray-700 text-xs font-bold uppercase"
        >
          {busy === "net" ? "…" : "Reconectar"}
        </button>

        {onRetryRoute && (
          <button
            type="button"
            onClick={onRetryRoute}
            className="w-full py-3 rounded-lg bg-gray-800 border border-gray-700 text-xs font-bold uppercase"
          >
            Reintentar pantalla
          </button>
        )}

        {tier === "SAFE_MODE" && safeMode && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("safe", exitSafeMode)}
            className="w-full py-2.5 rounded-lg border border-green-800 text-green-300 text-xs font-bold"
          >
            Salir de modo seguro
          </button>
        )}

        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("partial", resetRuntimePartial)}
          className="w-full py-2.5 rounded-lg border border-gray-700 text-gray-300 text-xs"
        >
          Reset runtime parcial
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("cache", async () => {
            const n = await clearHttpCacheSafe();
            setStatus(`Cache HTTP: ${n} bucket(s) limpiados.`);
          })}
          className="w-full py-2.5 rounded-lg border border-gray-700 text-gray-300 text-xs"
        >
          Limpiar cache HTTP (seguro)
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("sw", controlledSwReload)}
          className="w-full py-2.5 rounded-lg border border-gray-700 text-gray-300 text-xs"
        >
          Reiniciar SW / recargar
        </button>

        {(mode === "fullscreen" || mode === "panel") && (
          <button
            type="button"
            onClick={() => continueInDegradedMode()}
            className="w-full py-3 mt-2 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-200 text-xs font-bold uppercase"
          >
            {mode === "fullscreen" ? "Continuar en modo reducido" : "Ocultar aviso"}
          </button>
        )}
      </div>

      {status && <p className="text-[10px] text-gray-500 font-mono">{status}</p>}
    </div>
  );
};

export default DegradedScreen;
