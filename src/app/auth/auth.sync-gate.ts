import { metricsService } from "../services/metrics.service";
import { useRuntimeStore } from "../runtime/runtime.store";
import type { AuthPhase } from "./auth.types";
import { authLifecycle } from "./auth.lifecycle";
import { detectTokenSessionDrift } from "./auth.session-integrity";
import { canSyncFromAuth } from "./auth.selectors";

const AUTH_SETTLE_POLL_MS = 80;
const AUTH_SETTLE_MAX_MS = 18_000;

export type SyncGateResult =
  | { allowed: true }
  | { allowed: false; reason: string; silent: boolean; phase: AuthPhase };

let ensureAuthInFlight: Promise<SyncGateResult> | null = null;

function isSilentDeny(phase: AuthPhase): boolean {
  return phase === "OFFLINE_SESSION" || phase === "SAFE_OFFLINE_RECOVERY";
}

/**
 * Comprueba si el runtime permite sync (sin refresh).
 */
export function canProcessSync(): boolean {
  const store = useRuntimeStore.getState();
  if (!store.online || !store.currentUser) return false;
  if (store.isRefreshing) return false;
  if (!assertRuntimeUnlocked()) return false;
  if (!canSyncFromAuth(store.authPhase, store.online)) return false;
  return validateSessionVersion();
}

/**
 * Runtime bloqueado — sync prohibido; cola intacta.
 */
export function assertRuntimeUnlocked(): boolean {
  const store = useRuntimeStore.getState();
  if (store.authPhase === "LOCKED_RUNTIME" || store.lockedReason) {
    void metricsService.trackMetric("auth_sync_runtime_locked", 1, {
      phase: store.authPhase,
      reason: store.lockedReason ?? "locked",
    });
    return false;
  }
  return true;
}

function validateSessionVersion(): boolean {
  const store = useRuntimeStore.getState();
  const drift = detectTokenSessionDrift(store.currentUser);
  if (drift) {
    authLifecycle.lockRuntime(drift.lockReason);
    return false;
  }
  return true;
}

async function waitForAuthPipeline(): Promise<void> {
  const deadline = Date.now() + AUTH_SETTLE_MAX_MS;
  while (Date.now() < deadline) {
    const store = useRuntimeStore.getState();
    if (!store.isRefreshing && !authLifecycle.isAuthPipelineActive()) return;
    await new Promise((r) => setTimeout(r, AUTH_SETTLE_POLL_MS));
  }
}

/**
 * Gate centralizado — SIEMPRE antes de dequeue / transmit (8B.4).
 */
export async function ensureAuthForSync(): Promise<SyncGateResult> {
  if (ensureAuthInFlight) {
    return ensureAuthInFlight;
  }

  ensureAuthInFlight = runEnsureAuthForSync().finally(() => {
    ensureAuthInFlight = null;
  });

  return ensureAuthInFlight;
}

async function runEnsureAuthForSync(): Promise<SyncGateResult> {
  const store = useRuntimeStore.getState();
  const phase = store.authPhase;

  if (!store.online) {
    return deny("offline", phase, true);
  }

  if (!store.currentUser) {
    return deny("no_user", phase, false);
  }

  if (!assertRuntimeUnlocked()) {
    void metricsService.trackMetric("sync_blocked_auth_phase", 1, {
      phase: store.authPhase,
      lockedReason: store.lockedReason,
    });
    return deny(store.lockedReason ?? "LOCKED_RUNTIME", store.authPhase, false);
  }

  if (phase === "REAUTH_REQUIRED") {
    void metricsService.trackMetric("sync_blocked_auth_phase", 1, { phase });
    return deny("REAUTH_REQUIRED", phase, false);
  }

  if (!canSyncFromAuth(phase, store.online)) {
    void metricsService.trackMetric("sync_blocked_auth_phase", 1, { phase });
    return deny(phase, phase, isSilentDeny(phase));
  }

  await waitForAuthPipeline();

  if (!validateSessionVersion()) {
    void metricsService.trackMetric("auth_sync_gate_denied", 1, {
      reason: "INVALID_SESSION_VERSION",
    });
    return deny("INVALID_SESSION_VERSION", "LOCKED_RUNTIME", false);
  }

  if (canProcessSync()) {
    void metricsService.trackMetric("auth_sync_gate_allowed", 1, { path: "fast" });
    return { allowed: true };
  }

  const refreshStart = performance.now();
  const ok = await authLifecycle.ensureFreshSession("sync_gate");
  const refreshMs = performance.now() - refreshStart;

  if (refreshMs > 20) {
    void metricsService.trackMetric("sync_resume_after_refresh_ms", refreshMs);
  }

  if (!ok) {
    const after = useRuntimeStore.getState();
    void metricsService.trackMetric("auth_sync_gate_denied", 1, {
      phase: after.authPhase,
      reason: after.lockedReason ?? "refresh_failed",
    });
    void metricsService.trackMetric("sync_blocked_auth_phase", 1, {
      phase: after.authPhase,
    });
    return deny(
      after.lockedReason ?? after.authPhase,
      after.authPhase,
      isSilentDeny(after.authPhase)
    );
  }

  if (!canProcessSync()) {
    const after = useRuntimeStore.getState();
    return deny(after.authPhase, after.authPhase, isSilentDeny(after.authPhase));
  }

  void metricsService.trackMetric("auth_sync_gate_allowed", 1, { path: "refresh" });
  return { allowed: true };
}

function deny(
  reason: string,
  phase: AuthPhase,
  silent: boolean
): SyncGateResult {
  if (!silent) {
    void metricsService.trackMetric("auth_sync_gate_denied", 1, { reason, phase });
  }
  return { allowed: false, reason, silent, phase };
}
