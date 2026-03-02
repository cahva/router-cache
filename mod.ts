/**
 * @cahva/router-cache - Framework-agnostic, store-agnostic cache middleware.
 *
 * This module re-exports the core API. For store providers and framework
 * adapters, import from the respective subpaths:
 *
 * - `@cahva/router-cache/stores/redis` - Redis/DragonflyDB store
 * - `@cahva/router-cache/adapters/hono` - Hono middleware adapter
 *
 * @example
 * ```ts
 * import { RouterCache, FOREVER } from "@cahva/router-cache";
 * import { RedisStore } from "@cahva/router-cache/stores/redis";
 * import { cacheMiddleware } from "@cahva/router-cache/adapters/hono";
 * ```
 *
 * @module
 */

export { FOREVER, RouterCache } from "./src/core/cache.ts";
export { sizeof } from "./src/core/sizeof.ts";
export { normalizeExpire } from "./src/core/expire.ts";

export type {
  CacheEntry,
  CacheLogger,
  CacheOptions,
  CacheStore,
  ExpireValue,
  MiddlewareOptions,
} from "./src/core/types.ts";
