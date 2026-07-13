import type { CurrentUser } from "../runtime/runtime.store";
import type { OfflineSessionSnapshot, RuntimeLockReason } from "./auth.types";
import { getAccessToken, parseJwtPayload } from "./auth.session";

export type SessionDriftKind =
  | "INVALID_SESSION_VERSION"
  | "USER_ID_MISMATCH"
  | "SNAPSHOT_CORRUPT";

export type SessionDrift = {
  kind: SessionDriftKind;
  lockReason: RuntimeLockReason;
};

export function detectSessionDrift(
  local: CurrentUser | null,
  remote: CurrentUser,
  snapshot: OfflineSessionSnapshot | null
): SessionDrift | null {
  if (!local?.id || local.id !== remote.id) {
    return { kind: "USER_ID_MISMATCH", lockReason: "SESSION_REVOKED" };
  }

  const localSv = local.sessionVersion ?? snapshot?.sessionVersion ?? 0;
  const remoteSv = remote.sessionVersion ?? 0;
  if (localSv !== remoteSv) {
    return { kind: "INVALID_SESSION_VERSION", lockReason: "INVALID_SESSION_VERSION" };
  }

  if (snapshot && snapshot.sessionVersion !== remoteSv) {
    return { kind: "INVALID_SESSION_VERSION", lockReason: "INVALID_SESSION_VERSION" };
  }

  return null;
}

/** JWT memoria vs usuario runtime. */
export function detectTokenSessionDrift(user: CurrentUser | null): SessionDrift | null {
  const token = getAccessToken();
  if (!user || !token) return null;

  const payload = parseJwtPayload(token);
  if (payload?.sessionVersion == null) return null;

  const expected = user.sessionVersion ?? 0;
  if (payload.sessionVersion !== expected) {
    return { kind: "INVALID_SESSION_VERSION", lockReason: "INVALID_SESSION_VERSION" };
  }

  return null;
}
