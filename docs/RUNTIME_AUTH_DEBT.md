# Deuda técnica — Auth offline (Fase 8B)

## Contexto

`ARCHITECTURE_PROMPT.md` exige JWT en **cookies httpOnly** y prohíbe tokens en `localStorage`.

## Estado actual (8B.1 — Session Snapshot Foundation)

- **Hecho:** `offline_session` en Dexie (snapshot sin credenciales).
- **Hecho:** migración legacy `jwt_token` → `/me` o fallback offline → snapshot + backup `auth_legacy_backup`.
- **Hecho:** access token solo en memoria (`auth.session.ts`); sync/catalog leen memoria.
- **Hecho 8B.2:** access 30m (`tml_access`), refresh 7d (`tml_refresh`), `POST /api/auth/refresh`, login sin token en body.
- **Pendiente 8B.3+:** single-flight multi-tab, reconnect pipeline, sync auth gates.

## Riesgo

- Token persistido en cliente (superficie distinta a httpOnly).
- Rotación/revocación depende de flujo manual de login.

## Objetivo Fase 8B

1. Sesión principal vía cookie httpOnly (login en línea).
2. Sync offline: refresh corto o endpoint dedicado sin almacenar JWT largo en IDB, o sesión device-bound acotada documentada.
3. Eliminar o acotar `jwt_token` en `systemConfig`.

## Criterio de cierre 8B

- Ningún token de larga duración en IndexedDB sin justificación firmada.
- Sync operativo offline validado en Android gama baja con política de expiración clara.
