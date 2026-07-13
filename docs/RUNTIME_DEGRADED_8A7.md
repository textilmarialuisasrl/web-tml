# Runtime degradado — Fase 8A.7

## Tiers

| Tier | Cuándo | Efecto principal |
|------|--------|------------------|
| `NORMAL` | Sin señales de estrés | Política completa |
| `DEGRADED` | Red lenta, offline, memoria, tab oculta, etc. | Menos batches, sin búsqueda timeline, métricas muestreadas |
| `SAFE_MODE` | `safeMode` o ≥3 crashes | Mínimo operativo, sync muy conservador |

Política dinámica: `src/app/render/render.policy.ts`  
Monitor: `src/app/runtime/runtime.adaptive.ts`

## Recovery (sin reinstalar PWA)

`src/app/services/recovery.service.ts`

- Reconectar / reintentar sync
- Reset parcial (Dexie intacto)
- Limpiar cache HTTP gestionado
- SW reload controlado
- Salir de modo seguro

UI: `src/app/components/runtime/DegradedScreen.tsx`

## Métricas

- `degraded_mode_entries`, `safe_mode_entries`
- `render_policy_switches`, `memory_adaptations`, `battery_adaptations`
- `recovery_actions`
