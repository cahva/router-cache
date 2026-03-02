import { beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { Hono } from "hono";
import { RouterCache } from "../../src/core/cache.ts";
import { cacheMiddleware } from "../../src/adapters/hono.ts";
import type { CacheEntry, CacheStore } from "../../src/core/types.ts";

/**
 * In-memory CacheStore for testing the Hono adapter.
 */
class MemoryStore implements CacheStore {
  readonly data = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, entry: CacheEntry, _ttl?: number): Promise<void> {
    this.data.set(key, entry);
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    );
    const result: string[] = [];
    for (const key of this.data.keys()) {
      if (regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }
}

describe("cacheMiddleware (Hono)", () => {
  let store: MemoryStore;
  let cache: RouterCache;
  let app: Hono;
  let handlerCallCount: number;

  beforeEach(() => {
    store = new MemoryStore();
    cache = new RouterCache({ store, prefix: "test:", expire: 300 });
    app = new Hono();
    handlerCallCount = 0;
  });

  it("caches a JSON response on first request (MISS)", async () => {
    app.get(
      "/api/users",
      cacheMiddleware({ cache }),
      (c) => {
        handlerCallCount++;
        return c.json({ users: ["alice", "bob"] });
      },
    );

    const res = await app.request("/api/users");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ users: ["alice", "bob"] });
    expect(handlerCallCount).toBe(1);

    // Verify entry was stored
    expect(store.data.has("test:/api/users")).toBe(true);
  });

  it("returns cached response on second request (HIT)", async () => {
    app.get(
      "/api/users",
      cacheMiddleware({ cache }),
      (c) => {
        handlerCallCount++;
        return c.json({ users: ["alice"] });
      },
    );

    // First request - MISS
    const res1 = await app.request("/api/users");
    expect(res1.status).toBe(200);
    expect(handlerCallCount).toBe(1);

    // Second request - HIT (handler should NOT be called again)
    const res2 = await app.request("/api/users");
    expect(res2.status).toBe(200);
    expect(handlerCallCount).toBe(1); // Still 1, not called again

    const body = await res2.json();
    expect(body).toEqual({ users: ["alice"] });
    expect(res2.headers.get("X-Cache")).toBe("HIT");
  });

  it("sets X-Cache: MISS header on cache miss", async () => {
    app.get(
      "/api/data",
      cacheMiddleware({ cache }),
      (c) => c.text("hello"),
    );

    const res = await app.request("/api/data");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("MISS");
  });

  it("sets X-Cache: HIT header on cache hit", async () => {
    app.get(
      "/api/data",
      cacheMiddleware({ cache }),
      (c) => c.text("hello"),
    );

    await app.request("/api/data");
    const res = await app.request("/api/data");
    expect(res.headers.get("X-Cache")).toBe("HIT");
  });

  it("uses explicit name as cache key when provided", async () => {
    app.get(
      "/api/users",
      cacheMiddleware({ cache, name: "users-list" }),
      (c) => {
        handlerCallCount++;
        return c.json({ users: [] });
      },
    );

    await app.request("/api/users");
    expect(store.data.has("test:users-list")).toBe(true);
    expect(store.data.has("test:/api/users")).toBe(false);
  });

  it("does not cache non-200 responses", async () => {
    app.get(
      "/api/error",
      cacheMiddleware({ cache }),
      (c) => c.text("Not Found", 404),
    );

    const res = await app.request("/api/error");
    expect(res.status).toBe(404);
    expect(store.data.size).toBe(0);
  });

  it("uses custom expire from middleware options", async () => {
    app.get(
      "/api/data",
      cacheMiddleware({ cache, expire: 60 }),
      (c) => c.text("data"),
    );

    await app.request("/api/data");

    const entry = store.data.get("test:/api/data")!;
    expect(entry.expire).toBe(60);
  });

  it("uses cache default expire when no override specified", async () => {
    app.get(
      "/api/data",
      cacheMiddleware({ cache }),
      (c) => c.text("data"),
    );

    await app.request("/api/data");

    const entry = store.data.get("test:/api/data")!;
    expect(entry.expire).toBe(300); // cache default
  });

  it("caches text/html responses", async () => {
    app.get(
      "/page",
      cacheMiddleware({ cache }),
      (c) => c.html("<h1>Hello</h1>"),
    );

    const res = await app.request("/page");
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toBe("<h1>Hello</h1>");

    expect(store.data.has("test:/page")).toBe(true);
  });

  it("handles binary mode - caches base64-encoded bodies", async () => {
    app.get(
      "/api/image",
      cacheMiddleware({ cache, binary: true }),
      (c) => {
        handlerCallCount++;
        const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
        return c.body(data, 200, { "Content-Type": "image/png" });
      },
    );

    // First request - handler runs, response gets cached as base64
    const res1 = await app.request("/api/image");
    expect(res1.status).toBe(200);
    expect(handlerCallCount).toBe(1);

    // Verify it was stored as base64
    const entry = store.data.get("test:/api/image")!;
    expect(entry.body).toBeTruthy();
    // Decode to verify
    const decoded = Uint8Array.from(atob(entry.body), (ch) => ch.charCodeAt(0));
    expect(decoded[0]).toBe(0x89);
    expect(decoded[1]).toBe(0x50);

    // Second request - served from cache
    const res2 = await app.request("/api/image");
    expect(res2.status).toBe(200);
    expect(handlerCallCount).toBe(1); // Handler not called again
    expect(res2.headers.get("X-Cache")).toBe("HIT");
    expect(res2.headers.get("Content-Type")).toBe("image/png");

    const buf = await res2.arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
  });

  it("continues to handler when cache store throws (fail-open)", async () => {
    // Create a store that throws on get
    const failStore: CacheStore = {
      get: () => Promise.reject(new Error("Redis connection failed")),
      set: () => Promise.resolve(),
      del: () => Promise.resolve(0),
      keys: () => Promise.resolve([]),
    };
    const failCache = new RouterCache({ store: failStore, prefix: "test:" });

    const failApp = new Hono();
    failApp.get(
      "/api/data",
      cacheMiddleware({ cache: failCache }),
      (c) => {
        handlerCallCount++;
        return c.text("from handler");
      },
    );

    const res = await failApp.request("/api/data");
    expect(res.status).toBe(200);
    expect(handlerCallCount).toBe(1);

    const body = await res.text();
    expect(body).toBe("from handler");
  });

  it("uses function-based expire with request context", async () => {
    app.get(
      "/api/data",
      cacheMiddleware({
        cache,
        expire: (req: Request) => {
          const url = new URL(req.url);
          return url.searchParams.has("fast") ? 10 : 600;
        },
      }),
      (c) => c.text("data"),
    );

    await app.request("/api/data?fast=1");
    const entry = store.data.get("test:/api/data")!;
    expect(entry.expire).toBe(10);
  });
});
