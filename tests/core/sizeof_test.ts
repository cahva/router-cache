import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { sizeof } from "../../src/core/sizeof.ts";

describe("sizeof", () => {
  it("returns 0 for null", () => {
    expect(sizeof(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(sizeof(undefined)).toBe(0);
  });

  it("returns 8 for a number", () => {
    expect(sizeof(42)).toBe(8);
    expect(sizeof(0)).toBe(8);
    expect(sizeof(-1)).toBe(8);
    expect(sizeof(3.14)).toBe(8);
  });

  it("returns 4 for a boolean", () => {
    expect(sizeof(true)).toBe(4);
    expect(sizeof(false)).toBe(4);
  });

  it("returns length * 2 for strings", () => {
    expect(sizeof("")).toBe(0);
    expect(sizeof("a")).toBe(2);
    expect(sizeof("hello")).toBe(10);
    expect(sizeof("hello world")).toBe(22);
  });

  it("returns byteLength for Uint8Array", () => {
    expect(sizeof(new Uint8Array(0))).toBe(0);
    expect(sizeof(new Uint8Array(10))).toBe(10);
    expect(sizeof(new Uint8Array(1024))).toBe(1024);
  });

  it("calculates size of simple objects", () => {
    const obj = { a: 1 };
    // key "a" = 2 bytes, value 1 = 8 bytes
    expect(sizeof(obj)).toBe(10);
  });

  it("calculates size of objects with string values", () => {
    const obj = { name: "test" };
    // key "name" = 8 bytes, value "test" = 8 bytes
    expect(sizeof(obj)).toBe(16);
  });

  it("calculates size of nested objects", () => {
    const obj = { a: { b: 1 } };
    // key "a" = 2, inner: key "b" = 2 + value 1 = 8 → inner = 10, total = 12
    expect(sizeof(obj)).toBe(12);
  });

  it("calculates size of a CacheEntry-like object", () => {
    const entry = {
      body: '{"users":[]}',
      type: "application/json",
      touched: 1700000000000,
      expire: 3600,
    };
    const size = sizeof(entry);
    expect(size).toBeGreaterThan(0);

    // body key (8) + body value (24) = 32
    // type key (8) + type value (32) = 40
    // touched key (14) + touched value (8) = 22
    // expire key (12) + expire value (8) = 20
    // total = 114
    expect(size).toBe(114);
  });

  it("handles circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    // Should not throw; circular ref is detected and skipped
    const size = sizeof(obj);
    expect(size).toBeGreaterThan(0);
  });

  it("handles arrays (as objects)", () => {
    const arr = [1, 2, 3];
    const size = sizeof(arr);
    expect(size).toBeGreaterThan(0);
  });
});
