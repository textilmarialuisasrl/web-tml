# 8B Final — Ejecución validación real (E1–E5)

**Regla de oro:** durante las pruebas **no corregir código**. Solo capturar. Fixes en una etapa única después.

**Pre-QA audit:** [`RUNTIME_8B_PREQA_AUDIT.md`](RUNTIME_8B_PREQA_AUDIT.md) — **READY FOR OPERATIONAL VALIDATION** (fix VAL-PRE-001/002 aplicado; re-verificar en E3).

**Prerequisitos:** PR chaos + profiling merged. Build identificable (commit hash anotado). Login operativo.

**Artefactos obligatorios por entorno:** ver carpeta [`validation-results/`](validation-results/README.md).

---

## Protocolo común (todos los entornos)

### Antes de empezar

1. Anotar: fecha, operador QA, commit `git rev-parse --short HEAD`, build mode.
2. PWA: standalone instalada o Chrome tab (especificar).
3. Limpiar chaos en prod-like runs: `localStorage.removeItem('tml_chaos')` salvo E4.
4. Login → confirmar badge auth **ONLINE** y cola en 0 (o anotar pending inicial).

### Cada checkpoint (T0, T+15m, T+30m, …)

1. Abrir `/app/diag` → **Export runtime snapshot** → guardar JSON como  
   `validation-results/<ENV>-<checkpoint>-<ISO-date>.json`
2. Screenshot header (auth badge + cola + health).
3. Anotar en plantilla del entorno (ver `TEMPLATE-Ex.md`).

### Métricas clave a extraer del snapshot

| Campo JSON | Uso |
|------------|-----|
| `build.uptimeMs` | Tiempo sesión |
| `build.mode` | dev/production |
| `runtime.healthLevel` / `healthScore` | Stop si CRITICAL persistente |
| `auth.phase` / `lockedReason` | Comportamiento auth |
| `queue.syncPending` / `conflicts` / `failed` | Integridad cola |
| `memory.heapUsedMb` | Memory creep |
| `profiling.*` | Throughput, growth |
| `observers.observersActiveCount` | Leak listeners |
| `telemetryCounters.syncTriggers1m` | Storm detection |
| `criticalEvents[]` | auth_*, sync_*, chaos_* |

### Conteo refresh (Android / Chrome remote)

En **una** sesión de prueba, filtrar Network por `POST` + `/api/auth/refresh`:

- Anotar cantidad total en ventana del escenario.
- Tras un solo reconnect Wi‑Fi: debe haber **≤1** refresh concurrente (no ráfaga >3 en 10s).

### Stop-the-line (abortar matriz y escalar)

- Movimiento encolado desaparece sin estado terminal explicado.
- Mismo `clientGeneratedId` dos veces en servidor (auditar backend).
- `sync_loop_suspected` en criticalEvents o syncTriggers1m ≥ 20 sostenido.
- Health CRITICAL >10 min sin recovery visible.
- Cola con conteos incoherentes (pending negativo, etc.).

---

## E1 — Android Low-End Baseline

**Objetivo:** baseline real en hardware 2–3 GB RAM.

| Campo | Valor |
|-------|--------|
| Dispositivo | |
| Android | |
| RAM | |
| PWA standalone | sí / no |
| Red | Wi‑Fi estable |
| Duración | ~45–60 min |

### Procedimiento

| Paso | Acción | Checkpoint |
|------|--------|------------|
| 1 | Cold start (kill app) → abrir PWA | T0 export |
| 2 | Anotar `boot_to_ready_ms` en snapshot T0 (o `startup_time_ms` en criticalEvents) | |
| 3 | `heapUsedMb` T0 | |
| 4 | Operar: 5 movimientos taller (numeric pad) — cronometrar 1 ingreso completo | UX nota |
| 5 | Abrir timeline → scroll 30 s | jank sí/no |
| 6 | Sync forzado o esperar auto-sync | T+15m export |
| 7 | Dejar app foreground 30 min uso ligero | T+30m export — **heap delta** |
| 8 | Toggle avión OFF 2 min → ON | reconnect: 1 refresh? auth badge? |
| 9 | Cerrar sesión mental: auth badge tras reconnect | |

### Criterios E1

| Métrica | Objetivo | Resultado |
|---------|----------|-----------|
| boot_to_ready_ms | < 8000 | |
| heap T+30m vs T0 | < +15% | |
| health T+30m | ≠ CRITICAL persistente | |
| refresh en 1 reconnect | ≤ 1 ráfaga | |
| numeric pad 1 ingreso | < 12 s, ≤ 6 taps | |
| timeline scroll | sin freeze > 500 ms percibido | |

**Plantilla:** [`validation-results/TEMPLATE-E1.md`](validation-results/TEMPLATE-E1.md)

---

## E2 — Battery Saver + Red mala

**Objetivo:** tier DEGRADED correcto sin storms.

| Campo | Valor |
|-------|--------|
| Mismo dispositivo E1 | |
| Battery saver sistema | ON |
| Red | 3G real o DevTools Slow 3G + latency |
| Duración | ~60–90 min |

### Procedimiento

| Paso | Acción |
|------|--------|
| 1 | Activar battery saver + throttling |
| 2 | T0 export — anotar `runtime.tier`, `batterySaver` |
| 3 | Encolar 10 movimientos offline (modo avión 10 min) |
| 4 | Avión OFF → reconnect |
| 5 | Cada 10 min: foreground/background ×1 (5 ciclos) |
| 6 | Offline intermitente: avión 1 min ON / 2 min OFF ×5 |
| 7 | T+30m, T+60m export |
| 8 | Verificar: sin ráfaga refresh; sync eventual; cola neto correcto |

### Validar

- [ ] Tier DEGRADED o batterySaver activo cuando corresponde
- [ ] Sin `sync_loop_suspected`
- [ ] `auth_refresh_failed` no > 5 en 10 min salvo chaos
- [ ] pending final = encolados − synced ± failed/conflict

**Plantilla:** [`validation-results/TEMPLATE-E2.md`](validation-results/TEMPLATE-E2.md)

---

## E3 — Soak test 4 h (CRÍTICO)

**Objetivo:** estabilidad sesión larga.

| Campo | Valor |
|-------|--------|
| Dispositivo | Preferir E1 o E3 PWA standalone |
| Red | Wi‑Fi estable |
| Duración | **4 h** mínimo |
| Cola inicial | ≥ 20 pending recomendado |

### Muestreo obligatorio

| Tiempo | Export | Heap | pending | observers | metricsLog |
|--------|--------|------|---------|-----------|------------|
| T0 | ✓ | | | | |
| T+1h | ✓ | | | | |
| T+2h | ✓ | | | | |
| T+3h | ✓ | | | | |
| T+4h | ✓ | | | | |

### Ritmo operativo

- Cada **15 min:** background 30 s → foreground (simula operario).
- Cada **30 min:** encolar 1 movimiento OR forzar sync si pending > 0.
- No usar chaos salvo incidente documentado.

### Stop conditions (abortar soak)

| Condición | Umbral |
|-----------|--------|
| Memory creep | heap T+4h > T0 + **15%** |
| Observers | `observersActiveCount` crece monótono +5 por hora |
| metricsLog | > 450 sostenido sin prune efectivo |
| Refresh storm | > 3 POST refresh en 10 s en cualquier punto |
| Health | CRITICAL > 10 min |
| UX | jank constante en timeline |

### Al final

- Calcular: refresh total (Network), syncTriggers1m en T+4h, throughput promedio de profiling samples.
- Verificar B1–B3 checklist en [`RUNTIME_8B_FINALIZATION_QA.md`](RUNTIME_8B_FINALIZATION_QA.md) §7.

**Plantilla:** [`validation-results/TEMPLATE-E3.md`](validation-results/TEMPLATE-E3.md)

---

## E4 — Multi-tab + Visibility chaos

**Objetivo:** BC estable, sin duplicate refresh/sync.

| Campo | Valor |
|-------|--------|
| Entorno | Desktop Chrome o Android con 2 tabs |
| Chaos | `?chaos=1` en **una** tab solo para C07/C08 |
| Duración | ~45–60 min |

### Procedimiento

| Paso | Acción |
|------|--------|
| 1 | Tab A + Tab B misma origin, mismo usuario |
| 2 | T0 export Tab A |
| 3 | Tab A: `/app/diag` → **C08** (runtime lock) |
| 4 | Tab B: debe mostrar LOCKED / recovery sin crash |
| 5 | Tab B: Revalidar o Reingresar → SESSION_RESTORED en ambas |
| 6 | Tab A: **C07** visibility storm (chaos ON) |
| 7 | Network tab ambas tabs: contar refresh durante 2 min post-C07 — esperado: debounced, no > 5 total |
| 8 | Foreground/background manual ×10 en Tab A |
| 9 | Ambas tabs: trigger sync (uno solo) — verificar un solo batch activo |
| 10 | T_final export A + B |

### Validar

- [ ] No deadlock (UI responde < 5 s)
- [ ] No duplicate sync del mismo batchId en server logs
- [ ] BC: lock/unlock reflejado
- [ ] chaos auto-disable si health CRITICAL ×3

**Plantilla:** [`validation-results/TEMPLATE-E4.md`](validation-results/TEMPLATE-E4.md)

---

## E5 — Offline operational flow

**Objetivo:** operación real offline prolongado.

| Campo | Valor |
|-------|--------|
| Duración offline | **30–60 min** |
| Movimientos | ≥ 15–25 variados (taller/fardos) |
| Red | Avión ON todo el offline |

### Procedimiento

| Paso | Acción |
|------|--------|
| 1 | T0 export — anotar pending=0 |
| 2 | Modo avión ON |
| 3 | Encolar N movimientos (anotar N y cada clientGeneratedId si posible desde diag/backend) |
| 4 | Operar timeline / taller durante offline |
| 5 | Opcional: kill app mid-offline → reopen (1×) — pending debe conservarse |
| 6 | Avión OFF |
| 7 | Si token expirado: recovery UI → revalidar |
| 8 | Esperar sync completo |
| 9 | T_final export |
| 10 | Backend: verificar 0 duplicados, N synced o failed/conflict explicados |

### Criterio éxito E5

| Criterio | OK |
|----------|-----|
| 0 pérdidas (pending+synced+failed+conflict = N) | |
| 0 duplicados server | |
| 0 corrupción (sin SYNCING huérfanos > 10 min) | |

**Plantilla:** [`validation-results/TEMPLATE-E5.md`](validation-results/TEMPLATE-E5.md)

---

## Registro de issues

Cada hallazgo → [`validation-results/ISSUES-LOG.md`](validation-results/ISSUES-LOG.md).

**Severidad:**

| Nivel | Definición |
|-------|------------|
| **S0** | Pérdida datos cola / duplicado server / crash loop |
| **S1** | Bloqueante operación (no sync, LOCKED sin recovery) |
| **S2** | Degradación fuerte (storm, creep >15%, CRITICAL largo) |
| **S3** | UX fricción / cosmético / workaround existe |

**Reproducibilidad:** Always / Often (>50%) / Sometimes / Once

---

## Rollup final y decisión

Completar [`validation-results/SIGNOFF-ROLLUP.md`](validation-results/SIGNOFF-ROLLUP.md):

- Resumen por E1–E5
- Bloqueantes B1–B7 (§7 QA doc)
- Decisión: **SIGN-OFF 8B** | **MINI HARDENING** | **BLOCK 8C**

**No iniciar 8C** hasta SIGN-OFF explícito.

---

## Orden de ejecución (resumen)

```
E1 (baseline) → E2 (degraded) → E3 (soak 4h) → E4 (chaos tabs) → E5 (offline)
```

E4 puede paralelizarse en desktop mientras E3 corre en dispositivo dedicado.

E5 puede ejecutarse el día después del soak si el dispositivo es único.
