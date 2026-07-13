import { metricsService } from "../services/metrics.service";
import { useRuntimeStore } from "../runtime/runtime.store";
import { computeRuntimeHealth } from "./runtime.health";
import { evaluateAutoRecovery } from "./runtime.auto-recovery";
import { RollingCounter } from "./rolling-counter";
import {
  AUTO_RECOVERY,
  LONG_TASK_THRESHOLD_MS,
  ROLLING_WINDOW_5M,
  ROLLING_WINDOW_10M,
} from "./telemetry.policy";

export interface TelemetryCounters {
  longTasks5m: RollingCounter;
  renderStorms5m: RollingCounter;
  memoryPressure10m: RollingCounter;
  fpsDrops5m: RollingCounter;
  syncTriggers1m: RollingCounter;
}

class RuntimeTelemetry {
  private started = false;
  private longTaskObserver: PerformanceObserver | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private fpsRafId: number | null = null;
  private fpsSampleTimer: ReturnType<typeof setInterval> | null = null;
  private hydrationMarked = false;
  private rootMountAt = 0;
  private offlineSince: number | null = null;
  private lastQueuePending = 0;
  private lastQueueSampleAt = Date.now();
  private syncAttempts = 0;
  private syncFailures = 0;

  // In-memory telemetry buffer arrays for sync performance tracking
  private syncDurations: number[] = [];
  private syncBatchSizes: number[] = [];
  private syncLatencies: number[] = [];
  private syncRetriesCount = 0;
  private reconnectsCount = 0;

  private addToBuffer(buffer: number[], val: number, maxLen = 50): void {
    buffer.push(val);
    if (buffer.length > maxLen) {
      buffer.shift();
    }
  }

  readonly counters: TelemetryCounters = {
    longTasks5m: new RollingCounter(ROLLING_WINDOW_5M),
    renderStorms5m: new RollingCounter(ROLLING_WINDOW_5M),
    memoryPressure10m: new RollingCounter(ROLLING_WINDOW_10M),
    fpsDrops5m: new RollingCounter(ROLLING_WINDOW_5M),
    syncTriggers1m: new RollingCounter(60_000),
  };

  public start(): void {
    if (this.started || typeof window === "undefined") return;

    console.log("[TELEMETRY] start");
    this.started = true;
    this.rootMountAt = performance.now();

    this.installLongTaskObserver();
    this.startFpsSampler();
    this.trackOfflineSession();

    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);

    this.healthTimer = setInterval(() => {
      console.log("[TELEMETRY] sample tick");
      void this.runHealthCycle();
    }, 60_000);
    console.log("[TELEMETRY] sample tick");
    void this.runHealthCycle();
  }

  public stop(): void {
    console.log("[TELEMETRY] shutdown");
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    if (this.healthTimer) clearInterval(this.healthTimer);
    if (this.fpsSampleTimer) clearInterval(this.fpsSampleTimer);
    if (this.fpsRafId != null) cancelAnimationFrame(this.fpsRafId);
    this.started = false;
  }

  public markRootMounted(): void {
    if (this.hydrationMarked) return;
    this.hydrationMarked = true;
    const hydrationMs = performance.now() - this.rootMountAt;
    void metricsService.trackMetric("hydration_time_ms", hydrationMs);
  }

  public trackRouteLoad(routeName: string, durationMs: number): void {
    void metricsService.trackMetric("route_load_time_ms", durationMs, { route: routeName });
  }

  public recordRenderStorm(): void {
    this.counters.renderStorms5m.record();
    void metricsService.trackMetric("render_storm_events", 1, {
      count5m: this.counters.renderStorms5m.count(),
    });
  }

  public recordMemoryPressure(ratio: number): void {
    this.counters.memoryPressure10m.record();
    void metricsService.trackMetric("memory_pressure_events", 1, {
      ratio,
      count10m: this.counters.memoryPressure10m.count(),
    });
  }

  public recordSyncTrigger(): void {
    this.counters.syncTriggers1m.record();
    if (this.counters.syncTriggers1m.count() >= AUTO_RECOVERY.syncTriggersIn1m) {
      void metricsService.trackMetric("sync_loop_suspected", 1, {
        triggers1m: this.counters.syncTriggers1m.count(),
      });
    }
  }

  public recordSyncOutcome(success: boolean, batchSize: number, durationMs: number): void {
    this.syncAttempts += 1;
    if (!success) {
      this.syncFailures += 1;
      this.syncRetriesCount += 1;
    }
    this.addToBuffer(this.syncDurations, durationMs);
    this.addToBuffer(this.syncBatchSizes, batchSize);
    this.addToBuffer(this.syncLatencies, durationMs); // API latency proxy

    void metricsService.trackSyncOperation(durationMs, batchSize, success);
    const rate = this.syncAttempts > 0 ? this.syncFailures / this.syncAttempts : 0;
    void metricsService.trackMetric("failed_sync_rate", rate, {
      attempts: this.syncAttempts,
      failures: this.syncFailures,
    });
  }

  public recordReconnect(): void {
    this.reconnectsCount += 1;
    void metricsService.trackMetric("reconnect_frequency", 1);
  }

  public onQueueCountsUpdated(pending: number): void {
    const now = Date.now();
    const elapsedMin = (now - this.lastQueueSampleAt) / 60_000;
    if (elapsedMin >= 0.5 && this.lastQueuePending > 0) {
      const growth = (pending - this.lastQueuePending) / Math.max(elapsedMin, 0.5);
      void metricsService.trackMetric("queue_growth_rate", growth, {
        pending,
        prev: this.lastQueuePending,
      });
    }
    this.lastQueuePending = pending;
    this.lastQueueSampleAt = now;
    void metricsService.trackQueueSize(pending);
  }

  public getCounters(): TelemetryCounters {
    return this.counters;
  }

  public getSyncPerformanceStats() {
    return {
      durations: [...this.syncDurations],
      batchSizes: [...this.syncBatchSizes],
      latencies: [...this.syncLatencies],
      retries: this.syncRetriesCount,
      reconnects: this.reconnectsCount,
      attempts: this.syncAttempts,
      failures: this.syncFailures,
    };
  }

  public resetPerformanceStats(): void {
    this.syncDurations = [];
    this.syncBatchSizes = [];
    this.syncLatencies = [];
    this.syncRetriesCount = 0;
    this.reconnectsCount = 0;
    this.syncAttempts = 0;
    this.syncFailures = 0;
  }

  private onOnline = (): void => {
    if (this.offlineSince != null) {
      const durationMs = Date.now() - this.offlineSince;
      void metricsService.trackMetric("offline_session_duration_ms", durationMs);
      this.offlineSince = null;
    }
    this.recordReconnect();
  };

  private onOffline = (): void => {
    if (this.offlineSince == null) {
      this.offlineSince = Date.now();
    }
  };

  private trackOfflineSession(): void {
    if (!navigator.onLine) {
      this.offlineSince = Date.now();
    }
  }

  private installLongTaskObserver(): void {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = entry.duration;
          const threshold = import.meta.env.DEV ? 50 : LONG_TASK_THRESHOLD_MS;
          if (duration < threshold) continue;
          console.log(`[TELEMETRY] longtask detected: ${duration}ms`);
          this.counters.longTasks5m.record();
          void metricsService.trackMetric("long_task_ms", duration, {
            name: entry.name,
          });
          void metricsService.trackMetric("ui_freeze_ms", duration);
        }
      });
      this.longTaskObserver.observe({ entryTypes: ["longtask"] });
      console.log("[TELEMETRY] observers attached (longtask)");
    } catch {
      // longtask no soportado
    }
  }

  private startFpsSampler(): void {
    let frames = 0;
    let lastTs = performance.now();

    const tick = (ts: number) => {
      frames += 1;
      this.fpsRafId = requestAnimationFrame(tick);
      if (ts - lastTs >= 1000) {
        const fps = (frames * 1000) / (ts - lastTs);
        frames = 0;
        lastTs = ts;
        if (!document.hidden && fps < 24) {
          this.counters.fpsDrops5m.record();
          void metricsService.trackMetric("fps_drop_approx", fps);
        }
      }
    };

    if (!document.hidden) {
      this.fpsRafId = requestAnimationFrame(tick);
    }

    this.fpsSampleTimer = setInterval(() => {
      if (document.hidden && this.fpsRafId != null) {
        cancelAnimationFrame(this.fpsRafId);
        this.fpsRafId = null;
      } else if (!document.hidden && this.fpsRafId == null) {
        frames = 0;
        lastTs = performance.now();
        this.fpsRafId = requestAnimationFrame(tick);
      }
    }, 3000);
  }

  private async runHealthCycle(): Promise<void> {
    const store = useRuntimeStore.getState();
    const health = computeRuntimeHealth(store, {
      longTasks5m: this.counters.longTasks5m.count(),
      renderStorms5m: this.counters.renderStorms5m.count(),
    });
    const prev = store.healthLevel;

    store.setHealth(health.level, health.reasons, health.score);

    if (health.level !== prev) {
      void metricsService.trackMetric("runtime_health_change", 1, {
        from: prev,
        to: health.level,
        reasons: health.reasons,
        score: health.score,
      });
    }

    if (health.level === "CRITICAL") {
      void metricsService.trackMetric("runtime_health_critical", health.score, {
        reasons: health.reasons,
      });
    } else if (health.level === "WARNING") {
      void metricsService.trackMetric("runtime_health_warning", health.score, {
        reasons: health.reasons,
      });
    }

    await evaluateAutoRecovery(this.counters, health.level);
  }
}

export const runtimeTelemetry = new RuntimeTelemetry();
export default runtimeTelemetry;
