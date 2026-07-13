import { CACHE_NAMES, getManagedCacheNames } from "../cache/cache.policy";
import { metricsService } from "./metrics.service";
import { swClientService } from "./sw-client.service";
import { queueService } from "../offline/queue.service";
import { networkService } from "../network/network.service";
import { syncEngine } from "../sync/sync-engine";
import { safeModeEngine } from "../runtime/safe-mode";
import { useRuntimeStore } from "../runtime/runtime.store";
import { runtimeAdaptive } from "../runtime/runtime.adaptive";

export type RecoveryAction =
  | "reconnect"
  | "retry_sync"
  | "reset_partial"
  | "clear_http_cache"
  | "sw_controlled_reload"
  | "exit_safe_mode"
  | "continue_degraded";

async function trackRecovery(action: RecoveryAction, ok: boolean, detail?: string) {
  await metricsService.trackMetric("recovery_actions", 1, {
    action,
    ok,
    detail: detail ?? null,
  });
}

export async function reconnect(): Promise<boolean> {
  try {
    const ok = await networkService.triggerManualPing();
    if (ok) {
      swClientService.requestSyncWakeup("recovery_reconnect");
    }
    await trackRecovery("reconnect", ok);
    return ok;
  } catch (e) {
    await trackRecovery("reconnect", false, String(e));
    return false;
  }
}

export async function retryFailedSync(): Promise<void> {
  syncEngine.triggerSync();
  await trackRecovery("retry_sync", true);
}

/** Dexie intacto: crash recovery + contadores + tier recompute. */
export async function resetRuntimePartial(): Promise<void> {
  try {
    await queueService.runCrashRecovery();
    await queueService.refreshQueueCounts();
    runtimeAdaptive.recompute("partial_reset");
    useRuntimeStore.getState().setRecoveryDismissed(false);
    await trackRecovery("reset_partial", true);
  } catch (e) {
    await trackRecovery("reset_partial", false, String(e));
    throw e;
  }
}

/** Solo caches HTTP gestionados — NO toca IndexedDB operacional. */
export async function clearHttpCacheSafe(): Promise<number> {
  let removed = 0;
  if (!("caches" in window)) {
    await trackRecovery("clear_http_cache", false, "no_caches_api");
    return 0;
  }
  const managed = new Set(getManagedCacheNames());
  const keys = await caches.keys();
  for (const key of keys) {
    if (managed.has(key) || Object.values(CACHE_NAMES).includes(key as (typeof CACHE_NAMES)[keyof typeof CACHE_NAMES])) {
      await caches.delete(key);
      removed += 1;
    }
  }
  await trackRecovery("clear_http_cache", true, `removed:${removed}`);
  return removed;
}

export async function controlledSwReload(): Promise<void> {
  try {
    if (swClientService.hasPendingRefresh()) {
      swClientService.applyPendingUpdate(true);
    } else {
      window.location.reload();
    }
    await trackRecovery("sw_controlled_reload", true);
  } catch (e) {
    await trackRecovery("sw_controlled_reload", false, String(e));
  }
}

export async function exitSafeMode(): Promise<void> {
  await safeModeEngine.deactivateSafeMode();
  useRuntimeStore.getState().setBatterySaver(false);
  useRuntimeStore.getState().setMemoryPressureHigh(false);
  runtimeAdaptive.recompute("exit_safe_mode");
  await trackRecovery("exit_safe_mode", true);
}

export function continueInDegradedMode(): void {
  useRuntimeStore.getState().setRecoveryDismissed(true);
  void trackRecovery("continue_degraded", true);
}
