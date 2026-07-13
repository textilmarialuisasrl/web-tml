import { ConfigRepository } from "../repositories/config.repository";
import { configCache } from "../utils/cache";

export const ConfigService = {
  /**
   * Retrieves a configuration value by key.
   * Leverages InMemory cache with a 5-minute TTL to reduce database overfetching.
   */
  async getConfig(clave: string): Promise<string | null> {
    // 1. Check cache first
    const cached = configCache.get<string>(clave);
    if (cached !== null) {
      return cached;
    }

    // 2. Fetch from database
    const record = await ConfigRepository.findByKey(clave);
    if (record) {
      configCache.set(clave, record.valor);
      return record.valor;
    }

    return null;
  },

  /**
   * Alias of getConfig to match naming consistency.
   */
  async getValue(clave: string): Promise<string | null> {
    return this.getConfig(clave);
  },

  /**
   * Retrieves a configuration value parsed as number.
   */
  async getNumber(clave: string, defaultValue: number): Promise<number> {
    const val = await this.getConfig(clave);
    if (val === null) return defaultValue;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultValue : parsed;
  },

  /**
   * Retrieves a configuration value parsed as boolean.
   */
  async getBoolean(clave: string, defaultValue: boolean): Promise<boolean> {
    const val = await this.getConfig(clave);
    if (val === null) return defaultValue;
    return val === "true" || val === "1" || val === "yes";
  },

  /**
   * Retrieves a configuration value parsed as JSON.
   */
  async getJson<T>(clave: string, defaultValue: T): Promise<T> {
    const val = await this.getConfig(clave);
    if (val === null) return defaultValue;
    try {
      return JSON.parse(val) as T;
    } catch {
      return defaultValue;
    }
  },

  /**
   * Creates or updates a configuration key, invalidating the cached value.
   */
  async setConfig(clave: string, valor: string, descripcion?: string | null): Promise<void> {
    await ConfigRepository.upsertConfig(clave, valor, descripcion);
    // Invalidate cache immediately on edit
    configCache.delete(clave);
  },
};
