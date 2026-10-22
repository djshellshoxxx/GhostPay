import { createBackup, decodeBackup } from './backup.js';
import { toHex, utf8Decode, utf8Encode } from './bytes.js';
import { type AddressBook, type ContactEnv, EMPTY_BOOK, isValidId } from './contacts.js';
import {
  type CryptoDeps,
  type KdfPolicy,
  type KeyContext,
  type Rng,
  checkPolicy,
  defaultCryptoDeps,
  deriveKey,
  newKeyContext,
  normalizeNewPassword,
  normalizePasswordForUnlock,
  open,
  randomBytes,
  seal,
} from './envelope.js';
import { AUTH_FAILURE_MESSAGE, fail } from './errors.js';
import { type ImportOptions, type MergeReport, mergeBooks } from './merge.js';
import { parsePayload, serializePayload } from './schema.js';

/**
 * Injected byte storage. Only ciphertext and the public profile index ever reach it. An empty
 * array means "absent" (used for deletion), so no `delete` method is required.
 */
export interface VaultStorage {
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, value: Uint8Array): Promise<void>;
}

/** Vault construction options. */
export interface VaultOptions {
  readonly storage: VaultStorage;
  /** Epoch-ms clock. */
  readonly now: () => number;
  /** Random source; defaults to `crypto.getRandomValues`. */
  readonly rng?: Rng;
  /** KDF policy; defaults to 600k PBKDF2 iterations. Lowering is for tests only. */
  readonly kdf?: KdfPolicy;
  /** Override WebCrypto (tests). */
  readonly subtle?: SubtleCrypto;
}

/** Public (unencrypted) profile listing entry. */
export interface ProfileInfo {
  readonly id: string;
  /** Plaintext display hint chosen by the user. @security Visible to anyone with storage access; do not put secrets in it. */
  readonly publicLabel: string;
}

export const MAX_PROFILES = 16;
export const INDEX_KEY = 'ghostpay/vault/index';
export const profileKey = (id: string): string => `ghostpay/vault/profile/${id}`;

function normalizeHint(raw: string | undefined): string {
  const s = (raw ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if ([...s].length > 40 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}\p{Cn}]/u.test(s))
    return fail('INVALID_INPUT', 'invalid profile label');
  return s;
}

/** An unlocked profile. All operations throw LOCKED after {@link ProfileSession.lock}. */
export interface ProfileSession {
  readonly profileId: string;
  readonly isLocked: boolean;
  /** Current address book snapshot (immutable by convention). */
  getBook(): AddressBook;
  /** Atomically transform and persist the book; in-memory state changes only if the write succeeds. */
  mutate<T>(fn: (book: AddressBook, env: ContactEnv) => { book: AddressBook; result: T }): Promise<T>;
  /** Re-encrypt this profile under a new password (fresh salt). Requires the current password. */
  changePassword(current: string, next: string): Promise<void>;
  /** Encrypted, versioned backup of this profile's book. */
  exportBackup(backupPassword: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Decrypt, validate, merge/replace and persist. */
  importBackup(
    blob: Uint8Array,
    backupPassword: string,
    opts: ImportOptions,
  ): Promise<MergeReport & { migratedFrom: number | undefined }>;
  /** Drop key material and plaintext references. */
  lock(): void;
}

/** Vault facade. */
export interface Vault {
  listProfiles(): Promise<ProfileInfo[]>;
  createProfile(args: { password: string; publicLabel?: string }): Promise<ProfileSession>;
  unlock(profileId: string, password: string): Promise<ProfileSession>;
  deleteProfile(profileId: string): Promise<void>;
}

/**
 * Create the vault.
 * @security Profiles are isolated: separate random id, salt, key and storage key; a password for one
 * profile never decrypts another, and ciphertext copied between profiles fails AAD authentication.
 * Plaintext contacts exist only in memory of an unlocked session.
 */
export function createVault(opts: VaultOptions): Vault {
  const base = defaultCryptoDeps(opts.kdf);
  const deps: CryptoDeps = {
    rng: opts.rng ?? base.rng,
    subtle: opts.subtle ?? base.subtle,
    kdf: opts.kdf ?? base.kdf,
  };
  checkPolicy(deps.kdf);
  const { storage } = opts;
  const env: ContactEnv = { now: opts.now, rng: deps.rng };

  // Serialise all vault writes so concurrent calls cannot interleave read-modify-write of the index.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  }

  async function storageGet(key: string): Promise<Uint8Array | undefined> {
    try {
      const v = await storage.get(key);
      return v === undefined || v.length === 0 ? undefined : v;
    } catch {
      return fail('STORAGE', 'storage read failed');
    }
  }
  async function storagePut(key: string, v: Uint8Array): Promise<void> {
    try {
      await storage.put(key, v);
    } catch {
      return fail('STORAGE', 'storage write failed');
    }
  }

  async function readIndex(): Promise<ProfileInfo[]> {
    const raw = await storageGet(INDEX_KEY);
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(utf8Decode(raw));
    } catch {
      return fail('CORRUPT', 'profile index unreadable');
    }
    const arr = (parsed as { profiles?: unknown } | null)?.profiles;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { v?: unknown }).v !== 1 ||
      !Array.isArray(arr) ||
      arr.length > MAX_PROFILES
    ) {
      return fail('CORRUPT', 'profile index malformed');
    }
    const out: ProfileInfo[] = [];
    for (const e of arr as unknown[]) {
      const o = e as { id?: unknown; publicLabel?: unknown } | null;
      if (typeof o !== 'object' || o === null || !isValidId(o.id) || typeof o.publicLabel !== 'string')
        return fail('CORRUPT', 'profile index malformed');
      const id: string = o.id;
      if (out.some((p) => p.id === id)) return fail('CORRUPT', 'profile index malformed');
      out.push({ id, publicLabel: normalizeHintStrict(o.publicLabel) });
    }
    return out;
  }
  function normalizeHintStrict(s: string): string {
    try {
      return normalizeHint(s);
    } catch {
      return fail('CORRUPT', 'profile index malformed');
    }
  }
  async function writeIndex(list: readonly ProfileInfo[]): Promise<void> {
    await storagePut(
      INDEX_KEY,
      utf8Encode(
        JSON.stringify({ v: 1, profiles: list.map((p) => ({ id: p.id, publicLabel: p.publicLabel })) }),
      ),
    );
  }

  async function persist(ctx: KeyContext, book: AddressBook): Promise<void> {
    const pt = utf8Encode(serializePayload(book));
    try {
      await storagePut(profileKey(ctx.profileId), await seal(deps, ctx, pt));
    } finally {
      pt.fill(0);
    }
  }

  function makeSession(profileId: string, initialCtx: KeyContext, initialBook: AddressBook): ProfileSession {
    let ctx: KeyContext | undefined = initialCtx;
    let book: AddressBook | undefined = initialBook;
    const live = (): { c: KeyContext; b: AddressBook } => {
      if (!ctx || !book) return fail('LOCKED', 'profile is locked');
      return { c: ctx, b: book };
    };
    return {
      profileId,
      get isLocked(): boolean {
        return ctx === undefined;
      },
      getBook: () => live().b,
      mutate: <T>(fn: (b: AddressBook, e: ContactEnv) => { book: AddressBook; result: T }) =>
        serial(async () => {
          const { c, b } = live();
          const out = fn(b, env);
          await persist(c, out.book);
          if (ctx === c) book = out.book; // not locked / re-keyed meanwhile
          return out.result;
        }),
      changePassword: (current, next) =>
        serial(async () => {
          const { b } = live();
          const stored = await storageGet(profileKey(profileId));
          if (!stored) return fail('DECRYPT_FAILED', AUTH_FAILURE_MESSAGE);
          await open(deps, stored, normalizePasswordForUnlock(current), 'profile'); // proves knowledge of current password
          const fresh = await newKeyContext(deps, normalizeNewPassword(next), profileId, 'profile');
          await persist(fresh, b);
          ctx = fresh;
        }),
      exportBackup: async (pw) => {
        const { b } = live();
        return createBackup(deps, b, profileId, pw, env.now());
      },
      importBackup: (blob, pw, o) =>
        serial(async () => {
          const { c, b } = live();
          const dec = await decodeBackup(deps, blob, pw);
          const { book: merged, report } = mergeBooks(b, dec.book, o);
          await persist(c, merged);
          if (ctx === c) book = merged;
          return { ...report, migratedFrom: dec.migratedFrom };
        }),
      lock: () => {
        ctx = undefined;
        book = undefined;
      },
    };
  }

  return {
    listProfiles: () => readIndex(),

    createProfile: ({ password, publicLabel }) =>
      serial(async () => {
        const pw = normalizeNewPassword(password);
        const hint = normalizeHint(publicLabel);
        const list = await readIndex();
        if (list.length >= MAX_PROFILES) return fail('LIMIT', 'too many profiles');
        let id = toHex(randomBytes(deps, 16));
        for (let i = 0; i < 4 && list.some((p) => p.id === id); i++) id = toHex(randomBytes(deps, 16));
        if (list.some((p) => p.id === id)) return fail('INVALID_INPUT', 'rng produced a duplicate id');
        const ctx = await newKeyContext(deps, pw, id, 'profile');
        await persist(ctx, EMPTY_BOOK);
        await writeIndex([...list, { id, publicLabel: hint }]);
        return makeSession(id, ctx, EMPTY_BOOK);
      }),

    unlock: (profileId, password) =>
      serial(async () => {
        const pw = normalizePasswordForUnlock(password);
        if (!isValidId(profileId)) return fail('UNLOCK_FAILED', AUTH_FAILURE_MESSAGE);
        const blob = await storageGet(profileKey(profileId));
        if (!blob) {
          // Equalise timing with the real path, then fail with the same error as a wrong password.
          await deriveKey(deps, pw, randomBytes(deps, 16), deps.kdf.iterations);
          return fail('UNLOCK_FAILED', AUTH_FAILURE_MESSAGE);
        }
        let opened;
        try {
          opened = await open(deps, blob, pw, 'profile');
        } catch (e) {
          if ((e as { code?: string }).code === 'DECRYPT_FAILED')
            return fail('UNLOCK_FAILED', AUTH_FAILURE_MESSAGE);
          throw e;
        }
        // Header profile id is authenticated; it must match the slot it was loaded from.
        if (opened.ctx.profileId !== profileId) return fail('UNLOCK_FAILED', AUTH_FAILURE_MESSAGE);
        try {
          const { payload } = parsePayload(utf8Decode(opened.plaintext));
          return makeSession(profileId, opened.ctx, payload.book);
        } finally {
          opened.plaintext.fill(0);
        }
      }),

    deleteProfile: (profileId) =>
      serial(async () => {
        if (!isValidId(profileId)) return fail('NOT_FOUND', 'profile not found');
        const list = await readIndex();
        if (!list.some((p) => p.id === profileId)) return fail('NOT_FOUND', 'profile not found');
        await writeIndex(list.filter((p) => p.id !== profileId));
        await storagePut(profileKey(profileId), new Uint8Array(0));
      }),
  };
}
