/**
 * Deno KV cache store for router-cache.
 *
 * Provides a `DenoKvStore` implementation of `CacheStore` that uses
 * Deno's built-in key-value database. Zero external dependencies —
 * just Deno and its native KV API.
 *
 * Entries are stored as structured objects under a configurable prefix
 * tuple. TTL is handled natively via Deno KV's `expireIn` option.
 *
 * @example
 * ```ts
 * import { RouterCache } from "@cahva/router-cache";
 * import { DenoKvStore } from "@cahva/router-cache/stores/denokv";
 *
 * const kv = await Deno.openKv();
 * const cache = new RouterCache({
 *   store: new DenoKvStore({ kv }),
 *   expire: 60,
 * });
 * ```
 *
 * @module
 */

import type { CacheEntry, CacheStore } from "../core/types.ts";

/** Options for creating a DenoKvStore. */
export interface DenoKvStoreOptions {
  /** An opened Deno.Kv instance. */
  kv: Deno.Kv;
  /**
   * Prefix for all KV keys. Cache entries are stored under
   * `[prefix, cacheKey]` tuples. Defaults to `"rc"`.
   */
  prefix?: string;
}

/**
 * Deno KV implementation of {@linkcode CacheStore}.
 *
 * Stores cache entries as structured objects in Deno's built-in
 * key-value database. TTL is handled natively via the `expireIn`
 * option on `Deno.Kv.set`.
 *
 * Requires no external services — data is persisted locally by Deno
 * (SQLite-backed) or can run in-memory with `Deno.openKv(":memory:")`.
 *
 * @example Basic usage
 * ```ts
 * import { DenoKvStore } from "@cahva/router-cache/stores/denokv";
 *
 * const kv = await Deno.openKv();
 * const store = new DenoKvStore({ kv });
 * await store.set("key", { body: "hello", type: "text/plain", touched: Date.now(), expire: 60 }, 60);
 * const entry = await store.get("key");
 * ```
 *
 * @example With custom prefix
 * ```ts
 * import { DenoKvStore } from "@cahva/router-cache/stores/denokv";
 *
 * const kv = await Deno.openKv();
 * const store = new DenoKvStore({ kv, prefix: "myapp" });
 * // Entries stored under ["myapp", key] in Deno KV
 * ```
 */
export class DenoKvStore implements CacheStore {
  readonly #kv: Deno.Kv;
  readonly #prefix: string;

  /**
   * Create a new DenoKvStore.
   *
   * @param options Configuration including the Deno.Kv instance.
   */
  constructor(options: DenoKvStoreOptions) {
    this.#kv = options.kv;
    this.#prefix = options.prefix ?? "rc";
  }

  /**
   * Retrieve a cache entry by exact key.
   *
   * Returns `null` if the key does not exist or has expired
   * (Deno KV handles TTL expiration natively).
   *
   * @param key The cache key.
   * @returns The cache entry, or null if not found.
   */
  async get(key: string): Promise<CacheEntry | null> {
    const result = await this.#kv.get<CacheEntry>([this.#prefix, key]);
    return result.value;
  }

  /**
   * Store a cache entry.
   *
   * If `ttl` is a positive number, the entry will expire after that many
   * seconds. Expiration is handled natively by Deno KV.
   *
   * @param key The cache key.
   * @param entry The cache entry to store.
   * @param ttl Time-to-live in seconds. If omitted or <= 0, the entry does not expire.
   */
  async set(key: string, entry: CacheEntry, ttl?: number): Promise<void> {
    const options: { expireIn?: number } = {};

    if (ttl !== undefined && ttl > 0) {
      options.expireIn = ttl * 1000;
    }

    await this.#kv.set([this.#prefix, key], entry, options);
  }

  /**
   * Delete a cache entry by exact key.
   *
   * Checks for existence first since Deno KV's `delete()` returns void.
   *
   * @param key The cache key.
   * @returns 1 if the key existed and was deleted, 0 otherwise.
   */
  async del(key: string): Promise<number> {
    const existing = await this.#kv.get([this.#prefix, key]);
    if (existing.value === null) {
      return 0;
    }

    await this.#kv.delete([this.#prefix, key]);
    return 1;
  }

  /**
   * Find all keys matching a glob-style pattern.
   *
   * Uses Deno KV's `list` with a prefix selector to iterate all entries
   * under the store prefix, then filters by converting the glob pattern
   * to a regular expression.
   *
   * Supports `*` (match any characters) and `?` (match single character)
   * wildcards, matching the behavior of Redis `KEYS`/`SCAN` patterns.
   *
   * @param pattern A glob pattern (e.g. `"rc:users:*"`).
   * @returns An array of matching keys.
   */
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") + "$",
    );

    const result: string[] = [];
    const entries = this.#kv.list({ prefix: [this.#prefix] });

    for await (const entry of entries) {
      const key = entry.key[1] as string;
      if (regex.test(key)) {
        result.push(key);
      }
    }

    return result;
  }

  /**
   * Close the underlying Deno KV connection.
   *
   * Convenience method — not part of the CacheStore interface.
   * Call this when you are done using the store to release resources.
   */
  close(): void {
    this.#kv.close();
  }
}
