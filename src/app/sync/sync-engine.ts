import { db, type OfflineMovement, type SyncStatus } from "../storage/db";
import { queueService } from "../offline/queue.service";
import { useRuntimeStore } from "../runtime/runtime.store";
import { syncCircuitBreaker } from "./sync.circuit";
import { detectAndQuarantineCorruption } from "../offline/queue.integrity";
import { networkService } from "../network/network.service";
import { computeBatchRetryDelayMs } from "../offline/sync-state.machine";
import { ensureAuthForSync } from "../auth/auth.sync-gate";
import {
  getActiveRenderPolicy,
  getSyncBatchSize,
  getSyncRetryDelayMultiplier,
} from "../render/render.policy";
import { runtimeTelemetry } from "../telemetry/runtime.telemetry";
import { registerRuntimeCleanup } from "../runtime/runtime.cleanup-registry";
import { authFetch } from "../auth/auth.api";

class SyncEngine {
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private isProcessing = false;
  private initialized = false;
  private lastTriggerAt = 0;

  /**
   * Registro ligero; los listeners viven en sync-scheduler.ts (idempotente).
   */
  public init(): void {
    if (this.initialized) return;
    this.initialized = true;
    registerRuntimeCleanup(() => this.cancelScheduledSync(), "timer");

    // Execute integrity corruption scanning immediately upon initialization
    detectAndQuarantineCorruption().catch(() => {});
  }

  public cancelScheduledSync(): void {
    if (this.syncTimer) {
      const prevTimerId = this.syncTimer;
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
      if (import.meta.env.DEV) {
        console.log(`[SCHEDULER] retry scheduler destroyed (ID: ${prevTimerId})`);
      }
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public hasScheduledSync(): boolean {
    return this.syncTimer !== null;
  }

  /**
   * Disparo seguro: no bloquea render; una sola corrida activa.
   * Auth validada dentro de processQueue (8B.4).
   */
  public triggerSync(options?: { force?: boolean; isManual?: boolean }): void {
    if (this.isProcessing) return;

    const policy = getActiveRenderPolicy();
    const now = Date.now();
    const minInterval = options?.force ? 0 : policy.sync.minIntervalMs;
    if (now - this.lastTriggerAt < minInterval) return;
    this.lastTriggerAt = now;
    runtimeTelemetry.recordSyncTrigger();

    const run =
      typeof requestIdleCallback === "function"
        ? (cb: () => void) => requestIdleCallback(cb, { timeout: 2500 })
        : (cb: () => void) => setTimeout(cb, 0);

    const isManual = options?.isManual ?? false;
    run(() => {
      this.processQueue(isManual).catch((err) => {
        console.warn("[Sync Engine] Error processing queue:", err);
      });
    });
  }

  private async processQueue(isManual = false): Promise<void> {
    const store = useRuntimeStore.getState();

    if (this.isProcessing || !store.online || store.syncPending === 0) {
      return;
    }

    // Circuit Breaker Guard: Block sync flushes if circuit is OPEN
    if (syncCircuitBreaker.isOpen()) {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}][SYNC][WARN] sync-blocked-circuit-open - Sync engine execution skipped because circuit breaker is OPEN.`);
      return;
    }

    const gate = await ensureAuthForSync();
    if (!gate.allowed) {
      if (!gate.silent) {
        console.debug(`[Sync Engine] Bloqueado por auth: ${gate.reason} (${gate.phase})`);
      }
      return;
    }

    this.isProcessing = true;
    store.setSyncing(true);
    const batchStart = performance.now();
    const pendingBefore = store.syncPending;
    let batchSize = 0;

    try {
      const activeConnection = await networkService.triggerManualPing();
      if (!activeConnection) {
        await this.rollbackSyncingWithRetry("Conexión inestable detectada");
        this.scheduleResume(1);
        return;
      }

      const gateBeforeDequeue = await ensureAuthForSync();
      if (!gateBeforeDequeue.allowed) {
        return;
      }

      const policy = getActiveRenderPolicy();
      const chunkSize = getSyncBatchSize(policy);

      const batch = await queueService.dequeueBatch(chunkSize);
      batchSize = batch.length;
      if (batch.length === 0) {
        return;
      }

      const gateBeforeTransmit = await ensureAuthForSync();
      if (!gateBeforeTransmit.allowed) {
        await this.rollbackSyncingWithRetry("Sesión no validada antes de transmitir");
        return;
      }

      console.log(`[Sync Engine] Sincronizando lote de ${batch.length} movimientos...`);
      await this.transmitBatch(batch, isManual);

      // Record success on successful response
      syncCircuitBreaker.recordSuccess();

      await queueService.refreshQueueCounts();
      const pendingAfter = useRuntimeStore.getState().syncPending;
      void import("../telemetry/runtime.profiling").then((m) =>
        m.runtimeProfiling.recordSyncProgress(pendingBefore, pendingAfter)
      );
      runtimeTelemetry.recordSyncOutcome(true, batchSize, performance.now() - batchStart);
      if (useRuntimeStore.getState().syncPending > 0) {
        this.triggerSync({ force: true, isManual });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error de sincronización";
      console.warn("[Sync Engine] Batch sync error:", message);

      // Record failure in circuit breaker
      syncCircuitBreaker.recordFailure();

      runtimeTelemetry.recordSyncOutcome(false, batchSize, performance.now() - batchStart);
      const { maxAttempts } = await this.rollbackSyncingWithRetry(message);
      this.scheduleResume(maxAttempts);
    } finally {
      this.isProcessing = false;
      useRuntimeStore.getState().setSyncing(false);
    }
  }

  private async transmitBatch(batch: OfflineMovement[], isManual = false): Promise<void> {
    const store = useRuntimeStore.getState();
    const batchId =
      "batch-cli-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    await queueService.markBatchSyncing(batch, batchId);

    const payload = {
      batchId,
      deviceId: store.deviceId || "device-pwa-default",
      schemaVersion: 1,
      movements: batch.map((m) => ({
        clientGeneratedId: m.clientGeneratedId,
        tipo: m.tipo,
        offlineCreatedAt: m.offlineCreatedAt,
        tallerId: m.tallerId || null,
        observaciones: m.observaciones || null,
        items: m.items,
      })),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    let response: Response;
    const logPrefix = isManual ? "[MANUAL RETRY]" : "[AUTO SYNC]";

    try {
      response = await authFetch("/api/sync/movimientos", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (fetchErr: any) {
      for (const m of batch) {
        console.log(`\n${logPrefix}\nmovementId: ${m.clientGeneratedId}\npayload: ${JSON.stringify(m)}\nendpoint: /api/sync/movimientos\nresultado: FAILED (${fetchErr.message || "Network Error"})\n`);
      }
      throw fetchErr;
    }

    if (response.status === 401 || response.status === 403) {
      const { authLifecycle } = await import("../auth/auth.lifecycle");
      let code = "";
      try {
        const body = await response.clone().json();
        code = body?.code ?? "";
      } catch {
        // ignore
      }

      for (const m of batch) {
        console.log(`\n${logPrefix}\nmovementId: ${m.clientGeneratedId}\npayload: ${JSON.stringify(m)}\nendpoint: /api/sync/movimientos\nresultado: HTTP ERROR ${response.status} (${code || "UNAUTHORIZED"})\n`);
      }

      if (response.status === 403) {
        authLifecycle.lockRuntime("SESSION_REVOKED");
      } else if (code === "SNAPSHOT_SIGNATURE_MISMATCH") {
        authLifecycle.lockRuntime("SNAPSHOT_SIGNATURE_MISMATCH");
      } else {
        authLifecycle.transitionPhase("REAUTH_REQUIRED", "sync_http_401");
      }
      throw new Error(`HTTP Error ${response.status}: sesión inválida (${code || "UNAUTHORIZED"})`);
    }

    if (!response.ok) {
      const errText = await response.text();
      for (const m of batch) {
        console.log(`\n${logPrefix}\nmovementId: ${m.clientGeneratedId}\npayload: ${JSON.stringify(m)}\nendpoint: /api/sync/movimientos\nresultado: HTTP ERROR ${response.status}: ${errText}\n`);
      }
      throw new Error(`HTTP Error ${response.status}: ${errText}`);
    }

    const data: {
      success: boolean;
      message?: string;
      data: {
        synced: { clientGeneratedId: string }[];
        conflicts: { clientGeneratedId: string }[];
        rejected: { clientGeneratedId: string; error?: string }[];
      };
    } = await response.json();

    if (!data.success) {
      for (const m of batch) {
        console.log(`\n${logPrefix}\nmovementId: ${m.clientGeneratedId}\npayload: ${JSON.stringify(m)}\nendpoint: /api/sync/movimientos\nresultado: FAILED (${data.message || "Unknown server response error"})\n`);
      }
      throw new Error(data.message || "Error devuelto por el servidor");
    }

    const syncedIds = data.data.synced.map((x) => x.clientGeneratedId);
    const conflictIds = data.data.conflicts.map((x) => x.clientGeneratedId);
    const rejectedList = data.data.rejected;

    for (const m of batch) {
      let resultado = "PENDING";
      if (syncedIds.includes(m.clientGeneratedId)) {
        resultado = "SUCCESS";
      } else if (conflictIds.includes(m.clientGeneratedId)) {
        resultado = "CONFLICT";
      } else {
        const rej = rejectedList.find((x) => x.clientGeneratedId === m.clientGeneratedId);
        if (rej) {
          resultado = `REJECTED: ${rej.error || "unknown"}`;
        }
      }
      console.log(`\n${logPrefix}\nmovementId: ${m.clientGeneratedId}\npayload: ${JSON.stringify(m)}\nendpoint: /api/sync/movimientos\nresultado: ${resultado}\n`);
    }

    for (const cGenId of syncedIds) {
      await queueService.resolveItem(cGenId, "SYNCED", null, batchId);
    }
    for (const cGenId of conflictIds) {
      await queueService.resolveItem(
        cGenId,
        "CONFLICT",
        "Conflicto de stock o de datos en el servidor",
        batchId
      );
    }
    for (const rejected of rejectedList) {
      const errText = rejected.error || "";
      const isPermanent = 
        errText.includes("DUPLICATE_OPERATION") ||
        errText.includes("FORBIDDEN_WORKSHOP_ACCESS") ||
        errText.includes("validation") ||
        errText.includes("malformed") ||
        errText.includes("reclamación de propiedad") ||
        errText.includes("no permitido");
        
      const status: SyncStatus = isPermanent ? "DEAD_LETTER" : "FAILED";
      const errorMsg = isPermanent
        ? `[PERMANENT_REJECTION] ${errText || "Rechazo permanente de autorización o validación"}`
        : errText || "Operación rechazada por validación de stock en el servidor";

      await queueService.resolveItem(
        rejected.clientGeneratedId,
        status,
        errorMsg,
        batchId
      );
    }

    store.setLastSyncAt(new Date().toISOString());
  }

  private async rollbackSyncingWithRetry(
    errorMessage: string
  ): Promise<{ maxAttempts: number; deadLetterCount: number }> {
    const syncing = await db.movementsQueue
      .where("syncStatus")
      .equals("SYNCING")
      .toArray();

    if (syncing.length === 0) {
      return { maxAttempts: 1, deadLetterCount: 0 };
    }

    return queueService.failBatchWithRetry(syncing, errorMessage);
  }

  private scheduleResume(maxAttemptsAmongItems: number): void {
    const isDev = import.meta.env.DEV;
    const policy = getActiveRenderPolicy();
    const delay = isDev ? 60_000 : Math.round(
      computeBatchRetryDelayMs(maxAttemptsAmongItems) *
        getSyncRetryDelayMultiplier(policy)
    );
    console.log(`[Sync Engine] Reintento programado en ${delay}ms`);

    if (this.syncTimer) {
      const prevTimerId = this.syncTimer;
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
      if (isDev) {
        console.log(`[SCHEDULER] retry scheduler destroyed (ID: ${prevTimerId})`);
      }
    }

    const timerId = setTimeout(() => {
      this.syncTimer = null;
      
      const tickStart = performance.now();
      if (isDev) {
        console.log("[SCHEDULER] retry scheduler tick start");
      }

      const store = useRuntimeStore.getState();
      if (!navigator.onLine) {
        if (isDev) {
          console.log("[SCHEDULER] retry scheduler tick: offline skip");
          console.log("[SCHEDULER] retry scheduler tick end");
          console.log(`[SCHEDULER] retry scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
        return;
      }
      if (store.syncing) {
        if (isDev) {
          console.log("[SCHEDULER] retry scheduler tick: syncInFlight skip");
          console.log("[SCHEDULER] retry scheduler tick end");
          console.log(`[SCHEDULER] retry scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
        return;
      }
      if (store.authPhase !== "ONLINE_AUTH") {
        if (isDev) {
          console.log("[SCHEDULER] retry scheduler tick: authPhase skip");
          console.log("[SCHEDULER] retry scheduler tick end");
          console.log(`[SCHEDULER] retry scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
        return;
      }

      this.triggerSync();

      if (isDev) {
        console.log("[SCHEDULER] retry scheduler tick end");
        console.log(`[SCHEDULER] retry scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
      }
    }, delay);
    
    this.syncTimer = timerId;
    if (isDev) {
      console.log(`[SCHEDULER] retry scheduler created (ID: ${timerId})`);
    }
  }
}

export const syncEngine = new SyncEngine();
export default syncEngine;
