import type { Address, Hex, ScanCursor, ScannedAnnouncement } from '@ghostpay/chain-adapters';
import { parseCompressedPoint, parseMetadata, type ParsedMetadata } from '@ghostpay/core-crypto';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { ReconciliationVaultStore } from './reconciliationVault';
import type { ScanMatch } from './scanClient';

export const PRIVATE_SCAN_SLOT_PREFIX = 'ghostpay.scan.checkpoint.v5.';
export const PRIVATE_SCAN_MAX_MATCHES = 10_000;
export const PRIVATE_SCAN_MAX_PLAINTEXT_BYTES = 2_000_000;
const MAX_ENVELOPE_BYTES = PRIVATE_SCAN_MAX_PLAINTEXT_BYTES * 2 + 512;
const MAX_METADATA_BYTES = 4096;
const MAX_BLOCK = 10_000_000_000n;
const DOMAIN = 'GhostPay/EVM/private-scan/v5';
const text = new TextEncoder();
const HASH = /^0x[0-9a-f]{64}$/;
const ID = /^[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DIGITS = /^(0|[1-9][0-9]{0,10})$/;

export interface PrivateScanScope {
  readonly chainId: number;
  readonly sellerKeyId: string;
  readonly announcer: Address;
  readonly router: Address;
  readonly finalityDepth: number;
  readonly deep: boolean;
  /** Canonical selected source/manifest policy. Only its bound digest is persisted, inside ciphertext. */
  readonly configuration: string;
}

export interface PrivateScanState {
  readonly cursor: ScanCursor;
  readonly matches: readonly ScanMatch[];
  readonly startBlock: bigint;
  readonly routerOnlyBlocks?: readonly bigint[];
}

export type ScanStateErrorCode = 'invalid' | 'conflict' | 'limit' | 'stale' | 'unavailable';
const MESSAGES: Readonly<Record<ScanStateErrorCode, string>> = {
  invalid: 'Saved scan state is invalid. Clear the checkpoint and rescan from the chosen start block.',
  conflict: 'Scan state changed in another tab. Reload the checkpoint before resuming.',
  limit: 'Scan history reached its storage safety limit. The checkpoint was not advanced.',
  stale: 'The seller scan context changed. Resume with the current wallet and network.',
  unavailable: 'Encrypted scan storage is unavailable. The checkpoint was not advanced.',
};

/** Fixed public classifications. No RPC text, storage diagnostics, key material or foreign causes are retained. */
export class ScanStateError extends Error {
  public constructor(public readonly code: ScanStateErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ScanStateError';
  }
}

function fail(code: ScanStateErrorCode): never { throw new ScanStateError(code); }
function sanitized(error: unknown, fallback: ScanStateErrorCode): never {
  // Remint even an exported error: another adapter could have changed its message or cause.
  return fail(error instanceof ScanStateError && Object.hasOwn(MESSAGES, error.code) ? error.code : fallback);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string): boolean {
  return Object.keys(value).sort().join('|') === keys;
}
function integer(value: unknown, max: bigint = MAX_BLOCK): bigint {
  if (typeof value !== 'string' || !DIGITS.test(value)) return fail('invalid');
  const number = BigInt(value);
  if (number > max) return fail('invalid');
  return number;
}
function address(value: unknown): Address {
  if (typeof value !== 'string' || !ADDRESS.test(value)) return fail('invalid');
  return value.toLowerCase() as Address;
}
function hash(value: unknown): Hex {
  if (typeof value !== 'string' || !HASH.test(value)) return fail('invalid');
  return value as Hex;
}
function normalizedScope(scope: PrivateScanScope): PrivateScanScope {
  if (!Number.isSafeInteger(scope.chainId) || scope.chainId <= 0 || typeof scope.sellerKeyId !== 'string' ||
      !ID.test(scope.sellerKeyId) || !Number.isSafeInteger(scope.finalityDepth) || scope.finalityDepth < 0 ||
      scope.finalityDepth > 1_000_000 || typeof scope.deep !== 'boolean' || typeof scope.configuration !== 'string' ||
      scope.configuration.length > 8192) return fail('invalid');
  return Object.freeze({
    chainId: scope.chainId, sellerKeyId: scope.sellerKeyId, announcer: address(scope.announcer),
    router: address(scope.router), finalityDepth: scope.finalityDepth, deep: scope.deep, configuration: scope.configuration,
  });
}

/** Random absence marker: a deleted or newly reserved slot cannot equal a stale tab's previous CAS value. */
export function createPrivateScanTombstone(): string {
  return JSON.stringify({ version: 1, forgotten: true, nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) });
}

export function isPrivateScanTombstone(encoded: string): boolean {
  if (encoded.length > 256) return false;
  try {
    const value: unknown = JSON.parse(encoded);
    return object(value) && exact(value, 'forgotten|nonce|version') && value.version === 1 && value.forgotten === true &&
      typeof value.nonce === 'string' && ID.test(value.nonce);
  } catch { return false; }
}

function cursorFrom(value: unknown, startBlock: bigint): ScanCursor {
  if (!object(value) || !exact(value, value.last === undefined ? 'nextBlock' : 'last|nextBlock')) return fail('invalid');
  const nextBlock = integer(value.nextBlock, MAX_BLOCK + 1n);
  if (nextBlock < startBlock) return fail('invalid');
  if (value.last === undefined) {
    // An arbitrary starting block has no completed range. Advancing it requires a canonical preceding hash.
    if (nextBlock !== startBlock) return fail('invalid');
    return { nextBlock };
  }
  if (!object(value.last) || !exact(value.last, 'hash|number')) return fail('invalid');
  const number = integer(value.last.number);
  if (number + 1n !== nextBlock) return fail('invalid');
  return { nextBlock, last: { number, hash: hash(value.last.hash) } };
}

interface SavedMatch {
  readonly schemeId: string;
  readonly stealthAddress: Address;
  readonly caller: Address;
  readonly ephemeralPublicKey: string;
  readonly metadata: string;
  readonly blockNumber: string;
  readonly blockHash: Hex;
  readonly logIndex: number;
  readonly tagMatches: boolean;
  readonly transactionHash?: Hex;
  readonly blockTimestamp?: string;
}

function matchFrom(value: unknown, scope: PrivateScanScope): ScanMatch {
  if (!object(value)) return fail('invalid');
  const expected = ['blockHash', 'blockNumber', 'caller', 'ephemeralPublicKey', 'logIndex', 'metadata', 'schemeId', 'stealthAddress', 'tagMatches'];
  if (value.transactionHash !== undefined) expected.push('transactionHash');
  if (value.blockTimestamp !== undefined) expected.push('blockTimestamp');
  if (!exact(value, expected.sort().join('|')) || value.schemeId !== '1' || typeof value.tagMatches !== 'boolean' ||
      typeof value.logIndex !== 'number' || !Number.isSafeInteger(value.logIndex) || value.logIndex < 0 || value.logIndex > 0xffffff ||
      typeof value.ephemeralPublicKey !== 'string' || !/^0x0[23][0-9a-f]{64}$/.test(value.ephemeralPublicKey) ||
      typeof value.metadata !== 'string') return fail('invalid');
  if (value.metadata.length > MAX_METADATA_BYTES * 2 + 2) return fail('limit');
  if (!/^0x(?:[0-9a-f]{2})+$/.test(value.metadata)) return fail('invalid');
  try { parseCompressedPoint(hexToBytes(value.ephemeralPublicKey.slice(2))); } catch { return fail('invalid'); }
  if (value.blockTimestamp !== undefined && (typeof value.blockTimestamp !== 'string' ||
      !/^(0|[1-9][0-9]{0,19})$/.test(value.blockTimestamp))) return fail('invalid');
  const stealthAddress = address(value.stealthAddress);
  const caller = address(value.caller);
  const blockHash = hash(value.blockHash);
  const announcement: ScannedAnnouncement = {
    schemeId: 1n, stealthAddress, caller, blockNumber: integer(value.blockNumber), blockHash,
    ephemeralPublicKey: value.ephemeralPublicKey, metadata: value.metadata, logIndex: value.logIndex,
    id: `${blockHash}:${String(value.logIndex)}`,
    ...(value.transactionHash === undefined ? {} : { transactionHash: hash(value.transactionHash) }),
    ...(value.blockTimestamp === undefined ? {} : { blockTimestamp: value.blockTimestamp }),
  };
  let metadata: ParsedMetadata | undefined;
  try { metadata = parseMetadata(announcement.metadata); } catch { metadata = undefined; }
  // Decryption proves local integrity, not current canonical-chain or payment evidence. The caller replays these blocks.
  return { chainId: scope.chainId, announcement, stealthAddress, metadata, viaRouter: caller === scope.router, tagMatches: value.tagMatches, receipt: 'claimed' };
}

function savedMatch(match: ScanMatch, scope: PrivateScanScope): SavedMatch {
  const a = match.announcement;
  if (match.chainId !== scope.chainId || address(match.stealthAddress) !== address(a.stealthAddress) ||
      a.id !== `${a.blockHash}:${String(a.logIndex)}` || a.schemeId !== 1n || typeof a.blockNumber !== 'bigint') return fail('invalid');
  const saved: SavedMatch = {
    schemeId: '1', stealthAddress: address(a.stealthAddress), caller: address(a.caller),
    ephemeralPublicKey: a.ephemeralPublicKey, metadata: a.metadata, blockNumber: a.blockNumber.toString(),
    blockHash: a.blockHash, logIndex: a.logIndex, tagMatches: match.tagMatches,
    ...(a.transactionHash === undefined ? {} : { transactionHash: a.transactionHash }),
    ...(a.blockTimestamp === undefined ? {} : { blockTimestamp: a.blockTimestamp }),
  };
  matchFrom(saved, scope);
  return saved;
}

function stateFrom(value: unknown, scope: PrivateScanScope): PrivateScanState {
  if (!object(value) || !exact(value, 'cursor|matches|routerOnlyBlocks|startBlock') || !Array.isArray(value.matches) ||
      !Array.isArray(value.routerOnlyBlocks)) return fail('invalid');
  if (value.matches.length > PRIVATE_SCAN_MAX_MATCHES || value.routerOnlyBlocks.length > 1000) return fail('limit');
  const startBlock = integer(value.startBlock);
  const cursor = cursorFrom(value.cursor, startBlock);
  const seen = new Set<string>();
  const matches = value.matches.map((entry: unknown) => {
    const match = matchFrom(entry, scope);
    if (seen.has(match.announcement.id)) return fail('invalid');
    seen.add(match.announcement.id);
    return match;
  });
  const routerOnlyBlocks = value.routerOnlyBlocks.map((block: unknown) => integer(block));
  if (new Set(routerOnlyBlocks).size !== routerOnlyBlocks.length) return fail('invalid');
  return { startBlock, cursor, matches, ...(routerOnlyBlocks.length === 0 ? {} : { routerOnlyBlocks }) };
}

function encodeState(state: PrivateScanState, scope: PrivateScanScope, scopeDigest: string): Uint8Array<ArrayBuffer> {
  if (!Array.isArray(state.matches) || state.matches.length > PRIVATE_SCAN_MAX_MATCHES ||
      (state.routerOnlyBlocks?.length ?? 0) > 1000) return fail('limit');
  if (typeof state.startBlock !== 'bigint' || typeof state.cursor.nextBlock !== 'bigint') return fail('invalid');
  const startBlock = integer(state.startBlock.toString());
  const cursor = { nextBlock: state.cursor.nextBlock.toString(), ...(state.cursor.last === undefined ? {} : {
    last: { number: state.cursor.last.number.toString(), hash: state.cursor.last.hash },
  }) };
  cursorFrom(cursor, startBlock);
  const routerOnlyBlocks = (state.routerOnlyBlocks ?? []).map((block) => {
    if (typeof block !== 'bigint') return fail('invalid');
    return integer(block.toString()).toString();
  });
  if (new Set(routerOnlyBlocks).size !== routerOnlyBlocks.length) return fail('invalid');
  let size = 0;
  const seen = new Set<string>();
  const matches = state.matches.map((match: ScanMatch) => {
    const saved = savedMatch(match, scope);
    const id = `${saved.blockHash}:${String(saved.logIndex)}`;
    if (seen.has(id)) return fail('invalid');
    seen.add(id);
    size += JSON.stringify(saved).length;
    if (size > PRIVATE_SCAN_MAX_PLAINTEXT_BYTES) return fail('limit');
    return saved;
  });
  const saved = { startBlock: startBlock.toString(), cursor, matches, routerOnlyBlocks };
  const plain = text.encode(JSON.stringify({ version: 1, scope: scopeDigest, state: saved }));
  if (plain.length > PRIVATE_SCAN_MAX_PLAINTEXT_BYTES) { plain.fill(0); return fail('limit'); }
  return plain;
}

interface Envelope { readonly version: 1; readonly salt: string; readonly iv: string; readonly ciphertext: string }
function envelopeFrom(encoded: string): Envelope {
  if (encoded.length > MAX_ENVELOPE_BYTES) return fail('limit');
  const value: unknown = JSON.parse(encoded);
  if (!object(value) || !exact(value, 'ciphertext|iv|salt|version') || value.version !== 1 ||
      typeof value.salt !== 'string' || !ID.test(value.salt) || typeof value.iv !== 'string' || !/^[0-9a-f]{24}$/.test(value.iv) ||
      typeof value.ciphertext !== 'string' || value.ciphertext.length < 32 || value.ciphertext.length % 2 !== 0 ||
      !/^[0-9a-f]+$/.test(value.ciphertext)) return fail('invalid');
  return { version: 1, salt: value.salt, iv: value.iv, ciphertext: value.ciphertext };
}

/**
 * One encrypted cursor-and-discovery document per private seller/network/configuration context. Uses the existing vault
 * HKDF-SHA256/AES-256-GCM and guarded IndexedDB compare-and-swap pattern. A caller must await save before publishing
 * advanced durable progress; a failed CAS never drops another tab's history. No seller key bytes are persisted.
 */
export class PrivateScanVault {
  private base: CryptoKey | undefined;
  private expected: string | null | undefined;
  private observed: string | null | undefined;
  private generation = 0;
  private constructor(private readonly scope: PrivateScanScope, private readonly scopeDigest: string, private readonly slot: string,
    private readonly store: ReconciliationVaultStore, private readonly externalGuard: () => void) {}

  /** Takes ownership of viewingKey and wipes it on every exit, including validation and session failures. */
  public static async open(scope: PrivateScanScope, viewingKey: Uint8Array, store: ReconciliationVaultStore, guard: () => void): Promise<PrivateScanVault> {
    let raw: Uint8Array<ArrayBuffer> | undefined;
    try {
      try { guard(); } catch { return fail('stale'); }
      const normalized = normalizedScope(scope);
      if (viewingKey.length !== 32 || viewingKey.every((byte) => byte === 0)) return fail('invalid');
      const digest = bytesToHex(sha256(text.encode(JSON.stringify(normalized))));
      const nameBytes = hkdf(sha256, viewingKey, undefined, text.encode(`${DOMAIN}/slot|${digest}`), 32);
      const slot = `${PRIVATE_SCAN_SLOT_PREFIX}${bytesToHex(nameBytes)}`;
      nameBytes.fill(0);
      raw = new Uint8Array(viewingKey);
      const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
      try { guard(); } catch { return fail('stale'); }
      const vault = new PrivateScanVault(normalized, digest, slot, store, guard);
      vault.base = base;
      return vault;
    } catch (error) { return sanitized(error, 'unavailable'); }
    finally { viewingKey.fill(0); raw?.fill(0); }
  }

  public lock(): void { this.generation++; this.base = undefined; this.expected = undefined; this.observed = undefined; }

  private guard(): () => void {
    const generation = this.generation;
    return () => {
      try { this.externalGuard(); } catch { return fail('stale'); }
      if (this.base === undefined || generation !== this.generation) return fail('stale');
    };
  }

  private derive(salt: string): Promise<CryptoKey> {
    if (this.base === undefined) return fail('stale');
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: hexToBytes(salt), info: text.encode(`${DOMAIN}/key|${this.slot}`) },
      this.base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  private aad(e: Pick<Envelope, 'version' | 'salt' | 'iv'>): Uint8Array<ArrayBuffer> {
    return text.encode(`${DOMAIN}|${e.version}|${this.slot}|${e.salt}|${e.iv}`);
  }

  private async read(guard: () => void): Promise<string | null> {
    guard();
    let value: string | null;
    try { value = await this.store.read(this.slot); } catch (error) { guard(); return sanitized(error, 'unavailable'); }
    guard();
    if (value !== null && typeof value !== 'string') return fail('invalid');
    return value;
  }

  private async swap(expected: string | null, next: string, guard: () => void): Promise<void> {
    guard();
    let swapped: boolean;
    try { swapped = await this.store.compareAndSwap(this.slot, expected, next, guard); }
    catch (error) { guard(); return sanitized(error, 'unavailable'); }
    guard();
    if (!swapped) return fail('conflict');
    this.expected = next; this.observed = next;
  }

  public async load(): Promise<PrivateScanState | undefined> {
    const guard = this.guard(); guard();
    this.expected = undefined;
    const stored = await this.read(guard);
    this.observed = stored;
    if (stored === null) {
      // Register even an empty scanner, so deleting the seller can invalidate a tab opened before its first match.
      await this.swap(null, createPrivateScanTombstone(), guard);
      return undefined;
    }
    if (isPrivateScanTombstone(stored)) { this.expected = stored; return undefined; }
    let plain: Uint8Array<ArrayBuffer> | undefined;
    try {
      const envelope = envelopeFrom(stored);
      const key = await this.derive(envelope.salt); guard();
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(envelope.iv), additionalData: this.aad(envelope), tagLength: 128 }, key, hexToBytes(envelope.ciphertext)));
      guard();
      if (plain.length > PRIVATE_SCAN_MAX_PLAINTEXT_BYTES) return fail('limit');
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
      if (!object(value) || !exact(value, 'scope|state|version') || value.version !== 1 || value.scope !== this.scopeDigest) return fail('invalid');
      const state = stateFrom(value.state, this.scope);
      guard(); this.expected = stored;
      return state;
    } catch (error) { return sanitized(error, 'invalid'); }
    finally { plain?.fill(0); }
  }

  public async save(state: PrivateScanState): Promise<void> {
    const guard = this.guard(); guard();
    if (this.expected === undefined) return fail('invalid');
    const expected = this.expected;
    let plain: Uint8Array<ArrayBuffer> | undefined;
    try {
      plain = encodeState(state, this.scope, this.scopeDigest);
      const header = { version: 1 as const, salt: bytesToHex(crypto.getRandomValues(new Uint8Array(32))), iv: bytesToHex(crypto.getRandomValues(new Uint8Array(12))) };
      const key = await this.derive(header.salt); guard();
      const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: hexToBytes(header.iv), additionalData: this.aad(header), tagLength: 128 }, key, plain);
      guard();
      const next = JSON.stringify({ ...header, ciphertext: bytesToHex(new Uint8Array(sealed)) });
      await this.swap(expected, next, guard);
    } catch (error) { return sanitized(error, 'unavailable'); }
    finally { plain?.fill(0); }
  }

  /** Explicitly clears valid or corrupt state. It never deletes a row, avoiding stale-tab resurrection and ABA races. */
  public async forget(): Promise<void> {
    const guard = this.guard(); guard();
    const expected = this.observed === undefined ? await this.read(guard) : this.observed;
    guard();
    await this.swap(expected, createPrivateScanTombstone(), guard);
  }
}
