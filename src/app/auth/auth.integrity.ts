import { metricsService } from "../services/metrics.service";
import { useRuntimeStore, type CurrentUser } from "../runtime/runtime.store";
import { authFetch } from "./auth.api";
import {
  INTEGRITY_CHECK_COOLDOWN_MS,
  INTEGRITY_FOREGROUND_COOLDOWN_MS,
  INTEGRITY_HEARTBEAT_MS,
} from "./auth.constants";
import { authLifecycle } from "./auth.lifecycle";
import {
  buildSnapshotFromUser,
  isSnapshotStructurallyValid,
  readOfflineSnapshot,
  writeOfflineSnapshot,
} from "./auth.snapshot";
import { detectSessionDrift, detectTokenSessionDrift } from "./auth.session-integrity";
export type IntegrityTrigger =
  | "heartbeat"
  | "foreground"
  | "reconnect"
  | "manual"
  | "post_login";

export type IntegrityResult =
  | { ok: true; source: IntegrityTrigger }
  | { ok: false; reason: string; locked?: boolean };

type MeResponse = {
  success?: boolean;
  data?: {
    user: CurrentUser & { sessionVersion?: number };
    lastValidatedAt?: string;
  };
  code?: string;
  message?: string;
};

class AuthIntegrityMonitor {
  private started = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastCheckAt = 0;
  private lastForegroundAt = 0;
  private checkInFlight: Promise<IntegrityResult> | null = null;
  private lockedAt: number | null = null;
  private refreshInFlight = false;

  public start(): void {
    if (this.started || typeof window === "undefined") return;
    const isDev = import.meta.env.DEV;
    
    if (isDev) {
      console.log("[AUTH] heartbeat start");
    }

    // Ensure stable singleton lifecycle without leak risk
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.started = true;

    const interval = isDev ? 60_000 : INTEGRITY_HEARTBEAT_MS;
    const timerId = setInterval(() => {
      if (this.started) {
        if (isDev) {
          console.log("[AUTH] heartbeat tick");
        }
        void this.runCheck("heartbeat");
      }
    }, interval);
    this.heartbeatTimer = timerId;

    if (isDev) {
      console.log(`[AUTH] heartbeat interval created (ID: ${timerId})`);
    }
  }

  public stop(): void {
    const isDev = import.meta.env.DEV;
    if (this.started && isDev) {
      console.log("[AUTH] heartbeat stopped");
    }
    if (this.heartbeatTimer) {
      const prevTimerId = this.heartbeatTimer;
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (isDev) {
        console.log(`[AUTH] heartbeat interval destroyed (ID: ${prevTimerId})`);
      }
    }
    this.started = false;
  }

  public onRuntimeLocked(): void {
    if (this.lockedAt == null) {
      this.lockedAt = Date.now();
    }
  }

  public recordUnlocked(): void {
    if (this.lockedAt != null) {
      const duration = Date.now() - this.lockedAt;
      void metricsService.trackMetric("auth_locked_duration_ms", duration);
      this.lockedAt = null;
    }
  }

  /**
   * Android / resume — token memoria perdido + validación suave.
   */
  public async onForegroundVisible(): Promise<void> {
    const now = Date.now();
    if (now - this.lastForegroundAt < INTEGRITY_FOREGROUND_COOLDOWN_MS) return;
    this.lastForegroundAt = now;

    const store = useRuntimeStore.getState();
    if (!store.currentUser) return;

    if (!navigator.onLine) {
      if (store.authPhase === "ONLINE_AUTH") {
        authLifecycle.transitionPhase("OFFLINE_SESSION", "foreground_offline");
      }
      return;
    }

    if (store.authPhase === "LOCKED_RUNTIME") {
      return;
    }

    if (
      store.authPhase === "OFFLINE_SESSION" ||
      store.authPhase === "REAUTH_REQUIRED" ||
      store.authPhase === "SAFE_OFFLINE_RECOVERY"
    ) {
      void authLifecycle.handleReconnect("foreground");
      return;
    }

    void this.runCheck("foreground");
  }

  public runCheck(trigger: IntegrityTrigger): Promise<IntegrityResult> {
    if (this.checkInFlight) {
      return this.checkInFlight;
    }

    this.checkInFlight = this.executeCheck(trigger).finally(() => {
      this.checkInFlight = null;
    });

    return this.checkInFlight;
  }

  private async executeCheck(trigger: IntegrityTrigger): Promise<IntegrityResult> {
    const isDev = import.meta.env.DEV;
    let tCpuStart = 0;
    let tCpuTotal = 0;

    if (isDev) {
      console.log("[AUTH] integrity check start");
      tCpuStart = performance.now();
    }

    const store = useRuntimeStore.getState();
    const start = performance.now();

    // Skip heartbeat if already locked or reauth required to avoid loops
    if (store.authPhase === "REAUTH_REQUIRED" || store.authPhase === "LOCKED_RUNTIME") {
      if (isDev) {
        console.log("[AUTH] phase skip");
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "phase_skip" };
    }

    if (!store.currentUser) {
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "no_user" };
    }

    // Skip calling /api/auth/me if completely offline
    if (!navigator.onLine) {
      if (isDev) {
        console.log("[AUTH] offline skip");
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "offline" };
    }

    if (document.hidden && trigger !== "manual" && trigger !== "post_login") {
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "tab_hidden" };
    }

    if (authLifecycle.isAuthPipelineActive()) {
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "auth_pipeline_busy" };
    }

    const now = Date.now();
    if (
      trigger === "heartbeat" &&
      now - this.lastCheckAt < INTEGRITY_CHECK_COOLDOWN_MS
    ) {
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "cooldown" };
    }

    const tokenDrift = detectTokenSessionDrift(store.currentUser);
    if (tokenDrift) {
      void metricsService.trackMetric("auth_runtime_drift_detected", 1, {
        kind: tokenDrift.kind,
        trigger,
      });
      authLifecycle.lockRuntime(tokenDrift.lockReason);
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: tokenDrift.kind, locked: true };
    }

    const snapshot = await readOfflineSnapshot();
    if (snapshot && !isSnapshotStructurallyValid(snapshot)) {
      void metricsService.trackMetric("auth_runtime_drift_detected", 1, {
        kind: "snapshot_corrupt",
        trigger,
      });
      authLifecycle.transitionPhase("SAFE_OFFLINE_RECOVERY", "snapshot_corrupt");
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "snapshot_corrupt" };
    }

    if (store.authPhase !== "ONLINE_AUTH" && trigger === "heartbeat") {
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: "not_online_auth" };
    }

    if (store.authPhase !== "ONLINE_AUTH" && trigger !== "manual" && trigger !== "post_login") {
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: false, reason: store.authPhase };
    }

    if (isDev) {
      tCpuTotal += performance.now() - tCpuStart;
    }

    // Exclude network wait from scripting duration
    const me = await this.fetchMe();

    if (isDev) {
      tCpuStart = performance.now();
    }

    const duration = performance.now() - start;
    void metricsService.trackMetric("auth_runtime_integrity_check_ms", duration, {
      trigger,
      status: me.status,
    });

    this.lastCheckAt = now;

    if (me.ok && me.user) {
      const drift = detectSessionDrift(store.currentUser, me.user, snapshot);
      if (drift) {
        void metricsService.trackMetric("auth_runtime_drift_detected", 1, {
          kind: drift.kind,
          trigger,
        });
        authLifecycle.lockRuntime(drift.lockReason);
        if (isDev) {
          tCpuTotal += performance.now() - tCpuStart;
          console.log("[AUTH] integrity check end");
          console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
        }
        return { ok: false, reason: drift.kind, locked: true };
      }

      // Strict state diffing to skip redundant updates in Zustand store
      const unchanged = (store.currentUser?.id === me.user.id) &&
                        (store.currentUser?.sessionVersion === me.user.sessionVersion) &&
                        (store.authPhase === "ONLINE_AUTH");

      if (unchanged) {
        if (isDev) {
          console.log("[AUTH] auth unchanged");
          tCpuTotal += performance.now() - tCpuStart;
          console.log("[AUTH] integrity check end");
          console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
        }
        // Still save snapshot to remain fresh locally, but skip Zustand trigger
        const snap = await buildSnapshotFromUser(
          me.user,
          me.user.sessionVersion ?? 0,
          me.lastValidatedAt ?? new Date().toISOString()
        );
        await writeOfflineSnapshot(snap);
        return { ok: true, source: trigger };
      }

      if (isDev) {
        console.log("[AUTH] auth updated");
      }
      await this.applyMeValidation(me.user, me.lastValidatedAt);
      if (isDev) {
        tCpuTotal += performance.now() - tCpuStart;
        console.log("[AUTH] integrity check end");
        console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
      }
      return { ok: true, source: trigger };
    }

    const res = await this.handleMeFailure(me, trigger);
    if (isDev) {
      tCpuTotal += performance.now() - tCpuStart;
      console.log("[AUTH] integrity check end");
      console.log(`[AUTH] integrity duration: ${tCpuTotal.toFixed(2)}ms`);
    }
    return res;
  }

  private async fetchMe(): Promise<{
    ok: boolean;
    user?: CurrentUser;
    lastValidatedAt?: string;
    status: number;
    code?: string;
  }> {
    try {
      const res = await authFetch("/api/auth/me", { method: "GET" });
      let code = `HTTP_${res.status}`;
      let body: MeResponse | null = null;

      try {
        body = (await res.json()) as MeResponse;
        code = body?.code ?? code;
      } catch {
        // ignore
      }

      if (res.ok && body?.data?.user?.id) {
        const u = body.data.user;
        return {
          ok: true,
          user: {
            id: u.id,
            nombre: u.nombre,
            email: u.email,
            permisos: u.permisos,
            sessionVersion: u.sessionVersion ?? 0,
          },
          lastValidatedAt: body.data.lastValidatedAt,
          status: res.status,
        };
      }

      return { ok: false, status: res.status, code };
    } catch {
      return { ok: false, status: 0, code: "NETWORK" };
    }
  }

  private async applyMeValidation(
    user: CurrentUser,
    lastValidatedAt?: string
  ): Promise<void> {
    const snapshot = await buildSnapshotFromUser(
      user,
      user.sessionVersion ?? 0,
      lastValidatedAt ?? new Date().toISOString()
    );
    await writeOfflineSnapshot(snapshot);
    useRuntimeStore.getState().setCurrentUser(user);
    authLifecycle.transitionPhase("ONLINE_AUTH", "me_validated");
  }

  private async handleMeFailure(
    me: { status: number; code?: string },
    trigger: IntegrityTrigger
  ): Promise<IntegrityResult> {
    const code = me.code ?? `HTTP_${me.status}`;

    if (code === "SNAPSHOT_SIGNATURE_MISMATCH") {
      void metricsService.trackMetric("auth_runtime_revoked", 1, { code, trigger });
      const store = useRuntimeStore.getState();
      
      const { throttledSecurityLog } = await import("./auth.api");
      throttledSecurityLog("snapshot-mismatch", "Snapshot signature mismatch detected");

      if (store.lockedReason === "SNAPSHOT_SIGNATURE_MISMATCH") {
        // Mismatch persists after online validation. Clear ONLY snapshot auth!
        const { clearOfflineSnapshot } = await import("./auth.snapshot");
        await clearOfflineSnapshot();
        
        store.setCurrentUser(null);
        store.setLockedReason(null);
        store.setReconnectRequired(true);
        authLifecycle.transitionPhase("REAUTH_REQUIRED", "snapshot_mismatch_persistent");
        
        return { ok: false, reason: "SNAPSHOT_SIGNATURE_MISMATCH_PERSISTED" };
      } else {
        // First mismatch: transition to LOCKED_RUNTIME, block sync, require online validation
        authLifecycle.lockRuntime("SNAPSHOT_SIGNATURE_MISMATCH");
        return { ok: false, reason: code, locked: true };
      }
    }

    if (code === "ACCOUNT_DISABLED") {
      void metricsService.trackMetric("auth_runtime_revoked", 1, { code, trigger });
      authLifecycle.lockRuntime("ACCOUNT_DISABLED");
      return { ok: false, reason: code, locked: true };
    }

    if (code === "SESSION_INVALIDATED" || code === "SESSION_REVOKED") {
      void metricsService.trackMetric("auth_runtime_revoked", 1, { code, trigger });
      authLifecycle.lockRuntime("SESSION_REVOKED");
      return { ok: false, reason: code, locked: true };
    }

    if (me.status === 401 || me.status === 403) {
      if (trigger === "manual" || trigger === "foreground" || trigger === "reconnect") {
        const isDev = import.meta.env.DEV;
        if (this.refreshInFlight) {
          if (isDev) {
            console.log("[AUTH] refresh skipped");
          }
          return { ok: false, reason: "refresh_in_flight" };
        }

        if (isDev) {
          console.log("[AUTH] refresh in-flight");
        }
        this.refreshInFlight = true;

        try {
          const refreshed = await authLifecycle.ensureFreshSession("integrity_check", {
            force: trigger === "manual",
          });
          if (refreshed) {
            const retry = await this.fetchMe();
            if (retry.ok && retry.user) {
              const snap = await readOfflineSnapshot();
              const store = useRuntimeStore.getState();
              const drift = detectSessionDrift(store.currentUser, retry.user, snap);
              if (drift) {
                authLifecycle.lockRuntime(drift.lockReason);
                return { ok: false, reason: drift.kind, locked: true };
              }
              await this.applyMeValidation(retry.user, retry.lastValidatedAt);
              return { ok: true, source: trigger };
            }
          }
        } finally {
          this.refreshInFlight = false;
        }
      }
      authLifecycle.transitionPhase("REAUTH_REQUIRED", code);
      useRuntimeStore.getState().setReconnectRequired(true);
      return { ok: false, reason: code };
    }

    return { ok: false, reason: code };
  }

  public async tryRestoreSession(): Promise<boolean> {
    const isDev = import.meta.env.DEV;
    if (this.refreshInFlight) {
      if (isDev) {
        console.log("[AUTH] refresh skipped");
      }
      return false;
    }

    if (isDev) {
      console.log("[AUTH] refresh in-flight");
    }
    this.refreshInFlight = true;

    try {
      const refreshed = await authLifecycle.ensureFreshSession("manual", { force: true });
      if (!refreshed) {
        await metricsService.trackMetric("auth_session_restore_failed", 1);
        return false;
      }

      const integrity = await this.runCheck("manual");
      if (!integrity.ok && integrity.locked) {
        await metricsService.trackMetric("auth_session_restore_failed", 1, {
          reason: integrity.reason,
        });
        return false;
      }

      authLifecycle.promoteSessionRestored("restore");
      await metricsService.trackMetric("auth_session_restore_success", 1);
      await metricsService.trackMetric("auth_runtime_recovered", 1, { path: "restore" });
      return true;
    } finally {
      this.refreshInFlight = false;
    }
  }
}

export const authIntegrity = new AuthIntegrityMonitor();
export default authIntegrity;
