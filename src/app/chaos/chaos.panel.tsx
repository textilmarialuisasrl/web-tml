import React, { useState } from "react";
import { isChaosEnabled, setChaosEnabled } from "./chaos.flags";
import {
  disableChaos,
  enableChaosRuntime,
  getChaosSessionState,
  turnOffChaosCompletely,
} from "./chaos.runtime";
import {
  CHAOS_SCENARIO_LABELS,
  resetChaosScenarios,
  runChaosScenario,
  stopChaosScenarios,
  type ChaosScenarioId,
} from "./chaos.scenarios";

const SCENARIOS: ChaosScenarioId[] = ["C01", "C02", "C03", "C07", "C08"];

export const ChaosPanel: React.FC = () => {
  const [enabled, setEnabled] = useState(isChaosEnabled());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!enabled && !isChaosEnabled()) {
    return (
      <section className="bg-gray-900/50 border border-dashed border-gray-700 rounded-xl p-3 space-y-2">
        <div className="text-gray-500 text-[10px] uppercase font-bold">Chaos (off)</div>
        <p className="text-[10px] text-gray-600">
          Activar con ?chaos=1 o localStorage.tml_chaos=1
        </p>
        <button
          type="button"
          onClick={() => {
            setChaosEnabled(true);
            enableChaosRuntime();
            setEnabled(true);
            setStatus("Chaos habilitado");
          }}
          className="w-full py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs font-bold"
        >
          Habilitar chaos (QA)
        </button>
      </section>
    );
  }

  const session = getChaosSessionState();

  const run = (id: ChaosScenarioId) => {
    setBusy(id);
    setStatus(null);
    const result = runChaosScenario(id);
    setStatus(result.message);
    setBusy(null);
  };

  return (
    <section className="bg-red-950/20 border border-red-900/50 rounded-xl p-3 space-y-2">
      <div className="flex justify-between items-center">
        <div className="text-red-300 text-[10px] uppercase font-bold">Chaos runtime</div>
        <span className="text-[10px] text-red-400/80">
          {session.disabled ? "AUTO-OFF" : "ARMED"}
        </span>
      </div>

      {session.disabled && (
        <p className="text-[10px] text-red-200">{session.disabledReason}</p>
      )}

      <div className="text-[10px] text-gray-500 space-y-0.5">
        <div>Acciones/h: {session.actionTimestamps.length}</div>
        <div>Flaps: {session.flappingCycles}</div>
        <div>C01 sync401: {session.sync401Enabled ? "on" : "off"}</div>
        <div>C02 refresh fails left: {session.refreshFailRemaining}</div>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {SCENARIOS.map((id) => (
          <button
            key={id}
            type="button"
            disabled={busy != null || session.disabled}
            onClick={() => run(id)}
            className="py-2 px-2 rounded-lg bg-gray-900 border border-gray-700 text-left text-[11px] text-gray-200 disabled:opacity-40"
          >
            <span className="font-bold text-red-300">{id}</span>{" "}
            {CHAOS_SCENARIO_LABELS[id]}
          </button>
        ))}
      </div>

      {status && (
        <p className="text-[10px] text-amber-200/90 break-words">{status}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            stopChaosScenarios();
            enableChaosRuntime();
            setStatus("Timers detenidos");
          }}
          className="flex-1 py-2 rounded-lg bg-gray-800 border border-gray-700 text-[10px] font-bold text-gray-300"
        >
          STOP
        </button>
        <button
          type="button"
          onClick={() => {
            resetChaosScenarios();
            enableChaosRuntime();
            setStatus("Sesión reset");
          }}
          className="flex-1 py-2 rounded-lg bg-gray-800 border border-gray-700 text-[10px] font-bold text-gray-300"
        >
          RESET
        </button>
        <button
          type="button"
          onClick={() => {
            turnOffChaosCompletely();
            setEnabled(false);
            setStatus("Chaos off");
          }}
          className="flex-1 py-2 rounded-lg bg-gray-800 border border-gray-700 text-[10px] font-bold text-gray-400"
        >
          OFF
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          disableChaos("manual_pause");
          setStatus("Pausado (health/manual)");
        }}
        className="w-full py-2 rounded-lg border border-red-900/60 text-[10px] text-red-300/80"
      >
        Pausar chaos (sin desactivar flag)
      </button>
    </section>
  );
};

export default ChaosPanel;
