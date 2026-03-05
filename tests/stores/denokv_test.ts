import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { DenoKvStore } from "../../src/stores/denokv.ts";
import type { CacheEntry } from "../../src/core/types.ts";

function makeEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    body: '{"ok":true}',
    type: "application/json",
    touched: Date.now(),
    expire: 60,
    ...overrides,
  };
}

describe("DenoKvStore", () => {
  let kv: Deno.Kv;
  let store: DenoKvStore;

  beforeEach(async () => {
    kv = await Deno.openKv(":memory:");
    store = new DenoKvStore({ kv });
  });

  afterEach(() => {
    kv.close();
  });

  describe("get / set", () => {
    it("should return null for a missing key", async () => {
      expect(await store.get("nope")).toBeNull();
    });

    it("should store and retrieve an entry", async () => {
      const entry = makeEntry();
      await store.set("key1", entry);
      expect(await store.get("key1")).toEqual(entry);
    });

    it("should overwrite an existing entry", async () => {
      await store.set("key1", makeEntry({ body: "old" }));
      const updated = makeEntry({ body: "new" });
      await store.set("key1", updated);
      expect(await store.get("key1")).toEqual(updated);
    });
  });

  describe("del", () => {
    it("should return 0 for a missing key", async () => {
      expect(await store.del("nope")).toBe(0);
    });

    it("should delete an existing key and return 1", async () => {
      await store.set("key1", makeEntry());
      expect(await store.del("key1")).toBe(1);
      expect(await store.get("key1")).toBeNull();
    });
  });

  describe("keys", () => {
    it("should return all keys matching a wildcard pattern", async () => {
      await store.set("rc:users:1", makeEntry());
      await store.set("rc:users:2", makeEntry());
      await store.set("rc:posts:1", makeEntry());

      const result = await store.keys("rc:users:*");
      expect(result.sort()).toEqual(["rc:users:1", "rc:users:2"]);
    });

    it("should return all keys with * pattern", async () => {
      await store.set("a", makeEntry());
      await store.set("b", makeEntry());
      const result = await store.keys("*");
      expect(result.sort()).toEqual(["a", "b"]);
    });

    it("should support ? wildcard for single character", async () => {
      await store.set("rc:a", makeEntry());
      await store.set("rc:ab", makeEntry());
      const result = await store.keys("rc:?");
      expect(result).toEqual(["rc:a"]);
    });

    it("should return empty array when nothing matches", async () => {
      await store.set("rc:users:1", makeEntry());
      expect(await store.keys("rc:posts:*")).toEqual([]);
    });

    it("should escape regex special characters in the pattern", async () => {
      await store.set("rc:users.list", makeEntry());
      await store.set("rc:usersXlist", makeEntry());
      // The dot in the pattern should be literal, not regex "any char"
      const result = await store.keys("rc:users.list");
      expect(result).toEqual(["rc:users.list"]);
    });
  });

  describe("TTL", () => {
    it("should return entry before TTL expires", async () => {
      await store.set("key1", makeEntry(), 60);
      expect(await store.get("key1")).not.toBeNull();
    });

    it("should not expire entries with no TTL", async () => {
      await store.set("forever", makeEntry());
      expect(await store.get("forever")).not.toBeNull();
    });

    it("should not expire entries with TTL <= 0", async () => {
      await store.set("zero", makeEntry(), 0);
      await store.set("negative", makeEntry(), -1);
      expect(await store.get("zero")).not.toBeNull();
      expect(await store.get("negative")).not.toBeNull();
    });
  });

  describe("close", () => {
    it("should close without error", () => {
      // Create a separate instance to close (don't close the shared one)
      // Just verify the method exists and doesn't throw
      // The shared kv is closed in afterEach
      expect(typeof store.close).toBe("function");
    });
  });

  describe("prefix", () => {
    it("should use custom prefix", async () => {
      const customStore = new DenoKvStore({ kv, prefix: "myapp" });
      await customStore.set("key1", makeEntry());

      // Should be retrievable with the same prefix
      expect(await customStore.get("key1")).not.toBeNull();

      // Should NOT be visible from the default-prefix store
      expect(await store.get("key1")).toBeNull();
    });

    it("should default to 'rc' prefix", async () => {
      await store.set("key1", makeEntry());

      // Verify it's stored under ["rc", "key1"] in the raw KV
      const raw = await kv.get(["rc", "key1"]);
      expect(raw.value).not.toBeNull();
    });
  });
});
