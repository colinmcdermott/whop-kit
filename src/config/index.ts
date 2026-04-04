// ---------------------------------------------------------------------------
// Config system — framework-agnostic key-value store with caching
// ---------------------------------------------------------------------------
// Provides a ConfigStore interface that templates implement (e.g. with
// Prisma, Drizzle, KV store, etc.). The config manager adds an in-memory
// cache layer on top, plus optional env var fallback.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Persistent config store — implement per database/backend */
export interface ConfigStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface ConfigManagerOptions {
  /** The persistent store (database, KV, file, etc.) */
  store: ConfigStore;
  /** Map of config key → env var name for fallback lookups */
  envMap?: Record<string, string>;
  /** Cache TTL in milliseconds. Defaults to 30000 (30s). */
  cacheTtlMs?: number;
  /** Function to read env vars. Defaults to process.env lookup. */
  getEnv?: (name: string) => string | undefined;
}

export interface ConfigManager {
  /** Read a config value (cache → env → store) */
  get(key: string): Promise<string | null>;
  /** Write a config value (store + cache) */
  set(key: string, value: string): Promise<void>;
  /** Bulk set config values */
  setMany(configs: Record<string, string>): Promise<void>;
  /** Clear the in-memory cache (useful for testing) */
  clearCache(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a config manager with in-memory caching and optional env var fallback.
 *
 * @example
 * const config = createConfigManager({
 *   store: prismaConfigStore(prisma),
 *   envMap: {
 *     whop_app_id: "WHOP_APP_ID",
 *     whop_api_key: "WHOP_API_KEY",
 *   },
 * });
 *
 * const appId = await config.get("whop_app_id");
 */
export function createConfigManager(
  options: ConfigManagerOptions,
): ConfigManager {
  const { store, envMap = {}, cacheTtlMs = 30_000 } = options;
  const getEnv =
    options.getEnv ?? ((name: string) => process.env[name]);

  const cache = new Map<string, { value: string; expiresAt: number }>();

  async function get(key: string): Promise<string | null> {
    // 1. In-memory cache (with TTL)
    const cached = cache.get(key);
    if (cached !== undefined && Date.now() < cached.expiresAt) {
      return cached.value;
    }
    if (cached !== undefined) cache.delete(key);

    // 2. Env var fallback
    const envKey = envMap[key];
    if (envKey) {
      const envVal = getEnv(envKey);
      if (envVal) {
        cache.set(key, {
          value: envVal,
          expiresAt: Date.now() + cacheTtlMs,
        });
        return envVal;
      }
    }

    // 3. Persistent store
    try {
      const value = await store.get(key);
      if (value !== null) {
        cache.set(key, {
          value,
          expiresAt: Date.now() + cacheTtlMs,
        });
        return value;
      }
    } catch {
      // Store might not be ready (e.g. during first build)
    }

    return null;
  }

  async function set(key: string, value: string): Promise<void> {
    await store.set(key, value);
    cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
  }

  async function setMany(configs: Record<string, string>): Promise<void> {
    await Promise.all(
      Object.entries(configs)
        .filter(([, value]) => !!value)
        .map(([key, value]) => set(key, value)),
    );
  }

  function clearCache(): void {
    cache.clear();
  }

  return { get, set, setMany, clearCache };
}
