import { normalizeExpire } from "@cahva/router-cache";

/**
 * Create an Express middleware that caches responses using @cahva/router-cache.
 *
 * @param {object} options
 * @param {import("@cahva/router-cache").RouterCache} options.cache - The cache instance.
 * @param {import("@cahva/router-cache").ExpireValue} [options.expire] - Override TTL for this route.
 * @param {string} [options.name] - Explicit cache key (default: req.originalUrl).
 * @param {boolean} [options.binary] - Base64-encode bodies for binary content.
 */
export function cacheMiddleware(options) {
  const { cache, name, binary = false } = options;

  // Pre-build the expire resolver if provided
  const resolveExpire =
    options.expire !== undefined
      ? normalizeExpire(options.expire)
      : undefined;

  return async (req, res, next) => {
    // Determine cache key: explicit name or full request URL (path + query)
    const cacheName = name ?? req.originalUrl;

    try {
      // Check cache
      const entries = await cache.get(cacheName);

      if (entries.length > 0) {
        const entry = entries[0];
        res.set("Content-Type", entry.type);
        res.set("X-Cache", "HIT");
        return res.send(entry.body);
      }
    } catch (_error) {
      // Fail-open: continue to handler on cache read error
    }

    // Cache miss — intercept res.send to capture the response body
    const originalSend = res.send.bind(res);

    res.send = function (body) {
      // Only cache successful responses
      if (res.statusCode === 200) {
        const contentType =
          res.get("Content-Type") || "text/html";

        // Build a standard Request so the dynamic expire fn works
        const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
        const webRequest = new Request(fullUrl);

        const expire = resolveExpire
          ? resolveExpire(webRequest)
          : cache.defaultExpire;

        // Fire-and-forget: don't block the response
        cache
          .add(cacheName, typeof body === "string" ? body : String(body), {
            type: contentType,
            expire,
          })
          .catch(() => {
            // Fail-open: silently ignore cache write errors
          });
      }

      res.set("X-Cache", "MISS");
      return originalSend(body);
    };

    next();
  };
}
