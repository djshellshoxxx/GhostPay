import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { SecretBox, wipe } from '@ghostpay/secret-box';
import { keccak256, toHex, type Address } from 'viem';
import { ExternalPoolError, fail } from './errors.js';
import type { ExitRouteId, NoteState, PoolNote } from './types.js';

/** String key-value backend (IndexedDB, files, memory). Values handed to it are always ciphertext. */
export interface VaultStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** In-memory {@link VaultStorage}. */
export class MemoryVaultStorage implements VaultStorage {
  private readonly m = new Map<string, string>();
  public get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.m.get(key));
  }
  public set(key: string, value: string): Promise<void> {
    this.m.set(key, value);
    return Promise.resolve();
  }
  public delete(key: string): Promise<void> {
    this.m.delete(key);
    return Promise.resolve();
  }
  public keys(): Promise<string[]> {
    return Promise.resolve([...this.m.keys()]);
  }
}

/** scrypt parameters (same family as the web keystore: N=2^17, r=8, p=1). */
export interface VaultKdf {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

/** Production cost. Tests may lower N to 2^14 (the minimum). */
export const DEFAULT_VAULT_KDF: VaultKdf = Object.freeze({ N: 1 << 17, r: 8, p: 1 });
const MIN_N = 1 << 14;
const MAX_N = 1 << 20;
const MIN_PASSPHRASE = 10;
const HEADER = 'hdr';
const CHECK_PLAIN = 'ghostpay.ext-pools.vault.v1';
const TERMINAL: readonly NoteState[] = ['exited', 'ragequit'];

const NOTE_STATES: readonly NoteState[] = ['pending', 'confirmed', 'exiting', 'exited', 'ragequit', 'lost-sync'];
const ROUTES: readonly ExitRouteId[] = ['privacy-pools', 'railgun', 'tornado-fixed', 'aztec', 'mock-pool'];

/**
 * @param unixSeconds Timestamp.
 * @returns The timestamp rounded down to the hour (EP-VAULT-6).
 */
export function roundToHour(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600;
}

/**
 * Deterministic note id (spec 6.2).
 *
 * @param routeId Route.
 * @param chainId Chain.
 * @param depositTx Deposit transaction hash.
 * @param logIndex Log index of the deposit event.
 * @returns `keccak256` hex of the joined fields.
 */
export function computeNoteId(routeId: ExitRouteId, chainId: number, depositTx: string, logIndex: number): string {
  return keccak256(toHex(`${routeId}|${String(chainId)}|${depositTx.toLowerCase()}|${String(logIndex)}`));
}

/* ---------- strict JSON codec (bigint and bytes) ---------- */

function enc(v: unknown): unknown {
  if (typeof v === 'bigint') return { $b: v.toString() };
  if (v instanceof Uint8Array) return { $u: bytesToHex(v) };
  if (Array.isArray(v)) return v.map(enc);
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]));
  return v;
}

function dec(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dec);
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === '$b' && typeof o['$b'] === 'string' && /^-?\d+$/.test(o['$b'])) return BigInt(o['$b']);
    if (keys.length === 1 && keys[0] === '$u' && typeof o['$u'] === 'string' && /^(?:[0-9a-f]{2})*$/.test(o['$u'])) return hexToBytes(o['$u']);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, dec(x)]));
  }
  return v;
}

function isAddr(v: unknown): v is Address {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}

function parseNote(v: unknown): PoolNote {
  const bad = (): never => fail('VAULT_CORRUPT', 'stored note has an invalid shape');
  if (typeof v !== 'object' || v === null) return bad();
  const o = v as Record<string, unknown>;
  const asset = o['asset'];
  if (
    typeof o['noteId'] !== 'string' ||
    typeof o['routeId'] !== 'string' || !ROUTES.includes(o['routeId'] as ExitRouteId) ||
    typeof o['chainId'] !== 'number' ||
    !(asset === 'native' || isAddr(asset)) ||
    typeof o['depositedAmount'] !== 'bigint' ||
    !isAddr(o['depositor']) ||
    typeof o['depositTx'] !== 'string' ||
    typeof o['depositBlock'] !== 'bigint' ||
    typeof o['state'] !== 'string' || !NOTE_STATES.includes(o['state'] as NoteState) ||
    !(o['adapterData'] instanceof Uint8Array) ||
    typeof o['createdAt'] !== 'number'
  ) {
    return bad();
  }
  return {
    noteId: o['noteId'],
    routeId: o['routeId'] as ExitRouteId,
    chainId: o['chainId'],
    asset: asset,
    depositedAmount: o['depositedAmount'],
    depositor: o['depositor'],
    depositTx: o['depositTx'] as `0x${string}`,
    depositBlock: o['depositBlock'],
    state: o['state'] as NoteState,
    adapterData: o['adapterData'],
    createdAt: o['createdAt'],
  };
}

interface Envelope {
  readonly iv: string;
  readonly ct: string;
}

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (s === undefined) return fail('VAULT_LOCKED', 'Web Crypto is not available');
  return s;
}

function aadFor(vaultId: string, key: string): Uint8Array<ArrayBuffer> {
  return utf8ToBytes(`ghostpay.ext-pools.vault.v1|${vaultId}|${key}`);
}

/** Hash of a logical key so storage key names reveal neither addresses nor note ids. */
function slot(kind: string, id: string): string {
  return `${kind}:${bytesToHex(sha256(utf8ToBytes(id.toLowerCase()))).slice(0, 40)}`;
}

/**
 * Encrypted store for pool notes, stealth-signer references, scan scope status and proof caches.
 *
 * Every record is AES-256-GCM encrypted with a key from scrypt(passphrase). The derived key is held in a
 * {@link SecretBox}; the passphrase is never stored. The record's logical key and the vault id are bound as AAD, so
 * records cannot be swapped between slots.
 *
 * @security EP-VAULT-1: notes, mnemonics and spending material are only written encrypted; error messages are fixed
 *   text. EP-VAULT-3: a signer reference cannot be purged while a note still needs it. EP-VAULT-4: an incomplete scan
 *   scope blocks deposits. EP-VAULT-6: `createdAt` is rounded to the hour. This is a guardrail against logging and
 *   disk leaks, not a boundary against code running in the same page.
 */
export class Vault {
  private constructor(
    private readonly storage: VaultStorage,
    private readonly id: string,
    private key: SecretBox | null,
  ) {}

  /**
   * Creates a new vault (fails if one exists in `storage`).
   *
   * @param storage Backend.
   * @param passphrase At least 10 characters.
   * @param kdf scrypt cost; `N` must be a power of two in 2^14..2^20.
   * @throws ExternalPoolError INVALID_INPUT, VAULT_CORRUPT when a vault already exists.
   */
  public static async create(storage: VaultStorage, passphrase: string, kdf: VaultKdf = DEFAULT_VAULT_KDF): Promise<Vault> {
    if (passphrase.length < MIN_PASSPHRASE) fail('INVALID_INPUT', `passphrase must have at least ${String(MIN_PASSPHRASE)} characters`);
    Vault.checkKdf(kdf);
    if ((await storage.get(HEADER)) !== undefined) fail('VAULT_CORRUPT', 'a vault already exists in this storage');
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const vaultId = bytesToHex(salt);
    const key = await Vault.derive(passphrase, salt, kdf);
    const v = new Vault(storage, vaultId, key);
    const check = await v.seal(HEADER, utf8ToBytes(CHECK_PLAIN));
    await storage.set(HEADER, JSON.stringify({ v: 1, kdf: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, salt: vaultId, check }));
    return v.init();
  }

  /**
   * Opens an existing vault.
   *
   * @param storage Backend.
   * @param passphrase Passphrase.
   * @throws ExternalPoolError VAULT_BAD_PASSPHRASE (wrong passphrase and tampering are indistinguishable), VAULT_CORRUPT.
   */
  public static async open(storage: VaultStorage, passphrase: string): Promise<Vault> {
    const text = await storage.get(HEADER);
    if (text === undefined) return fail('VAULT_CORRUPT', 'no vault in this storage');
    let h: Record<string, unknown>;
    try {
      h = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return fail('VAULT_CORRUPT', 'vault header is not valid JSON');
    }
    const { N, r, p, salt, check } = h as { N?: unknown; r?: unknown; p?: unknown; salt?: unknown; check?: unknown };
    if (h['v'] !== 1 || h['kdf'] !== 'scrypt' || typeof N !== 'number' || typeof r !== 'number' || typeof p !== 'number' || typeof salt !== 'string' || !/^[0-9a-f]{32}$/.test(salt)) {
      return fail('VAULT_CORRUPT', 'vault header is malformed');
    }
    Vault.checkKdf({ N, r, p });
    const key = await Vault.derive(passphrase, hexToBytes(salt), { N, r, p });
    const v = new Vault(storage, salt, key);
    try {
      const plain = await v.unseal(HEADER, check);
      if (bytesToHex(plain) !== bytesToHex(utf8ToBytes(CHECK_PLAIN))) throw new Error('x');
    } catch {
      v.lock();
      return fail('VAULT_BAD_PASSPHRASE', 'wrong passphrase or damaged vault');
    }
    return v.init();
  }

  private static checkKdf(k: VaultKdf): void {
    if (!Number.isInteger(k.N) || k.N < MIN_N || k.N > MAX_N || (k.N & (k.N - 1)) !== 0) fail('INVALID_INPUT', 'invalid scrypt N');
    if (!Number.isInteger(k.r) || k.r < 1 || k.r > 16 || !Number.isInteger(k.p) || k.p < 1 || k.p > 4) fail('INVALID_INPUT', 'invalid scrypt r/p');
  }

  private static async derive(pass: string, salt: Uint8Array, k: VaultKdf): Promise<SecretBox> {
    const raw = await scryptAsync(utf8ToBytes(pass.normalize('NFKC')), salt, { N: k.N, r: k.r, p: k.p, dkLen: 32, maxmem: 2 ** 31 });
    return SecretBox.copyOf(raw, { label: 'ext-vault-key' });
  }

  /** Wipes the key. Further operations throw VAULT_LOCKED. Idempotent. */
  public lock(): void {
    this.key?.dispose();
    this.key = null;
  }

  /** @returns Whether the vault can still be used. */
  public get unlocked(): boolean {
    return this.key !== null && !this.key.disposed;
  }

  private async withKey<T>(fn: (k: CryptoKey) => Promise<T>): Promise<T> {
    if (this.key === null || this.key.disposed) return fail('VAULT_LOCKED', 'vault is locked');
    return this.key.useAsync(async (raw) => {
      const ck = await subtle().importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      return fn(ck);
    });
  }

  private async seal(logicalKey: string, plain: Uint8Array): Promise<Envelope> {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const ct = await this.withKey(async (k) =>
      new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aadFor(this.id, logicalKey), tagLength: 128 }, k, plain as Uint8Array<ArrayBuffer>)),
    );
    return { iv: bytesToHex(iv), ct: bytesToHex(ct) };
  }

  private async unseal(logicalKey: string, env: unknown): Promise<Uint8Array> {
    if (typeof env !== 'object' || env === null) return fail('VAULT_CORRUPT', 'record envelope is malformed');
    const { iv, ct } = env as { iv?: unknown; ct?: unknown };
    if (typeof iv !== 'string' || typeof ct !== 'string' || !/^[0-9a-f]{24}$/.test(iv) || !/^(?:[0-9a-f]{2}){16,}$/.test(ct)) {
      return fail('VAULT_CORRUPT', 'record envelope is malformed');
    }
    return this.withKey(async (k) => {
      try {
        return new Uint8Array(
          await subtle().decrypt({ name: 'AES-GCM', iv: hexToBytes(iv) as Uint8Array<ArrayBuffer>, additionalData: aadFor(this.id, logicalKey), tagLength: 128 }, k, hexToBytes(ct)),
        );
      } catch {
        return fail('VAULT_CORRUPT', 'record failed authentication');
      }
    });
  }

  private async putJson(slotKey: string, logicalKey: string, value: unknown): Promise<void> {
    const plain = utf8ToBytes(JSON.stringify(enc(value)));
    try {
      await this.storage.set(slotKey, JSON.stringify(await this.seal(logicalKey, plain)));
    } finally {
      wipe(plain);
    }
  }

  private async getJson(slotKey: string, logicalKey: string): Promise<unknown> {
    const text = await this.storage.get(slotKey);
    if (text === undefined) return undefined;
    let env: unknown;
    try {
      env = JSON.parse(text);
    } catch {
      return fail('VAULT_CORRUPT', 'record is not valid JSON');
    }
    const plain = await this.unseal(logicalKey, env);
    try {
      return dec(JSON.parse(new TextDecoder().decode(plain)));
    } catch (e) {
      if (e instanceof ExternalPoolError) throw e;
      return fail('VAULT_CORRUPT', 'record plaintext is not valid JSON');
    } finally {
      wipe(plain);
    }
  }

  private async init(): Promise<this> {
    const sc = (await this.getJson('scopes', 'scopes')) as Record<string, { status: string; reason: string }> | undefined;
    for (const [k, v] of Object.entries(sc ?? {})) {
      if (v.status === 'incomplete' || v.status === 'complete') this.scopes.set(k, { status: v.status, reason: String(v.reason) });
    }
    return this;
  }

  /* ---------- notes ---------- */

  private async readIndex(name: string): Promise<string[]> {
    const v = await this.getJson(`idx:${name}`, `idx:${name}`);
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return fail('VAULT_CORRUPT', 'index record is malformed');
    return v;
  }

  private async addToIndex(name: string, id: string): Promise<void> {
    const cur = await this.readIndex(name);
    if (!cur.includes(id)) await this.putJson(`idx:${name}`, `idx:${name}`, [...cur, id]);
  }

  /**
   * Stores or replaces a note. `createdAt` is rounded to the hour (EP-VAULT-6). A note is never moved back to an
   * earlier lifecycle state (`lost-sync` may always be set).
   *
   * @param note Note.
   * @throws ExternalPoolError NOTE_STATE on regression.
   */
  public async putNote(note: PoolNote): Promise<void> {
    const n: PoolNote = { ...note, createdAt: roundToHour(note.createdAt) };
    const old = await this.getNote(n.noteId);
    if (old !== undefined && NOTE_STATES.indexOf(n.state) < NOTE_STATES.indexOf(old.state) && n.state !== 'lost-sync') {
      return fail('NOTE_STATE', 'refusing to move a note back to an earlier state');
    }
    await this.putJson(slot('note', n.noteId), `note:${n.noteId}`, n);
    await this.addToIndex('notes', n.noteId);
  }

  /**
   * @param noteId Note id.
   * @returns The note or `undefined`.
   * @throws ExternalPoolError VAULT_CORRUPT on tampering.
   */
  public async getNote(noteId: string): Promise<PoolNote | undefined> {
    const v = await this.getJson(slot('note', noteId), `note:${noteId}`);
    return v === undefined ? undefined : parseNote(v);
  }

  /** @returns Every note, ordered by deposit block then id. */
  public async listNotes(): Promise<PoolNote[]> {
    const out: PoolNote[] = [];
    for (const id of await this.readIndex('notes')) {
      const n = await this.getNote(id);
      if (n !== undefined) out.push(n);
    }
    return out.sort((a, b) => (a.depositBlock === b.depositBlock ? a.noteId.localeCompare(b.noteId) : a.depositBlock < b.depositBlock ? -1 : 1));
  }

  /**
   * Moves a note to a new state.
   *
   * @param noteId Note id.
   * @param state New state.
   * @throws ExternalPoolError NOTE_NOT_FOUND; NOTE_STATE when the note is already terminal or the move goes backwards.
   */
  public async setState(noteId: string, state: NoteState): Promise<PoolNote> {
    const n = await this.getNote(noteId);
    if (n === undefined) return fail('NOTE_NOT_FOUND', 'unknown note');
    if (TERMINAL.includes(n.state) && n.state !== state) return fail('NOTE_STATE', 'note is already finished');
    const next = { ...n, state };
    await this.putNote(next);
    return next;
  }

  /* ---------- stealth signer references (EP-VAULT-3) ---------- */

  /**
   * Records how to re-derive the signer of a depositor address (a derivation index or label, never a key).
   *
   * @param depositor S1.
   * @param ref Non-secret derivation reference.
   */
  public async registerSigner(depositor: Address, ref: string): Promise<void> {
    await this.putJson(slot('signer', depositor), `signer:${depositor.toLowerCase()}`, { depositor, ref });
    await this.addToIndex('signers', depositor.toLowerCase());
  }

  /**
   * @param depositor S1.
   * @returns The stored reference or `undefined`.
   */
  public async getSignerRef(depositor: Address): Promise<string | undefined> {
    const v = (await this.getJson(slot('signer', depositor), `signer:${depositor.toLowerCase()}`)) as { ref?: unknown } | undefined;
    return typeof v?.ref === 'string' ? v.ref : undefined;
  }

  /**
   * Forgets a signer reference ("rotate and forget" hygiene).
   *
   * @param depositor S1.
   * @throws ExternalPoolError KEY_REQUIRED_FOR_NOTE while any note of this depositor is not `exited` or `ragequit`.
   * @security Privacy Pools can only `ragequit` from the depositor address, so losing S1 would strand the funds.
   */
  public async purgeSigner(depositor: Address): Promise<void> {
    const live = (await this.listNotes()).some((n) => n.depositor.toLowerCase() === depositor.toLowerCase() && !TERMINAL.includes(n.state));
    if (live) return fail('KEY_REQUIRED_FOR_NOTE', 'a live pool note still needs this one-time address key');
    await this.storage.delete(slot('signer', depositor));
  }

  /* ---------- scan scopes (EP-VAULT-4) ---------- */

  private readonly scopes = new Map<string, { status: 'complete' | 'incomplete'; reason: string }>();

  /**
   * Marks a scan scope (`<route>:<chainId>`) complete or incomplete.
   *
   * @param scope Scope id.
   * @param status New status.
   * @param reason Short non-secret reason.
   */
  public async setScope(scope: string, status: 'complete' | 'incomplete', reason = ''): Promise<void> {
    this.scopes.set(scope, { status, reason });
    await this.putJson('scopes', 'scopes', Object.fromEntries(this.scopes));
  }

  /**
   * @param scope Scope id.
   * @throws ExternalPoolError SCOPE_INCOMPLETE when the last scan of the scope reported an error.
   * @security Prevents re-using a deposit index that an unseen deposit already took (SDK README semantics).
   */
  public assertDepositAllowed(scope: string): void {
    const s = this.scopes.get(scope);
    if (s?.status === 'incomplete') fail('SCOPE_INCOMPLETE', `scan of ${scope} is incomplete${s.reason === '' ? '' : `: ${s.reason}`}`);
  }

  /* ---------- proof-input cache (EP-VAULT-5) ---------- */

  /**
   * @param noteId Note id.
   * @param data Bytes needed to rebuild proof inputs offline (tree leaves, association set).
   */
  public async putCache(noteId: string, data: Uint8Array): Promise<void> {
    await this.putJson(slot('cache', noteId), `cache:${noteId}`, { data });
  }

  /**
   * @param noteId Note id.
   * @returns Cached bytes or `undefined`.
   */
  public async getCache(noteId: string): Promise<Uint8Array | undefined> {
    const v = (await this.getJson(slot('cache', noteId), `cache:${noteId}`)) as { data?: unknown } | undefined;
    return v?.data instanceof Uint8Array ? v.data : undefined;
  }

  /* ---------- export / import ---------- */

  /**
   * @returns A JSON string of all stored (already encrypted) records, safe to write to disk.
   */
  public async exportBundle(): Promise<string> {
    const entries: Record<string, string> = {};
    for (const k of await this.storage.keys()) {
      const v = await this.storage.get(k);
      if (v !== undefined) entries[k] = v;
    }
    return JSON.stringify({ v: 1, entries });
  }

  /**
   * Imports a bundle into an empty storage (header included) and opens it.
   *
   * @param storage Empty backend.
   * @param bundle Text from {@link exportBundle}.
   * @param passphrase Passphrase of the exported vault.
   * @throws ExternalPoolError VAULT_CORRUPT, VAULT_BAD_PASSPHRASE.
   */
  public static async importBundle(storage: VaultStorage, bundle: string, passphrase: string): Promise<Vault> {
    let b: { v?: unknown; entries?: unknown };
    try {
      b = JSON.parse(bundle) as { v?: unknown; entries?: unknown };
    } catch {
      return fail('VAULT_CORRUPT', 'bundle is not valid JSON');
    }
    if (b.v !== 1 || typeof b.entries !== 'object' || b.entries === null) return fail('VAULT_CORRUPT', 'bundle is malformed');
    if ((await storage.keys()).length !== 0) return fail('VAULT_CORRUPT', 'target storage is not empty');
    const entries = Object.entries(b.entries as Record<string, unknown>);
    if (!entries.every(([k, v]) => /^[a-z]+(:[0-9a-f]{40})?$|^idx:[a-z]+$/.test(k) && typeof v === 'string')) return fail('VAULT_CORRUPT', 'bundle has a bad record');
    for (const [k, v] of entries) await storage.set(k, v as string);
    try {
      return await Vault.open(storage, passphrase);
    } catch (e) {
      for (const [k] of entries) await storage.delete(k);
      throw e;
    }
  }
}
