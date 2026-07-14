import { db, type OfflineMovement, type OfflineMovementItem, type SyncPriority, type SyncStatus } from "../storage/db";
import { useRuntimeStore } from "../runtime/runtime.store";
import { metricsService } from "../services/metrics.service";
import { runtimeTelemetry } from "../telemetry/runtime.telemetry";
import {
  statusAfterSyncFailure,
  SYNC_RETRY_MAX_ATTEMPTS,
} from "./sync-state.machine";

// Helper for deterministic JSON stringify
export function canonicalStringify(obj: any): string {
  if (obj === null) return "null";
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const properties = keys.map(key => `"${key}":${canonicalStringify(obj[key])}`);
  return "{" + properties.join(",") + "}";
}

// Helper for native SHA-256 hashing
export async function generateSHA256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Standard UUID v4 generator
export function generateUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class QueueService {
  constructor() {
    // Empty constructor
  }

  /**
   * Enqueues a new movement offline.
   */
  public async enqueue(
    tipo: string,
    items: OfflineMovementItem[],
    tallerId?: string | null,
    observaciones?: string | null,
    priority: SyncPriority = "NORMAL",
    insumos?: { descripcion: string; cantidad: number }[]
  ): Promise<OfflineMovement> {
    
    // 1. Generate unique client identifier
    const clientGeneratedId = generateUUID();
    
    // 2. Generate canonical hash of the payload for replay protection
    const canonicalPayload = canonicalStringify({ tipo, items, tallerId, observaciones, insumos });
    const payloadHash = await generateSHA256(canonicalPayload);

    // 3. Construct movement object
    const movement: OfflineMovement = {
      clientGeneratedId,
      tipo,
      offlineCreatedAt: new Date().toISOString(),
      items,
      tallerId: tallerId || null,
      observaciones: observaciones || null,
      syncStatus: "PENDING",
      payloadHash,
      priority,
      syncAttempts: 0,
      insumos: insumos || [],
    };

    // 4. Persistence transaction
    await db.transaction("rw", db.movementsQueue, db.stockCache, async () => {
      await db.movementsQueue.add(movement);
      
      // Perform optimistic offline stock cache update to reflect in UI instantly!
      for (const item of items) {
        const locationId = item.depositoOrigenId || item.tallerOrigenId || item.depositoDestinoId || item.tallerDestinoId;
        if (locationId) {
          const cacheId = `${item.productoId}_${locationId}`;
          const currentStock = await db.stockCache.get(cacheId);
          const currentQty = currentStock ? currentStock.cantidadUnidades : 0;
          
          let nextQty = currentQty;
          if (item.direccion === "ENTRADA") {
            nextQty += item.cantidadUnidades;
          } else if (item.direccion === "SALIDA") {
            nextQty -= item.cantidadUnidades;
          }

          await db.stockCache.put({
            id: cacheId,
            productoId: item.productoId,
            productoNombre: currentStock ? currentStock.productoNombre : "Producto Caché",
            depositoId: item.depositoOrigenId || item.depositoDestinoId || null,
            tallerId: item.tallerOrigenId || item.tallerDestinoId || null,
            cantidadUnidades: Math.max(0, nextQty),
            calidad: item.calidad,
            presentacion: item.presentacion,
            canal: item.canal,
            actualizadoAt: new Date().toISOString()
          });
        }
      }
    });

    // 5. Update local Zustand counts
    await this.refreshQueueCounts();

    return movement;
  }

  /**
   * Dequeues a batch of movements sorted by priority and date.
   */
  /**
   * Dequeue acotado en memoria: consultas indexadas con límite por estado (no .toArray() masivo).
   */
  public async dequeueBatch(size: number = 20): Promise<OfflineMovement[]> {
    const perStatusCap = Math.max(size * 2, 40);
    const [pendingRows, retryRows] = await Promise.all([
      db.movementsQueue.where("syncStatus").equals("PENDING").limit(perStatusCap).toArray(),
      db.movementsQueue
        .where("syncStatus")
        .equals("RETRY_SCHEDULED")
        .limit(perStatusCap)
        .toArray(),
    ]);

    const priorityWeights: Record<SyncPriority, number> = { HIGH: 3, NORMAL: 2, LOW: 1 };

    return [...pendingRows, ...retryRows]
      .sort((a, b) => {
        const weightA = priorityWeights[a.priority] ?? 2;
        const weightB = priorityWeights[b.priority] ?? 2;
        if (weightA !== weightB) {
          return weightB - weightA;
        }
        return (
          new Date(a.offlineCreatedAt).getTime() - new Date(b.offlineCreatedAt).getTime()
        );
      })
      .slice(0, size);
  }

  /**
   * Marca lote como SYNCING (transición atómica).
   */
  public async markBatchSyncing(
    batch: OfflineMovement[],
    batchId: string
  ): Promise<void> {
    await db.transaction("rw", db.movementsQueue, async () => {
      for (const item of batch) {
        if (!item.id) continue;
        await db.movementsQueue.update(item.id, {
          syncStatus: "SYNCING",
          syncBatchId: batchId,
        });
      }
    });
  }

  /**
   * Fallo de sync: backoff por ítem + dead-letter real al superar SYNC_RETRY_MAX_ATTEMPTS.
   */
  public async failBatchWithRetry(
    items: OfflineMovement[],
    errorMessage: string
  ): Promise<{ maxAttempts: number; deadLetterCount: number }> {
    let maxAttempts = 0;
    let deadLetterCount = 0;

    await db.transaction("rw", db.movementsQueue, async () => {
      for (const item of items) {
        if (!item.id) continue;
        const row = await db.movementsQueue.get(item.id);
        if (!row || row.syncStatus !== "SYNCING") continue;

        const { status, attempts } = statusAfterSyncFailure(row.syncAttempts);
        maxAttempts = Math.max(maxAttempts, attempts);
        
        let finalStatus: SyncStatus = status;
        if (status === "FAILED") {
          finalStatus = "DEAD_LETTER";
          deadLetterCount += 1;
        }

        const msg =
          finalStatus === "DEAD_LETTER"
            ? errorMessage ||
              `Superado el límite de ${SYNC_RETRY_MAX_ATTEMPTS} intentos (cola muerta)`
            : errorMessage;

        await db.movementsQueue.update(item.id, {
          syncStatus: finalStatus,
          syncAttempts: attempts,
          syncErrorMessage: msg,
          lastAttemptAt: new Date().toISOString(),
        });
      }
    });

    await this.refreshQueueCounts();
    return { maxAttempts, deadLetterCount };
  }

  /**
   * Resolves a synced item, transitioning it to the appropriate state.
   * If sync fails systematically, it acts as a DLQ (Dead-Letter Queue) by setting state FAILED.
   */
  public async resolveItem(
    clientGeneratedId: string,
    status: SyncStatus,
    errorMsg?: string | null,
    syncBatchId?: string | null
  ): Promise<void> {
    await db.transaction("rw", db.movementsQueue, async () => {
      const item = await db.movementsQueue.where("clientGeneratedId").equals(clientGeneratedId).first();
      if (!item) return;

      let finalStatus = status;
      let attempts = item.syncAttempts;

      if (status === "RETRY_SCHEDULED") {
        const next = statusAfterSyncFailure(item.syncAttempts);
        finalStatus = next.status === "FAILED" ? "DEAD_LETTER" : next.status;
        attempts = next.attempts;
        if (finalStatus === "DEAD_LETTER") {
          errorMsg =
            errorMsg ||
            `Superado el límite de ${SYNC_RETRY_MAX_ATTEMPTS} intentos de sincronización (DLQ)`;
        }
      }

      await db.movementsQueue.update(item.id!, {
        syncStatus: finalStatus,
        syncErrorMessage: errorMsg || null,
        syncAttempts: attempts,
        lastAttemptAt: new Date().toISOString(),
        syncBatchId: syncBatchId || item.syncBatchId || null
      });
    });

    await this.refreshQueueCounts();
  }

  /**
   * Resets movements stuck in SYNCING to PENDING (Crash Recovery).
   */
  public async runCrashRecovery(): Promise<number> {
    let recoveredCount = 0;
    
    await db.transaction("rw", db.movementsQueue, async () => {
      const stuckItems = await db.movementsQueue.where("syncStatus").equals("SYNCING").toArray();
      recoveredCount = stuckItems.length;

      for (const item of stuckItems) {
        await db.movementsQueue.update(item.id!, {
          syncStatus: "RETRY_SCHEDULED",
          syncErrorMessage: "Recuperado tras cierre inesperado de la aplicación",
        });
      }
    });

    if (recoveredCount > 0) {
      console.log(`[Crash Recovery] Se recuperaron ${recoveredCount} movimientos locales atascados`);
      await this.refreshQueueCounts();
    }
    
    return recoveredCount;
  }

  /**
   * Automatically purges old records to optimize database size.
   */
  public async applyRetentionPolicy(): Promise<{ purgedQueue: number; purgedMetrics: number }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let purgedQueue = 0;
    let purgedMetrics = 0;

    await db.transaction("rw", db.movementsQueue, db.metricsLog, async () => {
      // 1. Purge SYNCED movements older than 7 days
      const oldSynced = await db.movementsQueue
        .where("syncStatus")
        .equals("SYNCED")
        .filter(item => new Date(item.offlineCreatedAt) < sevenDaysAgo)
        .toArray();
      
      purgedQueue = oldSynced.length;
      for (const item of oldSynced) {
        await db.movementsQueue.delete(item.id!);
      }

      // 2. Purge metrics logs older than 90 days
      const oldMetrics = await db.metricsLog
        .filter(log => new Date(log.timestamp) < ninetyDaysAgo)
        .toArray();

      purgedMetrics = oldMetrics.length;
      for (const log of oldMetrics) {
        await db.metricsLog.delete(log.id!);
      }
    });

    if (purgedQueue > 0 || purgedMetrics > 0) {
      console.log(`[Retention Policy] Purga automática completada. Movimientos: -${purgedQueue}, Métricas: -${purgedMetrics}`);
    }

    return { purgedQueue, purgedMetrics };
  }

  /**
   * Recalculates all queue metrics and updates Zustand runtime store.
   */
  public async refreshQueueCounts(): Promise<void> {
    const store = useRuntimeStore.getState();
    
    const pending = await db.movementsQueue
      .where("syncStatus")
      .anyOf("PENDING", "RETRY_SCHEDULED")
      .count();

    const conflicts = await db.movementsQueue
      .where("syncStatus")
      .equals("CONFLICT")
      .count();

    const failed = await db.movementsQueue
      .where("syncStatus")
      .anyOf("FAILED", "DEAD_LETTER")
      .count();

    store.setCounts({
      syncPending: pending,
      conflicts,
      failed,
    });

    runtimeTelemetry.onQueueCountsUpdated(pending);
    void metricsService.trackConflictRate(conflicts, pending);
  }
}

export const queueService = new QueueService();
export default queueService;
