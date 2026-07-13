import { chaosShouldInjectSync401, isChaosActive } from "./chaos.runtime";
import { scenarioEngine } from "./scenario.engine";

let installed = false;
let nativeFetch: typeof fetch;

export function installChaosFetch(): void {
  if (typeof window === "undefined") return;
  if (installed) {
    if (import.meta.env.DEV) {
      console.log("[CHAOS] already installed");
    }
    return;
  }

  const start = performance.now();

  nativeFetch = window.fetch;
  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const sim = scenarioEngine.getState();

    // 1. Simulate Offline
    if (sim.backendOffline) {
      throw new TypeError("Failed to fetch (Simulated Offline)");
    }

    // 2. Simulate Timeout
    if (sim.timeout) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      throw new TypeError("Failed to fetch (Timeout simulated)");
    }

    // 3. Simulate Slow Network
    if (sim.slowNetwork) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // 4. Simulate Snapshot Mismatch
    if (sim.snapshotMismatch && (url.includes("/api/auth/me") || url.includes("/api/sync/movimientos"))) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "SNAPSHOT_SIGNATURE_MISMATCH",
          message: "Simulated snapshot signature mismatch error",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 5. Simulate 401 Unauthorized
    if (sim.auth401 && (url.includes("/api/auth/me") || url.includes("/api/sync/movimientos"))) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "UNAUTHORIZED",
          message: "Simulated 401 Unauthorized error",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (isChaosActive() && chaosShouldInjectSync401(url)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Chaos: 401 simulado en sync",
          code: "CHAOS_SYNC_401",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return nativeFetch(input, init);
  };

  installed = true;

  if (import.meta.env.DEV) {
    console.log(`[CHAOS] patch duration: ${(performance.now() - start).toFixed(2)}ms`);
  }
}

export function uninstallChaosFetch(): void {
  if (typeof window === "undefined") return;
  if (!installed) return;

  const start = performance.now();
  window.fetch = nativeFetch;
  installed = false;

  if (import.meta.env.DEV) {
    console.log(`[CHAOS] teardown duration: ${(performance.now() - start).toFixed(2)}ms`);
  }
}

export function isChaosFetchInstalled(): boolean {
  return installed;
}
