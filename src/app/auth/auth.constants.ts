/** Política refresh runtime (8B.3). */
export const AUTH_BROADCAST_CHANNEL = "tml-auth";

export const REFRESH_COOLDOWN_MS = 30_000;
export const RECONNECT_COOLDOWN_MS = 5_000;
export const REFRESH_LOCK_TTL_MS = 20_000;
export const RECONNECT_DEBOUNCE_MS = 2_500;
export const REFRESH_WAIT_TIMEOUT_MS = 22_000;
export const REFRESH_RETRY_WINDOW_MS = 10 * 60 * 1000;
export const REFRESH_RETRY_MAX = 3;

export const LS_REFRESH_LOCK = "tml_auth_refresh_lock";
export const LS_REFRESH_RESULT = "tml_auth_refresh_result";

/** Integrity monitor (8B.5) — sin polling agresivo. */
export const INTEGRITY_HEARTBEAT_MS = 12 * 60 * 1000;
export const INTEGRITY_FOREGROUND_COOLDOWN_MS = 8_000;
export const INTEGRITY_CHECK_COOLDOWN_MS = 60_000;
