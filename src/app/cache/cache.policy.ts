import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import type { WorkboxPlugin } from "workbox-core";

/**
 * Versión de política de cache — bump invalida buckets legacy en activate.
 * NO hardcodear TTL/límites fuera de este archivo.
 */
export const CACHE_POLICY_VERSION = 2;

export const CACHE_NAMES = {
  catalogs: `tml-catalogs-v${CACHE_POLICY_VERSION}`,
  syncApi: `tml-sync-api-v${CACHE_POLICY_VERSION}`,
  staticAssets: `tml-static-v${CACHE_POLICY_VERSION}`,
  images: `tml-images-v${CACHE_POLICY_VERSION}`,
  fonts: `tml-fonts-v${CACHE_POLICY_VERSION}`,
} as const;

/** Nombres de caches pre-8A.6 a eliminar en activate. */
export const LEGACY_CACHE_NAMES = [
  "master-catalogs-cache",
  "api-dynamic-cache",
  "images-cache",
  "google-fonts",
  "workbox-precache-v1",
  "workbox-precache-v2",
] as const;

export type CacheBucketId = keyof typeof CACHE_NAMES;

export interface CacheBucketPolicy {
  id: CacheBucketId;
  cacheName: string;
  maxEntries: number;
  maxAgeSeconds: number;
  priority: "critical" | "high" | "normal" | "low";
}

export const CACHE_BUCKETS: Record<CacheBucketId, CacheBucketPolicy> = {
  catalogs: {
    id: "catalogs",
    cacheName: CACHE_NAMES.catalogs,
    maxEntries: 12,
    maxAgeSeconds: 7 * 24 * 60 * 60,
    priority: "high",
  },
  syncApi: {
    id: "syncApi",
    cacheName: CACHE_NAMES.syncApi,
    maxEntries: 16,
    maxAgeSeconds: 5 * 60,
    priority: "critical",
  },
  staticAssets: {
    id: "staticAssets",
    cacheName: CACHE_NAMES.staticAssets,
    maxEntries: 80,
    maxAgeSeconds: 30 * 24 * 60 * 60,
    priority: "normal",
  },
  images: {
    id: "images",
    cacheName: CACHE_NAMES.images,
    maxEntries: 48,
    maxAgeSeconds: 14 * 24 * 60 * 60,
    priority: "low",
  },
  fonts: {
    id: "fonts",
    cacheName: CACHE_NAMES.fonts,
    maxEntries: 8,
    maxAgeSeconds: 365 * 24 * 60 * 60,
    priority: "low",
  },
};

export const SW_TIMING = {
  syncApiNetworkTimeoutSeconds: 2,
  cleanupIntervalMs: 6 * 60 * 60 * 1000,
  skipWaitingCooldownMs: 30 * 60 * 1000,
  updateLoopWindowMs: 10 * 60 * 1000,
  maxUpdatesInWindow: 3,
  cacheSizeWarnBytes: 40 * 1024 * 1024,
} as const;

export const ROUTE_PATTERNS = {
  syncApi: /^\/api\/sync\//,
  catalogs: /^\/api\/catalogos/,
  auth: /^\/api\/auth/,
  operationalApi:
    /^\/api\/(movements|movimientos|stocks|stock|dashboard|documents)(\/|$)/,
  health: /^\/api\/health/,
  system: /^\/api\/system\//,
  images: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
  fonts: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
} as const;

export function getManagedCacheNames(): string[] {
  return Object.values(CACHE_NAMES);
}

export function createExpirationPlugins(bucket: CacheBucketPolicy): WorkboxPlugin[] {
  return [
    new ExpirationPlugin({
      maxEntries: bucket.maxEntries,
      maxAgeSeconds: bucket.maxAgeSeconds,
      purgeOnQuotaError: true,
    }),
    cacheableOkOnly(),
  ];
}

export function cacheableOkOnly(): CacheableResponsePlugin {
  return new CacheableResponsePlugin({ statuses: [200] });
}

/** Plugins compartidos por bucket (observabilidad se añade en sw.ts). */
export function pluginsForBucket(bucketId: CacheBucketId): WorkboxPlugin[] {
  return createExpirationPlugins(CACHE_BUCKETS[bucketId]);
}
