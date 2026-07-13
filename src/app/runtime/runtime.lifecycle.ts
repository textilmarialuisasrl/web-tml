import { metricsService } from "../services/metrics.service";
import { authLifecycle } from "../auth/auth.lifecycle";
import { authIntegrity } from "../auth/auth.integrity";
import { catalogService } from "../services/catalog.service";
import { queueService } from "../offline/queue.service";
import { networkService } from "../network/network.service";
import { syncScheduler } from "../sync/sync-scheduler";
import { swClientService } from "../services/sw-client.service";
import { runtimeAdaptive } from "./runtime.adaptive";
import { runtimeTelemetry } from "../telemetry/runtime.telemetry";
import { runtimeProfiling } from "../telemetry/runtime.profiling";
import { pruneMetricsLog } from "../telemetry/telemetry.retention";
import { computeRenderPolicy, collectPolicySignals } from "../render/render.policy";
import { safeModeEngine } from "./safe-mode";
import { useRuntimeStore } from "./runtime.store";

export type RuntimePhase = "BOOTSTRAPPING" | "RECOVERING" | "READY" | "DEGRADED";

/**
 * Orquestador de arranque idempotente (Fase 8A).
 * Una sola ejecución concurrente; pasos ordenados; Dexie como verdad.
 */
class RuntimeLifecycle {
  private phase: RuntimePhase = "BOOTSTRAPPING";
  private bootPromise: Promise<void> | null = null;
  private bootFinished = false;
  private queueFlushTimer: ReturnType<typeof setTimeout> | null = null;

  public getPhase(): RuntimePhase {
    return this.phase;
  }

  public isReady(): boolean {
    return this.phase === "READY" || this.phase === "DEGRADED";
  }

  /**
   * Punto único de entrada del bootstrap PWA.
   */
  public runBoot(): Promise<void> {
    if (this.bootFinished) {
      return Promise.resolve();
    }
    if (this.bootPromise) {
      return this.bootPromise;
    }

    this.bootPromise = this.executeBoot();
    return this.bootPromise;
  }

  private async executeBoot(): Promise<void> {
    const isDev = import.meta.env.DEV;

    if (isDev) {
      console.count("executeBoot");
      console.time("runtime_boot");
      console.log("[BOOT] runtime init (DEV MODE)");
      this.phase = "BOOTSTRAPPING";
      const store = useRuntimeStore.getState();

      try {
        console.log("[BOOT] before dexie");
        await queueService.refreshQueueCounts();
        console.log("[BOOT] after dexie");

        console.log("[BOOT] before auth bootstrap");
        await authLifecycle.bootstrap();
        console.log("[BOOT] after auth bootstrap");

        console.log("[BOOT] before network init");
        if (!networkService.isInitialized()) {
          networkService.init();
        }
        console.log("[BOOT] after network init");

        console.log("[BOOT] before telemetry start");
        runtimeTelemetry.start();
        console.log("[BOOT] after telemetry start");

        console.log("[BOOT] before profiling start");
        runtimeProfiling.start();
        console.log("[BOOT] after profiling start");

        console.log("[BOOT] before adaptive start");
        runtimeAdaptive.start();
        console.log("[BOOT] after adaptive start");

        console.log("[BOOT] before authIntegrity start");
        authIntegrity.start();
        console.log("[BOOT] after authIntegrity start");

        console.log("[BOOT] before syncScheduler init");
        if (!syncScheduler.isInitialized()) {
          syncScheduler.init();
        }
        console.log("[BOOT] after syncScheduler init");

        console.log("[BOOT] before queueFlushScheduler init");
        this.initQueueFlushScheduler();
        console.log("[BOOT] after queueFlushScheduler init");

        console.log("[BOOT] set runtime tier NORMAL");
        store.setRuntimeTier("NORMAL", []);

        this.phase = "READY";
        this.bootFinished = true;
        console.log("[BOOT] app mounted/ready");
        console.timeEnd("runtime_boot");

        const { currentUser, online } = store;
        if (online && currentUser) {
          void authLifecycle.handleReconnect("boot");
        }

        return;
      } catch (err) {
        console.error("[BOOT] DEV Boot falló:", err);
        this.phase = "DEGRADED";
        store.setSafeMode(true);
        console.timeEnd("runtime_boot");
        throw err;
      }
    }

    this.phase = "BOOTSTRAPPING";
    const store = useRuntimeStore.getState();

    try {
      await safeModeEngine.registerBootAttempt();

      this.phase = "RECOVERING";

      await queueService.refreshQueueCounts();

      await authLifecycle.bootstrap();
      authLifecycle.initCoordination();
      authIntegrity.start();
      catalogService.syncCatalogos().catch(() => {});

      const recovered = await queueService.runCrashRecovery();
      if (recovered > 0) {
        console.log(`[Runtime] Crash recovery: ${recovered} movimiento(s) liberados de SYNCING`);
      }

      this.initQueueFlushScheduler();

      if (!swClientService.isInitialized()) {
        swClientService.init();
      }

      runtimeAdaptive.start();
      runtimeTelemetry.start();
      runtimeProfiling.markBootReady();
      runtimeProfiling.start();
      void pruneMetricsLog(true);

      if (!networkService.isInitialized()) {
        networkService.init();
      }

      const signals = collectPolicySignals(useRuntimeStore.getState());
      const bootPolicy = computeRenderPolicy(signals);
      useRuntimeStore.getState().setRuntimeTier(bootPolicy.tier, bootPolicy.reasons);
      networkService.applyPolicy(bootPolicy);

      if (!syncScheduler.isInitialized()) {
        syncScheduler.init();
      }

      void swClientService.registerBackgroundSync();

      const { runtimeTier } = useRuntimeStore.getState();
      this.phase = runtimeTier === "NORMAL" ? "READY" : "DEGRADED";

      await safeModeEngine.markSuccessfulBoot();
      await metricsService.logStartupCompleted();
      this.bootFinished = true;

      const { currentUser, online } = useRuntimeStore.getState();
      if (online && currentUser) {
        void authLifecycle.handleReconnect("boot");
      }
    } catch (err) {
      console.error("[Runtime] Boot falló:", err);
      this.phase = "DEGRADED";
      store.setSafeMode(true);
      throw err;
    }
  }

  private initQueueFlushScheduler(): void {
    const isDev = import.meta.env.DEV;
    if (this.queueFlushTimer) {
      const prevTimerId = this.queueFlushTimer;
      clearTimeout(this.queueFlushTimer);
      this.queueFlushTimer = null;
      if (isDev) {
        console.log(`[SCHEDULER] queue flush scheduler destroyed (ID: ${prevTimerId})`);
      }
    }

    const timerId = setTimeout(() => {
      this.queueFlushTimer = null;
      
      const tickStart = performance.now();
      if (isDev) {
        console.log("[SCHEDULER] queue flush scheduler tick start");
      }

      const storeState = useRuntimeStore.getState();
      if (!navigator.onLine) {
        if (isDev) {
          console.log("[SCHEDULER] queue flush scheduler tick: offline skip");
          console.log("[SCHEDULER] queue flush scheduler tick end");
          console.log(`[SCHEDULER] queue flush scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
        return;
      }
      if (storeState.syncing) {
        if (isDev) {
          console.log("[SCHEDULER] queue flush scheduler tick: syncInFlight skip");
          console.log("[SCHEDULER] queue flush scheduler tick end");
          console.log(`[SCHEDULER] queue flush scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
        return;
      }

      queueService.applyRetentionPolicy().catch(() => {});

      if (isDev) {
        console.log("[SCHEDULER] queue flush scheduler tick end");
        console.log(`[SCHEDULER] queue flush scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
      }
    }, 4000);
    this.queueFlushTimer = timerId;
    if (isDev) {
      console.log(`[SCHEDULER] queue flush scheduler created (ID: ${timerId})`);
    }
  }

  public cancelQueueFlush(): void {
    if (this.queueFlushTimer) {
      const prevTimerId = this.queueFlushTimer;
      clearTimeout(this.queueFlushTimer);
      this.queueFlushTimer = null;
      if (import.meta.env.DEV) {
        console.log(`[SCHEDULER] queue flush scheduler destroyed (ID: ${prevTimerId})`);
      }
    }
  }
}

export const runtimeLifecycle = new RuntimeLifecycle();
export default runtimeLifecycle;
