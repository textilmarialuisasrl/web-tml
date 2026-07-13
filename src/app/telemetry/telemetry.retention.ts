import { db } from "../storage/db";
import {
  METRICS_LOG_MAX_AGE_MS,
  METRICS_LOG_MAX_ENTRIES,
  METRICS_PRUNE_BATCH,
} from "./telemetry.policy";

/**
 * Purga incremental de metricsLog — evita crecimiento infinito en Android baratos.
 */
export async function pruneMetricsLog(force = false): Promise<number> {
  let removed = 0;
  try {
    const count = await db.metricsLog.count();
    if (!force && count <= METRICS_LOG_MAX_ENTRIES) {
      const cutoff = new Date(Date.now() - METRICS_LOG_MAX_AGE_MS).toISOString();
      removed += await db.metricsLog.where("timestamp").below(cutoff).delete();
      return removed;
    }

    const target = Math.max(0, count - METRICS_LOG_MAX_ENTRIES);
    const toRemove = force ? Math.min(count, METRICS_PRUNE_BATCH) : Math.min(target, METRICS_PRUNE_BATCH);

    if (toRemove > 0) {
      const oldest = await db.metricsLog.orderBy("timestamp").limit(toRemove).toArray();
      const ids = oldest.map((r) => r.id).filter((id): id is number => id != null);
      if (ids.length) await db.metricsLog.bulkDelete(ids);
      removed += ids.length;
    }

    const cutoff = new Date(Date.now() - METRICS_LOG_MAX_AGE_MS).toISOString();
    removed += await db.metricsLog.where("timestamp").below(cutoff).delete();
  } catch {
    // no bloquear runtime
  }
  return removed;
}
