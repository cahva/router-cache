import { beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { FOREVER, RouterCache } from "../../src/core/cache.ts";
import type {
  CacheEntry,
  CacheLogger,
  CacheStore,
} from "../../src/core/types.ts";

/**
 * In-memory CacheStore implementation for testing.
 * Simulates a real store without needing Redis.
 */
class MemoryStore implements CacheStore {
  readonly data = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, entry: CacheEntry, _ttl?: number): Promise<void> {
    this.data.set(key, entry);
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    // Simple glob matching: only supports trailing * for tests
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    );
    const result: string[] = [];
    for (const key of this.data.keys()) {
      if (regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }
}

describe("RouterCache", () => {
  let store: MemoryStore;
  let cache: RouterCache;

  beforeEach(() => {
    store = new MemoryStore();
    cache = new RouterCache({ store, prefix: "test:" });
  });

  describe("constructor", () => {
    it("uses default prefix 'rc:' when none specified", () => {
      const c = new RouterCache({ store });
      expect(c.prefix).toBe("rc:");
    });

    it("normalizes prefix to end with colon", () => {
      const c = new RouterCache({ store, prefix: "myapp" });
      expect(c.prefix).toBe("myapp:");
    });

    it("keeps prefix unchanged if it already ends with colon", () => {
      const c = new RouterCache({ store, prefix: "myapp:" });
      expect(c.prefix).toBe("myapp:");
    });

    it("uses FOREVER as default expire", () => {
      expect(cache.defaultExpire).toBe(FOREVER);
    });

    it("accepts custom default expire", () => {
      const c = new RouterCache({ store, expire: 3600 });
      expect(c.defaultExpire).toBe(3600);
    });
  });

  describe("FOREVER constant", () => {
    it("equals -1", () => {
      expect(FOREVER).toBe(-1);
    });
  });

  describe("add", () => {
    it("stores an entry in the store with correct key", async () => {
      await cache.add("/api/users", '{"users":[]}', {
        type: "application/json",
      });

      expect(store.data.has("test:/api/users")).toBe(true);
      const entry = store.data.get("test:/api/users")!;
      expect(entry.body).toBe('{"users":[]}');
      expect(entry.type).toBe("application/json");
    });

    it("defaults content-type to text/html", async () => {
      await cache.add("/page", "<h1>Hello</h1>");
      const entry = store.data.get("test:/page")!;
      expect(entry.type).toBe("text/html");
    });

    it("uses default expire when not specified", async () => {
      await cache.add("/page", "body");
      const entry = store.data.get("test:/page")!;
      expect(entry.expire).toBe(FOREVER);
    });

    it("uses provided expire override", async () => {
      await cache.add("/page", "body", { expire: 600 });
      const entry = store.data.get("test:/page")!;
      expect(entry.expire).toBe(600);
    });

    it("sets touched timestamp", async () => {
      const before = Date.now();
      await cache.add("/page", "body");
      const after = Date.now();
      const entry = store.data.get("test:/page")!;
      expect(entry.touched).toBeGreaterThanOrEqual(before);
      expect(entry.touched).toBeLessThanOrEqual(after);
    });

    it("logs SET message", async () => {
      const messages: string[] = [];
      const loggedCache = new RouterCache({
        store,
        prefix: "test:",
        logger: { onMessage: (msg) => messages.push(msg) },
      });

      await loggedCache.add("/api/data", "hello", { expire: 300 });

      expect(messages.length).toBe(1);
      expect(messages[0]).toContain("SET test:/api/data");
      expect(messages[0]).toContain("Kb");
      expect(messages[0]).toContain("300 TTL");
    });

    it("logs SET without TTL for FOREVER entries", async () => {
      const messages: string[] = [];
      const loggedCache = new RouterCache({
        store,
        prefix: "test:",
        logger: { onMessage: (msg) => messages.push(msg) },
      });

      await loggedCache.add("/api/data", "hello");

      expect(messages.length).toBe(1);
      expect(messages[0]).toContain("SET test:/api/data");
      expect(messages[0]).not.toContain("TTL");
    });
  });

  describe("get", () => {
    it("returns an empty array when key does not exist", async () => {
      const result = await cache.get("/missing");
      expect(result).toEqual([]);
    });

    it("returns a single entry by exact name", async () => {
      await cache.add("/api/users", '{"users":[]}', {
        type: "application/json",
        expire: 600,
      });

      const result = await cache.get("/api/users");
      expect(result.length).toBe(1);
      expect(result[0]!.body).toBe('{"users":[]}');
      expect(result[0]!.type).toBe("application/json");
      expect(result[0]!.name).toBe("/api/users");
      expect(result[0]!.prefix).toBe("test");
    });

    it("returns all entries with wildcard *", async () => {
      await cache.add("/api/users", "users");
      await cache.add("/api/posts", "posts");
      await cache.add("/api/comments", "comments");

      const result = await cache.get("*");
      expect(result.length).toBe(3);
    });

    it("defaults to wildcard * when no name given", async () => {
      await cache.add("/a", "a");
      await cache.add("/b", "b");

      const result = await cache.get();
      expect(result.length).toBe(2);
    });

    it("supports partial wildcard patterns", async () => {
      await cache.add("/api/users/1", "user1");
      await cache.add("/api/users/2", "user2");
      await cache.add("/api/posts/1", "post1");

      const result = await cache.get("/api/users/*");
      expect(result.length).toBe(2);
      expect(result.every((r) => r.name.startsWith("/api/users/"))).toBe(true);
    });

    it("logs GET messages", async () => {
      const messages: string[] = [];
      const loggedCache = new RouterCache({
        store,
        prefix: "test:",
        logger: { onMessage: (msg) => messages.push(msg) },
      });

      await loggedCache.add("/api/data", "hello");
      messages.length = 0; // clear SET message

      await loggedCache.get("/api/data");
      expect(messages.length).toBe(1);
      expect(messages[0]).toContain("GET test:/api/data");
      expect(messages[0]).toContain("Kb");
    });
  });

  describe("del", () => {
    it("deletes an entry by exact name", async () => {
      await cache.add("/api/users", "users");
      expect(store.data.size).toBe(1);

      const count = await cache.del("/api/users");
      expect(count).toBe(1);
      expect(store.data.size).toBe(0);
    });

    it("returns 0 when key does not exist", async () => {
      const count = await cache.del("/missing");
      expect(count).toBe(0);
    });

    it("deletes multiple entries with wildcard", async () => {
      await cache.add("/api/users/1", "user1");
      await cache.add("/api/users/2", "user2");
      await cache.add("/api/posts/1", "post1");

      const count = await cache.del("/api/users/*");
      expect(count).toBe(2);
      expect(store.data.size).toBe(1);
      expect(store.data.has("test:/api/posts/1")).toBe(true);
    });

    it("deletes all entries with *", async () => {
      await cache.add("/a", "a");
      await cache.add("/b", "b");
      await cache.add("/c", "c");

      const count = await cache.del("*");
      expect(count).toBe(3);
      expect(store.data.size).toBe(0);
    });

    it("returns 0 when wildcard matches nothing", async () => {
      const count = await cache.del("/nothing/*");
      expect(count).toBe(0);
    });

    it("logs DEL messages", async () => {
      const messages: string[] = [];
      const loggedCache = new RouterCache({
        store,
        prefix: "test:",
        logger: { onMessage: (msg) => messages.push(msg) },
      });

      await loggedCache.add("/api/data", "hello");
      messages.length = 0;

      await loggedCache.del("/api/data");
      expect(messages.length).toBe(1);
      expect(messages[0]).toContain("DEL test:/api/data");
    });
  });

  describe("logger", () => {
    it("works without a logger (no errors)", async () => {
      const silentCache = new RouterCache({ store, prefix: "test:" });
      await silentCache.add("/page", "body");
      await silentCache.get("/page");
      await silentCache.del("/page");
      // Should not throw
    });

    it("calls onMessage for each operation", async () => {
      const messages: string[] = [];
      const loggedCache = new RouterCache({
        store,
        prefix: "test:",
        logger: { onMessage: (msg) => messages.push(msg) },
      });

      await loggedCache.add("/page", "body");
      await loggedCache.get("/page");
      await loggedCache.del("/page");

      expect(messages.length).toBe(3);
      expect(messages[0]).toContain("SET");
      expect(messages[1]).toContain("GET");
      expect(messages[2]).toContain("DEL");
    });
  });
});
