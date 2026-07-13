import { authLifecycle } from "../auth/auth.lifecycle";
import { useRuntimeStore } from "../runtime/runtime.store";
import {
  activateC01,
  activateC02,
  activateC03,
  activateC07,
  activateC08,
  deactivateC01,
  resetChaosSession,
  stopAllChaosTimers,
} from "./chaos.runtime";

export type ChaosScenarioId = "C01" | "C02" | "C03" | "C07" | "C08";

export const CHAOS_SCENARIO_LABELS: Record<ChaosScenarioId, string> = {
  C01: "401 aleatorio en sync",
  C02: "Refresh failure burst",
  C03: "Network flapping",
  C07: "Visibility storm",
  C08: "Multi-tab runtime lock",
};

function applySyntheticOnline(online: boolean): void {
  const store = useRuntimeStore.getState();
  store.setOnline(online);
  if (online) {
    window.dispatchEvent(new Event("online"));
  } else {
    window.dispatchEvent(new Event("offline"));
  }
}

export function runChaosScenario(id: ChaosScenarioId): { ok: boolean; message: string } {
  switch (id) {
    case "C01":
      return activateC01();
    case "C02":
      return activateC02();
    case "C03":
      return activateC03(applySyntheticOnline);
    case "C07":
      return activateC07();
    case "C08":
      return activateC08((reason) => authLifecycle.lockRuntime(reason));
    default:
      return { ok: false, message: "Escenario desconocido" };
  }
}

export function stopChaosScenarios(): void {
  deactivateC01();
  stopAllChaosTimers();
}

export function resetChaosScenarios(): void {
  stopChaosScenarios();
  resetChaosSession();
}
