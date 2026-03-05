import { Hono } from "hono";
import { cached } from "./lib/cache.ts";

const app = new Hono();

// GET / — default TTL (3600s from cache instance)
app.get("/", cached(), (c) => {
  return c.json({
    message: "Hello from /",
    cached_at: new Date().toISOString(),
    ttl: "default (3600s)",
  });
});

// GET /short — 60 second TTL
app.get("/short", cached({ expire: 60 }), (c) => {
  return c.json({
    message: "Hello from /short",
    cached_at: new Date().toISOString(),
    ttl: "60s",
  });
});

// GET /long — dynamic TTL: 10s with ?realtime, otherwise 24h
app.get(
  "/long",
  cached({
    expire: (req) => {
      return new URL(req.url).searchParams.has("realtime") ? 10 : 86400;
    },
  }),
  (c) => {
    return c.json({
      message: "Hello from /long",
      cached_at: new Date().toISOString(),
      ttl: "86400s (or 10s with ?realtime)",
    });
  },
);

export default app;
