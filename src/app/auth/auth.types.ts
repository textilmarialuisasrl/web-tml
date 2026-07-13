import type { CurrentUser } from "../runtime/runtime.store";

/** Bloqueo operativo de sync (8B.4) — no borra cola. */
export type RuntimeLockReason =
  | "SESSION_REVOKED"
  | "ACCOUNT_DISABLED"
  | "REFRESH_BUDGET_EXCEEDED"
  | "INVALID_SESSION_VERSION";

/** Fase de autenticación operativa (8B). */
export type AuthPhase =
  | "ONLINE_AUTH"
  | "OFFLINE_SESSION"
  | "REAUTH_REQUIRED"
  | "LOCKED_RUNTIME"
  | "SAFE_OFFLINE_RECOVERY";

/** Persistido en Dexie — sin credenciales. */
export interface OfflineSessionSnapshot {
  userId: string;
  nombre: string;
  email: string;
  permisos: string[];
  sessionVersion: number;
  deviceFingerprint: string;
  issuedAt: string;
  lastValidatedAt: string;
  snapshotSignature?: string | null;
  snapshotSchemaVersion?: number;
}

/** Estado reactivo de auth — solo runtime (Zustand). */
export interface RuntimeAuthState {
  authPhase: AuthPhase;
  currentUser: CurrentUser | null;
  isRefreshing: boolean;
  lastRefreshAt: string | null;
  lockedReason: string | null;
  reconnectRequired: boolean;
}

export const OFFLINE_SESSION_SCHEMA_VERSION = 1;

export interface OfflineSessionEnvelope {
  schemaVersion: number;
  snapshot: OfflineSessionSnapshot;
  updatedAt: string;
}

/** Backup reversible de claves legacy antes de migración. */
export interface AuthLegacyBackup {
  jwtToken?: string;
  currentUser?: CurrentUser;
  backedUpAt: string;
}
