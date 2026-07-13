# Runtime telemetry — Fase 8A.8 / 8A.9 parcial

## Principios

- Local-first (Dexie `metricsLog`)
- Caps: 450 entradas, 10 días TTL, purga cada 20 writes
- Sampling según `render.policy` (excepto métricas críticas)
- Sin dashboards ni librerías de charts

## Health score interno

`NORMAL` | `WARNING` | `CRITICAL` — en `runtime.store` (`healthLevel`, `healthScore`, `healthReasons`).

Ciclo cada 60s + tras eventos graves. Visible en header y `/app/diag`.

## Auto-recovery

`telemetry/runtime.auto-recovery.ts` — si umbrales de long tasks, render storms, memoria, FPS o sync loop:

- `disposeAllRuntimeCleanups()`
- `batterySaver` on
- `runtimeAdaptive.recompute` + `trimTimelinePressure`
- métrica `auto_runtime_recovery` (cooldown 3 min)

## Long tasks

`PerformanceObserver` → `long_task_ms`, `ui_freeze_ms` si duration ≥ 200ms.

## Panel diagnóstico

Ruta interna: `/app/diag` — texto operacional, sin gráficos.

## Limpieza listeners

- `network.service`: handlers bound + `removeEventListener` simétrico
- `sw-client.service`: refs guardadas + `destroy()`
- `IncrementalTimeline`: `registerRuntimeCleanup` para IO y store subscribe
