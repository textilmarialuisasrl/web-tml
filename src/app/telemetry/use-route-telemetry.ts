import { useEffect, useRef } from "react";
import { runtimeTelemetry } from "./runtime.telemetry";

/** Mide tiempo de carga de ruta (lazy chunk + mount). */
export function useRouteTelemetry(routeName: string): void {
  const startRef = useRef(performance.now());
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    const durationMs = performance.now() - startRef.current;
    runtimeTelemetry.trackRouteLoad(routeName, durationMs);
  }, [routeName]);
}
