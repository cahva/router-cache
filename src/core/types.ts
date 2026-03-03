/**
 * Core types for router-cache.
 *
 * @module
 */

/** A cached response entry stored in the cache store. */
export interface CacheEntry {
  /** The response body as a string. */
  body: string;
  /** The content-type of the response (e.g. "application/json"). */
  type: string;
  /** Timestamp (ms since epoch) when the entry was created/updated. */
  touched: number;
  /** TTL in seconds. -1 means no expiration (FOREVER). */
  expire: number;
}

/**
 * Minimal interface for a cache store provider.
 *
 * Implementations must handle key-value storage of CacheEntry objects.
 * Keys are already prefixed by the RouterCache instance.
 */
export interface CacheStore {
  /** Retrieve a single cache entry by exact key. Returns null if not found. */
  get(key: string): Promise<CacheEntry | null>;
  /** Store a cache entry. If ttl > 0, the entry should expire after ttl seconds. */
  set(key: string, entry: CacheEntry, ttl?: number): Promise<void>;
  /** Delete a single entry by exact key. Returns the number of keys deleted (0 or 1). */
  del(key: string): Promise<number>;
  /** Find all keys matching a glob-style pattern (e.g. "rc:users:*"). */
  keys(pattern: string): Promise<string[]>;
}

/** Optional logger for cache operations. */
export interface CacheLogger {
  /** Called when the cache performs an operation (GET, SET, DEL). */
  onMessage?: (message: string) => void;
  /** Called when an error occurs during a cache operation. */
  onError?: (error: Error) => void;
}

/** Configuration options for creating a RouterCache instance. */
export interface CacheOptions {
  /** The store provider to use for caching. */
  store: CacheStore;
  /** Key prefix for all cache entries. Defaults to "rc:". */
  prefix?: string;
  /** Default TTL in seconds. -1 means no expiration. Defaults to -1. */
  expire?: number;
  /** Optional logger callbacks. */
  logger?: CacheLogger;
}

/**
 * Expiration policy value.
 *
 * Can be:
 * - A static number (TTL in seconds, -1 for forever)
 * - An object with a `value` property
 * - A function that receives the Request and returns a TTL
 *
 * @example
 * ```ts
 * // Static TTL
 * const expire: ExpireValue = 3600;
 *
 * // Object form
 * const expire: ExpireValue = { value: 3600 };
 *
 * // Dynamic TTL based on request
 * const expire: ExpireValue = (req) => {
 *   return new URL(req.url).pathname.startsWith("/api") ? 60 : 3600;
 * };
 * ```
 */
export type ExpireValue =
  | number
  | { value: number }
  | ((req: Request) => number);

/** Options for framework middleware adapters. */
export interface MiddlewareOptions {
  /** Override the default expiration for this route. */
  expire?: ExpireValue;
  /** Explicit cache key name. If not set, the full request URL path including search params is used. */
  name?: string;
  /** Enable binary mode: bodies are base64-encoded before caching. */
  binary?: boolean;
}
