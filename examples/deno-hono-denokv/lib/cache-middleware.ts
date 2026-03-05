import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { RouterCache, ExpireValue } from "@cahva/router-cache";
import { normalizeExpire } from "@cahva/router-cache";

/** Options for creating Hono cache middleware. */
export interface CacheMiddlewareOptions {
  /** The RouterCache instance to use. */
  cache: RouterCache;
  /** Override the default expiration for this route. */
  expire?: ExpireValue;
  /** Explicit cache key name. If not set, the request path + search params is used. */
  name?: string;
  /** Enable binary mode: bodies are base64-encoded before caching. */
  binary?: boolean;
}

/**
 * Create a Hono middleware that caches responses using @cahva/router-cache.
 *
 * On cache hit: returns the cached response immediately.
 * On cache miss: calls downstream, captures the response, caches it.
 */
export function cacheMiddleware(
  options: CacheMiddlewareOptions,
): MiddlewareHandler {
  const { cache, name, binary = false } = options;

  const resolveExpire =
    options.expire !== undefined
      ? normalizeExpire(options.expire)
      : undefined;

  return createMiddleware(async (c, next) => {
    const url = new URL(c.req.url);
    const cacheName = name ?? url.pathname + url.search;

    try {
      const entries = await cache.get(cacheName);

      if (entries.length > 0) {
        const entry = entries[0]!;

        if (binary) {
          const binaryData = Uint8Array.from(
            atob(entry.body),
            (ch) => ch.charCodeAt(0),
          );
          return new Response(binaryData, {
            status: 200,
            headers: {
              "Content-Type": entry.type,
              "X-Cache": "HIT",
            },
          });
        }

        return c.body(entry.body, 200, {
          "Content-Type": entry.type,
          "X-Cache": "HIT",
        });
      }
    } catch (_error) {
      // Fail-open: continue to handler on cache read error
    }

    await next();

    const res = c.res;

    if (res.status !== 200) {
      return;
    }

    try {
      const clonedRes = res.clone();
      let body: string;
      const contentType = res.headers.get("Content-Type") ?? "text/html";

      if (binary) {
        const buffer = await clonedRes.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binaryStr = "";
        for (const byte of bytes) {
          binaryStr += String.fromCharCode(byte);
        }
        body = btoa(binaryStr);
      } else {
        body = await clonedRes.text();
      }

      const expire = resolveExpire
        ? resolveExpire(c.req.raw)
        : cache.defaultExpire;

      await cache.add(cacheName, body, {
        type: contentType,
        expire,
      });

      c.header("X-Cache", "MISS");
    } catch (_error) {
      // Fail-open: silently ignore cache write errors
    }
  });
}
