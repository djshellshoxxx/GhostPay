/**
 * Local-store abstraction: namespaced keys, versioned records with pure migrations, quota and
 * availability error mapping, an injected storage backend, and an optional injected sealer
 * (AES-256-GCM helpers included) for encryption at rest.
 *
 * @security
 * - Key names are validated and can never carry secrets: no secret-looking words, no 0x prefix, no
 *   run of 32+ hex characters. Record property names that look like secrets are refused on write
 *   (spending/signing keys are never stored here).
 * - Error messages are fixed strings; backend error text is never forwarded.
 * - Unknown/future schema versions are never overwritten or deleted (no silent downgrade).
 * - Sealed records bind {namespace, collection, id, version} as AAD, so moving ciphertext between
 *   records or tampering with the version fails to open.
 * - Collection names and record counts remain visible to a local attacker (documented limitation).
 */

export type StoreErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_ID'
  | 'SECRET_REJECTED'
  | 'INVALID_VALUE'
  | 'TOO_LARGE'
  | 'QUOTA_EXCEEDED'
  | 'UNAVAILABLE'
  | 'IO_ERROR'
  | 'CORRUPT'
  | 'DECRYPT'
  | 'FUTURE_VERSION'
  | 'MIGRATION_FAILED'
  | 'SEALER_REQUIRED';

const STORE_MESSAGES: Readonly<Record<StoreErrorCode, string>> = {
  INVALID_NAME: 'invalid namespace or collection name',
  INVALID_ID: 'invalid record id',
  SECRET_REJECTED: 'secret-looking name rejected',
  INVALID_VALUE: 'value cannot be stored',
  TOO_LARGE: 'record too large',
  QUOTA_EXCEEDED: 'storage quota exceeded',
  UNAVAILABLE: 'storage unavailable',
  IO_ERROR: 'storage error',
  CORRUPT: 'stored record is damaged',
  DECRYPT: 'stored record could not be decrypted',
  FUTURE_VERSION: 'stored record is from a newer version',
  MIGRATION_FAILED: 'stored record could not be migrated',
  SEALER_REQUIRED: 'record is sealed but no key is available',
};

export class StoreError extends Error {
  public readonly code: StoreErrorCode;
  public constructor(code: StoreErrorCode) {
    super(STORE_MESSAGES[code]);
    this.name = 'StoreError';
    this.code = code;
  }
}

/** Maps a store error to the ux-errors app code. */
export function storeErrorToAppCode(
  code: StoreErrorCode,
): 'STORAGE_QUOTA' | 'STORAGE_BLOCKED' | 'STORAGE_CORRUPT' | undefined {
  switch (code) {
    case 'QUOTA_EXCEEDED':
      return 'STORAGE_QUOTA';
    case 'UNAVAILABLE':
      return 'STORAGE_BLOCKED';
    case 'CORRUPT':
    case 'DECRYPT':
    case 'FUTURE_VERSION':
    case 'MIGRATION_FAILED':
      return 'STORAGE_CORRUPT';
    default:
      return undefined;
  }
}

/** Classifies an arbitrary thrown backend error. @security Never reads `message`. */
export function toStoreError(e: unknown): StoreError {
  if (e instanceof StoreError) return e;
  let name = '';
  let code: unknown;
  if (typeof e === 'object' && e !== null) {
    try {
      const n = (e as { name?: unknown }).name;
      name = typeof n === 'string' ? n : '';
      code = (e as { code?: unknown }).code;
    } catch {
      /* hostile getter: fall through to IO_ERROR */
    }
  }
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014)
    return new StoreError('QUOTA_EXCEEDED');
  if (name === 'SecurityError' || name === 'InvalidAccessError' || name === 'NotAllowedError')
    return new StoreError('UNAVAILABLE');
  return new StoreError('IO_ERROR');
}

/** Minimal async key/value backend. Implementations: MemoryBackend, `fromWebStorage`. */
export interface KvBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Structural subset of DOM `Storage`. */
export interface WebStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Wraps a `Storage`-like object. Accessor errors (blocked storage) surface as StoreError. */
export function fromWebStorage(storage: WebStorageLike): KvBackend {
  const wrap = <T>(fn: () => T): Promise<T> => {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.reject(toStoreError(e));
    }
  };
  return {
    get: (k) => wrap(() => storage.getItem(k)),
    set: (k, v) => wrap(() => storage.setItem(k, v)),
    remove: (k) => wrap(() => storage.removeItem(k)),
    keys: () =>
      wrap(() => {
        const out: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k !== null) out.push(k);
        }
        return out;
      }),
  };
}

/** In-memory backend with an optional byte quota (UTF-16 code units of key+value) for tests. */
export class MemoryBackend implements KvBackend {
  private readonly map = new Map<string, string>();
  public constructor(private readonly quota: number = Infinity) {}
  /** Test hook: raw snapshot. */
  public dump(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
  private used(): number {
    let n = 0;
    for (const [k, v] of this.map) n += k.length + v.length;
    return n;
  }
  public get(key: string): Promise<string | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }
  public set(key: string, value: string): Promise<void> {
    const prev = this.map.get(key);
    const after =
      this.used() - (prev === undefined ? 0 : key.length + prev.length) + key.length + value.length;
    if (after > this.quota) {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      return Promise.reject(err);
    }
    this.map.set(key, value);
    return Promise.resolve();
  }
  public remove(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
  public keys(): Promise<string[]> {
    return Promise.resolve([...this.map.keys()]);
  }
}

// ---------------------------------------------------------------------------------------------
// Validation

const NAME_RE = /^[a-z][a-z0-9-]{0,23}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SECRET_WORDS =
  /(secret|mnemonic|seed|passphrase|password|passwd|private|privkey|spend|signing|wif|viewing|token)/i;
const SECRET_PROP =
  /(priv(ate)?_?key|secret|mnemonic|seed|passphrase|password|passwd|spend(ing)?_?key|signing_?key|view(ing)?_?key|^wif$)/i;
const FORBIDDEN_PROP = /^(__proto__|constructor|prototype)$/;
const MAX_DEPTH = 12;
const MAX_NODES = 20_000;
export const DEFAULT_MAX_RECORD_CHARS = 262_144;

function checkName(n: string): void {
  if (typeof n !== 'string' || !NAME_RE.test(n)) throw new StoreError('INVALID_NAME');
  if (SECRET_WORDS.test(n)) throw new StoreError('SECRET_REJECTED');
}

function checkId(id: string): void {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new StoreError('INVALID_ID');
  if (/^0x/i.test(id) || /[0-9a-fA-F]{32,}/.test(id)) throw new StoreError('SECRET_REJECTED');
}

/** Walks a value: rejects secret-looking/forbidden property names, cycles, non-JSON types, huge graphs. */
function checkValue(v: unknown): void {
  let nodes = 0;
  const seen = new Set<object>();
  const walk = (x: unknown, depth: number): void => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new StoreError('INVALID_VALUE');
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return;
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw new StoreError('INVALID_VALUE');
      return;
    }
    if (typeof x !== 'object') throw new StoreError('INVALID_VALUE');
    if (seen.has(x)) throw new StoreError('INVALID_VALUE');
    seen.add(x);
    if (Array.isArray(x)) {
      for (const i of x) walk(i, depth + 1);
    } else {
      const proto: unknown = Object.getPrototypeOf(x);
      if (proto !== Object.prototype && proto !== null) throw new StoreError('INVALID_VALUE');
      for (const k of Object.keys(x)) {
        if (FORBIDDEN_PROP.test(k)) throw new StoreError('INVALID_VALUE');
        if (SECRET_PROP.test(k)) throw new StoreError('SECRET_REJECTED');
        walk((x as Record<string, unknown>)[k], depth + 1);
      }
    }
    seen.delete(x);
  };
  walk(v, 0);
}

/** Schema helper: true when `o` is a plain object whose own keys are all within `allowed` (LOCAL-4). */
export function hasOnlyKeys(o: unknown, allowed: readonly string[]): o is Record<string, unknown> {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  return Object.keys(o).every((k) => allowed.includes(k));
}

// ---------------------------------------------------------------------------------------------
// Sealing (AES-256-GCM), optional

export interface Sealer {
  seal(plain: string, aad: string): Promise<string>;
  open(sealed: string, aad: string): Promise<string>;
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('b64');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * HKDF-SHA-256 from a viewing key to a non-extractable AES-256-GCM key, with a distinct `info` per
 * collection (LOCAL-3). @param profileSalt random per-profile salt, at least 16 bytes.
 * @security The viewing key bytes are the caller's; this function neither stores nor logs them.
 */
export async function deriveSealKey(
  viewingKey: Uint8Array,
  profileSalt: Uint8Array,
  collection: string,
): Promise<CryptoKey> {
  checkName(collection);
  if (viewingKey.length < 16 || profileSalt.length < 16) throw new StoreError('INVALID_VALUE');
  const base = await globalThis.crypto.subtle.importKey('raw', viewingKey as BufferSource, 'HKDF', false, [
    'deriveKey',
  ]);
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: profileSalt as BufferSource,
      info: enc.encode(`GhostPay/local-store/v1/${collection}`),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Blind lookup token: HMAC-SHA-256(key, collection|id) truncated to 16 bytes, base64url (22 chars).
 * Use as a record id so raw addresses/labels never appear in key names.
 */
export async function lookupToken(hmacKey: CryptoKey, collection: string, id: string): Promise<string> {
  const mac = await globalThis.crypto.subtle.sign('HMAC', hmacKey, enc.encode(`${collection}|${id}`));
  return b64u(new Uint8Array(mac).slice(0, 16));
}

/**
 * AES-256-GCM sealer. A fresh 96-bit IV per seal comes from the injected `randomBytes` (LOCAL-1).
 * Output is base64url(iv || ciphertext+tag).
 * @security `randomBytes` must be a CSPRNG (e.g. `crypto.getRandomValues`). Tests may inject fixed bytes.
 */
export function createAesGcmSealer(key: CryptoKey, randomBytes: (n: number) => Uint8Array): Sealer {
  return {
    async seal(plain, aad) {
      const iv = randomBytes(12);
      if (iv.length !== 12) throw new StoreError('IO_ERROR');
      const ct = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) },
        key,
        enc.encode(plain),
      );
      const out = new Uint8Array(12 + ct.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(ct), 12);
      return b64u(out);
    },
    async open(sealed, aad) {
      try {
        const raw = unb64u(sealed);
        if (raw.length < 12 + 16) throw new Error('short');
        const pt = await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: raw.slice(0, 12) as BufferSource, additionalData: enc.encode(aad) },
          key,
          raw.slice(12),
        );
        return dec.decode(pt);
      } catch {
        throw new StoreError('DECRYPT');
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Collections

export interface CollectionDef<T> {
  readonly name: string;
  /** Current schema version, integer >= 1. */
  readonly version: number;
  /** Strict parser for the CURRENT version; must throw on anything unexpected. */
  readonly parse: (raw: unknown) => T;
  /** `migrations[n]` turns a version-n payload into version n+1. Must be pure. */
  readonly migrations?: Readonly<Record<number, (raw: unknown) => unknown>>;
}

export interface CollectionOptions {
  readonly sealer?: Sealer;
  /** Max serialized payload characters (default 262 144). */
  readonly maxChars?: number;
}

export interface ListResult<T> {
  readonly items: readonly { readonly id: string; readonly value: T }[];
  /** Records that could not be read; they are left untouched. */
  readonly failed: readonly { readonly id: string; readonly code: StoreErrorCode }[];
}

export interface Collection<T> {
  put(id: string, value: T): Promise<void>;
  /** Atomic-ish: on failure already-written records are restored. */
  putMany(entries: readonly (readonly [string, T])[]): Promise<void>;
  get(id: string): Promise<T | undefined>;
  delete(id: string): Promise<void>;
  ids(): Promise<string[]>;
  list(): Promise<ListResult<T>>;
  count(): Promise<number>;
}

export interface Store {
  readonly namespace: string;
  collection<T>(def: CollectionDef<T>, opts?: CollectionOptions): Collection<T>;
  /** Removes every key under this namespace. Other namespaces and foreign keys are untouched. */
  wipe(): Promise<number>;
  usage(): Promise<{ readonly keys: number; readonly chars: number }>;
}

interface Envelope {
  readonly v: number;
  readonly d?: unknown;
  readonly s?: string;
}

function parseEnvelope(raw: string, maxChars: number): Envelope {
  if (raw.length > maxChars * 2 + 1024) throw new StoreError('CORRUPT');
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new StoreError('CORRUPT');
  }
  if (!hasOnlyKeys(o, ['v', 'd', 's'])) throw new StoreError('CORRUPT');
  const { v, d, s } = o;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw new StoreError('CORRUPT');
  if (s !== undefined && (typeof s !== 'string' || d !== undefined)) throw new StoreError('CORRUPT');
  if (s === undefined && !('d' in o)) throw new StoreError('CORRUPT');
  return s === undefined ? { v, d } : { v, s };
}

/**
 * Creates a store over an injected backend. All mutating calls are serialised per store, so
 * concurrent puts keep counts consistent.
 */
export function createStore(args: { readonly backend: KvBackend; readonly namespace: string }): Store {
  checkName(args.namespace);
  const { backend, namespace } = args;
  const prefix = `gp1:${namespace}:`;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <R>(fn: () => Promise<R>): Promise<R> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
  const guard = async <R>(fn: () => Promise<R>): Promise<R> => {
    try {
      return await fn();
    } catch (e) {
      throw toStoreError(e);
    }
  };

  return {
    namespace,
    collection<T>(def: CollectionDef<T>, opts: CollectionOptions = {}): Collection<T> {
      checkName(def.name);
      if (!Number.isSafeInteger(def.version) || def.version < 1) throw new StoreError('INVALID_VALUE');
      const maxChars = opts.maxChars ?? DEFAULT_MAX_RECORD_CHARS;
      const cprefix = `${prefix}${def.name}:`;
      const keyOf = (id: string): string => {
        checkId(id);
        return cprefix + id;
      };
      const aad = (id: string, v: number): string => `gp1|${namespace}|${def.name}|${id}|${v}`;

      const decode = async (id: string, raw: string): Promise<{ value: T; migrated: boolean }> => {
        const env = parseEnvelope(raw, maxChars);
        if (env.v > def.version) throw new StoreError('FUTURE_VERSION');
        let payload: unknown;
        if (env.s !== undefined) {
          if (opts.sealer === undefined) throw new StoreError('SEALER_REQUIRED');
          const text = await opts.sealer.open(env.s, aad(id, env.v));
          try {
            payload = JSON.parse(text);
          } catch {
            throw new StoreError('CORRUPT');
          }
        } else {
          payload = env.d;
        }
        try {
          checkValue(payload);
        } catch {
          throw new StoreError('CORRUPT');
        }
        for (let v = env.v; v < def.version; v++) {
          const m = def.migrations?.[v];
          if (m === undefined) throw new StoreError('MIGRATION_FAILED');
          try {
            payload = m(payload);
          } catch {
            throw new StoreError('MIGRATION_FAILED');
          }
        }
        try {
          return { value: def.parse(payload), migrated: env.v < def.version };
        } catch {
          throw new StoreError(env.v < def.version ? 'MIGRATION_FAILED' : 'CORRUPT');
        }
      };

      const encode = async (id: string, value: T): Promise<string> => {
        checkValue(value);
        const json = JSON.stringify(value);
        if (json.length > maxChars) throw new StoreError('TOO_LARGE');
        if (opts.sealer === undefined) return JSON.stringify({ v: def.version, d: value });
        return JSON.stringify({ v: def.version, s: await opts.sealer.seal(json, aad(id, def.version)) });
      };

      const readRaw = async (id: string): Promise<string | null> => guard(() => backend.get(keyOf(id)));

      const refuseFuture = (raw: string | null): void => {
        if (raw === null) return;
        try {
          if (parseEnvelope(raw, maxChars).v > def.version) throw new StoreError('FUTURE_VERSION');
        } catch (e) {
          if (e instanceof StoreError && e.code === 'FUTURE_VERSION') throw e;
          /* damaged old record may be replaced */
        }
      };

      const putUnlocked = async (id: string, value: T): Promise<string | null> => {
        const key = keyOf(id);
        const text = await encode(id, value);
        const prev = await readRaw(id);
        refuseFuture(prev);
        await guard(() => backend.set(key, text));
        return prev;
      };

      const getUnlocked = async (id: string): Promise<T | undefined> => {
        const raw = await readRaw(id);
        if (raw === null) return undefined;
        const { value, migrated } = await decode(id, raw);
        if (migrated) {
          try {
            await guard(async () => backend.set(keyOf(id), await encode(id, value)));
          } catch {
            /* write-back is best effort; the next read migrates again */
          }
        }
        return value;
      };

      const idsUnlocked = async (): Promise<string[]> => {
        const all = await guard(() => backend.keys());
        return all
          .filter((k) => k.startsWith(cprefix))
          .map((k) => k.slice(cprefix.length))
          .sort();
      };

      return {
        put: (id, value) => serial(async () => void (await putUnlocked(id, value))),
        putMany: (entries) =>
          serial(async () => {
            const done: [string, string | null][] = [];
            try {
              for (const [id, v] of entries) done.push([id, await putUnlocked(id, v)]);
            } catch (e) {
              for (const [id, prev] of done.reverse()) {
                try {
                  await (prev === null ? backend.remove(keyOf(id)) : backend.set(keyOf(id), prev));
                } catch {
                  /* best effort rollback */
                }
              }
              throw toStoreError(e);
            }
          }),
        get: (id) => serial(() => getUnlocked(id)),
        delete: (id) => serial(() => guard(() => backend.remove(keyOf(id)))),
        ids: () => serial(idsUnlocked),
        count: () => serial(async () => (await idsUnlocked()).length),
        list: () =>
          serial(async () => {
            const items: { id: string; value: T }[] = [];
            const failed: { id: string; code: StoreErrorCode }[] = [];
            for (const id of await idsUnlocked()) {
              try {
                const value = await getUnlocked(id);
                if (value !== undefined) items.push({ id, value });
              } catch (e) {
                failed.push({ id, code: toStoreError(e).code });
              }
            }
            return { items, failed };
          }),
      };
    },
    wipe: () =>
      serial(async () => {
        const ks = (await guard(() => backend.keys())).filter((k) => k.startsWith(prefix));
        for (const k of ks) await guard(() => backend.remove(k));
        return ks.length;
      }),
    usage: () =>
      serial(async () => {
        let keys = 0;
        let chars = 0;
        for (const k of await guard(() => backend.keys())) {
          if (!k.startsWith(prefix)) continue;
          keys++;
          chars += k.length + ((await guard(() => backend.get(k))) ?? '').length;
        }
        return { keys, chars };
      }),
  };
}
