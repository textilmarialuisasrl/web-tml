import type { SyncStatus } from "../storage/db";

/** Máximo de intentos antes de dead-letter (FAILED permanente). */
export const SYNC_RETRY_MAX_ATTEMPTS = 5;

export const SYNC_BACKOFF_MIN_MS = 2000;
export const SYNC_BACKOFF_MAX_MS = 30_000;

const RETRYABLE: SyncStatus[] = ["PENDING", "RETRY_SCHEDULED"];

export function isRetryableStatus(status: SyncStatus): boolean {
  return RETRYABLE.includes(status);
}

export function shouldMoveToDeadLetter(nextAttemptCount: number): boolean {
  return nextAttemptCount >= SYNC_RETRY_MAX_ATTEMPTS;
}

/**
 * Tras fallo de red/servidor: incrementa intento y decide RETRY_SCHEDULED vs FAILED (DLQ).
 */
export function statusAfterSyncFailure(currentAttempts: number): {
  status: "RETRY_SCHEDULED" | "FAILED";
  attempts: number;
} {
  const attempts = currentAttempts + 1;
  if (shouldMoveToDeadLetter(attempts)) {
    return { status: "FAILED", attempts };
  }
  return { status: "RETRY_SCHEDULED", attempts };
}

/**
 * Backoff exponencial + jitter (±25%) por número de intento (1-based para delay).
 */
export function computeBackoffDelayMs(attemptNumber: number): number {
  const attempt = Math.max(1, attemptNumber);
  let delay = Math.min(
    SYNC_BACKOFF_MAX_MS,
    SYNC_BACKOFF_MIN_MS * Math.pow(2, attempt - 1)
  );
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(Math.max(SYNC_BACKOFF_MIN_MS, delay + jitter));
}

/**
 * Delay de reintento de lote según el máximo de intentos ya acumulados en los ítems afectados.
 */
export function computeBatchRetryDelayMs(maxAttemptsAmongItems: number): number {
  return computeBackoffDelayMs(Math.max(1, maxAttemptsAmongItems));
}

export function canTransitionToSyncing(from: SyncStatus): boolean {
  return isRetryableStatus(from);
}

export function terminalStatuses(): SyncStatus[] {
  return ["SYNCED", "FAILED", "CONFLICT", "DEAD_LETTER"];
}
