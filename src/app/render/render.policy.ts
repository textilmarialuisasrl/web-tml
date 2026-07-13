import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { RuntimeTier } from "../runtime/runtime.tiers";
import type { NetworkQuality, RuntimeState } from "../runtime/runtime.store";
import { useRuntimeStore } from "../runtime/runtime.store";

export type { RuntimeTier };

export interface PolicySignals {
  safeMode: boolean;
  batterySaver: boolean;
  online: boolean;
  networkQuality: NetworkQuality;
  tabHidden: boolean;
  memoryPressureRatio: number | null;
  deviceMemoryGb: number | null;
  crashesCount: number;
  visibleTimelineItems: number;
  renderStormCount: number;
}

export interface RenderPolicySnapshot {
  tier: RuntimeTier;
  reasons: string[];
  timeline: {
    pageSize: number;
    memoryCeiling: number;
    searchAllowed: boolean;
    scanCap: number;
    prefetchSize: number;
  };
  sync: {
    batchSize: number;
    minIntervalMs: number;
    retryDelayMultiplier: number;
  };
  network: {
    pingIntervalMs: number;
    healthTimeoutMs: number;
  };
  metrics: {
    enabled: boolean;
    sampleRate: number;
  };
  ui: {
    animations: boolean;
    images: boolean;
    lazyRoutes: boolean;
  };
}

const MEMORY_PRESSURE_HIGH = 0.85;
const MEMORY_PRESSURE_MED = 0.72;
const LOW_DEVICE_MEMORY_GB = 4;

export function readMemoryPressureRatio(): number | null {
  const mem = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  if (!mem?.jsHeapSizeLimit) return null;
  return mem.usedJSHeapSize / mem.jsHeapSizeLimit;
}

export function readDeviceMemoryGb(): number | null {
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof dm === "number" ? dm : null;
}

export function collectPolicySignals(
  store: Pick<
    RuntimeState,
    | "safeMode"
    | "batterySaver"
    | "online"
    | "networkQuality"
    | "crashesCount"
    | "tabHidden"
    | "memoryPressureHigh"
  >,
  extras?: Partial<Pick<PolicySignals, "visibleTimelineItems" | "renderStormCount">>
): PolicySignals {
  const ratio = readMemoryPressureRatio();
  return {
    safeMode: store.safeMode,
    batterySaver: store.batterySaver,
    online: store.online,
    networkQuality: store.networkQuality,
    tabHidden: store.tabHidden,
    memoryPressureRatio: ratio,
    deviceMemoryGb: readDeviceMemoryGb(),
    crashesCount: store.crashesCount,
    visibleTimelineItems: extras?.visibleTimelineItems ?? 0,
    renderStormCount: extras?.renderStormCount ?? 0,
    ...(store.memoryPressureHigh && ratio == null ? { memoryPressureRatio: 0.9 } : {}),
  };
}

export function resolveRuntimeTier(signals: PolicySignals): {
  tier: RuntimeTier;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (signals.safeMode || signals.crashesCount >= 3) {
    if (signals.safeMode) reasons.push("safe_mode");
    if (signals.crashesCount >= 3) reasons.push("crash_threshold");
    return { tier: "SAFE_MODE", reasons };
  }

  if (signals.batterySaver) reasons.push("battery_saver");
  if (!signals.online || signals.networkQuality === "offline") reasons.push("offline");
  if (["2g", "slow-2g", "3g"].includes(signals.networkQuality)) {
    reasons.push(`network_${signals.networkQuality}`);
  }
  if (signals.tabHidden) reasons.push("tab_hidden");
  if (
    signals.memoryPressureRatio != null &&
    signals.memoryPressureRatio >= MEMORY_PRESSURE_HIGH
  ) {
    reasons.push("memory_pressure_high");
  }
  if (
    signals.deviceMemoryGb != null &&
    signals.deviceMemoryGb < LOW_DEVICE_MEMORY_GB
  ) {
    reasons.push("low_device_memory");
  }
  if (signals.visibleTimelineItems > 280) reasons.push("timeline_visible_high");
  if (signals.renderStormCount >= 8) reasons.push("render_storm");

  if (
    signals.memoryPressureRatio != null &&
    signals.memoryPressureRatio >= MEMORY_PRESSURE_MED
  ) {
    reasons.push("memory_pressure_med");
  }

  if (reasons.length > 0) {
    return { tier: "DEGRADED", reasons };
  }

  return { tier: "NORMAL", reasons: [] };
}

export function computeRenderPolicy(
  signals: PolicySignals,
  tierOverride?: RuntimeTier
): RenderPolicySnapshot {
  const resolved = resolveRuntimeTier(signals);
  const tier = tierOverride ?? resolved.tier;
  const reasons = tierOverride ? [...resolved.reasons, "manual_override"] : resolved.reasons;

  const slowNet = ["2g", "slow-2g", "3g"].includes(signals.networkQuality);
  const memHigh =
    signals.memoryPressureRatio != null &&
    signals.memoryPressureRatio >= MEMORY_PRESSURE_HIGH;

  if (tier === "SAFE_MODE") {
    return {
      tier,
      reasons,
      timeline: {
        pageSize: 15,
        memoryCeiling: 80,
        searchAllowed: false,
        scanCap: 200,
        prefetchSize: 0,
      },
      sync: {
        batchSize: 3,
        minIntervalMs: 45_000,
        retryDelayMultiplier: 2,
      },
      network: {
        pingIntervalMs: 90_000,
        healthTimeoutMs: 5000,
      },
      metrics: { enabled: false, sampleRate: 0 },
      ui: { animations: false, images: false, lazyRoutes: true },
    };
  }

  if (tier === "DEGRADED") {
    const batchSize = memHigh || slowNet ? 5 : 8;
    return {
      tier,
      reasons,
      timeline: {
        pageSize: slowNet ? 20 : 25,
        memoryCeiling: memHigh ? 120 : 160,
        searchAllowed: false,
        scanCap: signals.batterySaver ? 350 : 500,
        prefetchSize: 0,
      },
      sync: {
        batchSize,
        minIntervalMs: signals.tabHidden ? 60_000 : 30_000,
        retryDelayMultiplier: 1.5,
      },
      network: {
        pingIntervalMs: signals.tabHidden ? 75_000 : 45_000,
        healthTimeoutMs: 4500,
      },
      metrics: {
        enabled: true,
        sampleRate: signals.tabHidden ? 0.15 : 0.35,
      },
      ui: { animations: false, images: !memHigh, lazyRoutes: true },
    };
  }

  return {
    tier: "NORMAL",
    reasons,
    timeline: {
      pageSize: slowNet ? 35 : 50,
      memoryCeiling: 400,
      searchAllowed: true,
      scanCap: 1200,
      prefetchSize: 20,
    },
    sync: {
      batchSize: slowNet ? 10 : 20,
      minIntervalMs: 12_000,
      retryDelayMultiplier: 1,
    },
    network: {
      pingIntervalMs: 30_000,
      healthTimeoutMs: 4000,
    },
    metrics: { enabled: true, sampleRate: 1 },
    ui: { animations: true, images: true, lazyRoutes: true },
  };
}

/** API estable para timeline.slice y componentes. */
export function getTimelinePageSize(policy: RenderPolicySnapshot): number {
  return policy.timeline.pageSize;
}

export function getTimelineMemoryCeiling(policy: RenderPolicySnapshot): number {
  return policy.timeline.memoryCeiling;
}

export function isTimelineSearchAllowed(policy: RenderPolicySnapshot): boolean {
  return policy.timeline.searchAllowed;
}

export function getSearchScanCap(policy: RenderPolicySnapshot): number {
  return policy.timeline.scanCap;
}

export function getSyncBatchSize(policy: RenderPolicySnapshot): number {
  return policy.sync.batchSize;
}

export function getSyncRetryDelayMultiplier(policy: RenderPolicySnapshot): number {
  return policy.sync.retryDelayMultiplier;
}

export function shouldSampleMetrics(policy: RenderPolicySnapshot): boolean {
  if (!policy.metrics.enabled) return false;
  if (policy.metrics.sampleRate >= 1) return true;
  return Math.random() < policy.metrics.sampleRate;
}

export function shouldDisableAnimations(policy: RenderPolicySnapshot): boolean {
  return !policy.ui.animations;
}

export function shouldLoadImages(policy: RenderPolicySnapshot): boolean {
  return policy.ui.images;
}

/** Policy activa desde Zustand (componentes React). */
export function useRenderPolicy(): RenderPolicySnapshot {
  const slice = useRuntimeStore(
    useShallow((s) => ({
      safeMode: s.safeMode,
      batterySaver: s.batterySaver,
      online: s.online,
      networkQuality: s.networkQuality,
      crashesCount: s.crashesCount,
      tabHidden: s.tabHidden,
      memoryPressureHigh: s.memoryPressureHigh,
      runtimeTier: s.runtimeTier,
      degradedReasons: s.degradedReasons,
    }))
  );

  return useMemo(() => {
    const signals = collectPolicySignals(slice);
    const policy = computeRenderPolicy(signals);
    if (slice.runtimeTier !== policy.tier && slice.degradedReasons.length === 0) {
      return policy;
    }
    return policy.tier === slice.runtimeTier
      ? { ...policy, reasons: slice.degradedReasons.length ? slice.degradedReasons : policy.reasons }
      : policy;
  }, [slice]);
}

/** Policy activa fuera de React (sync-engine, network, metrics). */
export function getActiveRenderPolicy(
  extras?: Partial<Pick<PolicySignals, "visibleTimelineItems" | "renderStormCount">>
): RenderPolicySnapshot {
  const s = useRuntimeStore.getState();
  return computeRenderPolicy(collectPolicySignals(s, extras));
}
