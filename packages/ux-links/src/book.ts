import { fail } from './errors.js';
import { assertHandle, skeleton } from './handle.js';
import { validateText } from './text.js';
import { validateMetaAddress } from './target.js';
import { buildPaymentUri } from './uri.js';
import { exactRecord, isUint } from './validate.js';

/** Maximum entries in a local handle book. */
export const MAX_ENTRIES = 1000;
/** Maximum accepted size of an imported JSON book, in UTF-16 units. */
export const MAX_BOOK_JSON = 512 * 1024;

/** One handle -> meta-address mapping. */
export interface HandleEntry {
  readonly handle: string;
  readonly metaAddress: string;
  readonly label?: string;
  /** Unix seconds. */
  readonly addedAt: number;
}

/** Immutable local pay-me address book. */
export interface HandleBook {
  readonly version: 1;
  readonly entries: readonly HandleEntry[];
}

/** An empty book. */
export function emptyBook(): HandleBook {
  return { version: 1, entries: [] };
}

function validateEntry(v: unknown, path: string): HandleEntry {
  const r = exactRecord(
    v,
    ['handle', 'metaAddress', 'label', 'addedAt'],
    ['handle', 'metaAddress', 'addedAt'],
    'BOOK',
    path,
  );
  const handle = assertHandle(r['handle']).handle;
  if (handle !== r['handle']) return fail('BOOK', `${path}.handle`); // stored form must be canonical
  const metaAddress = validateMetaAddress(r['metaAddress']);
  if (!isUint(r['addedAt'])) return fail('BOOK', `${path}.addedAt`);
  const out: HandleEntry = {
    handle,
    metaAddress,
    addedAt: r['addedAt'],
    ...(r['label'] !== undefined ? { label: validateText(r['label'], 64, 'TEXT', `${path}.label`) } : {}),
  };
  return out;
}

function checkCollisions(existing: readonly HandleEntry[], e: HandleEntry, path: string): void {
  const sk = skeleton(e.handle);
  for (const o of existing) {
    if (o.handle === e.handle) fail('BOOK', `${path}.handle`);
    if (skeleton(o.handle) === sk) fail('BOOK', `${path}.handle`);
    if (o.metaAddress === e.metaAddress) fail('BOOK', `${path}.metaAddress`);
  }
}

/**
 * Adds an entry, returning a new book.
 *
 * @throws {LinkError} `BOOK` on exact duplicate handle, look-alike handle
 * (equal skeleton), duplicate meta-address, or a full book; `HANDLE`/`TARGET`/`TEXT` for bad fields.
 * @security Refusing look-alikes at insert time stops a pasted/imported entry
 * `paypa1` from silently shadowing `paypal`.
 */
export function addEntry(
  book: HandleBook,
  input: { handle: string; metaAddress: string; label?: string; addedAt: number },
): HandleBook {
  if (book.entries.length >= MAX_ENTRIES) return fail('BOOK', 'entries');
  const e = validateEntry({ ...input, handle: assertHandle(input.handle).handle }, 'entry');
  checkCollisions(book.entries, e, 'entry');
  return { version: 1, entries: [...book.entries, e] };
}

/** Removes the entry for a handle (no-op if absent). */
export function removeEntry(book: HandleBook, handle: string): HandleBook {
  const h = assertHandle(handle).handle;
  return { version: 1, entries: book.entries.filter((e) => e.handle !== h) };
}

/**
 * Exact-match lookup. Input is normalised with {@link assertHandle}; there is no fuzzy matching.
 * @throws {LinkError} `HANDLE` for an invalid handle.
 */
export function resolveHandle(book: HandleBook, input: string): HandleEntry | undefined {
  const h = assertHandle(input).handle;
  return book.entries.find((e) => e.handle === h);
}

/**
 * Entries whose skeleton equals the input's but whose handle differs: show these
 * as a warning ("looks like ...") before the user pays or saves.
 */
export function findLookalikes(book: HandleBook, input: string): readonly HandleEntry[] {
  const { handle, skeleton: sk } = assertHandle(input);
  return book.entries.filter((e) => e.handle !== handle && skeleton(e.handle) === sk);
}

/** `ghostpay:` URI (target only) for a book entry. */
export function entryUri(entry: HandleEntry): string {
  return buildPaymentUri({ target: validateEntry(entry, 'entry').metaAddress });
}

/**
 * Validates untrusted data as a {@link HandleBook}, including cross-entry
 * collision rules and the entry cap.
 * @throws {LinkError} `BOOK`.
 * @security Untrusted (imports/storage).
 */
export function validateBook(v: unknown): HandleBook {
  const r = exactRecord(v, ['version', 'entries'], ['version', 'entries'], 'BOOK', 'book');
  if (r['version'] !== 1) return fail('BOOK', 'version');
  const raw = r['entries'];
  if (!Array.isArray(raw) || raw.length > MAX_ENTRIES) return fail('BOOK', 'entries');
  const entries: HandleEntry[] = [];
  raw.forEach((x: unknown, i) => {
    const e = validateEntry(x, `entries[${i}]`);
    checkCollisions(entries, e, `entries[${i}]`);
    entries.push(e);
  });
  return { version: 1, entries };
}

/** Serialises a book to JSON (stable key order). */
export function serializeBook(book: HandleBook): string {
  const b = validateBook(book);
  return JSON.stringify({
    version: 1,
    entries: b.entries.map((e) => ({
      handle: e.handle,
      metaAddress: e.metaAddress,
      ...(e.label !== undefined ? { label: e.label } : {}),
      addedAt: e.addedAt,
    })),
  });
}

/**
 * Parses and validates a JSON-exported book.
 * @throws {LinkError} `BOOK` for oversize or malformed JSON, plus {@link validateBook} errors.
 * @security Untrusted input; size-capped before parsing.
 */
export function parseBook(json: unknown): HandleBook {
  if (typeof json !== 'string' || json.length > MAX_BOOK_JSON) return fail('BOOK', 'json');
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return fail('BOOK', 'json');
  }
  return validateBook(v);
}
