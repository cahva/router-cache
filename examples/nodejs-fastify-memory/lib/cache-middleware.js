import { normalizeExpire } from "@cahva/router-cache";

/**
 * Create a Fastify preHandler hook that caches responses using @cahva/router-cache.
 *
 * @param {object} options
 * @param {import("@cahva/router-cache").RouterCache} options.cache - The cache instance.
 * @param {import("@cahva/router-cache").ExpireValue} [options.expire] - Override TTL for this route.
 * @param {string} [options.name] - Explicit cache key (default: request url).
 * @param {boolean} [options.binary] - Base64-encode bodies for binary content.
 */
export function cacheMiddleware(options) {
  const { cache, name, binary = false } = options;

  // Pre-build the expire resolver if provided
  const resolveExpire =
    options.expire !== undefined
      ? normalizeExpire(options.expire)
      : undefined;

  return async (request, reply) => {
    // Determine cache key: explicit name or full request URL (path + query)
    const cacheName = name ?? request.url;

    try {
      // Check cache
      const entries = await cache.get(cacheName);

      if (entries.length > 0) {
        const entry = entries[0];
        reply.header("Content-Type", entry.type);
        reply.header("X-Cache", "HIT");
        return reply.send(entry.body);
      }
    } catch (_error) {
      // Fail-open: continue to handler on cache read error
    }

    // Cache miss — tag the request so the onSend hook writes to cache
    reply.header("X-Cache", "MISS");

    request._cacheName = cacheName;
    request._cacheResolveExpire = resolveExpire;
  };
}

/**
 * Register the cache onSend hook on a Fastify instance.
 * Call this once during setup to enable cache writes for all routes
 * that use the cacheMiddleware preHandler.
 *
 * @param {import("fastify").FastifyInstance} fastify
 * @param {import("@cahva/router-cache").RouterCache} cache
 */
export function registerCacheHook(fastify, cache) {
  fastify.addHook("onSend", async (request, reply, payload) => {
    if (!request._cacheName) return payload;
    if (reply.statusCode !== 200) return payload;

    const contentType = reply.getHeader("Content-Type") || "text/html";

    // Build a standard Request so the dynamic expire fn works
    const fullUrl = `${request.protocol}://${request.hostname}${request.url}`;
    const webRequest = new Request(fullUrl);

    const expire = request._cacheResolveExpire
      ? request._cacheResolveExpire(webRequest)
      : cache.defaultExpire;

    // Fire-and-forget: don't block the response
    cache
      .add(
        request._cacheName,
        typeof payload === "string" ? payload : String(payload),
        { type: String(contentType), expire },
      )
      .catch(() => {
        // Fail-open: silently ignore cache write errors
      });

    return payload;
  });
}
