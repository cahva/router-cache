import Fastify from "fastify";
import { cached, cache } from "./lib/cache.js";
import { registerCacheHook } from "./lib/cache-middleware.js";

const fastify = Fastify({ logger: false });

// Register the cache onSend hook (writes responses to cache)
registerCacheHook(fastify, cache);

// GET / — default TTL (3600s from cache instance)
fastify.get(
  "/",
  { preHandler: cached() },
  (_request, _reply) => {
    return {
      message: "Hello from /",
      cached_at: new Date().toISOString(),
      ttl: "default (3600s)",
    };
  },
);

// GET /short — 60 second TTL
fastify.get(
  "/short",
  { preHandler: cached({ expire: 60 }) },
  (_request, _reply) => {
    return {
      message: "Hello from /short",
      cached_at: new Date().toISOString(),
      ttl: "60s",
    };
  },
);

// GET /long — dynamic TTL: 10s with ?realtime, otherwise 24h
fastify.get(
  "/long",
  {
    preHandler: cached({
      expire: (req) => {
        return new URL(req.url).searchParams.has("realtime") ? 10 : 86400;
      },
    }),
  },
  (_request, _reply) => {
    return {
      message: "Hello from /long",
      cached_at: new Date().toISOString(),
      ttl: "86400s (or 10s with ?realtime)",
    };
  },
);

const PORT = 3000;
await fastify.listen({ port: PORT });
console.log(`Server listening on http://localhost:${PORT}`);
console.log(`Routes:`);
console.log(`  GET /       — default TTL (3600s)`);
console.log(`  GET /short  — 60s TTL`);
console.log(`  GET /long   — 24h TTL (or 10s with ?realtime)`);
