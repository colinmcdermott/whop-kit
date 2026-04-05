import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConfigManager } from "../src/config/index";
import type { ConfigStore } from "../src/config/index";

function createMockStore(): ConfigStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: vi.fn(async (key: string) => data.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
  };
}

describe("createConfigManager", () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  it("reads from the store", async () => {
    store.data.set("app_name", "Test App");
    const config = createConfigManager({ store });

    const value = await config.get("app_name");
    expect(value).toBe("Test App");
  });

  it("returns null for missing keys", async () => {
    const config = createConfigManager({ store });
    const value = await config.get("nonexistent");
    expect(value).toBeNull();
  });

  it("writes to the store and caches the value", async () => {
    const config = createConfigManager({ store });
    await config.set("app_name", "My App");

    expect(store.set).toHaveBeenCalledWith("app_name", "My App");

    // Second read should hit cache, not store
    const value = await config.get("app_name");
    expect(value).toBe("My App");
    // Store.get should only be called for the initial miss, not after set
    expect(store.get).not.toHaveBeenCalled();
  });

  it("falls back to env vars when configured", async () => {
    const config = createConfigManager({
      store,
      envMap: { whop_app_id: "WHOP_APP_ID" },
      getEnv: (name) => (name === "WHOP_APP_ID" ? "app_from_env" : undefined),
    });

    const value = await config.get("whop_app_id");
    expect(value).toBe("app_from_env");
    // Should not hit the store since env var was found
    expect(store.get).not.toHaveBeenCalled();
  });

  it("prefers cache over env and store", async () => {
    const config = createConfigManager({
      store,
      envMap: { key: "ENV_KEY" },
      getEnv: () => "env_value",
    });

    // First call populates cache from env
    await config.get("key");
    // Set a different value in the store
    store.data.set("key", "store_value");

    // Should still return cached env value
    const value = await config.get("key");
    expect(value).toBe("env_value");
  });

  it("setMany writes multiple values", async () => {
    const config = createConfigManager({ store });
    await config.setMany({ a: "1", b: "2", c: "" });

    expect(store.data.get("a")).toBe("1");
    expect(store.data.get("b")).toBe("2");
    // Empty string should be filtered out
    expect(store.data.has("c")).toBe(false);
  });

  it("clearCache forces re-read from store", async () => {
    const config = createConfigManager({ store });
    store.data.set("key", "original");

    // Populate cache
    await config.get("key");

    // Change store value
    store.data.set("key", "updated");

    // Cache still returns old value
    expect(await config.get("key")).toBe("original");

    // Clear cache forces re-read
    config.clearCache();
    expect(await config.get("key")).toBe("updated");
  });

  it("cache expires after TTL", async () => {
    const config = createConfigManager({ store, cacheTtlMs: 0 }); // instant expiry
    store.data.set("key", "value1");

    await config.get("key");
    store.data.set("key", "value2");

    // With 0 TTL, cache should be expired immediately
    const value = await config.get("key");
    expect(value).toBe("value2");
  });
});
