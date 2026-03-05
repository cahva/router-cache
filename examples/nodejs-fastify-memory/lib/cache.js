import { RouterCache } from "@cahva/router-cache";
import { MemoryStore } from "@cahva/router-cache/stores/memory";
import { cacheMiddleware } from "./cache-middleware.js";

const cache = new RouterCache({
  store: new MemoryStore(),
  prefix: "fastify:",
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
 * fastify.get("/", { preHandler: cached() }, handler);
 * fastify.get("/short", { preHandler: cached({ expire: 60 }) }, handler);
 *
 * @param {Omit<Parameters<typeof cacheMiddleware>[0], "cache">} [options]
 */
export function cached(options = {}) {
  return cacheMiddleware({ cache, ...options });
}

// Export the raw cache instance for direct operations (e.g. cache.del("/api/*"))
export { cache };
