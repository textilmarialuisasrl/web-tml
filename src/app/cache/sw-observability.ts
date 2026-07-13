import type { WorkboxPlugin } from "workbox-core";

export type SwMetricPayload = {
  metricName: string;
  value: number;
  metadata?: Record<string, unknown>;
};

type CounterKey = "hit" | "miss" | "fail" | "cleanup";

/**
 * Observabilidad mínima del SW — contadores en memoria, flush vía postMessage al cliente.
 * El cliente persiste en Dexie (metricsLog); el SW NO compite con Dexie como source of truth.
 */
export class SwObservabilityPlugin implements WorkboxPlugin {
  private hits = 0;
  private misses = 0;
  private failures = 0;
  private readonly routeLabel: string;

  constructor(routeLabel: string) {
    this.routeLabel = routeLabel;
  }

  public async cachedResponseWillBeUsed(param: any): Promise<any> {
    this.hits += 1;
    return param.cachedResponse;
  }

  public async fetchDidSucceed(param: any): Promise<any> {
    this.misses += 1;
    return param.response;
  }

  public async fetchDidFail(): Promise<void> {
    this.failures += 1;
  }

  public getCounters(): Record<CounterKey, number> {
    return { hit: this.hits, miss: this.misses, fail: this.failures, cleanup: 0 };
  }

  public resetCounters(): Record<CounterKey, number> {
    const snap = this.getCounters();
    this.hits = 0;
    this.misses = 0;
    this.failures = 0;
    return snap;
  }

  public buildMetricBatch(): SwMetricPayload[] {
    const c = this.resetCounters();
    const total = c.hit + c.miss;
    const ratio = total > 0 ? c.hit / total : 0;
    return [
      {
        metricName: "sw_cache_hit_ratio",
        value: ratio,
        metadata: { route: this.routeLabel, hits: c.hit, misses: c.miss },
      },
      {
        metricName: "sw_failed_fetches",
        value: c.fail,
        metadata: { route: this.routeLabel },
      },
    ];
  }
}

const globalPlugins: SwObservabilityPlugin[] = [];

export function trackSwPlugin(plugin: SwObservabilityPlugin): void {
  globalPlugins.push(plugin);
}

export function flushAllSwMetrics(): SwMetricPayload[] {
  const batch: SwMetricPayload[] = [];
  for (const p of globalPlugins) {
    batch.push(...p.buildMetricBatch());
  }
  return batch;
}

export async function postMetricsToClients(batch: SwMetricPayload[]): Promise<void> {
  if (batch.length === 0) return;
  const clients = await (self as any).clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "SW_METRICS_BATCH", batch });
  }
}
