import { prisma } from "../db/prisma";

export const metricsRegistry = {
  counters: {
    pdf_generation_count: 0,
    optimistic_lock_conflicts: 0,
    optimistic_lock_retries: 0,
    optimistic_lock_retry_success: 0,
    optimistic_lock_retry_failure: 0,
    stock_updates_total: 0,
    sync_batches_received: 0,
    sync_movements_processed: 0,
    sync_movements_synced: 0,
    sync_movements_conflicts: 0,
    sync_movements_rejected: 0,
  },

  gauges: {
    cache_hits: 0,
    cache_misses: 0,
    last_sync_batch_size: 0,
  },

  histograms: {
    sync_duration: {
      under100ms: 0,
      under500ms: 0,
      over1s: 0,
    },
    pdf_generation_duration: {
      under100ms: 0,
      under500ms: 0,
      over1s: 0,
    },
    csv_export_duration: {
      under100ms: 0,
      under500ms: 0,
      over1s: 0,
    },
  },

  incrementCounter(name: keyof typeof metricsRegistry.counters, amount = 1) {
    if (name in this.counters) {
      this.counters[name] += amount;
    }
  },

  recordCacheHit() {
    this.gauges.cache_hits++;
  },

  recordCacheMiss() {
    this.gauges.cache_misses++;
  },

  recordSyncBatchSize(size: number) {
    this.gauges.last_sync_batch_size = size;
  },

  recordSyncDuration(ms: number) {
    if (ms < 100) this.histograms.sync_duration.under100ms++;
    else if (ms < 500) this.histograms.sync_duration.under500ms++;
    else this.histograms.sync_duration.over1s++;
  },

  recordPdfDuration(ms: number) {
    if (ms < 100) this.histograms.pdf_generation_duration.under100ms++;
    else if (ms < 500) this.histograms.pdf_generation_duration.under500ms++;
    else this.histograms.pdf_generation_duration.over1s++;
  },

  recordCsvDuration(ms: number) {
    if (ms < 100) this.histograms.csv_export_duration.under100ms++;
    else if (ms < 500) this.histograms.csv_export_duration.under500ms++;
    else this.histograms.csv_export_duration.over1s++;
  },

  async getSnapshot() {
    const activeAlertsCount = await prisma.alertaStock.count({
      where: { activa: true },
    });

    const cacheTotal = this.gauges.cache_hits + this.gauges.cache_misses;
    const cacheHitRatio = cacheTotal > 0 ? this.gauges.cache_hits / cacheTotal : 0;

    return {
      counters: this.counters,
      gauges: {
        cache_hit_ratio: Number(cacheHitRatio.toFixed(4)),
        last_sync_batch_size: this.gauges.last_sync_batch_size,
        active_alerts: activeAlertsCount,
      },
      histograms: this.histograms,
    };
  },
};
