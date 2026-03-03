/**
 * Hono cache middleware adapter for router-cache.
 *
 * Provides a `cacheMiddleware` factory that creates Hono-compatible
 * middleware for caching responses via a RouterCache instance.
 *
 * @module
 */

import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { RouterCache } from "../core/cache.ts";
import type { MiddlewareOptions } from "../core/types.ts";
import { normalizeExpire } from "../core/expire.ts";

/** Options for creating Hono cache middleware. */
export interface HonoCacheOptions extends MiddlewareOptions {
  /** The RouterCache instance to use. */
  cache: RouterCache;
}

/**
 * Create a Hono middleware handler that caches responses.
 *
 * On cache hit: returns the cached response immediately without calling downstream.
 * On cache miss: calls downstream, captures the response, caches it, and returns it.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { RouterCache } from "@cahva/router-cache";
 * import { RedisStore } from "@cahva/router-cache/stores/redis";
 * import { cacheMiddleware } from "@cahva/router-cache/adapters/hono";
 *
 * const cache = new RouterCache({
 *   store: new RedisStore({ client: redisClient }),
 *   prefix: "myapp:",
 *   expire: 3600,
 * });
 *
 * const app = new Hono();
 * app.get("/api/users", cacheMiddleware({ cache, expire: 600 }), (c) => {
 *   return c.json({ users: [] });
 * });
 * ```
 *
 * @param options Configuration including the cache instance and optional overrides.
 * @returns A Hono-compatible middleware handler.
 */
export function cacheMiddleware(options: HonoCacheOptions): MiddlewareHandler {
  const { cache, name, binary = false } = options;

  // Pre-build the expire resolver if provided
  const resolveExpire = options.expire !== undefined
    ? normalizeExpire(options.expire)
    : undefined;

  return createMiddleware(async (c: Context, next: Next) => {
    // Determine the cache key: explicit name or the request path + search params
    const url = new URL(c.req.url);
    const cacheName = name ?? url.pathname + url.search;

    try {
      // Check cache
      const entries = await cache.get(cacheName);

      if (entries.length > 0) {
        const entry = entries[0]!;

        // Decode base64 if binary mode was used
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

        // Text response cache hit
        return c.body(entry.body, 200, {
          "Content-Type": entry.type,
          "X-Cache": "HIT",
        });
      }
    } catch (_error) {
      // On cache read error, continue to handler (fail-open)
    }

    // Cache miss - call downstream handler
    await next();

    // After downstream: capture the response and cache it
    const res = c.res;

    // Only cache successful responses
    if (res.status !== 200) {
      return;
    }

    try {
      // Read the response body
      const clonedRes = res.clone();
      let body: string;
      const contentType = res.headers.get("Content-Type") ?? "text/html";

      if (binary) {
        // Binary mode: base64-encode the response
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

      // Determine TTL
      const expire = resolveExpire
        ? resolveExpire(c.req.raw)
        : cache.defaultExpire;

      // Store in cache
      await cache.add(cacheName, body, {
        type: contentType,
        expire,
      });

      // Add cache miss header to the response
      c.header("X-Cache", "MISS");
    } catch (_error) {
      // On cache write error, silently continue (fail-open)
      // The response is already sent to the client
    }
  });
}
