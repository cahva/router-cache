import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { normalizeExpire } from "../../src/core/expire.ts";

describe("normalizeExpire", () => {
  it("returns a function that returns a static number", () => {
    const fn = normalizeExpire(3600);
    expect(fn()).toBe(3600);
  });

  it("handles -1 (FOREVER)", () => {
    const fn = normalizeExpire(-1);
    expect(fn()).toBe(-1);
  });

  it("handles 0", () => {
    const fn = normalizeExpire(0);
    expect(fn()).toBe(0);
  });

  it("passes through a function as-is", () => {
    const original = (req?: Request) => {
      if (req && new URL(req.url).pathname.startsWith("/api")) {
        return 600;
      }
      return 3600;
    };
    const fn = normalizeExpire(original);
    expect(fn).toBe(original);
  });

  it("returns the value from a function", () => {
    const fn = normalizeExpire(() => 1800);
    expect(fn()).toBe(1800);
  });

  it("extracts value from an object with a value property", () => {
    const fn = normalizeExpire({ value: 7200 });
    expect(fn()).toBe(7200);
  });

  it("function receives a Request and returns dynamic TTL", () => {
    const fn = normalizeExpire((req?: Request) => {
      if (!req) return 300;
      const url = new URL(req.url);
      return url.pathname === "/api/fast" ? 60 : 3600;
    });

    const fastReq = new Request("http://localhost/api/fast");
    const slowReq = new Request("http://localhost/api/slow");

    expect(fn(fastReq)).toBe(60);
    expect(fn(slowReq)).toBe(3600);
    expect(fn()).toBe(300);
  });
});
