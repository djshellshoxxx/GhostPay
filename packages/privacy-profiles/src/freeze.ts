/**
 * Deep immutability helper. Plain objects and arrays are frozen in place; anything already frozen is skipped, so
 * shared frozen tables cost nothing when they appear inside a fresh result.
 * Sets and Maps are not frozen (freezing does not stop `add`/`set`); callers that need an immutable collection
 * convert it to a sorted array first.
 */

/** Freezes `value` and everything reachable through plain objects and arrays. Returns the same reference. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  if (value instanceof Set || value instanceof Map) return value;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return value;
}
