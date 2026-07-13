export interface CacheProvider {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSeconds?: number): void;
  delete(key: string): void;
  clear(namespace?: string): void;
}

export class InMemoryProvider implements CacheProvider {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private defaultTtl: number;
  private namespace: string;

  constructor(namespace: string, defaultTtlSeconds = 300) {
    this.namespace = namespace;
    this.defaultTtl = defaultTtlSeconds;
  }

  private buildKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  public get<T>(key: string): T | null {
    const fullKey = this.buildKey(key);
    const item = this.cache.get(fullKey);
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
      this.cache.delete(fullKey);
      return null;
    }
    return item.value as T;
  }

  public set<T>(key: string, value: T, ttlSeconds?: number): void {
    const fullKey = this.buildKey(key);
    const ttl = ttlSeconds ?? this.defaultTtl;
    
    this.cache.set(fullKey, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  public delete(key: string): void {
    const fullKey = this.buildKey(key);
    this.cache.delete(fullKey);
  }

  public clear(namespace?: string): void {
    const targetNamespace = namespace || this.namespace;
    const prefix = `${targetNamespace}:`;
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  // Automatic expired items cleanup helper
  public prune(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// 5 minutes default TTL for permissions/auth cache
export const authCache = new InMemoryProvider("auth", 300);

// 30 seconds default TTL for dashboard cache
export const dashboardCache = new InMemoryProvider("dashboard", 30);

// 5 minutes default TTL for config cache
export const configCache = new InMemoryProvider("config", 300);

// Prune expired cache items every 60 seconds
setInterval(() => {
  authCache.prune();
  dashboardCache.prune();
  configCache.prune();
}, 60000).unref(); // unref prevents blocking process exit in scripts/tests
