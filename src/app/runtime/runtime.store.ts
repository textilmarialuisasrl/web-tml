import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { AuthPhase } from "../auth/auth.types";
import type { RuntimeTier } from "./runtime.tiers";
import type { RuntimeHealthLevel } from "../telemetry/runtime.health";

export type SessionMode = "ONLINE" | "OFFLINE";
export type NetworkQuality = "4g" | "3g" | "2g" | "slow-2g" | "offline";

export interface CurrentUser {
  id: string;
  nombre: string;
  email: string;
  permisos: string[];
  sessionVersion?: number;
  allowedTalleres?: string[];
}

export interface RuntimeState {
  online: boolean;
  syncing: boolean;
  syncPending: number;
  conflicts: number;
  failed: number;
  lastSyncAt?: string | null;
  sessionMode: SessionMode;
  batterySaver: boolean;
  safeMode: boolean;
  networkQuality: NetworkQuality;
  deviceId: string | null;
  currentUser: CurrentUser | null;
  crashesCount: number;
  runtimeTier: RuntimeTier;
  degradedReasons: string[];
  tabHidden: boolean;
  memoryPressureHigh: boolean;
  recoveryDismissed: boolean;
  healthLevel: RuntimeHealthLevel;
  healthReasons: string[];
  healthScore: number;
  authPhase: AuthPhase;
  isRefreshing: boolean;
  lastRefreshAt: string | null;
  lockedReason: string | null;
  reconnectRequired: boolean;

  // Actions
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setCounts: (counts: { syncPending: number; conflicts: number; failed: number }) => void;
  setLastSyncAt: (timestamp: string | null) => void;
  setSessionMode: (mode: SessionMode) => void;
  setBatterySaver: (enabled: boolean) => void;
  setSafeMode: (enabled: boolean) => void;
  setNetworkQuality: (quality: NetworkQuality) => void;
  setDeviceId: (id: string) => void;
  setCurrentUser: (user: CurrentUser | null) => void;
  incrementCrashes: () => number;
  resetCrashes: () => void;
  setRuntimeTier: (tier: RuntimeTier, reasons: string[]) => void;
  setTabHidden: (hidden: boolean) => void;
  setMemoryPressureHigh: (high: boolean) => void;
  setRecoveryDismissed: (dismissed: boolean) => void;
  setHealth: (level: RuntimeHealthLevel, reasons: string[], score: number) => void;
  setAuthPhase: (phase: AuthPhase, reason?: string) => void;
  setAuthRefreshing: (isRefreshing: boolean) => void;
  setLastRefreshAt: (iso: string | null) => void;
  setLockedReason: (reason: string | null) => void;
  setReconnectRequired: (required: boolean) => void;
}

export const useRuntimeStore = create<RuntimeState>()(
  subscribeWithSelector((set, get) => ({
  online: navigator.onLine,
  syncing: false,
  syncPending: 0,
  conflicts: 0,
  failed: 0,
  lastSyncAt: null,
  sessionMode: "ONLINE",
  batterySaver: false,
  safeMode: false,
  networkQuality: "4g",
  deviceId: null,
  currentUser: null,
  crashesCount: 0,
  runtimeTier: "NORMAL",
  degradedReasons: [],
  tabHidden: typeof document !== "undefined" ? document.hidden : false,
  memoryPressureHigh: false,
  recoveryDismissed: false,
  healthLevel: "NORMAL",
  healthReasons: [],
  healthScore: 100,
  authPhase: "REAUTH_REQUIRED",
  isRefreshing: false,
  lastRefreshAt: null,
  lockedReason: null,
  reconnectRequired: false,

  setOnline: (online) => {
    const mode: SessionMode = online ? "ONLINE" : "OFFLINE";
    set({ online, sessionMode: mode });
  },
  
  setSyncing: (syncing) => set({ syncing }),
  
  setCounts: (counts) => set({ 
    syncPending: counts.syncPending, 
    conflicts: counts.conflicts, 
    failed: counts.failed 
  }),
  
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  
  setSessionMode: (sessionMode) => set({ sessionMode }),
  
  setBatterySaver: (batterySaver) => set({ batterySaver }),
  
  setSafeMode: (safeMode) => set({ safeMode }),
  
  setNetworkQuality: (networkQuality) => {
    const isSlow = ["2g", "slow-2g"].includes(networkQuality);
    // Automatically trigger batterySaver mode if network quality is extremely low to preserve requests
    set({ 
      networkQuality, 
      batterySaver: isSlow ? true : get().batterySaver 
    });
  },
  
  setDeviceId: (deviceId) => set({ deviceId }),
  
  setCurrentUser: (currentUser) => set({ currentUser }),
  
  incrementCrashes: () => {
    const count = get().crashesCount + 1;
    set({ crashesCount: count });
    if (count >= 3) {
      set({ safeMode: true });
    }
    return count;
  },
  
  resetCrashes: () => set({ crashesCount: 0 }),

  setRuntimeTier: (runtimeTier, degradedReasons) => set({ runtimeTier, degradedReasons }),

  setTabHidden: (tabHidden) => set({ tabHidden }),

  setMemoryPressureHigh: (memoryPressureHigh) => set({ memoryPressureHigh }),

  setRecoveryDismissed: (recoveryDismissed) => set({ recoveryDismissed }),

  setHealth: (healthLevel, healthReasons, healthScore) =>
    set({ healthLevel, healthReasons, healthScore }),

  setAuthPhase: (authPhase, reason) =>
    set({
      authPhase,
      lockedReason:
        authPhase === "LOCKED_RUNTIME"
          ? reason ?? "locked"
          : authPhase === "ONLINE_AUTH"
            ? null
            : get().lockedReason,
      reconnectRequired:
        authPhase === "REAUTH_REQUIRED" ||
        authPhase === "SAFE_OFFLINE_RECOVERY" ||
        authPhase === "LOCKED_RUNTIME",
    }),

  setAuthRefreshing: (isRefreshing) => set({ isRefreshing }),

  setLastRefreshAt: (lastRefreshAt) => set({ lastRefreshAt }),

  setLockedReason: (lockedReason) => set({ lockedReason }),

  setReconnectRequired: (reconnectRequired) => set({ reconnectRequired }),
  }))
);
