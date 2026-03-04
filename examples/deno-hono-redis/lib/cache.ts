import Redis from "ioredis";
import { RouterCache } from "@cahva/router-cache";
import { RedisStore } from "@cahva/router-cache/stores/redis";
import { cacheMiddleware } from "./cache-middleware.ts";
import type { CacheMiddlewareOptions } from "./cache-middleware.ts";

const redis = new Redis();

const cache = new RouterCache({
  store: new RedisStore({ client: redis }),
  prefix: "hono:",
  expire: 3600, // default TTL: 1 hour
  logger: {
    onMessage: (msg) => console.log(`[cache] ${msg}`),
    onError: (err) => console.error(`[cache] ${err.message}`),
  },
});

/**
 * Pre-bound cache middleware helper.
 * No need to pass the cache instance every time.
 *
 * @example
 * app.get("/", cached(), handler);
 * app.get("/short", cached({ expire: 60 }), handler);
 * app.get("/long", cached({ expire: (req) => ... }), handler);
 */
export function cached(options: Omit<CacheMiddlewareOptions, "cache"> = {}) {
  return cacheMiddleware({ cache, ...options });
}

// Export the raw cache instance for direct operations (e.g. cache.del("/api/*"))
export { cache };
