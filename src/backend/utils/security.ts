import crypto from "crypto";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Computes the HMAC-SHA256 signature for the offline session snapshot.
 * Signs only identity structural fields: userId, sorted permissions, and sessionVersion.
 */
export function computeSnapshotHmac(
  userId: string,
  permisos: string[],
  sessionVersion: number
): string {
  const sortedPerms = [...permisos].sort().join(",");
  const payloadStr = [userId, sortedPerms, sessionVersion.toString()].join("|");
  return crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(payloadStr)
    .digest("hex");
}

// Rolling throttle map (event type -> last logged timestamp)
const logThrottles: Record<string, number> = {};

/**
 * Throttles security logs to a maximum of 1 log every 30 seconds per event type
 * to prevent CPU overhead and log/console flooding.
 */
export function throttledSecurityLog(
  event: string,
  msg: string,
  severity: "INFO" | "WARN" | "ERROR" | "CRITICAL" = "WARN"
): void {
  const now = Date.now();
  const lastLog = logThrottles[event] || 0;
  if (now - lastLog >= 30_000) {
    logThrottles[event] = now;
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}][SECURITY][${severity}] ${event} - ${msg}`;
    if (severity === "ERROR" || severity === "CRITICAL") {
      console.error(formattedMsg);
    } else if (severity === "INFO") {
      console.log(formattedMsg);
    } else {
      console.warn(formattedMsg);
    }
  }
}

