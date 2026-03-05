# nodejs-fastify-memory

Fastify 5 + in-memory store example for Node.js.

This example shows how to build a caching middleware for Fastify using
`@cahva/router-cache`.

## Project structure

```
nodejs-fastify-memory/
├── index.js              # Fastify app with cached routes
├── lib/
│   ├── cache.js          # Central cache instance + pre-bound "cached" helper
│   └── cache-middleware.js  # Fastify adapter (reusable in your own projects)
└── package.json
```

A key pattern here is the **centralized `cached()` helper** in `lib/cache.js`.
It creates the cache instance once (with the store, prefix, TTL defaults, and
logger) and exports a small wrapper around the middleware so route files never
need to know about the cache setup:

```js
// any route file
import { cached } from "./lib/cache.js";

fastify.get("/", { preHandler: cached() }, handler);
fastify.get("/short", { preHandler: cached({ expire: 60 }) }, handler);
```

The Fastify adapter uses two parts:

- **`cacheMiddleware()`** — a `preHandler` hook that checks the cache and
  short-circuits on a hit
- **`cachePlugin`** — a Fastify plugin that registers an `onSend` hook to
  write successful responses to the cache

This keeps route files clean and makes it easy to swap stores (memory, Redis,
etc.) in one place.

## Prerequisites

- Node.js 18+

## Getting started

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` with these routes:

| Route | TTL | Notes |
|-------|-----|-------|
| `GET /` | 3600s (default) | Basic cached response |
| `GET /short` | 60s | Short TTL override |
| `GET /long` | 86400s | 24h TTL, or 10s with `?realtime` query param |

Hit the same route twice to see the `X-Cache: HIT` header on the second
request.
