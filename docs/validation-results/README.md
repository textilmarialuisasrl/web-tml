# Artefactos — Validación 8B Final

Guardar aquí los resultados de E1–E5. **No commitear datos sensibles** (emails, tokens) — los snapshots JSON pueden contener metadata de usuario; redactar si se sube a git.

## Convención de nombres

```
E1-T0-2026-05-22T10-00.json
E1-T30m-2026-05-22T10-30.json
E3-T2h-2026-05-22T14-00.json
E4-tabB-final-2026-05-22.json
screenshots/E1-header-T0.png
```

## Archivos plantilla

| Archivo | Uso |
|---------|-----|
| `TEMPLATE-E1.md` … `TEMPLATE-E5.md` | Copiar por run y completar |
| `ISSUES-LOG.md` | Todos los bugs/hallazgos |
| `SIGNOFF-ROLLUP.md` | Decisión final |

## Copiar plantilla para un run

```powershell
Copy-Item TEMPLATE-E1.md runs/E1-device-pixel4a-2026-05-22.md
```

Los JSON de export van en `runs/json/` (crear si hace falta).
