import { authIntegrity } from "../auth/auth.integrity";
import { shutdownChaosRuntime, stopAllChaosTimers } from "../chaos/chaos.runtime";
import { uninstallChaosFetch } from "../chaos/chaos.fetch";
import { runtimeAdaptive } from "./runtime.adaptive";
import { runtimeTelemetry } from "../telemetry/runtime.telemetry";
import { runtimeProfiling } from "../telemetry/runtime.profiling";
import { authLifecycle } from "../auth/auth.lifecycle";
import { networkService } from "../network/network.service";
import { swClientService } from "../services/sw-client.service";
import { syncScheduler } from "../sync/sync-scheduler";
import { syncEngine } from "../sync/sync-engine";
import { disposeAllRuntimeCleanups } from "./runtime.cleanup-registry";
import { runtimeLifecycle } from "./runtime.lifecycle";

/**
 * Apagado ordenado de subsistemas runtime (tests, hot reload, recovery total).
 */
export function disposeRuntimeSubsystems(): number {
  stopAllChaosTimers();
  shutdownChaosRuntime();
  uninstallChaosFetch();
  runtimeAdaptive.stop();
  runtimeProfiling.stop();
  runtimeTelemetry.stop();
  authIntegrity.stop();
  authLifecycle.teardownCoordination();
  networkService.destroy();
  swClientService.destroy();
  syncScheduler.destroy();
  syncEngine.cancelScheduledSync();
  runtimeLifecycle.cancelQueueFlush();
  return disposeAllRuntimeCleanups();
}
