# @cahva/router-cache

Framework-agnostic, store-agnostic HTTP response cache middleware.

Cache your route responses with pluggable storage backends and framework
adapters. Bring your own Redis client, use any framework.

## Features

- **Framework-agnostic** - ships with a Hono adapter, more can be added
- **Store-agnostic** - ships with a Redis store, supports any backend via the
  `CacheStore` interface
- **Bring your own client** - works with both
  [ioredis](https://github.com/redis/ioredis) and
  [redis](https://github.com/redis/node-redis) (v4+)
- **Wildcard operations** - get/delete cache entries using glob patterns
  (e.g. `/api/users/*`)
- **Binary mode** - cache binary responses (images, PDFs) via base64 encoding
- **Flexible TTL** - static numbers, objects, or functions that receive the
  request for dynamic expiration
- **Fail-open** - cache errors never break your application
- **ESM & TypeScript** - fully typed, published as ESM on JSR

## Install

```sh
# Deno
deno add jsr:@cahva/router-cache

# Node.js
npx jsr add @cahva/router-cache
```

## Quick start

```ts
import { Hono } from "hono";
import { RouterCache } from "@cahva/router-cache";
import { RedisStore } from "@cahva/router-cache/stores/redis";
import { cacheMiddleware } from "@cahva/router-cache/adapters/hono";
import Redis from "ioredis";

// Create a Redis-backed cache
const cache = new RouterCache({
  store: new RedisStore({ client: new Redis() }),
  prefix: "myapp:",
  expire: 3600, // default TTL: 1 hour
});

const app = new Hono();

// Cache this route for 10 minutes
app.get("/api/users", cacheMiddleware({ cache, expire: 600 }), (c) => {
  return c.json({ users: ["alice", "bob"] });
});

export default app;
```

## Usage

### Creating a cache instance

```ts
import { RouterCache, FOREVER } from "@cahva/router-cache";
import { RedisStore } from "@cahva/router-cache/stores/redis";

const cache = new RouterCache({
  store: new RedisStore({ client: redisClient }),
  prefix: "myapp:",   // key prefix (default: "rc:")
  expire: 3600,       // default TTL in seconds (default: -1 = forever)
  logger: {
    onMessage: (msg) => console.log(`[cache] ${msg}`),
    onError: (err) => console.error(`[cache] ${err.message}`),
  },
});
```

### Hono middleware

```ts
import { cacheMiddleware } from "@cahva/router-cache/adapters/hono";

// Basic usage - caches using the request path as the key
app.get("/api/data", cacheMiddleware({ cache }), handler);

// Custom TTL
app.get("/api/data", cacheMiddleware({ cache, expire: 60 }), handler);

// Explicit cache key
app.get("/api/data", cacheMiddleware({ cache, name: "my-data" }), handler);

// Dynamic TTL based on request
app.get(
  "/api/data",
  cacheMiddleware({
    cache,
    expire: (req) => {
      return new URL(req.url).searchParams.has("realtime") ? 5 : 600;
    },
  }),
  handler,
);

// Binary mode for images/files
app.get("/api/image", cacheMiddleware({ cache, binary: true }), handler);
```

The middleware sets an `X-Cache` response header: `HIT` when served from cache,
`MISS` on first request.

### Direct cache operations

You can also use the cache directly without middleware:

```ts
// Store an entry
await cache.add("/api/users", '{"users":[]}', {
  type: "application/json",
  expire: 600,
});

// Retrieve entries
const entries = await cache.get("/api/users");

// Wildcard get
const allApi = await cache.get("/api/*");

// Delete
await cache.del("/api/users");

// Wildcard delete
await cache.del("/api/*");

// Delete everything
await cache.del("*");
```

### Redis client compatibility

The `RedisClient` interface is minimal enough to work with both popular Redis
client libraries without any adapters:

```ts
// ioredis
import Redis from "ioredis";
const store = new RedisStore({ client: new Redis() });

// redis v4+
import { createClient } from "redis";
const client = createClient();
await client.connect();
const store = new RedisStore({ client });
```

### Custom store

Implement the `CacheStore` interface to use any storage backend:

```ts
import type { CacheStore, CacheEntry } from "@cahva/router-cache";

class MemoryStore implements CacheStore {
  private data = new Map<string, CacheEntry>();

  async get(key: string) {
    return this.data.get(key) ?? null;
  }

  async set(key: string, entry: CacheEntry, ttl?: number) {
    this.data.set(key, entry);
    if (ttl && ttl > 0) {
      setTimeout(() => this.data.delete(key), ttl * 1000);
    }
  }

  async del(key: string) {
    return this.data.delete(key) ? 1 : 0;
  }

  async keys(pattern: string) {
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*") + "$",
    );
    return [...this.data.keys()].filter((k) => regex.test(k));
  }
}
```

## API

### `RouterCache`

| Property       | Type     | Description                          |
| -------------- | -------- | ------------------------------------ |
| `prefix`       | `string` | The key prefix for all cache entries |
| `defaultExpire` | `number` | Default TTL in seconds (-1 = forever) |

| Method                | Description                              |
| --------------------- | ---------------------------------------- |
| `get(name?)`          | Retrieve entries. Supports wildcards.    |
| `add(name, body, opts?)` | Store a cache entry.                  |
| `del(name)`           | Delete entries. Supports wildcards.      |

### `RedisStore`

| Method              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `get(key)`          | Retrieve a cache entry from a Redis hash.      |
| `set(key, entry, ttl?)` | Store as a Redis hash, optionally set TTL. |
| `del(key)`          | Delete a key.                                  |
| `keys(pattern)`     | SCAN for keys matching a glob pattern.         |

### `cacheMiddleware(options)`

| Option   | Type          | Description                                         |
| -------- | ------------- | --------------------------------------------------- |
| `cache`  | `RouterCache` | Required. The cache instance.                       |
| `expire` | `ExpireValue` | Override TTL for this route.                        |
| `name`   | `string`      | Explicit cache key (default: request pathname).     |
| `binary` | `boolean`     | Base64-encode bodies for binary content.            |

## Development

```sh
# Run tests
deno test --allow-net --allow-read

# Type check
deno check mod.ts src/stores/redis.ts src/adapters/hono.ts
```

## Acknowledgements

This package is inspired by
[express-redis-cache](https://www.npmjs.com/package/express-redis-cache), a
cache middleware for Express.js with Redis. The core caching concepts - storing
responses as Redis hashes, wildcard key operations via SCAN, and expiration
policies - originate from that project. `@cahva/router-cache` is a
ground-up rewrite in TypeScript with a framework-agnostic, store-agnostic
architecture.

## License

MIT
