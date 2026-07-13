import { readOfflineSnapshot } from "./auth.snapshot";
import { getAccessToken } from "./auth.session";

const logThrottles: Record<string, number> = {};

/**
 * Throttles console warning logs to maximum 1 log per 30 seconds per event type.
 */
export function throttledSecurityLog(event: string, msg: string): void {
  const now = Date.now();
  const lastLog = logThrottles[event] || 0;
  if (now - lastLog >= 30_000) {
    logThrottles[event] = now;
    console.warn(`[SECURITY] ${event} - ${msg}`);
  }
}

let consecutive401s = 0;

export async function authFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  // Diagnostic log: token loaded (usually null in memory session)
  const localToken = getAccessToken();
  console.log(`[AUTH FETCH] Token loaded: ${localToken ? `${localToken.substring(0, 15)}...` : "null (memory session)"}`);

  try {
    const snapshot = await readOfflineSnapshot();
    if (snapshot?.snapshotSignature) {
      headers.set("x-snapshot-signature", snapshot.snapshotSignature);
    }
  } catch {
    // ignore
  }

  // Diagnostic log: request headers and config sent
  console.log(`[AUTH FETCH] Sending request to ${path}`, {
    method: init.method || "GET",
    headers: Object.fromEntries(headers.entries()),
    credentials: init.credentials || "include"
  });

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    console.warn(`[AUTH FETCH] Response received: 401 Unauthorized for ${path}`);
    consecutive401s++;
    if (consecutive401s >= 3) {
      throttledSecurityLog("repeated-401s", "Detected 3 or more consecutive 401 responses");
    }
  } else if (response.ok) {
    consecutive401s = 0;
  }

  return response;
}
