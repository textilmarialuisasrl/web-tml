import React, { useEffect, useState } from "react";
import { useRuntimeStore } from "../../runtime/runtime.store";
import { useShallow } from "zustand/react/shallow";
import { selectLockedReason, selectReconnectRequired, selectCanContinueOffline } from "../../auth/auth.selectors";
import { authIntegrity } from "../../auth/auth.integrity";
import { authLifecycle } from "../../auth/auth.lifecycle";
import { authService } from "../../services/auth.service";
import { readOfflineSnapshot } from "../../auth/auth.snapshot";
import type { AuthPhase } from "../../auth/auth.types";

const LOCK_LABELS: Record<string, string> = {
  SESSION_REVOKED: "Sesión cerrada en otro dispositivo",
  ACCOUNT_DISABLED: "Cuenta deshabilitada",
  REFRESH_BUDGET_EXCEEDED: "Reintentos de sesión agotados",
  INVALID_SESSION_VERSION: "Sesión desactualizada — reingrese",
};

function resolveMotivo(phase: AuthPhase, lockedReason: string | null): string {
  if (lockedReason && LOCK_LABELS[lockedReason]) {
    return LOCK_LABELS[lockedReason];
  }
  if (phase === "REAUTH_REQUIRED") return "Sesión expirada — reingrese para sincronizar";
  if (phase === "SAFE_OFFLINE_RECOVERY") return "Recuperación segura — valide sesión";
  if (phase === "OFFLINE_SESSION") return "Sin conexión — operación local activa";
  return "Validación de sesión requerida";
}

export const AuthRecoveryScreen: React.FC = () => {
  const { online, pending, conflicts, failed, authPhase, currentUser } = useRuntimeStore(
    useShallow((s) => ({
      online: s.online,
      pending: s.syncPending,
      conflicts: s.conflicts,
      failed: s.failed,
      authPhase: s.authPhase,
      currentUser: s.currentUser,
    }))
  );
  const lockedReason = useRuntimeStore(selectLockedReason);
  const reconnectRequired = useRuntimeStore(selectReconnectRequired);
  const canOffline = useRuntimeStore(selectCanContinueOffline);

  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastValidatedAt, setLastValidatedAt] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(authPhase === "REAUTH_REQUIRED");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void readOfflineSnapshot().then((snap) => {
      setLastValidatedAt(snap?.lastValidatedAt ?? null);
    });
  }, [authPhase, lockedReason]);

  const motivo = resolveMotivo(authPhase, lockedReason);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  // Full login view for unauthenticated states
  if (!currentUser) {
    return (
      <section className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-sm mx-auto space-y-4 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-200">
            Ingreso al Sistema
          </h2>
          <p className="text-xs text-gray-400 font-medium">Identifíquese con sus credenciales de planta</p>
        </div>
        {status && (
          <p className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {status}
          </p>
        )}
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run("login", async () => {
              await authService.login(email.trim(), password);
              setStatus("Sesión iniciada");
            });
          }}
        >
          <div className="space-y-1 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Correo Electrónico</label>
            <input
              type="email"
              autoComplete="username"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-blue-500 text-gray-200 transition"
              required
            />
          </div>
          <div className="space-y-1 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-blue-500 text-gray-200 transition"
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy === "login"}
            className="w-full bg-blue-600 active:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-sm transition active:scale-[0.98] uppercase tracking-wide cursor-pointer"
          >
            {busy === "login" ? "Ingresando…" : "INGRESAR"}
          </button>
        </form>
      </section>
    );
  }

  // Recovery / locking screen for existing sessions
  return (
    <section
      className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 space-y-4"
      aria-live="polite"
    >
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-100">
          Recuperación de sesión
        </h2>
        <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">{motivo}</p>
        {lockedReason && (
          <p className="text-[10px] text-amber-300/70 mt-1 font-mono">{lockedReason}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
        <div className="bg-gray-900/80 rounded-lg px-3 py-2 border border-gray-800">
          <div className="text-gray-500 text-[10px] uppercase">Cola pendiente</div>
          <div className="text-lg font-bold text-blue-400">{pending}</div>
        </div>
        <div className="bg-gray-900/80 rounded-lg px-3 py-2 border border-gray-800">
          <div className="text-gray-500 text-[10px] uppercase">Conexión</div>
          <div className={`text-sm font-bold ${online ? "text-green-400" : "text-yellow-400"}`}>
            {online ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
        <div className="bg-gray-900/80 rounded-lg px-3 py-2 border border-gray-800">
          <div className="text-gray-500 text-[10px] uppercase">Conflictos / Fallos</div>
          <div className="text-sm font-semibold">
            <span className="text-orange-400">{conflicts}</span>
            {" / "}
            <span className="text-red-400">{failed}</span>
          </div>
        </div>
        <div className="bg-gray-900/80 rounded-lg px-3 py-2 border border-gray-800">
          <div className="text-gray-500 text-[10px] uppercase">Última validación</div>
          <div className="text-[10px] font-mono text-gray-400 truncate">
            {lastValidatedAt
              ? new Date(lastValidatedAt).toLocaleString()
              : "—"}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-gray-500 leading-relaxed">
        Los movimientos locales no se borran. La sincronización permanece pausada hasta
        validar sesión.
      </p>

      {status && (
        <p className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {status}
        </p>
      )}

      {showLogin ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("login", async () => {
              await authService.login(email.trim(), password);
              setShowLogin(false);
              setStatus("Sesión restaurada");
            });
          }}
        >
          <input
            type="email"
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-blue-500 text-gray-205"
            required
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-blue-500 text-gray-205"
            required
          />
          <button
            type="submit"
            disabled={busy != null}
            className="w-full bg-blue-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm"
          >
            {busy === "login" ? "Ingresando…" : "INGRESAR"}
          </button>
          <button
            type="button"
            onClick={() => setShowLogin(false)}
            className="w-full text-xs text-gray-500 py-1"
          >
            Volver
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy != null}
            onClick={() =>
              void run("revalidate", async () => {
                const ok = await authIntegrity.tryRestoreSession();
                if (!ok) {
                  const reconnected = await authLifecycle.handleReconnect("manual");
                  if (!reconnected) {
                    throw new Error("No se pudo revalidar la sesión");
                  }
                }
                setStatus("Sesión revalidada");
              })
            }
            className="w-full bg-amber-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm"
          >
            {busy === "revalidate" ? "Validando…" : "REVALIDAR SESIÓN"}
          </button>

          <button
            type="button"
            disabled={busy != null}
            onClick={() => {
              if (authPhase === "LOCKED_RUNTIME") {
                authLifecycle.releaseLockForReauth();
              }
              setShowLogin(true);
            }}
            className="w-full bg-gray-800 text-gray-100 font-bold py-3.5 rounded-xl border border-gray-600 text-sm"
          >
            REINGRESAR
          </button>

          {canOffline && (
            <button
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run("offline", async () => {
                  authLifecycle.continueOfflineFromRecovery();
                  setStatus("Modo offline — sync pausado");
                })
              }
              className="w-full bg-gray-900 text-gray-300 font-semibold py-3 rounded-xl border border-gray-700 text-xs"
            >
              {busy === "offline" ? "…" : "CONTINUAR OFFLINE"}
            </button>
          )}
        </div>
      )}

      {reconnectRequired && authPhase !== "LOCKED_RUNTIME" && (
        <p className="text-[10px] text-amber-400/80">Reconexión de sesión pendiente</p>
      )}
    </section>
  );
};

export default AuthRecoveryScreen;
