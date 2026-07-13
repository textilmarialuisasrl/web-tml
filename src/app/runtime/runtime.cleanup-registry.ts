/**
 * Registro central de cleanups efímeros (timeline IO, IntersectionObserver).
 * Subsistemas (network, auth, SW, telemetry) usan stop()/destroy() vía disposeRuntimeSubsystems.
 * auto-recovery SOLO invoca disposeAllRuntimeCleanups — no debe registrar subsistemas aquí.
 */
const cleanups = new Set<() => void>();

let timerRegistrations = 0;
let observerRegistrations = 0;
let listenerRegistrations = 0;

export type CleanupKind = "timer" | "observer" | "listener" | "generic";

export function registerRuntimeCleanup(
  fn: () => void,
  kind: CleanupKind = "generic"
): () => void {
  cleanups.add(fn);
  if (kind === "timer") timerRegistrations += 1;
  else if (kind === "observer") observerRegistrations += 1;
  else if (kind === "listener") listenerRegistrations += 1;

  if (import.meta.env.DEV) {
    console.log(`[RUNTIME] registered ${kind} - active-listeners: ${listenerRegistrations}, active-intervals: ${timerRegistrations}`);
  }

  return () => {
    const deleted = cleanups.delete(fn);
    if (deleted) {
      if (kind === "timer") timerRegistrations = Math.max(0, timerRegistrations - 1);
      else if (kind === "observer") observerRegistrations = Math.max(0, observerRegistrations - 1);
      else if (kind === "listener") listenerRegistrations = Math.max(0, listenerRegistrations - 1);
      
      if (import.meta.env.DEV) {
        console.log(`[RUNTIME] disposed ${kind} - active-listeners: ${listenerRegistrations}, active-intervals: ${timerRegistrations}`);
      }
    }
  };
}

export function registerRuntimeInterval(
  fn: () => void,
  ms: number
): ReturnType<typeof setInterval> {
  const id = setInterval(fn, ms);
  registerRuntimeCleanup(() => clearInterval(id), "timer");
  return id;
}

export function getRuntimeCleanupStats(): {
  registered: number;
  timers: number;
  observers: number;
  listeners: number;
  observersActiveCount: number;
} {
  return {
    registered: cleanups.size,
    timers: timerRegistrations,
    observers: observerRegistrations,
    listeners: listenerRegistrations,
    observersActiveCount: observerRegistrations + listenerRegistrations,
  };
}

export function disposeAllRuntimeCleanups(): number {
  let n = 0;
  for (const fn of [...cleanups]) {
    try {
      fn();
      n += 1;
    } catch {
      // seguir limpiando
    }
  }
  cleanups.clear();
  timerRegistrations = 0;
  observerRegistrations = 0;
  listenerRegistrations = 0;
  return n;
}
