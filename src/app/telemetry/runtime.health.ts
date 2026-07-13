import { readMemoryPressureRatio } from "../render/render.policy";
import type { RuntimeState } from "../runtime/runtime.store";
import { HEALTH_THRESHOLDS } from "./telemetry.policy";
export interface TelemetryCountersSnapshot {
  longTasks5m: number;
  renderStorms5m: number;
}

export type RuntimeHealthLevel = "NORMAL" | "WARNING" | "CRITICAL";

export interface RuntimeHealthSnapshot {
  level: RuntimeHealthLevel;
  reasons: string[];
  score: number;
}

export function computeRuntimeHealth(
  store: Pick<
    RuntimeState,
    | "safeMode"
    | "runtimeTier"
    | "syncPending"
    | "conflicts"
    | "failed"
    | "memoryPressureHigh"
    | "online"
  >,
  counters: TelemetryCountersSnapshot
): RuntimeHealthSnapshot {
  const reasons: string[] = [];
  let score = 100;

  const mem = readMemoryPressureRatio();

  if (store.safeMode || store.runtimeTier === "SAFE_MODE") {
    reasons.push("safe_mode");
    score -= 50;
  } else if (store.runtimeTier === "DEGRADED") {
    reasons.push("runtime_degraded");
    score -= 25;
  }

  if (mem != null) {
    if (mem >= HEALTH_THRESHOLDS.memoryCritical) {
      reasons.push("memory_critical");
      score -= 40;
    } else if (mem >= HEALTH_THRESHOLDS.memoryWarning) {
      reasons.push("memory_warning");
      score -= 20;
    }
  }

  if (store.syncPending >= HEALTH_THRESHOLDS.queueCritical) {
    reasons.push("queue_critical");
    score -= 35;
  } else if (store.syncPending >= HEALTH_THRESHOLDS.queueWarning) {
    reasons.push("queue_warning");
    score -= 15;
  }

  if (store.failed >= HEALTH_THRESHOLDS.failedCritical) {
    reasons.push("failed_critical");
    score -= 30;
  } else if (store.failed >= HEALTH_THRESHOLDS.failedWarning) {
    reasons.push("failed_warning");
    score -= 12;
  }

  const longTasks = counters.longTasks5m;
  if (longTasks >= HEALTH_THRESHOLDS.longTasksCritical) {
    reasons.push("freezes_critical");
    score -= 35;
  } else if (longTasks >= HEALTH_THRESHOLDS.longTasksWarning) {
    reasons.push("freezes_warning");
    score -= 18;
  }

  if (counters.renderStorms5m >= 2) {
    reasons.push("render_storm");
    score -= 15;
  }

  if (!store.online) {
    reasons.push("offline");
    score -= 10;
  }

  let level: RuntimeHealthLevel = "NORMAL";
  if (score <= 45 || reasons.some((r) => r.includes("critical") || r === "safe_mode")) {
    level = "CRITICAL";
  } else if (score <= 72 || reasons.length > 0) {
    level = "WARNING";
  }

  return { level, reasons, score: Math.max(0, score) };
}
