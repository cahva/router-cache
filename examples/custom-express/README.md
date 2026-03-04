# Custom Express Adapter Example

This example shows how to build a custom caching middleware for Express using
`@cahva/router-cache`. Since `router-cache` ships a built-in Hono adapter but
not an Express one, this demonstrates how to write your own adapter for any
framework.

## Project structure

```
custom-express/
├── index.js              # Express app with cached routes
├── lib/
│   ├── cache.js          # Central cache instance + pre-bound "cached" helper
│   └── cache-middleware.js  # Express adapter (reusable in your own projects)
└── package.json
```

A key pattern here is the **centralized `cached()` helper** in `lib/cache.js`.
It creates the cache instance once (with the store, prefix, TTL defaults, and
logger) and exports a small wrapper around the middleware so route files never
need to know about the cache setup:

```js
// any route file
import { cached } from "./lib/cache.js";

router.get("/", cached(), handler);
router.get("/short", cached({ expire: 60 }), handler);
```

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
