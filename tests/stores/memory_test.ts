import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { FakeTime } from "@std/testing/time";
import { MemoryStore } from "../../src/stores/memory.ts";
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

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
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

  describe("TTL / lazy eviction", () => {
    let time: FakeTime;

    beforeEach(() => {
      time = new FakeTime();
    });

    afterEach(() => {
      time.restore();
    });

    it("should return entry before TTL expires", async () => {
      await store.set("key1", makeEntry(), 60);
      time.tick(59_000);
      expect(await store.get("key1")).not.toBeNull();
    });

    it("should return null after TTL expires (lazy eviction on get)", async () => {
      await store.set("key1", makeEntry(), 60);
      time.tick(60_000);
      expect(await store.get("key1")).toBeNull();
    });

    it("should evict expired keys from keys() results", async () => {
      await store.set("short", makeEntry(), 10);
      await store.set("long", makeEntry(), 120);
      time.tick(15_000);

      const result = await store.keys("*");
      expect(result).toEqual(["long"]);
    });

    it("should delete expired entry from internal map on access", async () => {
      await store.set("key1", makeEntry(), 1);
      expect(store.size).toBe(1);

      time.tick(2_000);
      await store.get("key1");
      expect(store.size).toBe(0);
    });

    it("should not expire entries with no TTL", async () => {
      await store.set("forever", makeEntry());
      time.tick(999_999_000);
      expect(await store.get("forever")).not.toBeNull();
    });

    it("should not expire entries with TTL <= 0", async () => {
      await store.set("zero", makeEntry(), 0);
      await store.set("negative", makeEntry(), -1);
      time.tick(999_999_000);
      expect(await store.get("zero")).not.toBeNull();
      expect(await store.get("negative")).not.toBeNull();
    });
  });

  describe("clear", () => {
    it("should remove all entries", async () => {
      await store.set("a", makeEntry());
      await store.set("b", makeEntry());
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
      expect(await store.get("a")).toBeNull();
      expect(await store.get("b")).toBeNull();
    });
  });

  describe("size", () => {
    it("should reflect the number of stored entries", async () => {
      expect(store.size).toBe(0);
      await store.set("a", makeEntry());
      expect(store.size).toBe(1);
      await store.set("b", makeEntry());
      expect(store.size).toBe(2);
      await store.del("a");
      expect(store.size).toBe(1);
    });
  });
});
