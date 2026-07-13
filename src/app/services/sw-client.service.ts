import { registerSW } from "virtual:pwa-register";
import { metricsService } from "./metrics.service";
import { authLifecycle } from "../auth/auth.lifecycle";
import { runtimeLifecycle } from "../runtime/runtime.lifecycle";
import { CACHE_POLICY_VERSION } from "../cache/cache.policy";
import { pruneMetricsLog } from "../telemetry/telemetry.retention";

type SwMessage =
  | { type: "SW_METRICS_BATCH"; batch: { metricName: string; value: number; metadata?: Record<string, unknown> }[] }
  | { type: "SW_STARTUP"; version: number; at: number }
  | { type: "SW_SYNC_WAKEUP"; reason: string; at: number }
  | { type: "SW_CACHE_CLEANUP"; removed: number; reason: string; version: number }
  | { type: "SW_EMERGENCY_RESET"; version: number }
  | { type: "SKIP_WAITING_REJECTED"; reason: string };

/**
 * Puente cliente ↔ SW: updates controlados, métricas a Dexie, wakeup de sync.
 */
class SwClientService {
  private initialized = false;
  private updateSW: ((reloadPage?: boolean) => void) | null = null;
  private pendingRefresh = false;
  private readonly onSwMessage = (ev: MessageEvent) => {
    void this.handleSwMessage(ev.data as SwMessage);
  };
  private readonly onWindowOnline = () => this.notifySwOnline();

  public isInitialized(): boolean {
    return this.initialized;
  }

  public init(): void {
    if (this.initialized || typeof window === "undefined") return;
    if (import.meta.env.DEV) {
      console.log("⚡ [SwClientService] Service Worker desactivado en desarrollo.");
      this.initialized = true;
      return;
    }
    this.initialized = true;

    if (!("serviceWorker" in navigator)) {
      void metricsService.trackMetric("sw_unsupported", 1);
      return;
    }

    this.updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        void metricsService.trackMetric("sw_registered", 1, {
          scope: registration?.scope,
          policyVersion: CACHE_POLICY_VERSION,
        });
      },
      onRegisterError(error) {
        void metricsService.trackMetric("sw_register_error", 1, {
          message: error instanceof Error ? error.message : String(error),
        });
      },
      onNeedRefresh: () => {
        this.pendingRefresh = true;
        void metricsService.trackMetric("sw_update_available", 1, {
          policyVersion: CACHE_POLICY_VERSION,
        });
      },
      onOfflineReady() {
        void metricsService.trackMetric("sw_offline_ready", 1);
      },
    });

    navigator.serviceWorker.addEventListener("message", this.onSwMessage);
    window.addEventListener("online", this.onWindowOnline);
    void pruneMetricsLog(true);
  }

  public destroy(): void {
    navigator.serviceWorker.removeEventListener("message", this.onSwMessage);
    window.removeEventListener("online", this.onWindowOnline);
    this.initialized = false;
  }

  /** Aplica update solo con confirmación explícita (no rompe sesión activa). */
  public applyPendingUpdate(reload = true): void {
    if (!this.updateSW) return;
    const reg = navigator.serviceWorker.controller?.scriptURL;
    void metricsService.trackMetric("sw_update_apply_requested", 1, { reg });

    navigator.serviceWorker.ready.then((registration) => {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      this.pendingRefresh = true;
      if (reload) {
        this.updateSW?.(true);
      }
    });
  }

  public hasPendingRefresh(): boolean {
    return this.pendingRefresh;
  }

  public requestSyncWakeup(reason = "client_request"): void {
    if (import.meta.env.DEV) {
      if (runtimeLifecycle.isReady()) {
        void authLifecycle.handleReconnect("client_request");
      }
      return;
    }
    void navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: "REQUEST_SYNC_WAKEUP", reason });
    });
    if (runtimeLifecycle.isReady()) {
      void authLifecycle.handleReconnect("client_request");
    }
  }

  public async registerBackgroundSync(): Promise<void> {
    if (import.meta.env.DEV) return;
    const reg = await navigator.serviceWorker.ready;
    const syncReg = reg as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (syncReg.sync) {
      try {
        await syncReg.sync.register("tml-sync-wakeup");
      } catch {
        // Background Sync no disponible — wakeup vía online/visibility basta
      }
    }
  }

  private notifySwOnline(): void {
    if (import.meta.env.DEV) return;
    void navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: "CLIENT_ONLINE" });
    });
  }

  private async handleSwMessage(data: SwMessage): Promise<void> {
    if (!data?.type) return;

    switch (data.type) {
      case "SW_METRICS_BATCH":
        for (const m of data.batch) {
          await metricsService.trackMetric(m.metricName, m.value, m.metadata);
        }
        break;
      case "SW_STARTUP":
        await metricsService.trackMetric("sw_startup", 1, {
          version: data.version,
          at: data.at,
        });
        break;
      case "SW_SYNC_WAKEUP":
        await metricsService.trackMetric("sw_sync_wakeup", 1, { reason: data.reason });
        if (runtimeLifecycle.isReady()) {
          void authLifecycle.handleReconnect("sw_wakeup");
        }
        break;
      case "SW_CACHE_CLEANUP":
        await metricsService.trackMetric("sw_cache_cleanup_count", data.removed, {
          reason: data.reason,
          version: data.version,
        });
        break;
      case "SW_EMERGENCY_RESET":
        await metricsService.trackMetric("sw_emergency_reset", 1, { version: data.version });
        break;
      case "SKIP_WAITING_REJECTED":
        await metricsService.trackMetric("sw_skip_waiting_rejected", 1, { reason: data.reason });
        break;
      default:
        break;
    }
  }

}

export const swClientService = new SwClientService();
export default swClientService;
