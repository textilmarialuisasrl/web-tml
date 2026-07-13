# Timeline — índices Dexie y límites (Fase 8A.5)

## Índices existentes (`movementsQueue`)

```
++id, clientGeneratedId, syncStatus, payloadHash, priority, offlineCreatedAt,
[syncStatus+offlineCreatedAt], [syncStatus+priority+offlineCreatedAt]
```

## Rutas de consulta (sin scan global)

| Filtro | Query | Índice usado |
|--------|--------|----------------|
| `ALL` | `orderBy('offlineCreatedAt').reverse().offset(n).limit(m)` | `offlineCreatedAt` |
| Estado concreto | `where('[syncStatus+offlineCreatedAt]').between(...).reverse().offset(n).limit(m)` | compuesto |
| `PENDING` (UI) | Dos consultas acotadas: `PENDING` + `RETRY_SCHEDULED`, merge sort, slice | compuesto + límite |

## Búsqueda de texto

No hay índice full-text. La búsqueda:

- Está **deshabilitada** en `safeMode` / `batterySaver`.
- En modo normal escanea como máximo `SEARCH_SCAN_CAP` filas recientes (por índice `offlineCreatedAt`), nunca el dataset completo.
- Documentado como degradación controlada; para búsqueda global futura: índice dedicado o sync server-side.

## Hot paths evitados

- `collection.toArray()` sin `.limit()` en timeline.
- `filter()` / `sort()` sobre miles de filas cargadas.
- `useLiveQuery` re-ejecutando query completa en cada scroll.

## Posible mejora futura (no 8A.5)

- Tab/vista unificada `PENDING` + `RETRY_SCHEDULED` vía índice compuesto dedicado si el volumen por estado crece mucho.
