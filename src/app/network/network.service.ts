import { authLifecycle } from "../auth/auth.lifecycle";
import type { RenderPolicySnapshot } from "../render/render.policy";
import { metricsService } from "../services/metrics.service";
import { useRuntimeStore, type NetworkQuality } from "../runtime/runtime.store";

type NetworkConnection = {
  effectiveType?: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

class NetworkService {
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isListening = false;
  private pingIntervalMs = 30_000;
  private healthTimeoutMs = 4000;
  private readonly boundOnline = () => this.handleOnlineStatus();
  private readonly boundOffline = () => this.handleOfflineStatus();
  private connChangeHandler: (() => void) | null = null;
  private connection: NetworkConnection | null = null;
  public lastSuccessfulPing: string | null = null;

  public isInitialized(): boolean {
    return this.isListening;
  }

  public init() {
    if (this.isListening) return;
    this.isListening = true;

    window.addEventListener("online", this.boundOnline);
    window.addEventListener("offline", this.boundOffline);

    this.assessNetworkQuality();

    const nav = navigator as Navigator & {
      connection?: NetworkConnection;
      mozConnection?: NetworkConnection;
      webkitConnection?: NetworkConnection;
    };
    this.connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
    if (this.connection) {
      this.connChangeHandler = () => {
        void this.assessNetworkQuality();
      };
      this.connection.addEventListener("change", this.connChangeHandler);
    }

    this.startAdaptivePing();
  }

  public applyPolicy(policy: RenderPolicySnapshot): void {
    const prevInterval = this.pingIntervalMs;
    const prevTimeout = this.healthTimeoutMs;

    this.pingIntervalMs = policy.network.pingIntervalMs;
    this.healthTimeoutMs = policy.network.healthTimeoutMs;

    if (this.isListening && (prevInterval !== this.pingIntervalMs || prevTimeout !== this.healthTimeoutMs)) {
      this.restartPing();
    }
  }

  public destroy() {
    window.removeEventListener("online", this.boundOnline);
    window.removeEventListener("offline", this.boundOffline);
    if (this.connection && this.connChangeHandler) {
      this.connection.removeEventListener("change", this.connChangeHandler);
    }
    this.connChangeHandler = null;
    this.connection = null;
    if (this.pingInterval) {
      const prevTimerId = this.pingInterval;
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      if (import.meta.env.DEV) {
        console.log(`[SCHEDULER] polling scheduler destroyed (ID: ${prevTimerId})`);
      }
    }
    this.isListening = false;
  }

  private handleOnlineStatus() {
    const store = useRuntimeStore.getState();
    store.setOnline(true);
    void this.assessNetworkQuality();
    void this.triggerManualPing();
    if (store.currentUser) {
      void authLifecycle.handleReconnect("network_online");
    }
  }

  private handleOfflineStatus() {
    useRuntimeStore.getState().setOnline(false);
    useRuntimeStore.getState().setNetworkQuality("offline");
    if (useRuntimeStore.getState().currentUser) {
      authLifecycle.transitionPhase("OFFLINE_SESSION", "net_offline");
    }
  }

  public async assessNetworkQuality(): Promise<NetworkQuality> {
    const store = useRuntimeStore.getState();
    if (!navigator.onLine) {
      store.setNetworkQuality("offline");
      return "offline";
    }

    if (this.connection?.effectiveType) {
      const type = this.connection.effectiveType;
      const prev = store.networkQuality;
      store.setNetworkQuality(type as NetworkQuality);
      if (["2g", "slow-2g"].includes(type) && !store.batterySaver) {
        store.setBatterySaver(true);
        void metricsService.trackMetric("battery_adaptations", 1, {
          reason: "network_quality",
          quality: type,
        });
      }
      if (prev !== type) {
        void metricsService.trackMetric("network_quality_change", 1, { from: prev, to: type });
      }
      return type as NetworkQuality;
    }

    try {
      const start = Date.now();
      const res = await fetch("/api/health", { method: "HEAD", cache: "no-store" });
      const latency = Date.now() - start;

      if (res.ok) {
        let quality: NetworkQuality = "4g";
        if (latency > 1500) quality = "slow-2g";
        else if (latency > 800) quality = "2g";
        else if (latency > 350) quality = "3g";
        store.setNetworkQuality(quality);
        return quality;
      }
    } catch {
      store.setOnline(false);
      store.setNetworkQuality("offline");
      return "offline";
    }

    return "4g";
  }

  private startAdaptivePing() {
    this.restartPing();
  }

  private restartPing(): void {
    const isDev = import.meta.env.DEV;
    if (this.pingInterval) {
      const prevTimerId = this.pingInterval;
      clearInterval(this.pingInterval);
      if (isDev) {
        console.log(`[SCHEDULER] polling scheduler destroyed (ID: ${prevTimerId})`);
      }
    }
    const timerId = setInterval(async () => {
      const tickStart = performance.now();
      if (isDev) {
        console.log("[SCHEDULER] polling scheduler tick start");
      }

      const store = useRuntimeStore.getState();
      if (document.hidden && store.runtimeTier !== "NORMAL") {
        if (isDev) {
          console.log("[SCHEDULER] polling scheduler tick: hidden skip");
          console.log("[SCHEDULER] polling scheduler tick end");
          console.log(`[SCHEDULER] polling scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
        return;
      }

      // Skip polling if offline
      if (!navigator.onLine) {
        if (isDev) {
          console.log("[SCHEDULER] polling scheduler tick: offline skip");
          console.log("[SCHEDULER] polling scheduler tick end");
          console.log(`[SCHEDULER] polling scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
        return;
      }

      const tCpuTotal = performance.now() - tickStart;

      if (store.online) {
        await this.triggerManualPing();
      }

      if (isDev) {
        const tPost = performance.now();
        console.log("[SCHEDULER] polling scheduler tick end");
        console.log(`[SCHEDULER] polling scheduler duration: ${(tCpuTotal + (performance.now() - tPost)).toFixed(2)}ms`);
      }
    }, this.pingIntervalMs);
    this.pingInterval = timerId;
    if (isDev) {
      console.log(`[SCHEDULER] polling scheduler created (ID: ${timerId})`);
    }
  }

  public async triggerManualPing(): Promise<boolean> {
    const store = useRuntimeStore.getState();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.healthTimeoutMs);

      const res = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        if (!store.online) {
          store.setOnline(true);
        }
        this.lastSuccessfulPing = new Date().toISOString();
        return true;
      }
    } catch {
      if (store.online) {
        store.setOnline(false);
        store.setNetworkQuality("offline");
      }
      return false;
    }
    return false;
  }
}

export const networkService = new NetworkService();
export default networkService;
