import { db } from "../storage/db";
import { getActiveRenderPolicy, shouldSampleMetrics } from "../render/render.policy";
import { useRuntimeStore } from "../runtime/runtime.store";
import {
  CRITICAL_METRICS,
  METRICS_PRUNE_EVERY_N_WRITES,
  PROFILING_METRICS,
} from "../telemetry/telemetry.policy";
import { pruneMetricsLog } from "../telemetry/telemetry.retention";

class MetricsService {
  private startupTime = 0;
  private writesSincePrune = 0;

  public startStartupTimer() {
    this.startupTime = performance.now();
  }

  public async logStartupCompleted() {
    const startupDuration = performance.now() - this.startupTime;
    console.log(`[Observabilidad] Cold boot: ${startupDuration.toFixed(2)}ms`);
    await this.trackMetric("startup_time_ms", startupDuration, {
      userAgent: navigator.userAgent,
    });
  }

  public async trackMetric(name: string, value: number, metadata?: Record<string, unknown>): Promise<void> {
    if (import.meta.env.DEV) {
      console.debug(`[Metric] ${name}: ${value}`, metadata ?? "");
      return;
    }
    try {
      const policy = getActiveRenderPolicy();
      if (
        !CRITICAL_METRICS.has(name) &&
        !PROFILING_METRICS.has(name) &&
        !shouldSampleMetrics(policy)
      ) {
        return;
      }

      await db.metricsLog.add({
        timestamp: new Date().toISOString(),
        metricName: name,
        value,
        metadata: metadata ?? null,
      });

      this.writesSincePrune += 1;
      if (this.writesSincePrune >= METRICS_PRUNE_EVERY_N_WRITES) {
        this.writesSincePrune = 0;
        void pruneMetricsLog();
      }

      if (import.meta.env.DEV) {
        console.debug(`[Metric] ${name}: ${value}`, metadata ?? "");
      }

      if (name === "memory_pressure_ratio" && value > 0.85) {
        useRuntimeStore.getState().setBatterySaver(true);
      }
    } catch (err) {
      console.warn("Error tracking metric:", err);
    }
  }

  public async trackRenderTime(screenName: string, durationMs: number) {
    await this.trackMetric("screen_render_time_ms", durationMs, { screenName });
  }

  public async trackTimelineBatchFetch(
    durationMs: number,
    meta: Record<string, unknown>
  ) {
    await this.trackMetric("timeline_fetch_time_ms", durationMs, meta);
    await this.trackMetric("timeline_batch_fetch_ms", durationMs, meta);
  }

  public async trackTimelineVisibleCount(count: number) {
    await this.trackMetric("timeline_visible_items", count);
  }

  public async trackTimelineRenderDuration(durationMs: number, visibleCount: number) {
    await this.trackMetric("timeline_render_time_ms", durationMs, { visibleCount });
    if (durationMs > 32) {
      await this.trackMetric("timeline_slow_frame_ms", durationMs, { visibleCount });
    }
  }

  public async trackMemoryPressureIfNeeded() {
    const mem = (performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }).memory;
    if (!mem?.jsHeapSizeLimit) return;
    const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    await this.trackMetric("memory_pressure_ratio", ratio);
  }

  public async trackSyncOperation(
    durationMs: number,
    size: number,
    success: boolean,
    errorMsg?: string | null
  ) {
    await this.trackMetric("sync_operation_duration_ms", durationMs, {
      size,
      success,
      errorMsg: errorMsg ?? null,
    });
    if (!success) {
      await this.trackMetric("retry_rate", 1, { size });
    }
  }

  public async trackQueueSize(size: number) {
    await this.trackMetric("queue_size", size);
  }

  public async trackConflictRate(conflicts: number, pending: number) {
    const denom = Math.max(pending + conflicts, 1);
    await this.trackMetric("conflict_rate", conflicts / denom, { conflicts, pending });
  }

  public async getMetricsReport() {
    const logs = await db.metricsLog.orderBy("timestamp").reverse().limit(2000).toArray();
    const summaries: Record<
      string,
      { count: number; total: number; avg: number; min: number; max: number }
    > = {};

    for (const log of logs) {
      if (!summaries[log.metricName]) {
        summaries[log.metricName] = {
          count: 0,
          total: 0,
          avg: 0,
          min: log.value,
          max: log.value,
        };
      }
      const s = summaries[log.metricName];
      s.count += 1;
      s.total += log.value;
      s.min = Math.min(s.min, log.value);
      s.max = Math.max(s.max, log.value);
    }

    for (const key of Object.keys(summaries)) {
      summaries[key].avg = summaries[key].total / summaries[key].count;
    }

    return {
      totalLogs: await db.metricsLog.count(),
      sampled: logs.length,
      timestamp: new Date().toISOString(),
      summaries,
    };
  }
}

export const metricsService = new MetricsService();
export default metricsService;
