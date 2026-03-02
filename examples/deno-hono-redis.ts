/**
 * Basic Hono + Redis cache example for Deno.
 *
 * Prerequisites:
 *   - A running Redis server on localhost:6379
 *
 * Setup:
 *   deno add jsr:@cahva/router-cache  jsr:@hono/hono npm:ioredis
 *
 * Run with Deno:
 *   deno serve deno-hono-redis.ts
 */

import { Hono} from "@hono/hono";
import Redis from "ioredis";
import { RouterCache } from "@cahva/router-cache";
import { RedisStore } from "@cahva/router-cache/stores/redis";
import { cacheMiddleware } from "@cahva/router-cache/adapters/hono";

const redis = new Redis();
const cache = new RouterCache({
  store: new RedisStore({ client: redis }),
  prefix: "test:",
  expire: 60,
  logger: {
    onMessage: (msg) => console.log(`[cache] ${msg}`),
    onError: (err) => console.error(`[cache error] ${err.message}`),
  },
});

const app = new Hono();

// Cached route - returns current time (cached for 60s)
app.get("/", cacheMiddleware({ cache }), (c) => {
  return c.json({ time: new Date().toISOString(), message: "Hello!" });
});

// Cached with short TTL (10s)
app.get("/short", cacheMiddleware({ cache, expire: 10 }), (c) => {
  return c.json({ time: new Date().toISOString(), ttl: "10s" });
});

// Non-cached route for comparison
app.get("/nocache", (c) => {
  return c.json({ time: new Date().toISOString(), cached: false });
});

export default app;
