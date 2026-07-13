import { useRuntimeStore } from "../runtime/runtime.store";
import { syncEngine } from "./sync-engine";
import { swClientService } from "../services/sw-client.service";

/**
 * Disparadores de sync por cola pendiente — reconnect/auth vía authLifecycle (8B.3).
 */
class SyncScheduler {
  private initialized = false;
  private unsubscribePending: (() => void) | null = null;
  private wakeupTimer: ReturnType<typeof setInterval> | null = null;

  public isInitialized(): boolean {
    return this.initialized;
  }

  public init(): void {
    if (this.initialized) return;
    const isDev = import.meta.env.DEV;
    
    if (isDev) {
      console.log("[SCHEDULER] sync scheduler created");
    }
    this.initialized = true;

    // 1. Sync Scheduler: Zustand Pending Subscription
    this.unsubscribePending = useRuntimeStore.subscribe(
      (s) => s.syncPending,
      (pending, prevPending) => {
        const start = performance.now();
        if (isDev) {
          console.log("[SCHEDULER] sync scheduler tick start");
        }

        const store = useRuntimeStore.getState();
        if (!navigator.onLine) {
          if (isDev) {
            console.log("[SCHEDULER] sync scheduler tick: offline skip");
            console.log("[SCHEDULER] sync scheduler tick end");
            console.log(`[SCHEDULER] sync scheduler duration: ${(performance.now() - start).toFixed(2)}ms`);
          }
          return;
        }
        if (store.syncing) {
          if (isDev) {
            console.log("[SCHEDULER] sync scheduler tick: syncInFlight skip");
            console.log("[SCHEDULER] sync scheduler tick end");
            console.log(`[SCHEDULER] sync scheduler duration: ${(performance.now() - start).toFixed(2)}ms`);
          }
          return;
        }
        if (store.authPhase !== "ONLINE_AUTH") {
          if (isDev) {
            console.log("[SCHEDULER] sync scheduler tick: authPhase skip");
            console.log("[SCHEDULER] sync scheduler tick end");
            console.log(`[SCHEDULER] sync scheduler duration: ${(performance.now() - start).toFixed(2)}ms`);
          }
          return;
        }

        if (pending > prevPending && pending > 0) {
          syncEngine.triggerSync({ force: true });
          void swClientService.registerBackgroundSync();
        } else if (pending > 0) {
          syncEngine.triggerSync();
        }

        if (isDev) {
          console.log("[SCHEDULER] sync scheduler tick end");
          console.log(`[SCHEDULER] sync scheduler duration: ${(performance.now() - start).toFixed(2)}ms`);
        }
      }
    );

    // 2. Wakeup Scheduler: Periodic retry sync wakeup loop
    const interval = isDev ? 60_000 : 5 * 60 * 1000;
    if (this.wakeupTimer) {
      clearInterval(this.wakeupTimer);
      this.wakeupTimer = null;
    }

    const timerId = setInterval(() => {
      if (this.initialized) {
        const tickStart = performance.now();
        if (isDev) {
          console.log("[SCHEDULER] wakeup scheduler tick start");
        }

        const store = useRuntimeStore.getState();
        if (!navigator.onLine) {
          if (isDev) {
            console.log("[SCHEDULER] wakeup scheduler tick: offline skip");
            console.log("[SCHEDULER] wakeup scheduler tick end");
            console.log(`[SCHEDULER] wakeup scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
          }
          return;
        }
        if (store.syncing) {
          if (isDev) {
            console.log("[SCHEDULER] wakeup scheduler tick: syncInFlight skip");
            console.log("[SCHEDULER] wakeup scheduler tick end");
            console.log(`[SCHEDULER] wakeup scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
          }
          return;
        }
        if (store.authPhase !== "ONLINE_AUTH") {
          if (isDev) {
            console.log("[SCHEDULER] wakeup scheduler tick: authPhase skip");
            console.log("[SCHEDULER] wakeup scheduler tick end");
            console.log(`[SCHEDULER] wakeup scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
          }
          return;
        }
        if (store.syncPending === 0) {
          if (isDev) {
            console.log("[SCHEDULER] wakeup scheduler tick: empty queue skip");
            console.log("[SCHEDULER] wakeup scheduler tick end");
            console.log(`[SCHEDULER] wakeup scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
          }
          return;
        }

        syncEngine.triggerSync();

        if (isDev) {
          console.log("[SCHEDULER] wakeup scheduler tick end");
          console.log(`[SCHEDULER] wakeup scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
      }
    }, interval);
    this.wakeupTimer = timerId;

    if (isDev) {
      console.log(`[SCHEDULER] wakeup scheduler created (ID: ${timerId})`);
    }
  }

  public destroy(): void {
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.log("[SCHEDULER] sync scheduler destroyed");
    }

    this.unsubscribePending?.();
    this.unsubscribePending = null;

    if (this.wakeupTimer) {
      const prevTimerId = this.wakeupTimer;
      clearInterval(this.wakeupTimer);
      this.wakeupTimer = null;
      if (isDev) {
        console.log(`[SCHEDULER] wakeup scheduler destroyed (ID: ${prevTimerId})`);
      }
    }

    this.initialized = false;
  }
}

export const syncScheduler = new SyncScheduler();
export default syncScheduler;
