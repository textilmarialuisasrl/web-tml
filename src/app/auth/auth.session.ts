/**
 * Access token SOLO en memoria del tab (8B).
 * Nunca persistir en Dexie.
 */

export function setAccessToken(_token: string, _expiresAtMs?: number | null): void {
  // no-op shim for compatibility
}

export function getAccessToken(): string | null {
  if (import.meta.env.DEV) {
    console.warn("[AUTH] deprecated token access");
  }
  return null;
}

export function clearAccessToken(): void {
  // no-op shim for compatibility
}

/** Extrae exp del JWT si existe (solo para memoria). */
export function expiresAtFromJwt(token: string): number | null {
  try {
    const payload = parseJwtPayload(token);
    if (payload?.exp) return payload.exp * 1000;
  } catch {
    // ignore
  }
  return null;
}

export function parseJwtPayload(
  token: string
): { userId?: string; sessionVersion?: number; exp?: number } | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  return JSON.parse(json) as { userId?: string; sessionVersion?: number; exp?: number };
}
