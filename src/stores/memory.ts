/**
 * In-memory cache store for router-cache.
 *
 * Provides a `MemoryStore` implementation of `CacheStore` that keeps
 * entries in a `Map`. Expired entries are lazily evicted on access.
 *
 * **Not recommended for production use.** Entries are not persisted,
 * not shared across processes, and are lost on restart. Use this store
 * for development, testing, and prototyping.
 *
 * @example
 * ```ts
 * import { RouterCache } from "@cahva/router-cache";
 * import { MemoryStore } from "@cahva/router-cache/stores/memory";
 *
 * const cache = new RouterCache({
 *   store: new MemoryStore(),
 *   expire: 60,
 * });
 * ```
 *
 * @module
 */

import type { CacheEntry, CacheStore } from "../core/types.ts";

/** An entry stored in the MemoryStore with an optional expiry timestamp. */
interface StoredEntry {
  /** The cached response entry. */
  entry: CacheEntry;
  /** Absolute expiry time in ms since epoch, or undefined if no TTL. */
  expiresAt?: number;
}

/**
 * In-memory implementation of {@linkcode CacheStore}.
 *
 * Uses lazy eviction: expired entries are removed when accessed via
 * {@linkcode MemoryStore.get} or filtered out by {@linkcode MemoryStore.keys}.
 *
 * **Not recommended for production.** Entries are not persisted, not shared
 * across processes, and are lost on restart. Suitable for development,
 * testing, and prototyping.
 *
 * @example Basic usage
 * ```ts
 * import { MemoryStore } from "@cahva/router-cache/stores/memory";
 *
 * const store = new MemoryStore();
 * await store.set("key", { body: "hello", type: "text/plain", touched: Date.now(), expire: 60 }, 60);
 * const entry = await store.get("key");
 * ```
 */
export class MemoryStore implements CacheStore {
  /** Internal storage map. */
  readonly #data = new Map<string, StoredEntry>();

  /**
   * Retrieve a cache entry by exact key.
   *
   * Returns `null` if the key does not exist or has expired.
   * Expired entries are lazily deleted on access.
   *
   * @param key The cache key.
   * @returns The cache entry, or null if not found or expired.
   */
  get(key: string): Promise<CacheEntry | null> {
    const stored = this.#data.get(key);
    if (!stored) return Promise.resolve(null);

    if (stored.expiresAt !== undefined && Date.now() >= stored.expiresAt) {
      this.#data.delete(key);
      return Promise.resolve(null);
    }

    return Promise.resolve(stored.entry);
  }

  /**
   * Store a cache entry.
   *
   * If `ttl` is a positive number, the entry will expire after that many
   * seconds. Expired entries are lazily evicted on subsequent access.
   *
   * @param key The cache key.
   * @param entry The cache entry to store.
   * @param ttl Time-to-live in seconds. If omitted or <= 0, the entry does not expire.
   */
  set(key: string, entry: CacheEntry, ttl?: number): Promise<void> {
    const stored: StoredEntry = { entry };

    if (ttl !== undefined && ttl > 0) {
      stored.expiresAt = Date.now() + ttl * 1000;
    }

    this.#data.set(key, stored);
    return Promise.resolve();
  }

  /**
   * Delete a cache entry by exact key.
   *
   * @param key The cache key.
   * @returns 1 if the key existed and was deleted, 0 otherwise.
   */
  del(key: string): Promise<number> {
    return Promise.resolve(this.#data.delete(key) ? 1 : 0);
  }

  /**
   * Find all non-expired keys matching a glob-style pattern.
   *
   * Supports `*` (match any characters) and `?` (match single character)
   * wildcards, matching the behavior of Redis `KEYS`/`SCAN` patterns.
   *
   * @param pattern A glob pattern (e.g. `"rc:users:*"`).
   * @returns An array of matching keys.
   */
  keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") + "$",
    );

    const now = Date.now();
    const result: string[] = [];

    for (const [key, stored] of this.#data) {
      // Skip expired entries (lazy eviction)
      if (stored.expiresAt !== undefined && now >= stored.expiresAt) {
        this.#data.delete(key);
        continue;
      }
      if (regex.test(key)) {
        result.push(key);
      }
    }

    return Promise.resolve(result);
  }

  /**
   * Remove all entries from the store.
   *
   * Convenience method for testing and development workflows.
   */
  clear(): void {
    this.#data.clear();
  }

  /**
   * Return the number of non-expired entries in the store.
   *
   * Note: this does NOT trigger lazy eviction of expired entries.
   * The count may include entries that have expired but have not
   * yet been accessed.
   */
  get size(): number {
    return this.#data.size;
  }
}
