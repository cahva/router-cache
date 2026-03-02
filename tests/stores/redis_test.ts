import { beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { RedisStore } from "../../src/stores/redis.ts";
import type { RedisClient } from "../../src/stores/redis.ts";
import type { CacheEntry } from "../../src/core/types.ts";

/**
 * Mock Redis client for testing RedisStore without a real Redis connection.
 * Simulates Redis hash operations in memory.
 */
class MockRedisClient implements RedisClient {
  readonly store = new Map<string, Record<string, string>>();
  readonly ttls = new Map<string, number>();

  async hset(key: string, data: Record<string, string>): Promise<number> {
    this.store.set(key, { ...data });
    return Object.keys(data).length;
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.store.get(key) ?? null;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.store.has(key)) {
      this.ttls.set(key, seconds);
      return 1;
    }
    return 0;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        this.ttls.delete(key);
        count++;
      }
    }
    return count;
  }

  async scan(
    cursor: number | string,
    ..._args: string[]
  ): Promise<[string, string[]]> {
    // Simple mock: return all matching keys in one scan iteration
    // Extract MATCH pattern from args
    const matchIdx = _args.indexOf("MATCH");
    const pattern = matchIdx >= 0 ? _args[matchIdx + 1] : "*";

    const regex = new RegExp(
      "^" +
        (pattern ?? "*").replace(/\*/g, ".*").replace(/\?/g, ".") +
        "$",
    );

    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        keys.push(key);
      }
    }

    // Return cursor "0" to indicate scan is complete (ioredis format)
    return ["0", keys];
  }
}

describe("RedisStore", () => {
  let client: MockRedisClient;
  let store: RedisStore;

  beforeEach(() => {
    client = new MockRedisClient();
    store = new RedisStore({ client });
  });

  describe("set and get", () => {
    it("stores and retrieves a cache entry", async () => {
      const entry: CacheEntry = {
        body: '{"users":[]}',
        type: "application/json",
        touched: 1700000000000,
        expire: 3600,
      };

      await store.set("test:key", entry);
      const result = await store.get("test:key");

      expect(result).not.toBeNull();
      expect(result!.body).toBe('{"users":[]}');
      expect(result!.type).toBe("application/json");
      expect(result!.touched).toBe(1700000000000);
      expect(result!.expire).toBe(3600);
    });

    it("stores fields as strings in Redis hash", async () => {
      const entry: CacheEntry = {
        body: "hello",
        type: "text/plain",
        touched: 12345,
        expire: 60,
      };

      await store.set("key1", entry);

      // Verify the raw data stored in the mock client
      const raw = client.store.get("key1")!;
      expect(raw.body).toBe("hello");
      expect(raw.type).toBe("text/plain");
      expect(raw.touched).toBe("12345");
      expect(raw.expire).toBe("60");
    });

    it("returns null for non-existent key", async () => {
      const result = await store.get("nonexistent");
      expect(result).toBeNull();
    });

    it("returns null for empty hash (ioredis behavior)", async () => {
      // ioredis returns {} for non-existent keys with hgetall
      client.store.set("empty", {});
      const result = await store.get("empty");
      expect(result).toBeNull();
    });

    it("sets TTL when ttl > 0", async () => {
      const entry: CacheEntry = {
        body: "data",
        type: "text/plain",
        touched: Date.now(),
        expire: 300,
      };

      await store.set("key1", entry, 300);
      expect(client.ttls.get("key1")).toBe(300);
    });

    it("does not set TTL when ttl is undefined", async () => {
      const entry: CacheEntry = {
        body: "data",
        type: "text/plain",
        touched: Date.now(),
        expire: -1,
      };

      await store.set("key1", entry);
      expect(client.ttls.has("key1")).toBe(false);
    });

    it("does not set TTL when ttl is 0", async () => {
      const entry: CacheEntry = {
        body: "data",
        type: "text/plain",
        touched: Date.now(),
        expire: 0,
      };

      await store.set("key1", entry, 0);
      expect(client.ttls.has("key1")).toBe(false);
    });
  });

  describe("del", () => {
    it("deletes an existing key and returns 1", async () => {
      client.store.set("key1", {
        body: "x",
        type: "t",
        touched: "0",
        expire: "-1",
      });
      const count = await store.del("key1");
      expect(count).toBe(1);
      expect(client.store.has("key1")).toBe(false);
    });

    it("returns 0 when key does not exist", async () => {
      const count = await store.del("nonexistent");
      expect(count).toBe(0);
    });
  });

  describe("keys", () => {
    it("returns all keys matching a pattern", async () => {
      client.store.set("rc:users:1", { body: "u1" } as Record<string, string>);
      client.store.set("rc:users:2", { body: "u2" } as Record<string, string>);
      client.store.set("rc:posts:1", { body: "p1" } as Record<string, string>);

      const result = await store.keys("rc:users:*");
      expect(result.length).toBe(2);
      expect(result).toContain("rc:users:1");
      expect(result).toContain("rc:users:2");
    });

    it("returns empty array when no keys match", async () => {
      const result = await store.keys("nonexistent:*");
      expect(result).toEqual([]);
    });

    it("returns all keys with * pattern", async () => {
      client.store.set("a", {} as Record<string, string>);
      client.store.set("b", {} as Record<string, string>);
      client.store.set("c", {} as Record<string, string>);

      const result = await store.keys("*");
      expect(result.length).toBe(3);
    });
  });
});
