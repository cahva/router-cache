/**
 * Size calculation utility for cache entries.
 *
 * Provides an approximate byte-size measurement used for
 * cache size reporting in log messages.
 *
 * @module
 */

/**
 * Calculate approximate memory size of a value in bytes.
 *
 * Used for cache size reporting in log messages.
 *
 * @example
 * ```ts
 * import { sizeof } from "@cahva/router-cache";
 *
 * sizeof("hello");           // 10 (5 chars * 2 bytes)
 * sizeof(42);                // 8
 * sizeof({ key: "value" }); // 16 (key: 6 + value: 10)
 * ```
 *
 * @param obj The value to measure.
 * @param seen Set of already-visited objects to prevent circular reference issues.
 * @returns Approximate size in bytes.
 */
export function sizeof(
  obj: unknown,
  seen: WeakSet<object> = new WeakSet(),
): number {
  let bytes = 0;

  if (obj === null || obj === undefined) {
    return 0;
  }

  switch (typeof obj) {
    case "number":
      bytes += 8;
      break;
    case "string":
      bytes += (obj as string).length * 2;
      break;
    case "boolean":
      bytes += 4;
      break;
    case "object": {
      const objRef = obj as object;

      // Handle Uint8Array / ArrayBuffer
      if (objRef instanceof Uint8Array) {
        bytes += objRef.byteLength;
        break;
      }

      // Circular reference check
      if (seen.has(objRef)) {
        break;
      }
      seen.add(objRef);

      const keys = Object.keys(objRef);
      for (const key of keys) {
        bytes += key.length * 2; // Key size
        bytes += sizeof((objRef as Record<string, unknown>)[key], seen);
      }
      break;
    }
    default:
      break;
  }

  return bytes;
}
