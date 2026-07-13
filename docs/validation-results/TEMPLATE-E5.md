# E5 — Offline operational flow

**Fecha:**  
**Dispositivo:**  
**Duración offline:** ___ min  
**Movimientos encolados (N):**  

## IDs encolados (opcional)

```
clientGeneratedId list:
1.
2.
...
```

## Checkpoints

| Checkpoint | JSON | pending | auth | Notas |
|------------|------|---------|------|-------|
| T0 pre-offline | | 0 | | |
| Mid-offline (kill app 1×?) | | | | |
| T_post-reconnect | | | | |
| T_sync_complete | | 0? | ONLINE | |

## Verificación integridad

| Check | OK |
|-------|-----|
| Ningún movimiento perdido | ☐ |
| Backend: 0 duplicate clientGeneratedId | ☐ |
| Sin SYNCING huérfano >10 min | ☐ |
| Recovery si token expirado usable | ☐ |

## Conteo estados finales

| SYNCED | FAILED | CONFLICT | PENDING | Total |
|--------|--------|----------|---------|-------|
| | | | | |

## Resultado E5

- [ ] PASS (0 pérdidas, 0 dup, 0 corrupción)
- [ ] FAIL — VAL-
