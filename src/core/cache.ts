/**
 * RouterCache - Framework-agnostic cache core.
 *
 * Manages cache entries via a pluggable CacheStore, handling key prefixing,
 * TTL defaults, wildcard operations, and optional logging.
 *
 * @module
 */

import type {
  CacheEntry,
  CacheLogger,
  CacheOptions,
  CacheStore,
} from "./types.ts";
import { sizeof } from "./sizeof.ts";

/** Constant representing no expiration. */
export const FOREVER = -1;

/**
 * RouterCache provides a framework-agnostic caching layer.
 *
 * It delegates storage to a {@link CacheStore} implementation and handles
 * key prefixing, default TTL, wildcard get/del, and logging.
 *
 * @example
 * ```ts
 * import { RouterCache, FOREVER } from "@cahva/router-cache";
 * import { RedisStore } from "@cahva/router-cache/stores/redis";
 *
 * const cache = new RouterCache({
 *   store: new RedisStore({ client: redisClient }),
 *   prefix: "myapp:",
 *   expire: 3600,
 * });
 *
 * await cache.add("/api/users", '{"users":[]}', {
 *   type: "application/json",
 * });
 *
 * const entries = await cache.get("/api/users");
 * await cache.del("/api/users");
 * ```
 */
export class RouterCache {
  readonly #store: CacheStore;
  readonly #prefix: string;
  readonly #defaultExpire: number;
  readonly #logger: CacheLogger;

  /**
   * Create a new RouterCache instance.
   *
   * @param options Configuration including store, prefix, default expire, and logger.
   */
  constructor(options: CacheOptions) {
    this.#store = options.store;
    this.#defaultExpire = options.expire ?? FOREVER;
    this.#logger = options.logger ?? {};

    // Normalize prefix: ensure it ends with a colon
    const rawPrefix = options.prefix ?? "rc:";
    this.#prefix = rawPrefix.endsWith(":") ? rawPrefix : rawPrefix + ":";
  }

  /** The key prefix used for all cache entries. */
  get prefix(): string {
    return this.#prefix;
  }

  /** The default TTL in seconds (-1 = forever). */
  get defaultExpire(): number {
    return this.#defaultExpire;
  }

  /**
   * Build the full Redis/store key from a cache name.
   * Strips trailing colon from prefix before joining.
   */
  #buildKey(name: string): string {
    return `${this.#prefix}${name}`;
  }

  /**
   * Retrieve cache entries by name. Supports wildcard patterns (e.g. "users:*").
   *
   * @example
   * ```ts
   * // Get a single entry
   * const entries = await cache.get("/api/users");
   *
   * // Get all entries matching a pattern
   * const all = await cache.get("/api/*");
   *
   * // Get all entries
   * const everything = await cache.get();
   * ```
   *
   * @param name Cache entry name or wildcard pattern. Defaults to "*" (all entries).
   * @returns Array of matching cache entries (with `name` and `prefix` fields added).
   */
  async get(
    name?: string,
  ): Promise<(CacheEntry & { name: string; prefix: string })[]> {
    const cacheName = name ?? "*";
    const key = this.#buildKey(cacheName);
    const hasWildcard = key.includes("*");

    if (hasWildcard) {
      const matchingKeys = await this.#store.keys(key);

      if (matchingKeys.length === 0) {
        return [];
      }

      const results = await Promise.all(
        matchingKeys.map(async (k) => {
          const entry = await this.#store.get(k);
          if (!entry) return null;

          const { entryName, entryPrefix } = this.#parseKey(k);
          const size = sizeof(entry);
          const sizeKb = (size / 1024).toFixed(2);
          this.#logger.onMessage?.(`GET ${k} ~${sizeKb} Kb`);

          return { ...entry, name: entryName, prefix: entryPrefix };
        }),
      );

      return results.filter(
        (r): r is CacheEntry & { name: string; prefix: string } => r !== null,
      );
    }

    // Single key fetch
    const entry = await this.#store.get(key);
    if (!entry) {
      return [];
    }

    const { entryName, entryPrefix } = this.#parseKey(key);
    const size = sizeof(entry);
    const sizeKb = (size / 1024).toFixed(2);
    this.#logger.onMessage?.(`GET ${key} ~${sizeKb} Kb`);

    return [{ ...entry, name: entryName, prefix: entryPrefix }];
  }

  /**
   * Add a cache entry.
   *
   * @param name The cache entry name (e.g. "/api/users").
   * @param body The response body to cache.
   * @param options Optional type and expire overrides.
   * @returns Resolves when the entry has been stored.
   */
  async add(
    name: string,
    body: string,
    options?: { type?: string; expire?: number },
  ): Promise<void> {
    const key = this.#buildKey(name);

    const entry: CacheEntry = {
      body,
      type: options?.type ?? "text/html",
      touched: Date.now(),
      expire: options?.expire ?? this.#defaultExpire,
    };

    const ttl = entry.expire > 0 ? entry.expire : undefined;

    await this.#store.set(key, entry, ttl);

    const size = sizeof(entry);
    const sizeKb = (size / 1024).toFixed(2);

    if (ttl !== undefined) {
      this.#logger.onMessage?.(
        `SET ${key} ~${sizeKb} Kb ${ttl} TTL (sec)`,
      );
    } else {
      this.#logger.onMessage?.(`SET ${key} ~${sizeKb} Kb`);
    }
  }

  /**
   * Delete cache entries by name. Supports wildcard patterns.
   *
   * @example
   * ```ts
   * // Delete a single entry
   * await cache.del("/api/users");
   *
   * // Delete all entries matching a pattern
   * await cache.del("/api/users/*");
   *
   * // Delete all entries
   * await cache.del("*");
   * ```
   *
   * @param name The cache entry name or wildcard pattern.
   * @returns The number of entries deleted.
   */
  async del(name: string): Promise<number> {
    const key = this.#buildKey(name);
    const hasWildcard = key.includes("*");

    if (hasWildcard) {
      const matchingKeys = await this.#store.keys(key);

      if (matchingKeys.length === 0) {
        return 0;
      }

      let totalDeleted = 0;
      await Promise.all(
        matchingKeys.map(async (k) => {
          const count = await this.#store.del(k);
          totalDeleted += count;
          this.#logger.onMessage?.(`DEL ${k}`);
        }),
      );

      return totalDeleted;
    }

    // Single key deletion
    const count = await this.#store.del(key);
    if (count > 0) {
      this.#logger.onMessage?.(`DEL ${key}`);
    }
    return count;
  }

  /**
   * Parse a full store key into name and prefix parts.
   * e.g. "rc:users:123" -> { entryPrefix: "rc", entryName: "users:123" }
   */
  #parseKey(key: string): { entryName: string; entryPrefix: string } {
    const prefixWithoutColon = this.#prefix.replace(/:$/, "");
    const entryPrefix = prefixWithoutColon;

    // Remove the prefix (including colon) from the key to get the name
    const entryName = key.startsWith(this.#prefix)
      ? key.slice(this.#prefix.length)
      : key;

    return { entryName, entryPrefix };
  }
}
