import type { RuntimeState } from "../runtime/runtime.store";
import type { AuthPhase } from "./auth.types";

export const selectAuthPhase = (s: RuntimeState) => s.authPhase;
export const selectIsAuthRefreshing = (s: RuntimeState) => s.isRefreshing;
export const selectLockedReason = (s: RuntimeState) => s.lockedReason;
export const selectReconnectRequired = (s: RuntimeState) => s.reconnectRequired;

/** Enqueue permitido con snapshot — cola independiente del token. */
export function canEnqueueFromAuth(phase: AuthPhase, hasUser: boolean): boolean {
  if (!hasUser) return false;
  if (phase === "LOCKED_RUNTIME") return false;
  return [
    "ONLINE_AUTH",
    "OFFLINE_SESSION",
    "REAUTH_REQUIRED",
    "SAFE_OFFLINE_RECOVERY",
  ].includes(phase);
}

/** Sync permitido solo con sesión online validada (8B.4). */
export function canSyncFromAuth(phase: AuthPhase, online: boolean): boolean {
  return phase === "ONLINE_AUTH" && online;
}

export const selectCanEnqueue = (s: RuntimeState) =>
  canEnqueueFromAuth(s.authPhase, s.currentUser != null);

export const selectCanSyncAuth = (s: RuntimeState) =>
  canSyncFromAuth(s.authPhase, s.online);

export type AuthOperationalStatus = "ONLINE" | "OFFLINE" | "REAUTH" | "LOCKED";

export function resolveAuthOperationalStatus(
  phase: AuthPhase,
  online: boolean
): AuthOperationalStatus {
  if (phase === "LOCKED_RUNTIME") return "LOCKED";
  if (phase === "REAUTH_REQUIRED" || phase === "SAFE_OFFLINE_RECOVERY") return "REAUTH";
  if (!online || phase === "OFFLINE_SESSION") return "OFFLINE";
  return "ONLINE";
}

export function canContinueOffline(
  phase: AuthPhase,
  lockedReason: string | null
): boolean {
  if (phase === "LOCKED_RUNTIME") {
    return lockedReason === "REFRESH_BUDGET_EXCEEDED";
  }
  return ["OFFLINE_SESSION", "REAUTH_REQUIRED", "SAFE_OFFLINE_RECOVERY"].includes(phase);
}

export function shouldShowAuthRecovery(
  phase: AuthPhase,
  reconnectRequired: boolean
): boolean {
  if (phase === "LOCKED_RUNTIME") return true;
  if (phase === "REAUTH_REQUIRED") return true;
  if (phase === "SAFE_OFFLINE_RECOVERY") return true;
  return reconnectRequired && phase !== "ONLINE_AUTH";
}

export const selectAuthOperationalStatus = (s: RuntimeState) =>
  resolveAuthOperationalStatus(s.authPhase, s.online);

export const selectShowAuthRecovery = (s: RuntimeState) =>
  shouldShowAuthRecovery(s.authPhase, s.reconnectRequired);

export const selectCanContinueOffline = (s: RuntimeState) =>
  canContinueOffline(s.authPhase, s.lockedReason);
