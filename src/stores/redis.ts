/**
 * Redis-backed cache store for router-cache.
 *
 * Provides a `RedisStore` implementation of `CacheStore` that uses
 * a user-supplied Redis client. The `RedisClient` interface is minimal
 * enough to be satisfied by both `ioredis` and `redis` (v4+).
 *
 * @module
 */

import type { CacheEntry, CacheStore } from "../core/types.ts";

/**
 * Minimal Redis client interface.
 *
 * Both `ioredis` and `redis` v4+ satisfy this interface out of the box.
 * Users bring their own client instance - this package does NOT depend
 * on any Redis client library.
 *
 * @example Using with ioredis
 * ```ts
 * import Redis from "ioredis";
 * import { RedisStore } from "@cahva/router-cache/stores/redis";
 *
 * const client = new Redis();
 * const store = new RedisStore({ client });
 * ```
 *
 * @example Using with redis v4+
 * ```ts
 * import { createClient } from "redis";
 * import { RedisStore } from "@cahva/router-cache/stores/redis";
 *
 * const client = createClient();
 * await client.connect();
 * const store = new RedisStore({ client });
 * ```
 */
export interface RedisClient {
  /** Hash multi-set: store multiple field-value pairs in a hash key. */
  hset(key: string, data: Record<string, string>): Promise<number>;
  /** Hash get-all: retrieve all field-value pairs from a hash key. */
  hgetall(key: string): Promise<Record<string, string> | null>;
  /** Set a key's time-to-live in seconds. */
  expire(key: string, seconds: number): Promise<number | boolean>;
  /** Delete one or more keys. */
  del(...keys: string[]): Promise<number>;
  /**
   * SCAN cursor-based iteration.
   *
   * ioredis returns `[cursor: string, keys: string[]]`.
   * redis v4 returns `{ cursor: number, keys: string[] }` but we normalize both.
   */
  scan(
    cursor: number | string,
    ...args: string[]
  ): Promise<[string, string[]] | { cursor: number; keys: string[] }>;
}

/**
 * Normalize SCAN results from different Redis client libraries.
 *
 * ioredis: `["0", ["key1", "key2"]]`
 * redis v4: `{ cursor: 0, keys: ["key1", "key2"] }`
 */
function normalizeScanResult(
  result: [string, string[]] | { cursor: number; keys: string[] },
): { cursor: string; keys: string[] } {
  if (Array.isArray(result)) {
    // ioredis format
    return { cursor: result[0], keys: result[1] };
  }
  // redis v4 format
  return { cursor: String(result.cursor), keys: result.keys };
}

/** Options for creating a RedisStore. */
export interface RedisStoreOptions {
  /** A Redis client instance satisfying the RedisClient interface. */
  client: RedisClient;
}

/**
 * Redis-backed implementation of {@link CacheStore}.
 *
 * Stores cache entries as Redis hashes with fields:
 * `body`, `type`, `touched`, `expire`.
 *
 * Uses SCAN for non-blocking key pattern matching (wildcard support).
 *
 * @example
 * ```ts
 * import { RedisStore } from "@cahva/router-cache/stores/redis";
 * import { RouterCache } from "@cahva/router-cache";
 *
 * const store = new RedisStore({ client: redisClient });
 * const cache = new RouterCache({ store, prefix: "myapp:" });
 * ```
 */
export class RedisStore implements CacheStore {
  readonly #client: RedisClient;

  /**
   * Create a new RedisStore.
   *
   * @param options Configuration including the Redis client instance.
   */
  constructor(options: RedisStoreOptions) {
    this.#client = options.client;
  }

  /**
   * Retrieve a cache entry by key.
   *
   * @param key The full cache key (including prefix).
   * @returns The cache entry, or null if not found.
   */
  async get(key: string): Promise<CacheEntry | null> {
    const data = await this.#client.hgetall(key);

    // Both ioredis and redis v4 return null or empty object for missing keys
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      body: data.body ?? "",
      type: data.type ?? "text/html",
      touched: Number(data.touched ?? 0),
      expire: Number(data.expire ?? -1),
    };
  }

  /**
   * Store a cache entry as a Redis hash. Optionally set a TTL.
   *
   * @param key The full cache key (including prefix).
   * @param entry The cache entry to store.
   * @param ttl Optional TTL in seconds. If > 0, sets a Redis EXPIRE.
   */
  async set(key: string, entry: CacheEntry, ttl?: number): Promise<void> {
    await this.#client.hset(key, {
      body: entry.body,
      type: entry.type,
      touched: String(entry.touched),
      expire: String(entry.expire),
    });

    if (ttl !== undefined && ttl > 0) {
      await this.#client.expire(key, ttl);
    }
  }

  /**
   * Delete a single entry by key.
   *
   * @param key The full cache key to delete.
   * @returns The number of keys deleted (0 or 1).
   */
  async del(key: string): Promise<number> {
    return await this.#client.del(key);
  }

  /**
   * Find all keys matching a glob-style pattern using SCAN.
   *
   * Uses cursor-based iteration to avoid blocking the Redis server,
   * matching the behavior of the original implementation.
   *
   * @param pattern A glob-style pattern (e.g. "rc:users:*").
   * @returns Array of matching key strings.
   */
  async keys(pattern: string): Promise<string[]> {
    const allKeys: string[] = [];
    let cursor = "0";

    do {
      const result = await this.#client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        "100",
      );

      const normalized = normalizeScanResult(result);
      cursor = normalized.cursor;
      allKeys.push(...normalized.keys);
    } while (cursor !== "0");

    return allKeys;
  }
}
