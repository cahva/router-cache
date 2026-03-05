# Examples

Usage examples for `@cahva/router-cache`. Each example includes its own
adapter implementation showing how to integrate with your framework of choice.

All examples use a centralized `cached()` helper pattern — the cache instance
and store are configured once in `lib/cache`, and route files just import the
pre-bound middleware.

| Example | Runtime | Framework | Store |
|---------|---------|-----------|-------|
| [deno-hono-redis/](./deno-hono-redis/) | Deno | Hono | Redis |
| [deno-hono-denokv/](./deno-hono-denokv/) | Deno | Hono | Deno KV |
| [nodejs-express-memory/](./nodejs-express-memory/) | Node.js | Express 5 | Memory |
| [nodejs-fastify-memory/](./nodejs-fastify-memory/) | Node.js | Fastify 5 | Memory |
