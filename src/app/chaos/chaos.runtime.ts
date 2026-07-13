import { metricsService } from "../services/metrics.service";
import { useRuntimeStore } from "../runtime/runtime.store";
import { isChaosEnabled, setChaosEnabled } from "./chaos.flags";

export const CHAOS_CAPS = {
  actionsPerHour: 12,
  flappingMaxCycles: 10,
  sync401Probability: 0.3,
  refreshFailBurst: 3,
  visibilityStormEvents: 20,
  criticalHealthStreakDisable: 3,
} as const;

type ScenarioId = "C01" | "C02" | "C03" | "C07" | "C08";

type SessionState = {
  disabled: boolean;
  disabledReason: string | null;
  actionTimestamps: number[];
  flappingCycles: number;
  refreshFailRemaining: number;
  sync401Enabled: boolean;
  criticalStreak: number;
  flappingTimer: ReturnType<typeof setInterval> | null;
  visibilityTimer: ReturnType<typeof setTimeout> | null;
  lastScenarioAt: Partial<Record<ScenarioId, number>>;
};

const COOLDOWN_MS: Record<ScenarioId, number> = {
  C01: 60_000,
  C02: 90_000,
  C03: 120_000,
  C07: 120_000,
  C08: 60_000,
};

const state: SessionState = {
  disabled: false,
  disabledReason: null,
  actionTimestamps: [],
  flappingCycles: 0,
  refreshFailRemaining: 0,
  sync401Enabled: false,
  criticalStreak: 0,
  flappingTimer: null,
  visibilityTimer: null,
  lastScenarioAt: {},
};

let healthUnsub: (() => void) | null = null;
let active = false;

export function isChaosActive(): boolean {
  return isChaosEnabled() && !state.disabled && active;
}

export function getChaosSessionState(): Readonly<SessionState> {
  return state;
}

function pruneActionHour(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  state.actionTimestamps = state.actionTimestamps.filter((t) => t > cutoff);
}

function recordAction(id: ScenarioId): boolean {
  if (!isChaosActive()) return false;
  pruneActionHour();
  const now = Date.now();
  const last = state.lastScenarioAt[id] ?? 0;
  if (now - last < COOLDOWN_MS[id]) return false;
  if (state.actionTimestamps.length >= CHAOS_CAPS.actionsPerHour) return false;

  state.lastScenarioAt[id] = now;
  state.actionTimestamps.push(now);
  void metricsService.trackMetric("chaos_action", 1, { scenario: id });
  return true;
}

export function disableChaos(reason: string): void {
  state.disabled = true;
  state.disabledReason = reason;
  stopAllChaosTimers();
  void metricsService.trackMetric("chaos_auto_disabled", 1, { reason });
}

export function enableChaosRuntime(): void {
  if (!isChaosEnabled()) {
    if (import.meta.env.DEV) {
      console.log("[CHAOS] skipped");
    }
    return;
  }
  if (active) {
    if (import.meta.env.DEV) {
      console.log("[CHAOS] already installed");
    }
    return;
  }

  const start = performance.now();
  state.disabled = false;
  state.disabledReason = null;

  if (!healthUnsub) {
    healthUnsub = useRuntimeStore.subscribe(
      (s) => s.healthLevel,
      (level) => {
        if (!isChaosEnabled()) return;
        if (level === "CRITICAL") {
          state.criticalStreak += 1;
          if (state.criticalStreak >= CHAOS_CAPS.criticalHealthStreakDisable) {
            disableChaos("health_critical_persistent");
          }
        } else {
          state.criticalStreak = 0;
        }
      }
    );
  }

  active = true;

  if (import.meta.env.DEV) {
    console.log("[CHAOS] installed");
    console.log(`[CHAOS] install duration: ${(performance.now() - start).toFixed(2)}ms`);
  }
}

export function shutdownChaosRuntime(): void {
  if (!active) {
    return;
  }

  const start = performance.now();
  healthUnsub?.();
  healthUnsub = null;
  stopAllChaosTimers();
  active = false;

  if (import.meta.env.DEV) {
    console.log("[CHAOS] destroyed");
    console.log(`[CHAOS] teardown duration: ${(performance.now() - start).toFixed(2)}ms`);
  }
}

export function stopAllChaosTimers(): void {
  if (state.flappingTimer) {
    clearInterval(state.flappingTimer);
    state.flappingTimer = null;
  }
  if (state.visibilityTimer) {
    clearTimeout(state.visibilityTimer);
    state.visibilityTimer = null;
  }
  state.flappingCycles = 0;
}

export function chaosShouldInjectSync401(url: string): boolean {
  if (!isChaosActive() || !state.sync401Enabled) return false;
  if (!url.includes("/api/sync/movimientos")) return false;
  return Math.random() < CHAOS_CAPS.sync401Probability;
}

export function chaosShouldFailRefresh(): boolean {
  if (!isChaosActive() || state.refreshFailRemaining <= 0) return false;
  state.refreshFailRemaining -= 1;
  void metricsService.trackMetric("chaos_refresh_fail", 1, {
    remaining: state.refreshFailRemaining,
  });
  return true;
}

export function armScenario(id: ScenarioId): { ok: boolean; message: string } {
  if (!isChaosEnabled()) {
    return { ok: false, message: "Chaos desactivado (flag off)" };
  }
  if (state.disabled) {
    return { ok: false, message: `Chaos auto-off: ${state.disabledReason}` };
  }
  if (!recordAction(id)) {
    return { ok: false, message: "Cooldown o límite horario alcanzado" };
  }
  return { ok: true, message: "armed" };
}

export function activateC01(): { ok: boolean; message: string } {
  const r = armScenario("C01");
  if (!r.ok) return r;
  state.sync401Enabled = true;
  return { ok: true, message: "C01: 401 aleatorio en POST sync (~30%)" };
}

export function deactivateC01(): void {
  state.sync401Enabled = false;
}

export function activateC02(): { ok: boolean; message: string } {
  const r = armScenario("C02");
  if (!r.ok) return r;
  state.refreshFailRemaining = CHAOS_CAPS.refreshFailBurst;
  return {
    ok: true,
    message: `C02: próximos ${CHAOS_CAPS.refreshFailBurst} refresh fallan`,
  };
}

export function activateC03(
  onToggle: (online: boolean) => void
): { ok: boolean; message: string } {
  const r = armScenario("C03");
  if (!r.ok) return r;
  if (state.flappingTimer) {
    return { ok: false, message: "Flapping ya activo" };
  }

  state.flappingCycles = 0;
  let online = navigator.onLine;

  state.flappingTimer = setInterval(() => {
    if (state.flappingCycles >= CHAOS_CAPS.flappingMaxCycles) {
      stopAllChaosTimers();
      void metricsService.trackMetric("chaos_flapping_done", 1);
      return;
    }
    online = !online;
    state.flappingCycles += 1;
    onToggle(online);
    void metricsService.trackMetric("chaos_network_flap", 1, {
      cycle: state.flappingCycles,
      online,
    });
  }, 2500);

  return {
    ok: true,
    message: `C03: flapping max ${CHAOS_CAPS.flappingMaxCycles} ciclos`,
  };
}

export function activateC07(): { ok: boolean; message: string } {
  const r = armScenario("C07");
  if (!r.ok) return r;
  if (state.visibilityTimer) {
    return { ok: false, message: "Visibility storm en curso" };
  }

  let count = 0;
  const fire = () => {
    if (count >= CHAOS_CAPS.visibilityStormEvents) {
      state.visibilityTimer = null;
      void metricsService.trackMetric("chaos_visibility_storm_done", 1);
      return;
    }
    count += 1;
    document.dispatchEvent(new Event("visibilitychange"));
    void metricsService.trackMetric("chaos_visibility_pulse", 1, { count });
    state.visibilityTimer = setTimeout(fire, 500);
  };

  fire();
  return {
    ok: true,
    message: `C07: ${CHAOS_CAPS.visibilityStormEvents} visibilitychange (500ms)`,
  };
}

export function activateC08(
  lockFn: (reason: string) => void
): { ok: boolean; message: string } {
  const r = armScenario("C08");
  if (!r.ok) return r;
  lockFn("SESSION_REVOKED");
  void metricsService.trackMetric("chaos_runtime_lock", 1);
  return { ok: true, message: "C08: RUNTIME_LOCKED (multi-tab BC)" };
}

export function resetChaosSession(): void {
  stopAllChaosTimers();
  state.disabled = false;
  state.disabledReason = null;
  state.actionTimestamps = [];
  state.refreshFailRemaining = 0;
  state.sync401Enabled = false;
  state.criticalStreak = 0;
  state.lastScenarioAt = {};
}

export function turnOffChaosCompletely(): void {
  resetChaosSession();
  setChaosEnabled(false);
  shutdownChaosRuntime();
  void import("./chaos.fetch").then((m) => m.uninstallChaosFetch());
}
