import { runtimeTelemetry } from "../telemetry/runtime.telemetry";
import { metricsService } from "../services/metrics.service";
import { networkService } from "../network/network.service";
import {
  collectPolicySignals,
  computeRenderPolicy,
  readMemoryPressureRatio,
} from "../render/render.policy";
import type { RuntimeTier } from "./runtime.tiers";
import { useRuntimeStore } from "./runtime.store";

const MEMORY_CHECK_MS = 25_000;
const RENDER_STORM_WINDOW_MS = 4000;
const RENDER_STORM_THRESHOLD = 8;

/**
 * Monitor ligero: ajusta tier, batterySaver y intervalos sin stores nuevas.
 */
class RuntimeAdaptive {
  private started = false;
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private storeUnsub: (() => void) | null = null;
  private visibleTimelineItems = 0;
  private renderTimestamps: number[] = [];
  private batteryCleanup: (() => void) | null = null;
  private lastRecomputeAt = 0;

  public start(): void {
    if (this.started) return;
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log("[ADAPTIVE] start");
    }
    this.started = true;

    document.addEventListener("visibilitychange", this.onVisibility);
    this.onVisibility();

    void this.probeBattery();
    const interval = isDev ? 60_000 : MEMORY_CHECK_MS;
    this.memoryTimer = setInterval(() => void this.checkMemory(), interval);
    void this.checkMemory();

    this.storeUnsub = useRuntimeStore.subscribe(
      (s) =>
        `${s.safeMode}|${s.batterySaver}|${s.online}|${s.networkQuality}|${s.crashesCount}|${s.tabHidden}|${s.memoryPressureHigh}`,
      () => this.recomputeInternal("store_change")
    );

    if (isDev) {
      console.log("[ADAPTIVE] listeners attached");
    }

    this.recomputeInternal("boot");
  }

  public recompute(trigger: string): void {
    this.recomputeInternal(trigger);
  }

  public stop(): void {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log("[ADAPTIVE] shutdown");
    }
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    this.storeUnsub?.();
    this.storeUnsub = null;

    if (this.batteryCleanup) {
      this.batteryCleanup();
      this.batteryCleanup = null;
    }

    if (isDev) {
      console.log("[ADAPTIVE] listeners removed");
    }
    this.started = false;
  }

  public setVisibleTimelineItems(count: number): void {
    this.visibleTimelineItems = count;
    if (count > 280) {
      this.recomputeInternal("timeline_visible");
    }
  }

  public recordRender(): void {
    const now = Date.now();
    this.renderTimestamps = this.renderTimestamps.filter(
      (t) => now - t < RENDER_STORM_WINDOW_MS
    );
    this.renderTimestamps.push(now);
    if (this.renderTimestamps.length >= RENDER_STORM_THRESHOLD) {
      runtimeTelemetry.recordRenderStorm();
      this.recomputeInternal("render_storm");
    }
  }

  /** Auto-recovery: señal para reducir carga de timeline. */
  public trimTimelinePressure(): void {
    this.visibleTimelineItems = Math.min(this.visibleTimelineItems, 80);
    this.renderTimestamps = [];
  }

  private onVisibility = (): void => {
    const hidden = document.hidden;
    useRuntimeStore.getState().setTabHidden(hidden);
    this.recomputeInternal(hidden ? "tab_hidden" : "tab_visible");
  };

  private async probeBattery(): Promise<void> {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log("[ADAPTIVE] battery snapshot");
    }
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ charging: boolean; level: number; addEventListener?: any; removeEventListener?: any }>;
    };
    if (!nav.getBattery) return;
    try {
      const bat = await nav.getBattery();
      const apply = () => {
        if (isDev) {
          console.log("[ADAPTIVE] battery snapshot");
        }
        if (!bat.charging && bat.level < 0.2) {
          useRuntimeStore.getState().setBatterySaver(true);
          this.recomputeInternal("battery_low");
        }
      };
      apply();
      bat.addEventListener("levelchange", apply);
      bat.addEventListener("chargingchange", apply);

      this.batteryCleanup = () => {
        bat.removeEventListener("levelchange", apply);
        bat.removeEventListener("chargingchange", apply);
      };
    } catch {
      // no bloquear
    }
  }

  private async checkMemory(): Promise<void> {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log("[ADAPTIVE] memory snapshot");
    }
    const ratio = readMemoryPressureRatio();
    if (ratio == null) return;

    const store = useRuntimeStore.getState();
    const high = ratio >= 0.85;
    if (high !== store.memoryPressureHigh) {
      store.setMemoryPressureHigh(high);
    }
    if (high) {
      runtimeTelemetry.recordMemoryPressure(ratio);
      if (!store.batterySaver) {
        store.setBatterySaver(true);
        await metricsService.trackMetric("memory_adaptations", 1, { ratio, action: "battery_saver_on" });
      }
    }

    await metricsService.trackMemoryPressureIfNeeded();
    this.recomputeInternal("memory_probe");
  }

  private recomputeInternal(trigger: string): void {
    const isDev = import.meta.env.DEV;
    
    // Throttling in development mode (max 1 recompute per 60 seconds, unless booting or shutting down)
    if (isDev && trigger !== "boot" && trigger !== "shutdown") {
      const now = Date.now();
      if (now - this.lastRecomputeAt < 60_000) {
        console.log("[ADAPTIVE] policy recompute skipped (throttled)");
        return;
      }
      this.lastRecomputeAt = now;
    }

    let t0 = 0;
    if (isDev) {
      t0 = performance.now();
      console.log("[ADAPTIVE] recompute start");
      console.log("[ADAPTIVE] policy recompute");
    }

    const store = useRuntimeStore.getState();
    const signals = collectPolicySignals(store, {
      visibleTimelineItems: this.visibleTimelineItems,
      renderStormCount: this.renderTimestamps.length,
    });
    const policy = computeRenderPolicy(signals);

    // Strict policy diffing to prevent redundant updates in the Zustand store
    const policyUnchanged = (policy.tier === store.runtimeTier) && (policy.reasons.join() === store.degradedReasons.join());
    if (policyUnchanged) {
      if (isDev) {
        console.log("[ADAPTIVE] policy unchanged");
        const duration = performance.now() - t0;
        console.log("[ADAPTIVE] recompute end");
        console.log(`[ADAPTIVE] recompute duration: ${duration.toFixed(2)}ms`);
      }
      networkService.applyPolicy(policy);
      return;
    }

    if (policy.tier !== store.runtimeTier) {
      const prev = store.runtimeTier;
      store.setRuntimeTier(policy.tier, policy.reasons);
      void this.onTierChange(prev, policy.tier, policy.reasons, trigger);
    } else if (policy.reasons.join() !== store.degradedReasons.join()) {
      store.setRuntimeTier(policy.tier, policy.reasons);
    }

    networkService.applyPolicy(policy);

    if (isDev) {
      console.log("[ADAPTIVE] policy updated");
      const duration = performance.now() - t0;
      console.log("[ADAPTIVE] recompute end");
      console.log(`[ADAPTIVE] recompute duration: ${duration.toFixed(2)}ms`);
    }
  }

  private async onTierChange(
    prev: RuntimeTier,
    next: RuntimeTier,
    reasons: string[],
    trigger: string
  ): Promise<void> {
    await metricsService.trackMetric("runtime_tier_switches", 1, {
      from: prev,
      to: next,
      reasons,
      trigger,
    });
    await metricsService.trackMetric("render_policy_switches", 1, {
      from: prev,
      to: next,
      reasons,
      trigger,
    });

    if (next === "DEGRADED") {
      await metricsService.trackMetric("degraded_mode_entries", 1, { reasons, trigger });
    }
    if (next === "SAFE_MODE") {
      await metricsService.trackMetric("safe_mode_entries", 1, { reasons, trigger });
      useRuntimeStore.getState().setRecoveryDismissed(false);
    }
    if (next !== "SAFE_MODE" && prev === "SAFE_MODE") {
      await metricsService.trackMetric("recovery_actions", 1, { action: "exit_safe_mode_tier", trigger });
    }
  }
}

export const runtimeAdaptive = new RuntimeAdaptive();
export default runtimeAdaptive;
