import { metricsService } from "../services/metrics.service";
import { useRuntimeStore, type CurrentUser } from "../runtime/runtime.store";
import type { AuthPhase, OfflineSessionSnapshot, RuntimeLockReason } from "./auth.types";
import { catalogService } from "../services/catalog.service";
import {
  clearAuthPersistence,
  hasLegacyJwt,
  migrateLegacyAuth,
  readOfflineSnapshot,
  snapshotToCurrentUser,
  writeOfflineSnapshot,
  buildSnapshotFromUser,
} from "./auth.snapshot";
import {
  clearAccessToken,
} from "./auth.session";
import { authBroadcast } from "./auth.broadcast";
import { authIntegrity } from "./auth.integrity";
import { RECONNECT_DEBOUNCE_MS } from "./auth.constants";
import {
  coordinatedRefresh,
  subscribeAuthBroadcast,
  type RefreshReason,
  type RefreshResult,
} from "./auth.refresh";


/**
 * Bootstrap + coordinación refresh/reconnect (8B.1 / 8B.3).
 */
class AuthLifecycle {
  private reconnectTimestamps: number[] = [];
  private bootstrapped = false;
  private coordinationReady = false;
  private reconnectInFlight: Promise<boolean> | null = null;
  private reconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubBroadcast: (() => void) | null = null;
  private onVisibility: (() => void) | null = null;

  public isBootstrapped(): boolean {
    return this.bootstrapped;
  }

  public isAuthPipelineActive(): boolean {
    return this.reconnectInFlight != null || useRuntimeStore.getState().isRefreshing;
  }

  public async waitForAuthSettlement(timeoutMs = 18_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && this.isAuthPipelineActive()) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  /**
   * Bloqueo operativo — todas las tabs vía BC; cola intacta.
   */
  public lockRuntime(
    reason: RuntimeLockReason | string,
    options?: { broadcast?: boolean; phase?: AuthPhase }
  ): void {
    const store = useRuntimeStore.getState();
    const phase = options?.phase ?? "LOCKED_RUNTIME";

    if (store.lockedReason === reason && store.authPhase === phase && store.reconnectRequired === true) {
      if (import.meta.env.DEV) {
        console.log(`[BROADCAST] unchanged: runtime already locked with reason ${reason}`);
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.warn(`[DevMode] Bloqueo de runtime prevenido. Motivo: ${reason}`);
      store.setLockedReason(reason);
      this.transitionPhase("REAUTH_REQUIRED", reason);
      store.setReconnectRequired(true);
      return;
    }
    clearAccessToken();
    store.setLockedReason(reason);
    this.transitionPhase(phase, reason);
    store.setReconnectRequired(true);

    authIntegrity.onRuntimeLocked();

    if (reason === "SESSION_REVOKED" || reason === "ACCOUNT_DISABLED" || reason === "INVALID_SESSION_VERSION") {
      void import("./auth.api").then((m) => {
        m.throttledSecurityLog("forced-session-revocation", `forced session revocation (reason: ${reason})`);
      });
    }

    if (options?.broadcast !== false) {
      authBroadcast.publish({ type: "RUNTIME_LOCKED", at: Date.now(), reason });
    }
  }

  public promoteSessionRestored(reason: string): void {
    const store = useRuntimeStore.getState();
    const phase: AuthPhase = navigator.onLine ? "ONLINE_AUTH" : "OFFLINE_SESSION";

    if (store.lockedReason === null && store.reconnectRequired === false && store.authPhase === phase) {
      if (import.meta.env.DEV) {
        console.log(`[BROADCAST] unchanged: session already promoted/restored`);
      }
      return;
    }

    store.setLockedReason(null);
    store.setReconnectRequired(false);
    this.transitionPhase(phase, reason);
    authIntegrity.recordUnlocked();
    authBroadcast.publish({
      type: "SESSION_RESTORED",
      at: Date.now(),
      userId: store.currentUser?.id,
    });
  }

  /** LOCKED → REAUTH para login limpio (cola intacta). */
  public releaseLockForReauth(): void {
    clearAccessToken();
    const store = useRuntimeStore.getState();
    store.setLockedReason(null);
    store.setReconnectRequired(true);
    this.transitionPhase("REAUTH_REQUIRED", "lock_release_reauth");
    authIntegrity.recordUnlocked();
    authBroadcast.publish({
      type: "RUNTIME_UNLOCKED",
      at: Date.now(),
      targetPhase: "REAUTH_REQUIRED",
    });
  }

  /** Modo offline operativo — solo si política lo permite. */
  public continueOfflineFromRecovery(): void {
    const store = useRuntimeStore.getState();
    if (!store.currentUser) return;
    clearAccessToken();
    store.setLockedReason(null);
    store.setReconnectRequired(false);
    this.transitionPhase("OFFLINE_SESSION", "continue_offline");
    authIntegrity.recordUnlocked();
    authBroadcast.publish({
      type: "RUNTIME_UNLOCKED",
      at: Date.now(),
      targetPhase: "OFFLINE_SESSION",
    });
  }

  /** Solo para disposeRuntimeSubsystems / teardown tests — no auto-recovery. */
  public teardownCoordination(): void {
    if (this.onVisibility) {
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.onVisibility = null;
    }
    this.unsubBroadcast?.();
    this.unsubBroadcast = null;
    authBroadcast.close();
    if (this.reconnectDebounceTimer) {
      const prevTimerId = this.reconnectDebounceTimer;
      clearTimeout(this.reconnectDebounceTimer);
      this.reconnectDebounceTimer = null;
      if (import.meta.env.DEV) {
        console.log(`[SCHEDULER] reconnect scheduler destroyed (ID: ${prevTimerId})`);
      }
    }
    this.coordinationReady = false;
  }

  public initCoordination(): void {
    if (this.coordinationReady || typeof window === "undefined") return;
    this.coordinationReady = true;

    authBroadcast.init();

    this.unsubBroadcast = subscribeAuthBroadcast((msg) => {
      if (msg.type === "REFRESH_SUCCESS" && msg.tabId !== authBroadcast.getTabId()) {
        void this.applyRemoteRefresh(msg.user, msg.snapshotSignature);
      }
      if (msg.type === "SESSION_REVOKED") {
        this.lockRuntime("SESSION_REVOKED", { broadcast: false });
      }
      if (msg.type === "RUNTIME_LOCKED") {
        this.lockRuntime(msg.reason as RuntimeLockReason, { broadcast: false });
      }
      if (msg.type === "RUNTIME_UNLOCKED") {
        const store = useRuntimeStore.getState();
        store.setLockedReason(null);
        authIntegrity.recordUnlocked();
        if (msg.targetPhase === "REAUTH_REQUIRED") {
          store.setReconnectRequired(true);
          this.transitionPhase("REAUTH_REQUIRED", "runtime_unlocked_remote");
        } else if (msg.targetPhase === "OFFLINE_SESSION") {
          store.setReconnectRequired(false);
          this.transitionPhase("OFFLINE_SESSION", "runtime_unlocked_remote");
        }
      }
      if (msg.type === "SESSION_RESTORED") {
        const store = useRuntimeStore.getState();
        store.setLockedReason(null);
        store.setReconnectRequired(false);
        authIntegrity.recordUnlocked();
        const phase: AuthPhase = navigator.onLine ? "ONLINE_AUTH" : "OFFLINE_SESSION";
        this.transitionPhase(phase, "session_restored_remote");
      }
      if (msg.type === "LOGOUT") {
        void this.onLogoutLocal({ broadcast: false });
      }
    });

    this.onVisibility = () => {
      const store = useRuntimeStore.getState();
      store.setTabHidden(document.hidden);
      if (!document.hidden && store.currentUser) {
        void authIntegrity.onForegroundVisible();
      }
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    useRuntimeStore.getState().setTabHidden(document.hidden);
  }

  public async bootstrap(): Promise<CurrentUser | null> {
    const store = useRuntimeStore.getState();

    let snapshot = await readOfflineSnapshot();

    if (!snapshot && (await hasLegacyJwt())) {
      const migration = await migrateLegacyAuth();
      if (migration.ok) {
        await metricsService.trackMetric("auth_legacy_migration_success", 1, {
          source: migration.source,
        });
        snapshot = await readOfflineSnapshot();
      } else {
        await metricsService.trackMetric("auth_legacy_migration_failed", 1, {
          reason: migration.reason,
        });
        this.transitionPhase("SAFE_OFFLINE_RECOVERY", "legacy_migration_failed");
        this.bootstrapped = true;
        return null;
      }
    }

    if (!snapshot) {
      await metricsService.trackMetric("auth_snapshot_missing", 1);
      this.transitionPhase("REAUTH_REQUIRED", "no_snapshot");
      this.bootstrapped = true;
      return null;
    }

    if (!this.validateSnapshotIntegrity(snapshot)) {
      await metricsService.trackMetric("auth_snapshot_corrupted", 1);
      this.transitionPhase("SAFE_OFFLINE_RECOVERY", "snapshot_corrupted");
      this.bootstrapped = true;
      return null;
    }

    const user = snapshotToCurrentUser(snapshot);
    store.setCurrentUser(user);

    if (!snapshot.snapshotSignature) {
      void import("./auth.api").then((m) => {
        m.throttledSecurityLog("unsigned-legacy-snapshot", "legacy unsigned snapshot detected");
      });
    }

    const phase = this.resolveBootPhase(store.safeMode);
    this.transitionPhase(phase, "snapshot_restored");

    await metricsService.trackMetric("auth_snapshot_restored", 1, {
      userId: snapshot.userId,
      phase,
    });

    this.bootstrapped = true;
    return user;
  }

  /**
   * Pipeline único: online / visibility / SW → refresh → snapshot → sync.
   */
  public handleReconnect(reason: RefreshReason): Promise<boolean> {
    const isDev = import.meta.env.DEV;
    if (this.reconnectDebounceTimer) {
      const prevTimerId = this.reconnectDebounceTimer;
      clearTimeout(this.reconnectDebounceTimer);
      this.reconnectDebounceTimer = null;
      if (isDev) {
        console.log(`[SCHEDULER] reconnect scheduler destroyed (ID: ${prevTimerId})`);
      }
    }

    return new Promise((resolve) => {
      const timerId = setTimeout(() => {
        this.reconnectDebounceTimer = null;
        
        const tickStart = performance.now();
        if (isDev) {
          console.log("[SCHEDULER] reconnect scheduler tick start");
        }

        const store = useRuntimeStore.getState();
        if (!navigator.onLine) {
          if (isDev) {
            console.log("[SCHEDULER] reconnect scheduler tick: offline skip");
            console.log("[SCHEDULER] reconnect scheduler tick end");
            console.log(`[SCHEDULER] reconnect scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
          }
          resolve(false);
          return;
        }

        if (!store.currentUser) {
          if (isDev) {
            console.log("[SCHEDULER] reconnect scheduler tick: noUser skip");
            console.log("[SCHEDULER] reconnect scheduler tick end");
            console.log(`[SCHEDULER] reconnect scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
          }
          resolve(false);
          return;
        }

        void this.runReconnectPipeline(reason).then(resolve);

        if (isDev) {
          console.log("[SCHEDULER] reconnect scheduler tick end");
          console.log(`[SCHEDULER] reconnect scheduler duration: ${(performance.now() - tickStart).toFixed(2)}ms`);
        }
      }, RECONNECT_DEBOUNCE_MS);

      this.reconnectDebounceTimer = timerId;
      if (isDev) {
        console.log(`[SCHEDULER] reconnect scheduler created (ID: ${timerId})`);
      }
    });
  }

  private async runReconnectPipeline(reason: RefreshReason): Promise<boolean> {
    const store = useRuntimeStore.getState();
    if (!store.currentUser || !navigator.onLine) {
      return false;
    }

    // Suspicious reconnect storm check
    const now = Date.now();
    this.reconnectTimestamps = this.reconnectTimestamps.filter((t) => now - t < 60_000);
    this.reconnectTimestamps.push(now);
    if (this.reconnectTimestamps.length > 5) {
      void import("./auth.api").then((m) => {
        m.throttledSecurityLog("suspicious-reconnect-storm", "suspicious reconnect storm detected");
      });
    }

    if (document.hidden && reason !== "foreground" && reason !== "boot") {
      await metricsService.trackMetric("auth_refresh_visibility_skip", 1, {
        reason,
        context: "reconnect",
      });
      store.setReconnectRequired(true);
      return false;
    }

    if (this.reconnectInFlight) {
      return this.reconnectInFlight;
    }

    await metricsService.trackMetric("auth_reconnect_pipeline_start", 1, { reason });
    const pipelineStart = performance.now();

    this.reconnectInFlight = (async () => {
      try {
        const ok = await this.ensureFreshSession(reason, {
          allowHidden: reason === "boot",
        });
        const pipelineMs = performance.now() - pipelineStart;
        void metricsService.trackMetric("reconnect_pipeline_duration_ms", pipelineMs, {
          reason,
        });

        if (ok) {
          store.setReconnectRequired(false);
          await metricsService.trackMetric("auth_reconnect_pipeline_success", 1, { reason });
          void authIntegrity.runCheck("reconnect");
          const { syncEngine } = await import("../sync/sync-engine");
          syncEngine.triggerSync();
          return true;
        }
        await metricsService.trackMetric("auth_reconnect_pipeline_failed", 1, { reason });
        return false;
      } catch {
        await metricsService.trackMetric("auth_reconnect_pipeline_failed", 1, {
          reason,
          code: "exception",
        });
        return false;
      } finally {
        this.reconnectInFlight = null;
      }
    })();

    return this.reconnectInFlight;
  }

  public async ensureFreshSession(
    reason: RefreshReason,
    options: { force?: boolean; allowHidden?: boolean } = {}
  ): Promise<boolean> {
    const store = useRuntimeStore.getState();
    if (!store.currentUser) return false;

    if (!navigator.onLine) {
      this.transitionPhase("OFFLINE_SESSION", "offline");
      return false;
    }

    const result = await coordinatedRefresh(reason, {
      force: options.force,
      allowHidden: options.allowHidden,
    });

    return this.applyRefreshResult(result, reason);
  }


  private async applyRefreshResult(
    result: RefreshResult,
    reason: string
  ): Promise<boolean> {
    if (result.ok) {
      await this.persistSessionFromRefresh(result.user, result.snapshotSignature);
      this.transitionPhase("ONLINE_AUTH", `refresh_ok:${reason}`);
      if (reason === "manual" || reason === "foreground_resume") {
        void metricsService.trackMetric("auth_runtime_recovered", 1, { reason });
      }
      return true;
    }

    if (result.budgetExceeded) {
      this.lockRuntime("REFRESH_BUDGET_EXCEEDED");
      await metricsService.trackMetric("auth_reconnect_required", 1, { reason: "budget" });
      return false;
    }

    if (result.code === "COOLDOWN" || result.code === "TAB_HIDDEN") {
      const store = useRuntimeStore.getState();
      const currentPhase = store.authPhase;
      const phase = currentPhase === "ONLINE_AUTH" ? "ONLINE_AUTH" : "OFFLINE_SESSION";
      this.transitionPhase(phase, result.code.toLowerCase());
      return phase === "ONLINE_AUTH";
    }

    if (result.code === "ACCOUNT_DISABLED") {
      this.lockRuntime("ACCOUNT_DISABLED");
      return false;
    }

    if (
      result.code === "SESSION_REVOKED" ||
      result.code === "SESSION_INVALIDATED"
    ) {
      this.lockRuntime("SESSION_REVOKED");
      return false;
    }

    if (result.status === 401 || result.status === 403) {
      this.transitionPhase("REAUTH_REQUIRED", result.code);
      useRuntimeStore.getState().setReconnectRequired(true);
      return false;
    }

    if (!navigator.onLine) {
      this.transitionPhase("OFFLINE_SESSION", "refresh_offline");
      return false;
    }

    this.transitionPhase("OFFLINE_SESSION", `refresh_failed:${result.code}`);
    return false;
  }

  private async persistSessionFromRefresh(
    user: CurrentUser,
    snapshotSignature?: string | null
  ): Promise<void> {
    const sessionVersion = user.sessionVersion ?? 0;
    const snapshot = await buildSnapshotFromUser(
      user,
      sessionVersion,
      new Date().toISOString(),
      snapshotSignature
    );
    await writeOfflineSnapshot(snapshot);
    useRuntimeStore.getState().setCurrentUser({ ...user, sessionVersion });
  }

  private async applyRemoteRefresh(user: CurrentUser, snapshotSignature?: string | null): Promise<void> {
    const store = useRuntimeStore.getState();
    const currentVersion = store.currentUser?.sessionVersion;
    
    if (store.currentUser?.id === user.id && 
        currentVersion === user.sessionVersion) {
      if (import.meta.env.DEV) {
        console.log("[BROADCAST] unchanged: remote refresh matches current session");
      }
      return;
    }

    await this.persistSessionFromRefresh(user, snapshotSignature);
    this.transitionPhase("ONLINE_AUTH", "remote_tab_refresh");
    await metricsService.trackMetric("auth_refresh_multitab_sync", 1, {
      context: "apply_remote",
    });
  }

  private validateSnapshotIntegrity(snapshot: OfflineSessionSnapshot): boolean {
    return Boolean(snapshot.userId && snapshot.email && Array.isArray(snapshot.permisos));
  }

  public resolveBootPhase(safeMode: boolean): AuthPhase {
    if (safeMode) return "SAFE_OFFLINE_RECOVERY";
    if (!navigator.onLine) return "OFFLINE_SESSION";
    const store = useRuntimeStore.getState();
    if (store.currentUser) return "ONLINE_AUTH";
    return "OFFLINE_SESSION";
  }

  public transitionPhase(next: AuthPhase, reason: string): void {
    const store = useRuntimeStore.getState();
    const prev = store.authPhase;
    if (prev === next) {
      if (import.meta.env.DEV) {
        console.log(`[BROADCAST] unchanged: authPhase is already ${next}`);
      }
      return;
    }

    store.setAuthPhase(next, reason);
    void metricsService.trackMetric("auth_phase_transition", 1, {
      from: prev,
      to: next,
      reason,
    });

    if (next === "ONLINE_AUTH") {
      catalogService.syncCatalogos().catch(() => {});
    }
  }

  public async onLoginSuccess(
    user: CurrentUser,
    snapshotSignature?: string | null
  ): Promise<void> {
    const sessionVersion = user.sessionVersion ?? 0;

    const snapshot = await buildSnapshotFromUser(
      user,
      sessionVersion,
      new Date().toISOString(),
      snapshotSignature
    );
    await writeOfflineSnapshot(snapshot);

    useRuntimeStore.getState().setCurrentUser({ ...user, sessionVersion });
    this.promoteSessionRestored("login_success");
    void authIntegrity.runCheck("post_login");
    const { syncEngine } = await import("../sync/sync-engine");
    if (navigator.onLine) {
      syncEngine.triggerSync();
    }
  }

  public async onLogoutLocal(options?: { broadcast?: boolean }): Promise<void> {
    await clearAuthPersistence();
    const store = useRuntimeStore.getState();
    store.setCurrentUser(null);
    store.setLockedReason(null);
    store.setReconnectRequired(false);
    this.transitionPhase("REAUTH_REQUIRED", "logout_local");

    if (options?.broadcast !== false) {
      authBroadcast.publish({ type: "LOGOUT", at: Date.now() });
    }
  }
}

export const authLifecycle = new AuthLifecycle();
export default authLifecycle;
