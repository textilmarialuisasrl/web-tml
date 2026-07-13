import { db } from "../storage/db";
import type { CurrentUser } from "../runtime/runtime.store";
import {
  OFFLINE_SESSION_SCHEMA_VERSION,
  type AuthLegacyBackup,
  type OfflineSessionEnvelope,
  type OfflineSessionSnapshot,
} from "./auth.types";
import {
  clearAccessToken,
  expiresAtFromJwt,
  parseJwtPayload,
  setAccessToken,
} from "./auth.session";

export const SNAPSHOT_KEY = "offline_session";
export const LEGACY_JWT_KEY = "jwt_token";
export const LEGACY_USER_KEY = "current_user";
export const LEGACY_BACKUP_KEY = "auth_legacy_backup";
const DEVICE_FINGERPRINT_KEY = "device_fingerprint";

export function snapshotToCurrentUser(snapshot: OfflineSessionSnapshot): CurrentUser {
  return {
    id: snapshot.userId,
    nombre: snapshot.nombre,
    email: snapshot.email,
    permisos: snapshot.permisos,
    sessionVersion: snapshot.sessionVersion,
  };
}

export function isSnapshotStructurallyValid(
  raw: unknown
): raw is OfflineSessionSnapshot {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  return (
    typeof s.userId === "string" &&
    typeof s.nombre === "string" &&
    typeof s.email === "string" &&
    Array.isArray(s.permisos) &&
    typeof s.sessionVersion === "number" &&
    typeof s.deviceFingerprint === "string" &&
    typeof s.issuedAt === "string" &&
    typeof s.lastValidatedAt === "string"
  );
}

async function getOrCreateDeviceFingerprint(): Promise<string> {
  const row = await db.systemConfig.get(DEVICE_FINGERPRINT_KEY);
  if (row?.value) return String(row.value);

  const seed = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`;
  const data = new TextEncoder().encode(seed);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const fp = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);

  await db.systemConfig.put({ key: DEVICE_FINGERPRINT_KEY, value: fp });
  return fp;
}

export async function buildSnapshotFromUser(
  user: CurrentUser,
  sessionVersion?: number,
  lastValidatedAt?: string,
  snapshotSignature?: string | null
): Promise<OfflineSessionSnapshot> {
  const sv = sessionVersion ?? user.sessionVersion ?? 0;
  const now = new Date().toISOString();
  return {
    userId: user.id,
    nombre: user.nombre,
    email: user.email,
    permisos: [...user.permisos],
    sessionVersion: sv,
    deviceFingerprint: await getOrCreateDeviceFingerprint(),
    issuedAt: now,
    lastValidatedAt: lastValidatedAt ?? now,
    snapshotSignature,
    snapshotSchemaVersion: 1,
  };
}

export async function readOfflineSnapshot(): Promise<OfflineSessionSnapshot | null> {
  try {
    const row = await db.systemConfig.get(SNAPSHOT_KEY);
    if (!row?.value) return null;

    const envelope = row.value as OfflineSessionEnvelope | OfflineSessionSnapshot;

    if (isSnapshotStructurallyValid(envelope)) {
      return envelope;
    }

    if (
      typeof envelope === "object" &&
      envelope !== null &&
      "snapshot" in envelope &&
      isSnapshotStructurallyValid((envelope as OfflineSessionEnvelope).snapshot)
    ) {
      return (envelope as OfflineSessionEnvelope).snapshot;
    }

    return null;
  } catch {
    return null;
  }
}

export async function writeOfflineSnapshot(snapshot: OfflineSessionSnapshot): Promise<void> {
  const envelope: OfflineSessionEnvelope = {
    schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
    snapshot,
    updatedAt: new Date().toISOString(),
  };
  await db.systemConfig.put({ key: SNAPSHOT_KEY, value: envelope });
}

export async function clearOfflineSnapshot(): Promise<void> {
  await db.systemConfig.delete(SNAPSHOT_KEY);
}

export async function hasLegacyJwt(): Promise<boolean> {
  const row = await db.systemConfig.get(LEGACY_JWT_KEY);
  return row?.value != null && String(row.value).length > 0;
}

export async function readLegacyJwt(): Promise<string | null> {
  const row = await db.systemConfig.get(LEGACY_JWT_KEY);
  return row?.value ? String(row.value) : null;
}

export async function readLegacyUser(): Promise<CurrentUser | null> {
  const row = await db.systemConfig.get(LEGACY_USER_KEY);
  if (!row?.value || typeof row.value !== "object") return null;
  const u = row.value as CurrentUser;
  if (!u.id || !u.email) return null;
  return u;
}

export async function backupLegacyAuth(): Promise<void> {
  const jwt = await db.systemConfig.get(LEGACY_JWT_KEY);
  const user = await db.systemConfig.get(LEGACY_USER_KEY);
  if (!jwt?.value && !user?.value) return;

  const backup: AuthLegacyBackup = {
    backedUpAt: new Date().toISOString(),
  };
  if (jwt?.value) backup.jwtToken = String(jwt.value);
  if (user?.value) backup.currentUser = user.value as CurrentUser;

  await db.systemConfig.put({ key: LEGACY_BACKUP_KEY, value: backup });
}

export async function clearLegacyAuthKeys(): Promise<void> {
  await db.systemConfig.delete(LEGACY_JWT_KEY);
  await db.systemConfig.delete(LEGACY_USER_KEY);
}

export type LegacyMigrationResult =
  | { ok: true; source: "me" | "legacy_user" | "jwt_offline" }
  | { ok: false; reason: string };

/**
 * Migra jwt_token / current_user → offline_session.
 * No toca movementsQueue.
 */
export async function migrateLegacyAuth(): Promise<LegacyMigrationResult> {
  await backupLegacyAuth();

  const legacyToken = await readLegacyJwt();
  const legacyUser = await readLegacyUser();

  if (!legacyToken && !legacyUser) {
    return { ok: false, reason: "no_legacy_data" };
  }

  if (navigator.onLine && legacyToken) {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${legacyToken}` },
        credentials: "include",
      });
      // Nota: JWT legacy sin typ:access puede fallar tras 8B.2 — fallback offline abajo

      if (response.ok) {
        const resData = await response.json();
        const user = resData?.data?.user as CurrentUser | undefined;
        if (user?.id) {
          const payload = parseJwtPayload(legacyToken);
          const snapshot = await buildSnapshotFromUser(
            user,
            user.sessionVersion ?? payload?.sessionVersion ?? 0,
            new Date().toISOString()
          );
          await writeOfflineSnapshot(snapshot);
          setAccessToken(legacyToken, expiresAtFromJwt(legacyToken));
          await clearLegacyAuthKeys();
          return { ok: true, source: "me" };
        }
      }
    } catch {
      // continuar fallback offline
    }
  }

  if (legacyUser) {
    const sessionVersion = legacyToken
      ? (parseJwtPayload(legacyToken)?.sessionVersion ?? 0)
      : 0;
    const snapshot = await buildSnapshotFromUser(legacyUser, sessionVersion);
    await writeOfflineSnapshot(snapshot);
    if (legacyToken) {
      setAccessToken(legacyToken, expiresAtFromJwt(legacyToken));
    }
    await clearLegacyAuthKeys();
    return { ok: true, source: legacyToken ? "jwt_offline" : "legacy_user" };
  }

  return { ok: false, reason: "migration_unresolved" };
}

/** Limpieza de sesión local — NO toca cola. */
export async function clearAuthPersistence(): Promise<void> {
  clearAccessToken();
  await clearOfflineSnapshot();
  await clearLegacyAuthKeys();
}
