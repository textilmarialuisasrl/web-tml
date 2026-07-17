import React, { useEffect, useState } from "react";
import { useRuntimeStore } from "../../runtime/runtime.store";
import { useShallow } from "zustand/react/shallow";
import { selectLockedReason, selectCanContinueOffline } from "../../auth/auth.selectors";
import { authLifecycle } from "../../auth/auth.lifecycle";
import { authService } from "../../services/auth.service";
import { readOfflineSnapshot } from "../../auth/auth.snapshot";

export const AuthRecoveryScreen: React.FC = () => {
  const { authPhase, currentUser } = useRuntimeStore(
    useShallow((s) => ({
      authPhase: s.authPhase,
      currentUser: s.currentUser,
    }))
  );
  const lockedReason = useRuntimeStore(selectLockedReason);
  const canOffline = useRuntimeStore(selectCanContinueOffline);

  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Pre-fill email if user already has an expired session
  useEffect(() => {
    if (currentUser?.email) {
      setEmail(currentUser.email);
    } else {
      void readOfflineSnapshot().then((snap) => {
        if (snap?.email) {
          setEmail(snap.email);
        }
      });
    }
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("login");
    setStatus(null);
    try {
      await authService.login(email.trim(), password);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setBusy(null);
    }
  };

  const handleContinueOffline = async () => {
    setBusy("offline");
    setStatus(null);
    try {
      authLifecycle.continueOfflineFromRecovery();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al entrar en modo offline");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Alert Banner for expired/locked sessions */}
      {currentUser && (
        <div className="border border-error-container/30 bg-error-container/10 text-error rounded p-3 text-xs leading-relaxed text-center font-bold">
          La sesión expiró. Inicie sesión nuevamente.
          {lockedReason && (
            <span className="block text-[9px] font-mono opacity-80 mt-0.5 uppercase tracking-wide">
              Motivo: {lockedReason}
            </span>
          )}
        </div>
      )}

      {status && (
        <div className="border border-error-container/30 bg-error-container/10 text-error rounded p-3 text-xs text-center font-bold">
          {status}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field (Only editable if no current user session exists) */}
        <div className="space-y-1 text-left">
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
            Correo Electrónico
          </label>
          <input
            type="email"
            autoComplete="username"
            placeholder="ejemplo@textilmarialuisa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy === "login" || !!currentUser}
            className="w-full bg-surface-container border border-outline rounded px-3 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary disabled:opacity-75 disabled:cursor-not-allowed"
            required
          />
        </div>

        {/* Password Field */}
        <div className="space-y-1 text-left">
          <div className="flex justify-between items-center">
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Contraseña
            </label>
            {currentUser && (
              <button
                type="button"
                onClick={() => {
                  void authService.logout();
                }}
                className="text-[9px] font-bold text-primary hover:underline uppercase tracking-wide cursor-pointer"
              >
                Cambiar de Cuenta
              </button>
            )}
          </div>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy === "login"}
            className="w-full bg-surface-container border border-outline rounded px-3 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary"
            required
            autoFocus
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={busy !== null}
          className="w-full bg-primary hover:brightness-105 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-3 rounded text-xs transition uppercase tracking-wider cursor-pointer"
        >
          {busy === "login" ? "Ingresando…" : "INGRESAR"}
        </button>
      </form>

      {/* Offline continue button if applicable */}
      {currentUser && canOffline && (
        <button
          type="button"
          onClick={handleContinueOffline}
          disabled={busy !== null}
          className="w-full bg-surface-container-low hover:bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold py-2.5 rounded text-[10px] transition uppercase tracking-wider cursor-pointer"
        >
          {busy === "offline" ? "Cargando…" : "Continuar en modo Offline"}
        </button>
      )}
    </div>
  );
};

export default AuthRecoveryScreen;
