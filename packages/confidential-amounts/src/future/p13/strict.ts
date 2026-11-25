/** Strict decoding helpers for untrusted P13 records (COMMON section 4). */
import { check } from './errors.js';
import type { P13Code } from './errors.js';

/** Plain data record view: own enumerable string keys with data (not accessor) values. */
export type DataRecord = Readonly<Record<string, unknown>>;

/**
 * Accepts only a plain object whose own keys are exactly `required` plus any of `optional`, all data properties.
 * Accessors, symbols, class instances and unknown keys are refused so a hostile object cannot vary between reads.
 */
export function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  code: P13Code,
): DataRecord {
  check(typeof value === 'object' && value !== null && !Array.isArray(value), code, 'expected an object');
  const proto: unknown = Object.getPrototypeOf(value);
  check(proto === Object.prototype || proto === null, code, 'expected a plain object');
  check(Object.getOwnPropertySymbols(value).length === 0, code, 'unexpected symbol key');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const out: Record<string, unknown> = {};
  for (const [key, d] of Object.entries(descriptors)) {
    check(required.includes(key) || optional.includes(key), code, 'unexpected key');
    check('value' in d && d.enumerable === true, code, 'accessor or hidden property');
    out[key] = d.value;
  }
  for (const key of required) check(key in out, code, 'missing key');
  return out;
}

/** Dense array of data elements, at most `max` long. */
export function dataArray(value: unknown, max: number, code: P13Code): readonly unknown[] {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code, 'expected an array');
  const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value);
  const length: unknown = descriptors['length']?.value;
  check(typeof length === 'number' && length <= max, code, 'array too long');
  check(Object.keys(descriptors).length === length + 1, code, 'sparse or extended array');
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const d = descriptors[String(i)];
    check(d !== undefined && 'value' in d, code, 'accessor element');
    out.push(d.value);
  }
  return out;
}

/** String matching `re`. */
export function matchString(value: unknown, re: RegExp, code: P13Code): string {
  check(typeof value === 'string' && re.test(value), code, 'invalid string field');
  return value;
}

/** Safe integer in `min..max`. */
export function intIn(value: unknown, min: number, max: number, code: P13Code): number {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max, code, 'invalid integer');
  return value;
}
