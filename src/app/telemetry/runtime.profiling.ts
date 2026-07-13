import { getManagedCacheNames } from "../cache/cache.policy";
import { metricsService } from "../services/metrics.service";
import { useRuntimeStore } from "../runtime/runtime.store";
import { getRuntimeCleanupStats } from "../runtime/runtime.cleanup-registry";
import { runtimeTelemetry } from "./runtime.telemetry";

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

export interface ProfilingSample {
  at: string;
  runtimeHeapUsedMb: number | null;
  observersActiveCount: number;
  cleanupRegistered: number;
  syncThroughputPerMin: number;
  queueGrowthVelocity: number;
  cacheEntriesCount: number;
  metricsLogCount: number;
  syncPending: number;
}

class RuntimeProfiling {
  private started = false;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private bootReadyAt: number | null = null;
  private lastSample: ProfilingSample | null = null;
  private lastSyncedPending = 0;
  private lastSyncedAt = Date.now();
  private syncedDeltaWindow = 0;

  public markBootReady(): void {
    if (this.bootReadyAt != null) return;
    this.bootReadyAt = performance.now();
    const ms = this.bootReadyAt;
    void metricsService.trackMetric("boot_to_ready_ms", ms);
  }

  public start(): void {
    if (this.started || typeof window === "undefined") return;

    const isDev = import.meta.env.DEV;
    console.log("[PROFILING] start");
    
    // Prevent interval duplication under any circumstance (like HMR reload)
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }

    this.started = true;

    const interval = isDev ? 60_000 : SAMPLE_INTERVAL_MS;

    const timerId = setInterval(() => {
      if (this.started) void this.sample();
    }, interval);
    this.sampleTimer = timerId;

    if (isDev) {
      console.log(`[PROFILING] profiling interval created (ID: ${timerId})`);
      console.log(`[PROFILING] active profiling timer id: ${timerId}`);
    }

    void this.sample();
  }

  public stop(): void {
    const isDev = import.meta.env.DEV;
    const prevTimerId = this.sampleTimer;
    console.log("[PROFILING] shutdown");
    this.started = false;
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
      if (isDev) {
        console.log(`[PROFILING] profiling interval destroyed (ID: ${prevTimerId})`);
      }
    }
  }

  public getLastSample(): ProfilingSample | null {
    return this.lastSample;
  }

  public recordSyncProgress(pendingBefore: number, pendingAfter: number): void {
    const synced = Math.max(0, pendingBefore - pendingAfter);
    if (synced > 0) {
      this.syncedDeltaWindow += synced;
    }
  }

  private readHeapMb(): number | null {
    const mem = (performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }).memory;
    if (!mem?.usedJSHeapSize) return null;
    return Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
  }

  private async countCacheEntries(): Promise<number> {
    if (!("caches" in window)) return 0;
    let total = 0;
    for (const name of getManagedCacheNames()) {
      try {
        const cache = await caches.open(name);
        total += (await cache.keys()).length;
      } catch {
        // ignore
      }
    }
    return total;
  }

  public async sample(): Promise<ProfilingSample> {
    const isDev = import.meta.env.DEV;
    let t0 = 0;
    if (isDev) {
      t0 = performance.now();
      console.log("[PROFILING] sample start");
    }

    const store = useRuntimeStore.getState();
    const cleanup = getRuntimeCleanupStats();
    const heap = this.readHeapMb();
    const cacheEntries = await this.countCacheEntries();

    let metricsCount = 0;
    if (isDev) {
      console.log("[PROFILING] skipped heavy scan");
      console.log("[PROFILING] lightweight sample");
    } else {
      try {
        const report = await metricsService.getMetricsReport();
        metricsCount = report.totalLogs;
      } catch {
        // ignore
      }
    }

    const elapsedMin = Math.max((Date.now() - this.lastSyncedAt) / 60_000, 0.01);
    const throughput = this.syncedDeltaWindow / elapsedMin;
    const queueGrowth =
      (store.syncPending - this.lastSyncedPending) / elapsedMin;

    this.lastSyncedPending = store.syncPending;
    this.lastSyncedAt = Date.now();
    this.syncedDeltaWindow = 0;

    const sample: ProfilingSample = {
      at: new Date().toISOString(),
      runtimeHeapUsedMb: heap,
      observersActiveCount: cleanup.observersActiveCount,
      cleanupRegistered: cleanup.registered,
      syncThroughputPerMin: Math.round(throughput * 10) / 10,
      queueGrowthVelocity: Math.round(queueGrowth * 10) / 10,
      cacheEntriesCount: cacheEntries,
      metricsLogCount: metricsCount,
      syncPending: store.syncPending,
    };

    this.lastSample = sample;

    if (isDev) {
      console.log("[PROFILING] metrics write: skipped db storage in DEV");
    } else {
      if (heap != null) {
        void metricsService.trackMetric("runtime_heap_used_mb", heap);
      }
      void metricsService.trackMetric(
        "observers_active_count",
        cleanup.observersActiveCount
      );
      void metricsService.trackMetric("sync_throughput_per_min", throughput);
      void metricsService.trackMetric("queue_growth_velocity", queueGrowth);
      void metricsService.trackMetric("cache_entries_count", cacheEntries);
    }

    runtimeTelemetry.onQueueCountsUpdated(store.syncPending);

    if (isDev) {
      const duration = performance.now() - t0;
      console.log("[PROFILING] sample end");
      console.log(`[PROFILING] duration: ${duration.toFixed(2)}ms`);
    }

    return sample;
  }
}

export const runtimeProfiling = new RuntimeProfiling();
export default runtimeProfiling;
