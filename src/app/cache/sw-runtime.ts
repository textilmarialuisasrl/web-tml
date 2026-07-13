import {
  CACHE_POLICY_VERSION,
  getManagedCacheNames,
  LEGACY_CACHE_NAMES,
  SW_TIMING,
} from "./cache.policy";
import { flushAllSwMetrics, postMetricsToClients } from "./sw-observability";

declare const self: ServiceWorkerGlobalScope;

let skipWaitingAllowedAt = 0;
let updateTimestamps: number[] = [];
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let clientsClaimed = false;

export function recordSwStartup(): void {
  void notifyClients({
    type: "SW_STARTUP",
    version: CACHE_POLICY_VERSION,
    at: Date.now(),
  });
}

export function canSkipWaitingNow(): boolean {
  return Date.now() >= skipWaitingAllowedAt;
}

export function registerSkipWaiting(): void {
  skipWaitingAllowedAt = Date.now() + SW_TIMING.skipWaitingCooldownMs;
}

export function recordUpdateAttempt(): boolean {
  const now = Date.now();
  updateTimestamps = updateTimestamps.filter(
    (t) => now - t < SW_TIMING.updateLoopWindowMs
  );
  updateTimestamps.push(now);
  return updateTimestamps.length <= SW_TIMING.maxUpdatesInWindow;
}

export async function purgeStaleCaches(): Promise<number> {
  const allow = new Set(getManagedCacheNames());
  const keys = await caches.keys();
  let removed = 0;

  for (const key of keys) {
    const isLegacy = (LEGACY_CACHE_NAMES as readonly string[]).includes(key);
    const isManaged = allow.has(key);
    const isPrecache = key.includes("precache");
    if (isLegacy || (!isManaged && !isPrecache)) {
      await caches.delete(key);
      removed += 1;
    }
  }

  if (removed > 0) {
    await notifyClients({
      type: "SW_CACHE_CLEANUP",
      removed,
      reason: "purge_stale",
      version: CACHE_POLICY_VERSION,
    });
  }
  return removed;
}

export async function runPeriodicCacheCleanup(): Promise<void> {
  const keys = await caches.keys();
  let totalEntries = 0;
  let totalBytes = 0;

  for (const name of keys) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    totalEntries += requests.length;
    for (const req of requests) {
      const res = await cache.match(req);
      if (res) {
        const blob = await res.clone().blob();
        totalBytes += blob.size;
      }
    }
  }

  const metrics = flushAllSwMetrics();
  metrics.push({
    metricName: "sw_cache_cleanup_count",
    value: keys.length,
    metadata: { totalEntries, totalBytes },
  });

  if (totalBytes > SW_TIMING.cacheSizeWarnBytes) {
    metrics.push({
      metricName: "sw_cache_size_warning",
      value: totalBytes,
      metadata: { threshold: SW_TIMING.cacheSizeWarnBytes, caches: keys.length },
    });
  }

  await postMetricsToClients(metrics);
}

export function startCleanupInterval(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    void runPeriodicCacheCleanup();
  }, SW_TIMING.cleanupIntervalMs);
}

export async function safeActivate(): Promise<void> {
  try {
    await purgeStaleCaches();
    startCleanupInterval();
    await runPeriodicCacheCleanup();
    recordSwStartup();
  } catch (err) {
    console.error("[SW] activate recovery:", err);
    await emergencyCacheReset();
  }
}

export async function emergencyCacheReset(): Promise<void> {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await notifyClients({
    type: "SW_EMERGENCY_RESET",
    version: CACHE_POLICY_VERSION,
  });
}

export async function claimClientsIfAllowed(force = false): Promise<void> {
  if (clientsClaimed && !force) return;
  await self.clients.claim();
  clientsClaimed = true;
}

export async function notifyClients(payload: Record<string, unknown>): Promise<void> {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(payload);
  }
}

/** Pide a todas las pestañas disparar sync (Dexie sigue siendo verdad). */
export async function broadcastSyncWakeup(reason: string): Promise<void> {
  await notifyClients({ type: "SW_SYNC_WAKEUP", reason, at: Date.now() });
}

/** Reintento diferido simple tras fallo de red en sync API. */
export function scheduleDeferredSyncWakeup(delayMs = 8000): void {
  setTimeout(() => {
    void broadcastSyncWakeup("deferred_retry");
  }, delayMs);
}

export async function handleInstallFailure(error: unknown): Promise<void> {
  console.error("[SW] install failed:", error);
  await emergencyCacheReset();
}
