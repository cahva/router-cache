import express from "express";
import { cached } from "./lib/cache.js";

const app = express();

// GET / — default TTL (3600s from cache instance)
app.get(
  "/",
  cached(),
  (_req, res) => {
    res.json({
      message: "Hello from /",
      cached_at: new Date().toISOString(),
      ttl: "default (3600s)",
    });
  },
);

// GET /short — 60 second TTL
app.get(
  "/short",
  cached({ expire: 60 }),
  (_req, res) => {
    res.json({
      message: "Hello from /short",
      cached_at: new Date().toISOString(),
      ttl: "60s",
    });
  },
);

// GET /long — dynamic TTL: 10s with ?realtime, otherwise 24h
app.get(
  "/long",
  cached({
    expire: (req) => {
      return new URL(req.url).searchParams.has("realtime") ? 10 : 86400;
    },
  }),
  (_req, res) => {
    res.json({
      message: "Hello from /long",
      cached_at: new Date().toISOString(),
      ttl: "86400s (or 10s with ?realtime)",
    });
  },
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Routes:`);
  console.log(`  GET /       — default TTL (3600s)`);
  console.log(`  GET /short  — 60s TTL`);
  console.log(`  GET /long   — 24h TTL (or 10s with ?realtime)`);
});
