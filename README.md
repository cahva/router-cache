# @cahva/router-cache

Framework-agnostic, store-agnostic HTTP response cache middleware.

Cache your route responses with pluggable storage backends and framework
adapters. Bring your own Redis client, use any framework.

## Features

- **Framework-agnostic** - works with any framework; includes example adapters
  for Hono, Express, Fastify, etc.
- **Store-agnostic** - ships with Redis, Deno KV, and in-memory stores;
  supports any backend via the `CacheStore` interface
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
import { RouterCache } from "@cahva/router-cache";
import { RedisStore } from "@cahva/router-cache/stores/redis";
import Redis from "ioredis";

// Create a Redis-backed cache
const cache = new RouterCache({
  store: new RedisStore({ client: new Redis() }),
  prefix: "myapp:",
  expire: 3600, // default TTL: 1 hour
});

// Store a response
await cache.add("/api/users", '{"users":["alice","bob"]}', {
  type: "application/json",
  expire: 600, // 10 minutes
});

// Retrieve it
const entries = await cache.get("/api/users");

// Delete with wildcards
await cache.del("/api/*");
```

For framework-specific middleware examples (Hono, Express, Fastify, etc.), see the
[examples](https://github.com/cahva/router-cache/tree/main/examples)
directory.

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

### Framework adapters

The library doesn't ship framework-specific middleware — instead, you write
a thin adapter for your framework. The core exports `normalizeExpire()` and
the `MiddlewareOptions` type to make this straightforward.

A recommended pattern is to create a **centralized `cached()` helper** that
binds the cache instance once, so route files stay clean:

```ts
// lib/cache.ts
import { RouterCache } from "@cahva/router-cache";
import { RedisStore } from "@cahva/router-cache/stores/redis";
import { cacheMiddleware } from "./cache-middleware.ts";

const cache = new RouterCache({
  store: new RedisStore({ client: redis }),
  prefix: "myapp:",
  expire: 3600,
});

export function cached(options = {}) {
  return cacheMiddleware({ cache, ...options });
}

// routes.ts — no cache setup needed
import { cached } from "./lib/cache.ts";

app.get("/api/data", cached(), handler);
app.get("/api/data", cached({ expire: 60 }), handler);
app.get("/api/data", cached({ expire: (req) => ... }), handler);
```

Complete adapter implementations for Hono, Express, Fastify, etc. are available in the
[examples](https://github.com/cahva/router-cache/tree/main/examples)
directory.

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

### Memory store (development & testing)

A built-in in-memory store is available for development, testing, and
prototyping. It supports TTL via lazy eviction - no timers, no external
dependencies.

> **Not recommended for production.** Entries are not persisted, not shared
> across processes, and are lost on restart.

```ts
import { RouterCache } from "@cahva/router-cache";
import { MemoryStore } from "@cahva/router-cache/stores/memory";

const cache = new RouterCache({
  store: new MemoryStore(),
  expire: 60,
});
```

The `MemoryStore` also exposes `clear()` and `size` for convenience in tests.

### Deno KV store

A Deno KV store is available for Deno projects. It uses Deno's built-in
key-value database — zero external dependencies, no separate server required.

Data is persisted locally (SQLite-backed) by default, or can run in-memory
with `Deno.openKv(":memory:")`.

```ts
import { RouterCache } from "@cahva/router-cache";
import { DenoKvStore } from "@cahva/router-cache/stores/denokv";

const kv = await Deno.openKv();
const cache = new RouterCache({
  store: new DenoKvStore({ kv }),
  expire: 60,
});
```

The `DenoKvStore` also exposes `close()` to release the underlying KV
connection when done.

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

### `MemoryStore`

In-memory store for development and testing. Not for production use.

| Method / Property   | Description                                    |
| ------------------- | ---------------------------------------------- |
| `get(key)`          | Retrieve a cache entry (evicts if expired).    |
| `set(key, entry, ttl?)` | Store an entry, optionally with TTL.      |
| `del(key)`          | Delete an entry.                               |
| `keys(pattern)`     | Glob-match keys, filtering out expired entries.|
| `clear()`           | Remove all entries.                            |
| `size`              | Number of entries (may include expired).       |

### `DenoKvStore`

Deno KV store using Deno's built-in key-value database.

| Method / Property       | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `get(key)`              | Retrieve a cache entry.                        |
| `set(key, entry, ttl?)` | Store an entry, optionally with TTL.           |
| `del(key)`              | Delete an entry.                               |
| `keys(pattern)`         | Glob-match keys via prefix scan + filtering.   |
| `close()`               | Close the underlying Deno KV connection.       |

### `MiddlewareOptions`

Common options for framework middleware adapters:

| Option   | Type          | Description                                         |
| -------- | ------------- | --------------------------------------------------- |
| `expire` | `ExpireValue` | Override TTL for this route.                        |
| `name`   | `string`      | Explicit cache key (default: request path + search params). |
| `binary` | `boolean`     | Base64-encode bodies for binary content.            |

## Examples

Runnable examples are available in the
[examples](https://github.com/cahva/router-cache/tree/main/examples) directory:

- **[deno-hono-redis](https://github.com/cahva/router-cache/tree/main/examples/deno-hono-redis)** -
  Hono + Redis on Deno
- **[deno-hono-denokv](https://github.com/cahva/router-cache/tree/main/examples/deno-hono-denokv)** -
  Hono + Deno KV on Deno
- **[nodejs-express-memory](https://github.com/cahva/router-cache/tree/main/examples/nodejs-express-memory)** -
  Express 5 + in-memory store on Node.js
- **[nodejs-fastify-memory](https://github.com/cahva/router-cache/tree/main/examples/nodejs-fastify-memory)** -
  Fastify 5 + in-memory store on Node.js

## Development

```sh
# Run tests
deno test --allow-net --allow-read

# Type check
deno check mod.ts src/stores/redis.ts src/stores/memory.ts src/stores/denokv.ts
```

## Acknowledgements

This package is inspired by
[express-redis-cache](https://www.npmjs.com/package/express-redis-cache), a
cache middleware for Express.js with Redis (no longer maintained). The core
caching concept of storing responses as Redis hashes originates from that
project. This project was started because the original library stopped working
in Node.js v24.

`@cahva/router-cache` is a ground-up rewrite in TypeScript with a
framework-agnostic, store-agnostic architecture. It also improves on the
original by using Redis `SCAN` for wildcard key operations instead of the
blocking `KEYS` command.

## License

MIT
