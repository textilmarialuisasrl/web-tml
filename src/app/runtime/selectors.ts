import type { RuntimeState } from "./runtime.store";

/** Connectivity */
export const selectOnline = (s: RuntimeState) => s.online;
export const selectNetworkQuality = (s: RuntimeState) => s.networkQuality;
export const selectSessionMode = (s: RuntimeState) => s.sessionMode;

/** Sync counters (Dexie is source of truth; these are mirrors for UI) */
export const selectSyncPending = (s: RuntimeState) => s.syncPending;
export const selectSyncing = (s: RuntimeState) => s.syncing;
export const selectSyncConflicts = (s: RuntimeState) => s.conflicts;
export const selectSyncFailed = (s: RuntimeState) => s.failed;
export const selectLastSyncAt = (s: RuntimeState) => s.lastSyncAt;

/** Header status bar — single subscription instead of 4+ */
export const selectHeaderStatus = (s: RuntimeState) => ({
  online: s.online,
  syncing: s.syncing,
  pending: s.syncPending,
  safeMode: s.safeMode,
  runtimeTier: s.runtimeTier,
  healthLevel: s.healthLevel,
  authPhase: s.authPhase,
  lockedReason: s.lockedReason,
  reconnectRequired: s.reconnectRequired,
  conflicts: s.conflicts,
  failed: s.failed,
});

/** Resilience */
export const selectSafeMode = (s: RuntimeState) => s.safeMode;
export const selectBatterySaver = (s: RuntimeState) => s.batterySaver;

/** Dashboard metrics */
export const selectDashboardMetrics = (s: RuntimeState) => ({
  syncPending: s.syncPending,
  conflicts: s.conflicts,
  failed: s.failed,
  networkQuality: s.networkQuality,
});
