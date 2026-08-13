// Stand-ins for the three lodash helpers the upstream base/benchmark report
// used (isEqual, groupBy, uniqBy). omni-ui does not depend on lodash and these
// call sites all operate on plain JSON-shaped data — run configs, filter
// selections, tooltip records — so a local implementation is enough and keeps
// the dependency out of the tree.

/**
 * Structural equality over JSON-shaped values (primitives, plain objects,
 * arrays). Not a general lodash `isEqual`: Dates, Maps, Sets, and class
 * instances compare by reference. Every call site here passes plain data.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // NaN === NaN is false but lodash treats them as equal; match that.
    return Number.isNaN(a) && Number.isNaN(b);
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    const x = a as unknown[];
    const y = b as unknown[];
    return x.length === y.length && x.every((item, i) => deepEqual(item, y[i]));
  }

  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(y, key) && deepEqual(x[key], y[key]));
}

/** Groups items by a property name or a key function, preserving input order. */
export function groupBy<T>(items: T[], key: keyof T | ((item: T) => string)): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const group = typeof key === 'function' ? key(item) : String(item[key]);
    (out[group] ??= []).push(item);
  }
  return out;
}

/** Keeps the first item for each distinct value of `key`. */
export function uniqBy<T>(items: T[], key: keyof T): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const item of items) {
    const value = item[key];
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(item);
  }
  return out;
}
