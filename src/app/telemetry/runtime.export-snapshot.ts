import { db } from "../storage/db";
import { getChaosSessionState, isChaosActive } from "../chaos/chaos.runtime";
import { isChaosEnabled } from "../chaos/chaos.flags";
import { isChaosFetchInstalled } from "../chaos/chaos.fetch";
import { useRuntimeStore } from "../runtime/runtime.store";
import { getRuntimeCleanupStats } from "../runtime/runtime.cleanup-registry";
import { runtimeLifecycle } from "../runtime/runtime.lifecycle";
import { runtimeProfiling } from "./runtime.profiling";
import { runtimeTelemetry } from "./runtime.telemetry";
import { swClientService } from "../services/sw-client.service";
import { readMemoryPressureRatio } from "../render/render.policy";
import { CRITICAL_METRICS } from "./telemetry.policy";
import { readOfflineSnapshot } from "../auth/auth.snapshot";

export interface RuntimeExportSnapshot {
  exportedAt: string;
  build: { mode: string; uptimeMs: number };
  runtime: {
    phase: string;
    tier: string;
    healthLevel: string;
    healthScore: number;
    healthReasons: string[];
    safeMode: boolean;
    batterySaver: boolean;
    tabHidden: boolean;
  };
  auth: {
    phase: string;
    lockedReason: string | null;
    reconnectRequired: boolean;
    isRefreshing: boolean;
    lastRefreshAt: string | null;
    snapshotLastValidated: string | null;
  };
  queue: {
    syncPending: number;
    conflicts: number;
    failed: number;
    syncing: boolean;
    lastSyncAt: string | null;
  };
  network: {
    online: boolean;
    networkQuality: string;
    sessionMode: string;
  };
  sw: {
    controlled: boolean;
    updatePending: boolean;
  };
  memory: {
    pressureRatio: number | null;
    heapUsedMb: number | null;
  };
  profiling: ReturnType<typeof runtimeProfiling.getLastSample>;
  observers: ReturnType<typeof getRuntimeCleanupStats>;
  chaos: {
    enabled: boolean;
    active: boolean;
    fetchPatched: boolean;
    session: ReturnType<typeof getChaosSessionState>;
  };
  telemetryCounters: {
    longTasks5m: number;
    syncTriggers1m: number;
    renderStorms5m: number;
  };
  criticalEvents: {
    timestamp: string;
    metricName: string;
    value: number;
    metadata: unknown;
  }[];
}

function readBuildMode(): string {
  try {
    return import.meta.env?.MODE ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function buildRuntimeExportSnapshot(): Promise<RuntimeExportSnapshot> {
  const store = useRuntimeStore.getState();
  const counters = runtimeTelemetry.getCounters();
  const snapshot = await readOfflineSnapshot();

  const logs = await db.metricsLog.orderBy("timestamp").reverse().limit(80).toArray();
  const criticalEvents = logs
    .filter(
      (l) =>
        CRITICAL_METRICS.has(l.metricName) ||
        l.metricName.startsWith("chaos_") ||
        l.metricName.startsWith("auth_") ||
        l.metricName.startsWith("sync_")
    )
    .slice(0, 25)
    .map((l) => ({
      timestamp: l.timestamp,
      metricName: l.metricName,
      value: l.value,
      metadata: l.metadata,
    }));

  const mem = (performance as Performance & {
    memory?: { usedJSHeapSize: number };
  }).memory;

  let profiling = runtimeProfiling.getLastSample();
  if (!profiling) {
    profiling = await runtimeProfiling.sample();
  }

  return {
    exportedAt: new Date().toISOString(),
    build: {
      mode: readBuildMode(),
      uptimeMs: Math.round(performance.now()),
    },
    runtime: {
      phase: runtimeLifecycle.getPhase(),
      tier: store.runtimeTier,
      healthLevel: store.healthLevel,
      healthScore: store.healthScore,
      healthReasons: store.healthReasons,
      safeMode: store.safeMode,
      batterySaver: store.batterySaver,
      tabHidden: store.tabHidden,
    },
    auth: {
      phase: store.authPhase,
      lockedReason: store.lockedReason,
      reconnectRequired: store.reconnectRequired,
      isRefreshing: store.isRefreshing,
      lastRefreshAt: store.lastRefreshAt,
      snapshotLastValidated: snapshot?.lastValidatedAt ?? null,
    },
    queue: {
      syncPending: store.syncPending,
      conflicts: store.conflicts,
      failed: store.failed,
      syncing: store.syncing,
      lastSyncAt: store.lastSyncAt ?? null,
    },
    network: {
      online: store.online,
      networkQuality: store.networkQuality,
      sessionMode: store.sessionMode,
    },
    sw: {
      controlled: !!navigator.serviceWorker?.controller,
      updatePending: swClientService.hasPendingRefresh(),
    },
    memory: {
      pressureRatio: readMemoryPressureRatio(),
      heapUsedMb: mem?.usedJSHeapSize
        ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10
        : null,
    },
    profiling,
    observers: getRuntimeCleanupStats(),
    chaos: {
      enabled: isChaosEnabled(),
      active: isChaosActive(),
      fetchPatched: isChaosFetchInstalled(),
      session: getChaosSessionState(),
    },
    telemetryCounters: {
      longTasks5m: counters.longTasks5m.count(),
      syncTriggers1m: counters.syncTriggers1m.count(),
      renderStorms5m: counters.renderStorms5m.count(),
    },
    criticalEvents,
  };
}

export async function exportRuntimeSnapshotToClipboard(): Promise<boolean> {
  const data = await buildRuntimeExportSnapshot();
  const text = JSON.stringify(data, null, 2);

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tml-runtime-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return false;
}

export function formatRuntimeSnapshotTxt(snapshot: RuntimeExportSnapshot): string {
  const lines = [
    `TML Runtime Snapshot ${snapshot.exportedAt}`,
    `build=${snapshot.build.mode} uptime=${snapshot.build.uptimeMs}ms`,
    `phase=${snapshot.runtime.phase} tier=${snapshot.runtime.tier} health=${snapshot.runtime.healthLevel}(${snapshot.runtime.healthScore})`,
    `auth=${snapshot.auth.phase} lock=${snapshot.auth.lockedReason ?? "-"}`,
    `queue pending=${snapshot.queue.syncPending} conflict=${snapshot.queue.conflicts} failed=${snapshot.queue.failed}`,
    `net online=${snapshot.network.online} quality=${snapshot.network.networkQuality}`,
    `heap=${snapshot.memory.heapUsedMb ?? "n/d"}MB observers=${snapshot.observers.observersActiveCount}`,
    `chaos=${snapshot.chaos.active ? "ON" : "off"}`,
    "--- critical ---",
    ...snapshot.criticalEvents.map(
      (e) => `${e.timestamp} ${e.metricName}=${e.value}`
    ),
  ];
  return lines.join("\n");
}
