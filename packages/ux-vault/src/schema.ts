import {
  type AddressBook,
  type Contact,
  MAX_CONTACTS,
  addressKey,
  isValidId,
  normalizeAddress,
  normalizeLabel,
  normalizeNetwork,
  normalizeNote,
  normalizeTag,
  normalizeTags,
} from './contacts.js';
import { fail } from './errors.js';

/** Current plaintext payload schema version. */
export const CURRENT_SCHEMA = 2;

/** Decrypted payload (profile storage and backups share it). */
export interface Payload {
  readonly schema: typeof CURRENT_SCHEMA;
  readonly book: AddressBook;
}

type Obj = Record<string, unknown>;

function asObj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    return fail('CORRUPT', `${what} must be an object`);
  return v as Obj;
}

/** Read an own property only (guards against inherited / prototype keys). */
function own(o: Obj, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function asTime(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return fail('CORRUPT', 'invalid timestamp');
  return v;
}

/** Wrap normaliser failures from untrusted data as CORRUPT. */
function strict<T>(f: () => T): T {
  try {
    return f();
  } catch {
    return fail('CORRUPT', 'invalid field in stored data');
  }
}

function validateContact(raw: unknown): Contact {
  const o = asObj(raw, 'contact');
  const id = own(o, 'id');
  if (!isValidId(id)) return fail('CORRUPT', 'invalid contact id');
  const createdAt = asTime(own(o, 'createdAt'));
  const updatedAt = asTime(own(o, 'updatedAt'));
  if (updatedAt < createdAt) return fail('CORRUPT', 'updatedAt before createdAt');
  return {
    id,
    label: strict(() => normalizeLabel(own(o, 'label'))),
    address: strict(() => normalizeAddress(own(o, 'address'))),
    network: strict(() => normalizeNetwork(own(o, 'network'))),
    tags: strict(() => normalizeTags(own(o, 'tags'))),
    note: strict(() => normalizeNote(own(o, 'note'))),
    createdAt,
    updatedAt,
  };
}

/**
 * Strictly validate an untrusted address book. Unknown fields are dropped; duplicate ids or
 * duplicate network+address pairs are rejected.
 * @security All imports and all loads pass through here. Throws CORRUPT on any violation.
 */
export function validateBook(raw: unknown): AddressBook {
  const o = asObj(raw, 'book');
  const arr = own(o, 'contacts');
  if (!Array.isArray(arr)) return fail('CORRUPT', 'contacts must be an array');
  if (arr.length > MAX_CONTACTS) return fail('LIMIT', 'too many contacts');
  const ids = new Set<string>();
  const keys = new Set<string>();
  const contacts = (arr as unknown[]).map(validateContact);
  for (const c of contacts) {
    const k = addressKey(c.network, c.address);
    if (ids.has(c.id) || keys.has(k)) return fail('CORRUPT', 'duplicate contact in data');
    ids.add(c.id);
    keys.add(k);
  }
  return { contacts };
}

/** Schema v1 -> v2: `entries[{id,name,address,chain,tag?,ts}]` became `contacts[...]` with labels, tags, note, two timestamps. */
function migrate1to2(v1: Obj): Obj {
  const entries = own(v1, 'entries');
  if (!Array.isArray(entries)) return fail('CORRUPT', 'v1 entries must be an array');
  if (entries.length > MAX_CONTACTS) return fail('LIMIT', 'too many contacts');
  const contacts = (entries as unknown[]).map((e) => {
    const o = asObj(e, 'v1 entry');
    const chain = own(o, 'chain');
    const tag = own(o, 'tag');
    const ts = asTime(own(o, 'ts'));
    return {
      id: own(o, 'id'),
      label: own(o, 'name'),
      address: own(o, 'address'),
      network: typeof chain === 'string' ? chain.trim().toLowerCase() : chain,
      tags:
        tag === undefined || tag === ''
          ? []
          : [strict(() => normalizeTag(typeof tag === 'string' ? tag.trim().replace(/\s+/g, '-') : tag))],
      note: '',
      createdAt: ts,
      updatedAt: ts,
    };
  });
  return { schema: 2, contacts };
}

const MIGRATIONS: Readonly<Record<number, (o: Obj) => Obj>> = { 1: migrate1to2 };

/**
 * Parse (already-authenticated) JSON text into the current payload, running ordered migrations.
 * @security Future schema numbers fail closed with UNSUPPORTED_VERSION rather than being guessed at.
 */
export function parsePayload(json: string): { payload: Payload; migratedFrom?: number; exportedAt?: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail('CORRUPT', 'payload is not valid json');
  }
  let o = asObj(parsed, 'payload');
  const schema = own(o, 'schema');
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1)
    return fail('CORRUPT', 'invalid schema number');
  if (schema > CURRENT_SCHEMA)
    return fail('UNSUPPORTED_VERSION', `payload schema ${schema} is newer than supported ${CURRENT_SCHEMA}`);
  const rawAt = own(o, 'exportedAt');
  const exportedAt =
    typeof rawAt === 'number' && Number.isSafeInteger(rawAt) && rawAt >= 0 ? rawAt : undefined;
  let v = schema;
  while (v < CURRENT_SCHEMA) {
    const step = MIGRATIONS[v];
    /* c8 ignore next */
    if (!step) return fail('CORRUPT', 'missing migration step');
    o = step(o);
    v++;
  }
  const book = validateBook(o);
  const payload: Payload = { schema: CURRENT_SCHEMA, book };
  return {
    payload,
    ...(schema < CURRENT_SCHEMA ? { migratedFrom: schema } : {}),
    ...(exportedAt === undefined ? {} : { exportedAt }),
  };
}

/** Serialise the current payload (canonical field order). */
export function serializePayload(book: AddressBook, exportedAt?: number): string {
  return JSON.stringify({
    schema: CURRENT_SCHEMA,
    ...(exportedAt === undefined ? {} : { exportedAt }),
    contacts: book.contacts.map((c) => ({
      id: c.id,
      label: c.label,
      address: c.address,
      network: c.network,
      tags: [...c.tags],
      note: c.note,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}
