/** Error thrown by the shape helpers; callers translate it to their own error type. */
export class ShapeError extends Error {
  public constructor(public readonly path: string) {
    super('shape');
    this.name = 'ShapeError';
  }
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/**
 * Reads own data properties of a plain object. `required` keys must exist,
 * `optional` keys may; any other key, any accessor property, symbol keys and
 * non-plain prototypes are rejected. Values are read exactly once.
 */
export function readShape(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ShapeError(path);
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new ShapeError(path);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new ShapeError(path);
  const allowed = new Set([...required, ...optional]);
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!allowed.has(key)) throw new ShapeError(join(path, key));
    const d = Object.getOwnPropertyDescriptor(value, key) as PropertyDescriptor;
    if (!('value' in d)) throw new ShapeError(join(path, key));
    out[key] = d.value;
  }
  for (const key of required) if (!(key in out)) throw new ShapeError(join(path, key));
  return out;
}

/** Reads a plain array (no holes, no extra props) of at most `max` items. */
export function readArray(value: unknown, max: number, path: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new ShapeError(path);
  if (value.length > max) throw new ShapeError(path);
  const out: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, i);
    if (d === undefined || !('value' in d)) throw new ShapeError(`${path}[${i}]`);
    out.push(d.value);
  }
  return out;
}

export function readString(value: unknown, re: RegExp, path: string): string {
  if (typeof value !== 'string' || !re.test(value)) throw new ShapeError(path);
  return value;
}

export function readInt(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ShapeError(path);
  }
  return value;
}

export function readBool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ShapeError(path);
  return value;
}

/** Printable text without control, bidi-override or zero-width characters; 1..max chars. */
export function textRe(max: number): RegExp {
  return new RegExp(
    `^(?![\\s])[^\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069\\ufeff]{1,${max}}$`,
    'u',
  );
}
