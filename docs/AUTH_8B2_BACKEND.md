# Auth 8B.2 — Backend cookie session

## Cookies

| Cookie | Path | Duración | Contenido |
|--------|------|----------|-----------|
| `tml_access` | `/api` | 30 min (JWT `typ: access`) | httpOnly, SameSite=Lax |
| `tml_refresh` | `/api/auth` | 7 días (`typ: refresh`) | httpOnly, SameSite=Lax |
| `token` (legacy) | `/` | — | Limpiada en login/logout |

## Endpoints

- `POST /api/auth/login` — body: `{ user, lastValidatedAt }` (sin JWT)
- `POST /api/auth/refresh` — body: `{ user, accessToken, lastValidatedAt }` (access efímero para memoria tab; refresh solo cookie)
- `GET /api/auth/me` — requiere access cookie o Bearer
- `POST /api/auth/logout` — limpia cookies

## Env

- `ACCESS_TOKEN_EXPIRES` (default `30m`)
- `REFRESH_TOKEN_EXPIRES` (default `7d`)
- `ACCESS_COOKIE_MAX_AGE_MS` / `REFRESH_COOKIE_MAX_AGE_MS`

## Revocación

`sessionVersion` en JWT vs DB → `SESSION_INVALIDATED` (401).  
Cuenta inactiva → `ACCOUNT_DISABLED` (403).

## Cliente

- `credentials: 'include'` en API autenticada
- Login no persiste token del body
- `refreshSession()` manual con métricas (auto-loop en 8B.3)
