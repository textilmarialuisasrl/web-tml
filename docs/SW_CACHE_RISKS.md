# Service Worker — riesgos y decisiones (Fase 8A.6)

Documento vivo. Política centralizada en `src/app/cache/cache.policy.ts`.

## Riesgos corregidos en 8A.6

| Riesgo | Antes | Ahora |
|--------|--------|--------|
| **Doble cache operacional** | `NetworkFirst` en `/api/movements`, `/api/stocks`, `/api/movimientos` con `api-dynamic-cache` (100 entradas) | `NetworkOnly` — Dexie + cola offline son la única verdad operativa |
| **Cache infinita / larga en API dinámica** | 24h + 100 entradas en movimientos/stock | Eliminado; solo `syncApi` acotado (16 entradas, 5 min) para GET bajo `/api/sync/` |
| **Updates agresivos** | `registerType: "autoUpdate"` + `skipWaiting` inmediato vía mensaje sin guardas | `prompt` + `SKIP_WAITING` con cooldown 30 min y tope 3 updates / 10 min |
| **Políticas dispersas** | TTL y nombres hardcodeados en `sw.ts` | `cache.policy.ts` único origen |
| **Caches legacy huérfanas** | `master-catalogs-cache`, `images-cache`, etc. | Purga en `install`/`activate` vía `LEGACY_CACHE_NAMES` |

## Riesgos residuales (conocidos)

### 1. Catálogos: HTTP cache + Dexie

- **Ruta:** `/api/catalogos` → `StaleWhileRevalidate` + tabla `catalogos` en Dexie.
- **Riesgo:** datos HTTP stale mientras Dexie ya tiene versión nueva (o al revés).
- **Mitigación:** `catalogService` persiste en Dexie; la UI operativa debe leer Dexie, no la respuesta HTTP cacheada. El SW solo acelera cold start.

### 2. Precache vs runtime `images`

- Assets en build van a precache Workbox; imágenes `/images/*` también matchean `CacheFirst` runtime.
- **Riesgo:** posible doble almacenamiento del mismo URL en precache + `tml-images-v2`.
- **Mitigación:** `ExpirationPlugin` en bucket imágenes; precache limitado por manifest Vite. Monitorear `sw_cache_size_warning`.

### 3. POST `/api/sync/movimientos` no es cacheable

- Workbox no cachea POST por defecto; la ruta usa `NetworkOnly`.
- **Riesgo:** ninguno de cache HTTP; fallos dependen de cola Dexie (correcto).
- **Mitigación:** `fetchDidFail` → `scheduleDeferredSyncWakeup` + `syncScheduler` en cliente.

### 4. Race install / activate

- Nueva versión queda en `waiting` hasta `applyPendingUpdate()`.
- **Riesgo:** dos SW activos brevemente si el usuario fuerza reload durante update.
- **Mitigación:** no `skipWaiting` automático; `clients.claim` solo en `activate` controlado.

### 5. Background Sync API

- Tag `tml-sync-wakeup` — soporte limitado (Chrome/Android).
- **Fallback:** `online`, `visibilitychange`, `CLIENT_ONLINE`, `REQUEST_SYNC_WAKEUP`.

### 6. Hit ratio aproximado

- `fetchDidSucceed` cuenta respuestas de red; `cachedResponseWillBeUsed` cuenta hits.
- En `StaleWhileRevalidate` puede haber ambos en ciclos distintos — ratio orientativo, no exacto contable.

### 7. Auth JWT en IndexedDB (8B)

- SW no toca tokens; `/api/auth` es `NetworkOnly`.
- Ver `docs/RUNTIME_AUTH_DEBT.md`.

## Comportamiento determinístico

| Recurso | Estrategia | Cache | TTL / límite |
|---------|------------|-------|----------------|
| `/api/sync/*` GET | NetworkFirst | `tml-sync-api-v2` | 2s timeout, 16 / 5 min |
| `/api/sync/*` write | NetworkOnly | — | wakeup diferido 8s |
| `/api/catalogos` | SWR | `tml-catalogs-v2` | 12 / 7 días |
| `/api/auth`, health, system, operational | NetworkOnly | — | — |
| JS/CSS/document (no API) | CacheFirst | `tml-static-v2` | 80 / 30 días |
| Imágenes | CacheFirst | `tml-images-v2` | 48 / 14 días |
| Fuentes Google | CacheFirst | `tml-fonts-v2` | 8 / 1 año |

## Observabilidad

Métricas Dexie vía `sw-client.service` → `metricsLog`:

- `sw_startup`, `sw_registered`, `sw_cache_hit_ratio`, `sw_failed_fetches`
- `sw_cache_cleanup_count`, `sw_cache_size_warning`
- `sw_sync_wakeup`, `sw_skip_waiting_rejected`, `sw_emergency_reset`

Retención `metricsLog`: `METRICS_LOG_MAX_ENTRIES` / `METRICS_LOG_MAX_AGE_MS` en `cache.policy.ts`.

## Recovery

1. Fallo en `install` → `emergencyCacheReset()` (borra todos los `caches`).
2. Fallo en `activate` → mismo reset.
3. `SW_EMERGENCY_RESET` notifica al cliente para métrica.

## API del cliente

```typescript
swClientService.applyPendingUpdate(); // solo con confirmación UI
swClientService.requestSyncWakeup("manual");
```
