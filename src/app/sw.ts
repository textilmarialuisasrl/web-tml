/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import {
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from "workbox-strategies";
import {
  CACHE_BUCKETS,
  ROUTE_PATTERNS,
  SW_TIMING,
  pluginsForBucket,
} from "./cache/cache.policy";
import { SwObservabilityPlugin, trackSwPlugin } from "./cache/sw-observability";
import {
  broadcastSyncWakeup,
  canSkipWaitingNow,
  claimClientsIfAllowed,
  handleInstallFailure,
  purgeStaleCaches,
  recordUpdateAttempt,
  registerSkipWaiting,
  safeActivate,
  scheduleDeferredSyncWakeup,
} from "./cache/sw-runtime";

declare const self: ServiceWorkerGlobalScope;

function obs(label: string): SwObservabilityPlugin {
  const plugin = new SwObservabilityPlugin(label);
  trackSwPlugin(plugin);
  return plugin;
}

function withObs(bucketPlugins: ReturnType<typeof pluginsForBucket>, label: string) {
  return [...bucketPlugins, obs(label)];
}

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// --- API: sync crítica — network-first, timeout corto, cache acotada (solo GET 200) ---
registerRoute(
  ({ url, request }) =>
    ROUTE_PATTERNS.syncApi.test(url.pathname) && request.method === "GET",
  new NetworkFirst({
    cacheName: CACHE_BUCKETS.syncApi.cacheName,
    networkTimeoutSeconds: SW_TIMING.syncApiNetworkTimeoutSeconds,
    plugins: withObs(pluginsForBucket("syncApi"), "sync-api"),
  })
);

// Escrituras sync — sin cache HTTP; fallo de red → wakeup diferido
registerRoute(
  ({ url, request }) =>
    ROUTE_PATTERNS.syncApi.test(url.pathname) && request.method !== "GET",
  new NetworkOnly({
    plugins: [
      obs("sync-api-write"),
      {
        fetchDidFail: async () => {
          scheduleDeferredSyncWakeup();
        },
      },
    ],
  })
);

// --- Catálogos: stale-while-revalidate ---
registerRoute(
  ROUTE_PATTERNS.catalogs,
  new StaleWhileRevalidate({
    cacheName: CACHE_BUCKETS.catalogs.cacheName,
    plugins: withObs(pluginsForBucket("catalogs"), "catalogs"),
  })
);

// --- Datos operacionales: NO cachear (Dexie es verdad) ---
registerRoute(
  ({ url }) => ROUTE_PATTERNS.operationalApi.test(url.pathname),
  new NetworkOnly({ plugins: [obs("operational-api")] })
);

registerRoute(ROUTE_PATTERNS.auth, new NetworkOnly({ plugins: [obs("auth")] }));
registerRoute(ROUTE_PATTERNS.health, new NetworkOnly({ plugins: [obs("health")] }));
registerRoute(ROUTE_PATTERNS.system, new NetworkOnly({ plugins: [obs("system")] }));

// --- Assets estáticos same-origin (fuera de /api) ---
registerRoute(
  ({ request, url }) => {
    if (url.pathname.startsWith("/api")) return false;
    const dest = request.destination;
    return dest === "script" || dest === "style" || dest === "font" || dest === "document";
  },
  new CacheFirst({
    cacheName: CACHE_BUCKETS.staticAssets.cacheName,
    plugins: withObs(pluginsForBucket("staticAssets"), "static"),
  })
);

// --- Imágenes: cache limitada + LRU via ExpirationPlugin ---
registerRoute(
  ({ request, url }) =>
    request.destination === "image" || ROUTE_PATTERNS.images.test(url.pathname),
  new CacheFirst({
    cacheName: CACHE_BUCKETS.images.cacheName,
    plugins: withObs(pluginsForBucket("images"), "images"),
  })
);

registerRoute(
  ROUTE_PATTERNS.fonts,
  new CacheFirst({
    cacheName: CACHE_BUCKETS.fonts.cacheName,
    plugins: withObs(pluginsForBucket("fonts"), "fonts"),
  })
);

// --- Lifecycle: recovery seguro, sin skipWaiting agresivo ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await purgeStaleCaches();
      } catch (err) {
        await handleInstallFailure(err);
        throw err;
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await safeActivate();
      await claimClientsIfAllowed(true);
    })()
  );
});

self.addEventListener("sync", (event) => {
  const ev = event as any;
  if (ev.tag === "tml-sync-wakeup") {
    ev.waitUntil(broadcastSyncWakeup("background-sync"));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;

  switch (data.type) {
    case "SKIP_WAITING": {
      if (!canSkipWaitingNow()) {
        void event.source?.postMessage({
          type: "SKIP_WAITING_REJECTED",
          reason: "cooldown",
        });
        return;
      }
      if (!recordUpdateAttempt()) {
        void event.source?.postMessage({
          type: "SKIP_WAITING_REJECTED",
          reason: "update_loop_guard",
        });
        return;
      }
      registerSkipWaiting();
      void self.skipWaiting();
      break;
    }
    case "CLIENTS_CLAIM":
      void claimClientsIfAllowed(true);
      break;
    case "CLIENT_ONLINE":
      void broadcastSyncWakeup("client_online");
      break;
    case "REQUEST_SYNC_WAKEUP":
      void broadcastSyncWakeup(data.reason ?? "client_request");
      break;
    default:
      break;
  }
});
