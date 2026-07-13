# Pre-QA Audit — Runtime 8B (sign-off readiness)

**Fecha auditoría:** 2026-05-22  
**Alcance:** código actual post PR chaos/profiling — sin E1–E5 ejecutados aún en dispositivo.  
**Regla:** fixes quirúrgicos documentados abajo; validación de campo confirma o refuta riesgos residuales.

---

## Veredicto

# READY FOR OPERATIONAL VALIDATION

Condiciones:
- Ejecutar E1→E5 según [`RUNTIME_8B_VALIDATION_EXECUTION.md`](RUNTIME_8B_VALIDATION_EXECUTION.md).
- Registrar hallazgos en [`validation-results/ISSUES-LOG.md`](validation-results/ISSUES-LOG.md).
- **No iniciar 8C** hasta `SIGNOFF-ROLLUP.md` aprobado.
- Re-validar soak (E3) tras fix **VAL-PRE-001** (auto-recovery vs cleanup registry).

---

## Fix quirúrgico aplicado (pre-QA)

### VAL-PRE-001 — Auto-recovery destruía subsistemas vivos

| Campo | Detalle |
|-------|---------|
| **Causa** | `evaluateAutoRecovery()` llamaba `disposeAllRuntimeCleanups()` que incluía `network.destroy`, `sw-client.destroy`, `authIntegrity.stop`, `telemetry.stop`, auth visibility/BC unsubscribe. |
| **Impacto** | Tras recovery automático: sin listeners online/offline, sin heartbeat integrity, sin health cycle — reconnect roto hasta reload. **Crítico para soak E3.** |
| **Repro** | Forzar health CRITICAL o sync_loop → auto_runtime_recovery → intentar sync/reconnect. |
| **Fix** | Subsistemas **ya no** se registran en cleanup registry. Solo cleanups efímeros (timeline IO, IntersectionObserver, sync retry timer cancel). `disposeRuntimeSubsystems()` para teardown completo. |
| **Riesgo residual** | `runtime.adaptive` store subscribe no se limpia en auto-recovery (correcto — debe persistir). |

### VAL-PRE-002 — `runtime.adaptive` Zustand subscribe leak

| Campo | Detalle |
|-------|---------|
| **Causa** | `useRuntimeStore.subscribe` en `start()` sin `unsub` en `stop()`. |
| **Impacto** | Creep de listeners en HMR / dispose parcial. |
| **Fix** | `storeUnsub` + `stop()` limpia; `disposeRuntimeSubsystems` llama `runtimeAdaptive.stop()`. |

### VAL-PRE-003 — `auth.lifecycle.teardownCoordination()`

| Campo | Detalle |
|-------|---------|
| **Fix** | Método explícito para dispose tests (visibility + BC unsub), no invocado por auto-recovery. |

---

## 1. Runtime cleanup

| Componente | Registro | Dispose | Auto-recovery | Estado |
|------------|----------|---------|---------------|--------|
| `network.service` | `init()` once | `destroy()` vía dispose only | No toca | OK |
| `sw-client.service` | `init()` once | `destroy()` dispose only | No toca | OK |
| `runtime.telemetry` | `start()` | `stop()` dispose only | No toca | OK |
| `auth.integrity` | `setInterval` heartbeat | `stop()` dispose only | No toca | OK |
| `auth.lifecycle` | visibility + BC | `teardownCoordination()` dispose | No toca | OK |
| `runtime.profiling` | `setInterval` 5m | `stop()` dispose only | No toca | OK |
| `runtime.adaptive` | visibility + memory + store sub | `stop()` dispose only | No toca | OK |
| `sync-engine` retry timer | cleanup registry | `cancelScheduledSync` | Puede cancelar retry programado | Aceptable |
| `IncrementalTimeline` | IO + IntersectionObserver | unmount + cleanup registry | Sí — esperado | OK |
| `DiagnosticsPanel` | interval 15s | React unmount | N/A | OK |
| `chaos.runtime` flapping | setInterval | `stopAllChaosTimers` | No registry | OK |
| `auth.broadcast` | BC + storage | Sin close (app lifetime) | N/A | Riesgo bajo |

**HMR / post-resume:** `runtimeLifecycle.bootFinished` evita doble boot; `initCoordination` guard `coordinationReady`. Tras kill Android process → full reload (OK).

---

## 2. Auth lifecycle

| Área | Estado | Notas |
|------|--------|-------|
| Single-flight refresh | OK | `refreshInFlight` + LS lock + BC |
| Reconnect debounce 2.5s | OK | `handleReconnect` |
| Cooldowns / retry budget | OK | 30s / 5s reconnect / 3 per 10m |
| Sync gate | OK | Triple `ensureAuthForSync` |
| Foreground resume | OK | `authIntegrity.onForegroundVisible` → `foreground_resume` |
| BC multi-tab | OK | LOCKED / UNLOCKED / SESSION_RESTORED |
| Storage fallback | OK | `LS_REFRESH_RESULT` |
| Refresh storms | Mitigado | Validar en E2/E4 Network tab |
| Stale authPhase | Bajo | BC + integrity `/me` corrigen |

**Doble visibility:** `auth.lifecycle` + `runtime.adaptive` ambos escuchan `visibilitychange` — redundante pero no storm (adaptive solo recompute).

---

## 3. Sync lifecycle

| Área | Estado |
|------|--------|
| No dequeue sin auth | OK — gate pre-dequeue y pre-transmit |
| 401/403 rollback | OK — `rollbackSyncingWithRetry` + lock/REAUTH |
| Retry scheduling | OK — `scheduleResume` + policy delay |
| Cola intacta en auth fail | OK — no mutations destructivas |
| Loop detection | OK — `sync_loop_suspected` + chaos auto-off |

Validar en E5: 0 pérdidas, 0 duplicados server.

---

## 4. Timeline / runtime

| Área | Estado |
|------|--------|
| Keyset pagination | OK — `fetchTimelinePage` |
| Memory ceiling | OK — `memoryCeiling` cap |
| Search en degraded | OK — `isTimelineSearchAllowed` |
| IntersectionObserver cleanup | OK |
| No toArray global | OK — slice |

---

## 5. SW lifecycle

| Área | Estado |
|------|--------|
| Auth NetworkOnly | OK — `ROUTE_PATTERNS.auth` |
| Operational API NetworkOnly | OK |
| Sync GET cache acotada | OK |
| Sync POST no cache | OK |
| skipWaiting guard | OK — `canSkipWaitingNow` en sw-runtime |
| Wakeup → reconnect pipeline | OK — no sync directo |
| Emergency reset | OK — documentado SW_CACHE_RISKS |

---

## 6. Riesgos residuales (validar en E1–E5)

| ID | Severidad | Riesgo | Validación |
|----|-----------|--------|------------|
| R1 | S2 | Android BC entre procesos suspendidos — tab desync breve | E4 |
| R2 | S2 | Memory creep 4h soak | E3 heap delta |
| R3 | S2 | `metricsLog` cerca de 450 en soak | E3 |
| R4 | S3 | Battery API listeners nunca removed | Bajo impacto |
| R5 | S2 | Auto-recovery post-fix — confirmar reconnect OK | E3 tras CRITICAL |
| R6 | S1 | Duplicados server bajo flapping extremo | E5 + backend audit |
| R7 | S3 | Chaos C07 no cambia `document.hidden` real | Solo QA tool |
| R8 | S2 | SW update mid-sync | E4 manual / field |

---

## 7. Checklist bloqueantes pre-sign-off (evidencia requerida)

| ID | Evidencia |
|----|-----------|
| B1–B7 | Completar en SIGNOFF-ROLLUP tras E1–E5 |
| VAL-PRE-001 | Re-test: auto_recovery → sync/reconnect sin reload |

---

## 8. Qué NO hacer antes del sign-off

- No agregar OpenTelemetry, dashboards, Redux, nuevos stores.
- No refactors auth/sync.
- No 8C.
- Fixes en campo → una sola PR "8B hardening" con issues VAL-*.

---

## Referencias

- Ejecución: `RUNTIME_8B_VALIDATION_EXECUTION.md`
- Plantillas: `validation-results/TEMPLATE-E*.md`
- Dispose: `src/app/runtime/runtime.dispose.ts`
- Auto-recovery: `src/app/telemetry/runtime.auto-recovery.ts`
