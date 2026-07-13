const CHAOS_LS_KEY = "tml_chaos";
const CHAOS_QUERY = "chaos";

/** Solo dev/staging explícito — nunca activo por defecto en prod. */
export function initChaosFromUrl(): void {
  if (typeof window === "undefined") return;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(CHAOS_QUERY) === "1") {
      localStorage.setItem(CHAOS_LS_KEY, "1");
      params.delete(CHAOS_QUERY);
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    }
  } catch {
    // private mode
  }
}

export function isChaosFlagSet(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CHAOS_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChaosEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(CHAOS_LS_KEY, "1");
    else localStorage.removeItem(CHAOS_LS_KEY);
  } catch {
    // ignore
  }
}

/** Chaos solo si flag explícito — producción no afectada por defecto. */
export function isChaosEnabled(): boolean {
  return isChaosFlagSet();
}
