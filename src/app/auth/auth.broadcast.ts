import {
  AUTH_BROADCAST_CHANNEL,
  LS_REFRESH_RESULT,
} from "./auth.constants";
import { useRuntimeStore, type CurrentUser } from "../runtime/runtime.store";
import type { RuntimeLockReason } from "./auth.types";
import type { RefreshResult } from "./auth.refresh";

export type AuthBroadcastEvent = (
  | { type: "REFRESH_STARTED"; tabId: string; at: number; reason: string }
  | {
      type: "REFRESH_SUCCESS";
      tabId: string;
      at: number;
      user: CurrentUser;
      accessToken?: string;
      snapshotSignature?: string | null;
    }
  | { type: "REFRESH_FAILED"; tabId: string; at: number; code: string; status: number }
  | { type: "SESSION_REVOKED"; at: number; code?: string }
  | { type: "RUNTIME_LOCKED"; at: number; reason: RuntimeLockReason | string }
  | { type: "RUNTIME_UNLOCKED"; at: number; targetPhase?: string }
  | { type: "SESSION_RESTORED"; at: number; userId?: string }
  | { type: "LOGOUT"; at: number }
) & {
  sourceId?: string;
  timestamp?: number;
  eventId?: string;
};

type Listener = (msg: AuthBroadcastEvent) => void;

const TAB_ID =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Date.now()}`;

class AuthBroadcast {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<Listener>();
  private storageBound = false;

  public getTabId(): string {
    return TAB_ID;
  }

  public init(): void {
    if (typeof window === "undefined") return;
    if (!this.storageBound) {
      window.addEventListener("storage", this.onStorage);
      this.storageBound = true;
    }
    if (typeof BroadcastChannel === "undefined") return;
    if (this.channel) return;

    this.channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    if (import.meta.env.DEV) {
      console.log(`[BROADCAST] channel created (ID: ${AUTH_BROADCAST_CHANNEL})`);
    }

    this.channel.onmessage = (ev: MessageEvent<AuthBroadcastEvent>) => {
      this.handleIncomingMessage(ev.data);
    };
  }

  public close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
      if (import.meta.env.DEV) {
        console.log(`[BROADCAST] channel closed (ID: ${AUTH_BROADCAST_CHANNEL})`);
      }
    }
    if (this.storageBound) {
      window.removeEventListener("storage", this.onStorage);
      this.storageBound = false;
    }
  }

  public subscribe(fn: Listener): () => void {
    this.init();
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public publish(msg: AuthBroadcastEvent): void {
    this.init();
    
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fullMsg: AuthBroadcastEvent = {
      ...msg,
      sourceId: TAB_ID,
      timestamp: Date.now(),
      eventId,
    };

    try {
      this.channel?.postMessage(fullMsg);
    } catch {
      // BC no disponible
    }

    if (msg.type === "REFRESH_SUCCESS" || msg.type === "REFRESH_FAILED") {
      try {
        localStorage.setItem(
          LS_REFRESH_RESULT,
          JSON.stringify({ ...fullMsg, at: Date.now() })
        );
      } catch {
        // quota / private mode
      }
    }
  }

  /** Fallback Android: esperar resultado de otra pestaña vía BC o storage. */
  public waitForRemoteRefresh(timeoutMs: number): Promise<RefreshResult | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      const onMsg = (msg: AuthBroadcastEvent) => {
        if (msg.type === "REFRESH_SUCCESS" && msg.tabId !== TAB_ID) {
          cleanup();
          resolve({
            ok: true,
            user: msg.user,
            snapshotSignature: msg.snapshotSignature,
            fromRemoteTab: true,
          });
        }
        if (msg.type === "REFRESH_FAILED" && msg.tabId !== TAB_ID) {
          cleanup();
          resolve({
            ok: false,
            code: msg.code,
            status: msg.status,
            fromRemoteTab: true,
          });
        }
        if (msg.type === "SESSION_REVOKED" || msg.type === "RUNTIME_LOCKED") {
          cleanup();
          const code =
            msg.type === "RUNTIME_LOCKED" ? msg.reason : "SESSION_REVOKED";
          resolve({ ok: false, code: String(code), status: 401, fromRemoteTab: true });
        }
      };

      const unsub = this.subscribe(onMsg);

      const cleanup = () => {
        clearTimeout(timer);
        unsub();
      };

      try {
        const raw = localStorage.getItem(LS_REFRESH_RESULT);
        if (raw) {
          const parsed = JSON.parse(raw) as AuthBroadcastEvent & { at: number };
          if (Date.now() - parsed.at < 5000) {
            onMsg(parsed);
          }
        }
      } catch {
        // ignore
      }
    });
  }

  private handleIncomingMessage(msg: AuthBroadcastEvent): void {
    if (!msg?.type) return;

    const isDev = import.meta.env.DEV;

    // Guard 1: self-message skip
    if (msg.sourceId === TAB_ID) {
      if (isDev) {
        console.log("[BROADCAST] self-message skipped");
      }
      return;
    }

    // Guard 2: offline skip
    if (!navigator.onLine && ["REFRESH_STARTED", "REFRESH_SUCCESS", "REFRESH_FAILED"].includes(msg.type)) {
      if (isDev) {
        console.log(`[BROADCAST] message skipped: offline skip (${msg.type})`);
      }
      return;
    }

    // Guard 3: authPhase skip
    const store = useRuntimeStore.getState();
    if ((store.authPhase === "LOCKED_RUNTIME" || store.authPhase === "REAUTH_REQUIRED") &&
        ["REFRESH_STARTED", "REFRESH_FAILED"].includes(msg.type)) {
      if (isDev) {
        console.log(`[BROADCAST] message skipped: authPhase skip (${msg.type})`);
      }
      return;
    }

    // Guard 4: hidden tab skip (DEV optional)
    if (isDev && document.hidden && ["REFRESH_STARTED"].includes(msg.type)) {
      if (isDev) {
        console.log(`[BROADCAST] message skipped: hidden tab skip (${msg.type})`);
      }
      return;
    }

    // Timing and Execution
    const start = performance.now();
    if (isDev) {
      console.log(`[BROADCAST] message start: ${msg.type}`);
    }

    // Dispatch to listeners
    for (const fn of this.listeners) {
      try {
        fn(msg);
      } catch (err) {
        console.error("[BROADCAST] listener error:", err);
      }
    }

    if (isDev) {
      console.log(`[BROADCAST] message end: ${msg.type}`);
      console.log(`[BROADCAST] duration: ${(performance.now() - start).toFixed(2)}ms`);
    }
  }

  private onStorage = (ev: StorageEvent): void => {
    if (ev.key !== LS_REFRESH_RESULT || !ev.newValue) return;
    try {
      const msg = JSON.parse(ev.newValue) as AuthBroadcastEvent;
      this.handleIncomingMessage(msg);
    } catch {
      // ignore
    }
  };
}

export const authBroadcast = new AuthBroadcast();
export default authBroadcast;
