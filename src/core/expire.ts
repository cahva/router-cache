/**
 * Expiration policy normalization for cache TTL values.
 *
 * Converts various expiration value formats into a consistent
 * function signature for use by cache middleware.
 *
 * @module
 */

import type { ExpireValue } from "./types.ts";

/**
 * Normalize an expiration policy value into a function that returns a TTL.
 *
 * Supports:
 * - Static number: returned as-is
 * - Function: passed through directly
 * - Object with `value` property: returns the value
 * - Object without `value`: returns the object (for compatibility)
 *
 * @example
 * ```ts
 * import { normalizeExpire } from "@cahva/router-cache";
 *
 * const fn1 = normalizeExpire(300);
 * fn1(); // 300
 *
 * const fn2 = normalizeExpire({ value: 600 });
 * fn2(); // 600
 *
 * const fn3 = normalizeExpire((req) => {
 *   return new URL(req.url).pathname.startsWith("/api") ? 60 : 3600;
 * });
 * ```
 *
 * @param expire The expiration value to normalize.
 * @returns A function that accepts an optional Request and returns a TTL number.
 */
export function normalizeExpire(
  expire: ExpireValue,
): (req?: Request) => number {
  // If expire is a function, return it as-is
  if (typeof expire === "function") {
    return expire as (req?: Request) => number;
  }

  // If expire is an object with dynamic expiration
  if (expire !== null && typeof expire === "object") {
    if (Object.prototype.hasOwnProperty.call(expire, "value")) {
      return () => (expire as { value: number }).value;
    }
    // Return the object itself (for compatibility with original library)
    return () => expire as unknown as number;
  }

  // Static expiration value (number or -1 for FOREVER)
  return () => expire;
}
