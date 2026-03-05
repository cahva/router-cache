# deno-hono-denokv

Hono + Deno KV example for Deno.

This example shows how to use `@cahva/router-cache` with
[Hono](https://hono.dev) and Deno's built-in KV store, using a centralized
`cached()` helper pattern.

## Project structure

```
deno-hono-denokv/
├── main.ts               # Hono app with cached routes
├── lib/
│   ├── cache.ts          # Central cache instance + pre-bound "cached" helper
│   └── cache-middleware.ts  # Hono adapter (reusable in your own projects)
└── deno.json
```

The **centralized `cached()` helper** in `lib/cache.ts` creates the cache
instance once (with the Deno KV store, prefix, TTL defaults, and logger) and
exports a small wrapper so route files never need to know about the cache
setup:

```ts
// any route file
import { cached } from "./lib/cache.ts";

app.get("/", cached(), handler);
app.get("/short", cached({ expire: 60 }), handler);
```

This keeps route files clean and makes it easy to swap stores or change
defaults in one place.

## Prerequisites

- [Deno](https://deno.land) 1.40+

No external services required — Deno KV is built into the runtime and
persists data locally (SQLite-backed).

## Getting started

```bash
deno task start
```

The server starts on `http://localhost:8000` with these routes:

| Route | TTL | Notes |
|-------|-----|-------|
| `GET /` | 3600s (default) | Basic cached response |
| `GET /short` | 60s | Short TTL override |
| `GET /long` | 86400s | 24h TTL, or 10s with `?realtime` query param |

Hit the same route twice to see the `X-Cache: HIT` header on the second
request.
