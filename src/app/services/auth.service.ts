import { authLifecycle } from "../auth/auth.lifecycle";
import { authFetch } from "../auth/auth.api";
import { getAccessToken } from "../auth/auth.session";
import { readOfflineSnapshot } from "../auth/auth.snapshot";
import type { CurrentUser } from "../runtime/runtime.store";

class AuthService {
  public async login(email: string, password: string): Promise<CurrentUser> {
    const response = await authFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let message = "Error de autenticación";
      try {
        const json = JSON.parse(errText);
        message = json.message || message;
      } catch {
        // fallback
      }
      throw new Error(message);
    }

    const resData = await response.json();
    if (!resData.success) {
      throw new Error(resData.message || "Error al iniciar sesión");
    }

    const user = resData.data.user as CurrentUser & { sessionVersion: number };
    await authLifecycle.onLoginSuccess(user, resData.data.snapshotSignature);
    if (navigator.onLine) {
      await authLifecycle.ensureFreshSession("manual", { force: true });
    }
    return user;
  }

  public async logout(): Promise<void> {
    try {
      await authFetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("[Auth] Backend logout failed, clearing locally", err);
    }
    await authLifecycle.onLogoutLocal();
  }

  public async checkSession(): Promise<CurrentUser | null> {
    return authLifecycle.bootstrap();
  }

  /**
   * Refresh explícito (8B.2) — actualiza snapshot + memoria si OK.
   */
  public async tryRefresh(force = false): Promise<boolean> {
    return authLifecycle.ensureFreshSession("manual", { force });
  }

  public getAccessToken(): string | null {
    return getAccessToken();
  }

  public async getJWTToken(): Promise<string | null> {
    return getAccessToken();
  }

  public async getOfflineSnapshotUser(): Promise<CurrentUser | null> {
    const snap = await readOfflineSnapshot();
    if (!snap) return null;
    return {
      id: snap.userId,
      nombre: snap.nombre,
      email: snap.email,
      permisos: snap.permisos,
      sessionVersion: snap.sessionVersion,
    };
  }
}

export const authService = new AuthService();
export default authService;
