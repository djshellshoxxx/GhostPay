import { toHex } from './bytes.js';
import { fail } from './errors.js';

/** Limits (enforced on every write and on every import). */
export const MAX_CONTACTS = 5000;
export const MAX_LABEL_LENGTH = 64;
export const MAX_NOTE_LENGTH = 500;
export const MAX_TAGS = 16;
export const MAX_TAG_LENGTH = 32;
export const MAX_ADDRESS_LENGTH = 128;

/** A saved payee. All text fields are normalised by {@link normalizeContactInput}. */
export interface Contact {
  readonly id: string;
  /** Human display name (NFKC, trimmed, no control/format/bidi characters). */
  readonly label: string;
  /** Opaque address string, ASCII printable only; case preserved (checksums). */
  readonly address: string;
  /** Lowercase network slug such as `eth`, `btc`. */
  readonly network: string;
  readonly tags: readonly string[];
  readonly note: string;
  /** Epoch milliseconds from the injected clock. */
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Decrypted address-book contents. */
export interface AddressBook {
  readonly contacts: readonly Contact[];
}

/** Caller-supplied contact fields. */
export interface ContactInput {
  label: string;
  address: string;
  network: string;
  tags?: readonly string[];
  note?: string;
}

/** Injected clock/rng for deterministic tests. */
export interface ContactEnv {
  readonly now: () => number;
  readonly rng: (n: number) => Uint8Array;
}

/** Empty book. */
export const EMPTY_BOOK: AddressBook = { contacts: [] };

// Control (Cc), format incl. zero-width and bidi (Cf), line/para separators, private use, surrogates, unassigned.
const FORBIDDEN_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}\p{Cn}]/u;
const ID_RE = /^[0-9a-f]{32}$/;
const NETWORK_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ADDRESS_RE = /^[\x21-\x7e]{1,128}$/;

/** True if `id` looks like a contact/profile id (32 lowercase hex). */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/**
 * Normalise a label: NFKC, collapse whitespace, trim.
 * @security Rejects control, zero-width, bidi-override and unassigned code points outright
 * (they enable spoofed look-alike labels such as RLO tricks).
 */
export function normalizeLabel(raw: unknown): string {
  if (typeof raw !== 'string') return fail('INVALID_INPUT', 'label must be a string');
  const s = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (s.length === 0 || [...s].length > MAX_LABEL_LENGTH)
    return fail('INVALID_INPUT', 'label length invalid');
  if (FORBIDDEN_TEXT.test(s)) return fail('INVALID_INPUT', 'label contains forbidden characters');
  return s;
}

/** Normalise a free-text note (newlines allowed, other control/format chars rejected). */
export function normalizeNote(raw: unknown): string {
  if (typeof raw !== 'string') return fail('INVALID_INPUT', 'note must be a string');
  const s = raw.normalize('NFKC').replace(/\r\n?/g, '\n').trim();
  if ([...s].length > MAX_NOTE_LENGTH) return fail('INVALID_INPUT', 'note too long');
  if (FORBIDDEN_TEXT.test(s.replace(/\n/g, '')))
    return fail('INVALID_INPUT', 'note contains forbidden characters');
  return s;
}

/** Normalise a tag: lowercase slug. */
export function normalizeTag(raw: unknown): string {
  if (typeof raw !== 'string') return fail('INVALID_INPUT', 'tag must be a string');
  const s = raw.normalize('NFKC').trim().toLowerCase();
  if (!TAG_RE.test(s)) return fail('INVALID_INPUT', 'tag must match [a-z0-9][a-z0-9_-]{0,31}');
  return s;
}

/** Normalise a tag list: validate, dedupe (order preserved), cap. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return fail('INVALID_INPUT', 'tags must be an array');
  const out: string[] = [];
  for (const t of raw as unknown[]) {
    const n = normalizeTag(t);
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > MAX_TAGS) return fail('INVALID_INPUT', 'too many tags');
  return out;
}

/** Normalise a network slug. */
export function normalizeNetwork(raw: unknown): string {
  if (typeof raw !== 'string') return fail('INVALID_INPUT', 'network must be a string');
  const s = raw.trim().toLowerCase();
  if (!NETWORK_RE.test(s)) return fail('INVALID_INPUT', 'invalid network');
  return s;
}

/**
 * Validate an address string. Only printable ASCII without whitespace is accepted, which rules out
 * homoglyph and invisible-character substitution inside addresses. Chain-specific checksum
 * validation is intentionally left to the chain adapters.
 */
export function normalizeAddress(raw: unknown): string {
  if (typeof raw !== 'string') return fail('INVALID_INPUT', 'address must be a string');
  const s = raw.trim();
  if (!ADDRESS_RE.test(s))
    return fail('INVALID_INPUT', 'address must be 1-128 printable ASCII characters without spaces');
  return s;
}

/** Case-insensitive address families (EVM hex, bech32/bech32m-style prefixes). */
function isCaseInsensitiveAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a) || /^(bc1|tb1|sp1|tsp1)[0-9a-z]+$/i.test(a);
}

/**
 * Canonical comparison key `network:address`. EVM and bech32 addresses are lowercased (casing is a
 * checksum only); everything else, notably base58, is compared case-sensitively.
 */
export function addressKey(network: string, address: string): string {
  return `${network}:${isCaseInsensitiveAddress(address) ? address.toLowerCase() : address}`;
}

/** Validate and normalise all user-supplied contact fields. */
export function normalizeContactInput(input: ContactInput): Required<ContactInput> {
  return {
    label: normalizeLabel(input.label),
    address: normalizeAddress(input.address),
    network: normalizeNetwork(input.network),
    tags: normalizeTags(input.tags ?? []),
    note: normalizeNote(input.note ?? ''),
  };
}

/** Validate the injected clock output. */
export function checkTime(t: number): number {
  if (!Number.isSafeInteger(t) || t < 0) return fail('INVALID_INPUT', 'clock returned invalid time');
  return t;
}

/** New random 128-bit id from injected rng. */
export function newId(env: ContactEnv): string {
  const b = env.rng(16);
  if (b.length !== 16) return fail('INVALID_INPUT', 'rng returned wrong length');
  return toHex(b);
}

/**
 * Add a contact (pure).
 * @security Rejects an exact duplicate (same network + canonical address) with `DUPLICATE`; use
 * `analyzeCandidate` first to surface look-alike warnings to the user.
 */
export function addContact(
  book: AddressBook,
  input: ContactInput,
  env: ContactEnv,
): { book: AddressBook; contact: Contact } {
  if (book.contacts.length >= MAX_CONTACTS) return fail('LIMIT', 'address book is full');
  const n = normalizeContactInput(input);
  const key = addressKey(n.network, n.address);
  if (book.contacts.some((c) => addressKey(c.network, c.address) === key)) {
    return fail('DUPLICATE', 'address already saved');
  }
  const t = checkTime(env.now());
  let id = newId(env);
  for (let i = 0; i < 4 && book.contacts.some((c) => c.id === id); i++) id = newId(env);
  if (book.contacts.some((c) => c.id === id)) return fail('INVALID_INPUT', 'rng produced a duplicate id');
  const contact: Contact = { id, ...n, createdAt: t, updatedAt: t };
  return { book: { contacts: [...book.contacts, contact] }, contact };
}

/** Patchable fields. */
export type ContactPatch = Partial<ContactInput>;

/** Update a contact (pure). Changing the address re-runs the duplicate check. */
export function updateContact(
  book: AddressBook,
  id: string,
  patch: ContactPatch,
  env: ContactEnv,
): { book: AddressBook; contact: Contact } {
  const cur = book.contacts.find((c) => c.id === id);
  if (!cur) return fail('NOT_FOUND', 'contact not found');
  const n = normalizeContactInput({
    label: patch.label ?? cur.label,
    address: patch.address ?? cur.address,
    network: patch.network ?? cur.network,
    tags: patch.tags ?? cur.tags,
    note: patch.note ?? cur.note,
  });
  const key = addressKey(n.network, n.address);
  if (book.contacts.some((c) => c.id !== id && addressKey(c.network, c.address) === key)) {
    return fail('DUPLICATE', 'address already saved');
  }
  const contact: Contact = { ...cur, ...n, updatedAt: Math.max(checkTime(env.now()), cur.updatedAt) };
  return { book: { contacts: book.contacts.map((c) => (c.id === id ? contact : c)) }, contact };
}

/** Remove a contact (pure). */
export function removeContact(book: AddressBook, id: string): AddressBook {
  if (!book.contacts.some((c) => c.id === id)) return fail('NOT_FOUND', 'contact not found');
  return { contacts: book.contacts.filter((c) => c.id !== id) };
}
