import { metricsService } from "../services/metrics.service";
import { disposeAllRuntimeCleanups } from "../runtime/runtime.cleanup-registry";
import { runtimeAdaptive } from "../runtime/runtime.adaptive";
import { useRuntimeStore } from "../runtime/runtime.store";
import { AUTO_RECOVERY } from "./telemetry.policy";
import type { TelemetryCounters } from "./runtime.telemetry";
import type { RuntimeHealthLevel } from "./runtime.health";

let lastAutoRecoveryAt = 0;
const COOLDOWN_MS = 3 * 60 * 1000;

/**
 * Recovery automático sin reinstalar PWA — fuerza degradación y limpia observers.
 */
export async function evaluateAutoRecovery(
  counters: TelemetryCounters,
  healthLevel: RuntimeHealthLevel
): Promise<void> {
  const now = Date.now();
  if (now - lastAutoRecoveryAt < COOLDOWN_MS) return;

  const longTasks = counters.longTasks5m.count();
  const renderStorms = counters.renderStorms5m.count();
  const memoryEvents = counters.memoryPressure10m.count();
  const fpsDrops = counters.fpsDrops5m.count();
  const syncTriggers = counters.syncTriggers1m.count();

  const shouldRecover =
    healthLevel === "CRITICAL" ||
    longTasks >= AUTO_RECOVERY.longTasksIn5m ||
    renderStorms >= AUTO_RECOVERY.renderStormsIn5m ||
    memoryEvents >= AUTO_RECOVERY.memoryPressureIn10m ||
    fpsDrops >= AUTO_RECOVERY.fpsDropsIn5m ||
    syncTriggers >= AUTO_RECOVERY.syncTriggersIn1m;

  if (!shouldRecover) return;

  lastAutoRecoveryAt = now;
  const store = useRuntimeStore.getState();

  /** Solo observers/timeline efímeros — NO subsistemas (network, auth, telemetry). */
  const disposed = disposeAllRuntimeCleanups();

  if (!store.batterySaver) {
    store.setBatterySaver(true);
  }
  store.setMemoryPressureHigh(true);
  store.setRecoveryDismissed(false);

  runtimeAdaptive.recompute("auto_runtime_recovery");
  runtimeAdaptive.trimTimelinePressure();

  await metricsService.trackMetric("auto_runtime_recovery", 1, {
    longTasks,
    renderStorms,
    memoryEvents,
    fpsDrops,
    syncTriggers,
    disposed,
    healthLevel,
  });
}
