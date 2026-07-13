# Issues log — 8B Validation

| ID | Env | Severity | Título | Repro | Snapshot / evidencia | Auth | Sync | Cola | UX |
|----|-----|----------|--------|-------|----------------------|------|------|------|-----|
| VAL-PRE-001 | Pre-QA | S1 | auto-recovery dispose subsistemas | Always | audit | broken reconnect | broken | OK | — |
| VAL-PRE-002 | Pre-QA | S2 | adaptive store unsub leak | HMR | audit | — | — | — | — |

**VAL-PRE-001 / 002:** corregidos en código antes de E1 — re-verificar en E3.

## Plantilla por issue

### VAL-XXX — [título corto]

- **Entorno:** E1 / E2 / …
- **Severity:** S0 | S1 | S2 | S3
- **Reproducibilidad:** Always | Often | Sometimes | Once
- **Pasos:**
  1.
  2.
- **Esperado:**
- **Observado:**
- **Snapshots:** `runs/json/...`
- **Métricas relevantes:** (pegar criticalEvents o contadores)
- **Auth behavior:**
- **Sync behavior:**
- **Cola:** pending antes/después, ¿pérdida?
- **UX degradada:**
- **Notas fix (NO implementar durante validación):**
