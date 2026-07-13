# E2 — Battery Saver + Red mala

**Fecha:**  
**Dispositivo (mismo E1):**  
**Battery saver:** ON  
**Red:** 3G / throttled  

## Checkpoints

| Checkpoint | Hora | JSON | tier | batterySaver | pending | syncTriggers1m | refresh notes |
|------------|------|------|------|--------------|---------|----------------|---------------|
| T0 | | | | | | | |
| T+30m | | | | | | | |
| T+60m | | | | | | | |

## Escenarios

| Escenario | OK | Notas |
|-----------|-----|-------|
| 10 encolados offline → sync | ☐ | |
| 5× foreground/background | ☐ | sin storm |
| Avión 1m/2m ×5 | ☐ | |
| Cola neto correcto | ☐ | encolados= synced+pending+failed+conflict |

## Resultado E2

- [ ] PASS
- [ ] FAIL — VAL-
