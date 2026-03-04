/**
 * @cahva/router-cache - Framework-agnostic, store-agnostic cache middleware.
 *
 * This module re-exports the core API. For store providers, import from
 * the respective subpaths:
 *
 * - `@cahva/router-cache/stores/redis` - Redis/DragonflyDB store
 * - `@cahva/router-cache/stores/memory` - In-memory store (dev/testing)
 *
 * For framework adapter examples (Hono, Express, etc.), see the
 * [examples](https://github.com/cahva/router-cache/tree/main/examples)
 * directory.
 *
 * @example
 * ```ts
 * import { RouterCache, FOREVER } from "@cahva/router-cache";
 * import { RedisStore } from "@cahva/router-cache/stores/redis";
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
