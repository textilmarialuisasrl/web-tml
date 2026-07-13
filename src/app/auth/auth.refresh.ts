import { metricsService } from "../services/metrics.service";
import { RollingCounter } from "../telemetry/rolling-counter";
import { authFetch } from "./auth.api";
import { authBroadcast } from "./auth.broadcast";
import {
  LS_REFRESH_LOCK,
  RECONNECT_COOLDOWN_MS,
  REFRESH_COOLDOWN_MS,
  REFRESH_LOCK_TTL_MS,
  REFRESH_RETRY_MAX,
  REFRESH_RETRY_WINDOW_MS,
  REFRESH_WAIT_TIMEOUT_MS,
} from "./auth.constants";
import {
  clearAccessToken,
} from "./auth.session";
import type { CurrentUser } from "../runtime/runtime.store";

export type RefreshReason =
  | "reconnect"
  | "foreground"
  | "boot"
  | "manual"
  | "scheduler"
  | "sw_wakeup"
  | "client_request"
  | "network_online"
  | "visibility"
  | "sync_gate"
  | "foreground_resume"
  | "integrity_check";

export type RefreshResult =
  | { ok: true; user: CurrentUser; snapshotSignature?: string | null; fromRemoteTab?: boolean }
  | { ok: false; code: string; status: number; fromRemoteTab?: boolean; budgetExceeded?: boolean };

const TAB_ID = authBroadcast.getTabId();
const failureBudget = new RollingCounter(REFRESH_RETRY_WINDOW_MS);

let refreshInFlight: Promise<RefreshResult> | null = null;
let lastRefreshAt = 0;
let lastRefreshReason: RefreshReason | null = null;

function isReconnectReason(reason: RefreshReason): boolean {
  return [
    "reconnect",
    "boot",
    "network_online",
    "sw_wakeup",
    "client_request",
    "foreground",
    "foreground_resume",
    "visibility",
  ].includes(reason);
}

function readLock(): { tabId: string; until: number } | null {
  try {
    const raw = localStorage.getItem(LS_REFRESH_LOCK);
    if (!raw) return null;
    return JSON.parse(raw) as { tabId: string; until: number };
  } catch {
    return null;
  }
}

function tryAcquireLock(): boolean {
  const now = Date.now();
  const existing = readLock();
  if (existing && existing.until > now && existing.tabId !== TAB_ID) {
    return false;
  }
  try {
    localStorage.setItem(
      LS_REFRESH_LOCK,
      JSON.stringify({ tabId: TAB_ID, until: now + REFRESH_LOCK_TTL_MS })
    );
    return true;
  } catch {
    return true;
  }
}

function releaseLock(): void {
  try {
    const existing = readLock();
    if (existing?.tabId === TAB_ID) {
      localStorage.removeItem(LS_REFRESH_LOCK);
    }
  } catch {
    // ignore
  }
}

function shouldSkipCooldown(reason: RefreshReason, force: boolean): boolean {
  if (force) return false;
  const elapsed = Date.now() - lastRefreshAt;
  const limit = isReconnectReason(reason) ? RECONNECT_COOLDOWN_MS : REFRESH_COOLDOWN_MS;
  if (elapsed < limit && lastRefreshReason === reason) {
    return true;
  }
  if (!isReconnectReason(reason) && elapsed < REFRESH_COOLDOWN_MS) {
    return true;
  }
  return false;
}

async function performHttpRefresh(reason: RefreshReason): Promise<RefreshResult> {
  const waitStart = performance.now();
  const lock = readLock();
  if (lock && lock.until > Date.now() && lock.tabId !== TAB_ID) {
    const remote = await authBroadcast.waitForRemoteRefresh(REFRESH_WAIT_TIMEOUT_MS);
    const waitMs = performance.now() - waitStart;
    if (waitMs > 50) {
      await metricsService.trackMetric("auth_refresh_lock_wait_ms", waitMs, { reason });
    }
    if (remote) {
      await metricsService.trackMetric("auth_refresh_multitab_sync", 1, { reason });
      return remote;
    }
    await metricsService.trackMetric("auth_refresh_concurrent_prevented", 1, { reason });
    return { ok: false, code: "LOCK_WAIT_TIMEOUT", status: 0 };
  }

  if (!tryAcquireLock()) {
    const remote = await authBroadcast.waitForRemoteRefresh(REFRESH_WAIT_TIMEOUT_MS);
    if (remote) {
      await metricsService.trackMetric("auth_refresh_multitab_sync", 1, { reason });
      return remote;
    }
    await metricsService.trackMetric("auth_refresh_concurrent_prevented", 1, { reason });
    return { ok: false, code: "LOCK_BUSY", status: 0 };
  }

  authBroadcast.publish({ type: "REFRESH_STARTED", tabId: TAB_ID, at: Date.now(), reason });
  const store = await import("../runtime/runtime.store").then((m) => m.useRuntimeStore.getState());
  store.setAuthRefreshing(true);

  const start = performance.now();
  try {
    const res = await authFetch("/api/auth/refresh", { method: "POST" });
    const duration = performance.now() - start;

    if (!res.ok) {
      let code = `HTTP_${res.status}`;
      try {
        const body = await res.json();
        code = body?.code ?? code;
      } catch {
        // ignore
      }

      failureBudget.record();

      if (code === "SESSION_INVALIDATED" || code === "ACCOUNT_DISABLED") {
        const lockReason =
          code === "ACCOUNT_DISABLED" ? "ACCOUNT_DISABLED" : "SESSION_REVOKED";
        authBroadcast.publish({
          type: "RUNTIME_LOCKED",
          at: Date.now(),
          reason: lockReason,
        });
        clearAccessToken();
        await metricsService.trackMetric("auth_session_revoked", 1, { code });
      }

      await metricsService.trackMetric("auth_refresh_failed", 1, {
        code,
        status: res.status,
        durationMs: duration,
        reason,
      });

      if (res.status === 401 || res.status === 403) {
        await metricsService.trackMetric("auth_refresh_rejected", 1, { code, reason });
      }

      const fail: RefreshResult = { ok: false, code, status: res.status };
      authBroadcast.publish({
        type: "REFRESH_FAILED",
        tabId: TAB_ID,
        at: Date.now(),
        code,
        status: res.status,
      });
      return fail;
    }

    const json = await res.json();
    const data = json.data as {
      user: CurrentUser & { sessionVersion?: number };
      snapshotSignature?: string | null;
    };

    if (!data?.user?.id) {
      failureBudget.record();
      return { ok: false, code: "INVALID_PAYLOAD", status: res.status };
    }

    const user: CurrentUser = {
      id: data.user.id,
      nombre: data.user.nombre,
      email: data.user.email,
      permisos: data.user.permisos,
      sessionVersion: data.user.sessionVersion ?? 0,
    };

    lastRefreshAt = Date.now();
    lastRefreshReason = reason;
    failureBudget.reset();

    await metricsService.trackMetric("auth_refresh_success", 1, { durationMs: duration, reason });
    await metricsService.trackMetric("auth_refresh_duration_ms", duration, { reason });

    authBroadcast.publish({
      type: "REFRESH_SUCCESS",
      tabId: TAB_ID,
      at: Date.now(),
      user,
      snapshotSignature: data.snapshotSignature,
    });

    return { ok: true, user, snapshotSignature: data.snapshotSignature };
  } catch (err) {
    failureBudget.record();
    await metricsService.trackMetric("auth_refresh_failed", 1, {
      code: "NETWORK",
      reason,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, code: "NETWORK", status: 0 };
  } finally {
    releaseLock();
    const storeOff = await import("../runtime/runtime.store").then((m) =>
      m.useRuntimeStore.getState()
    );
    storeOff.setAuthRefreshing(false);
    storeOff.setLastRefreshAt(new Date().toISOString());
  }
}

/**
 * Refresh coordinado — single-flight global + multi-tab (8B.3).
 */
export async function coordinatedRefresh(
  reason: RefreshReason,
  options: { force?: boolean; allowHidden?: boolean } = {}
): Promise<RefreshResult> {
  const { force = false, allowHidden = false } = options;

  if (typeof document !== "undefined" && document.hidden && !allowHidden) {
    if (!isReconnectReason(reason)) {
      await metricsService.trackMetric("auth_refresh_visibility_skip", 1, { reason });
      return { ok: false, code: "TAB_HIDDEN", status: 0 };
    }
  }

  if (failureBudget.count() >= REFRESH_RETRY_MAX) {
    await metricsService.trackMetric("auth_refresh_retry_budget_exceeded", 1, {
      failures: failureBudget.count(),
      reason,
    });
    const { throttledSecurityLog } = await import("./auth.api");
    throttledSecurityLog("repeated-failed-refresh", "Auth refresh budget exceeded");

    clearAccessToken();
    authBroadcast.publish({
      type: "RUNTIME_LOCKED",
      at: Date.now(),
      reason: "REFRESH_BUDGET_EXCEEDED",
    });
    return {
      ok: false,
      code: "RETRY_BUDGET_EXCEEDED",
      status: 0,
      budgetExceeded: true,
    };
  }

  if (shouldSkipCooldown(reason, force)) {
    await metricsService.trackMetric("auth_refresh_cooldown_skip", 1, { reason });
    return { ok: false, code: "COOLDOWN", status: 0 };
  }

  if (refreshInFlight) {
    await metricsService.trackMetric("auth_refresh_concurrent_prevented", 1, {
      reason,
      scope: "in_flight",
    });
    return refreshInFlight;
  }

  const { chaosShouldFailRefresh } = await import("../chaos/chaos.runtime");
  if (chaosShouldFailRefresh()) {
    return { ok: false, code: "CHAOS_REFRESH_FAIL", status: 401 };
  }

  refreshInFlight = performHttpRefresh(reason).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/** @deprecated usar coordinatedRefresh */
export async function refreshSession(force = false): Promise<RefreshResult> {
  return coordinatedRefresh("manual", { force });
}

export function subscribeAuthBroadcast(
  fn: (msg: import("./auth.broadcast").AuthBroadcastEvent) => void
): () => void {
  return authBroadcast.subscribe(fn);
}
