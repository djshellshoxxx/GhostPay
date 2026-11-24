import { parseScanState, serializeScanState, zeroize, type ScanState } from '@ghostpay/btc-silent-payments';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { ReconciliationVaultStore } from '../../lib/reconciliationVault';
import type { BtcWallet } from './wallet';

const DOMAIN = 'GhostPay/BTC/scan-state/v1';
const MAX_BYTES = 512 * 1024;
const text = new TextEncoder();
const invalid = (): never => { throw new Error('Saved Bitcoin scan state is unavailable or invalid.'); };

interface Envelope { readonly version: 1; readonly scope: string; readonly salt: string; readonly iv: string; readonly ciphertext: string }

/**
 * Opt-in encrypted scan metadata, using the existing vault HKDF/AES-GCM and atomic CAS storage pattern.
 * No seed, scan key, spend key or spend tweak is serialized. A saved match is historical metadata, never spend authority.
 * The storage key is an opaque digest of the public wallet and network; ciphertext AAD authenticates that scope.
 */
export class BtcScanVault {
  private base: CryptoKey | undefined;
  private expected: string | null | undefined;
  private generation = 0;
  private constructor(private readonly store: ReconciliationVaultStore, private readonly scope: string,
    private readonly network: BtcWallet['net']['id'], private readonly externalGuard: () => void) {}

  public static async open(wallet: BtcWallet, store: ReconciliationVaultStore, guard: () => void, sourcePolicy?: string): Promise<BtcScanVault> {
    guard();
    if (sourcePolicy !== undefined && (typeof sourcePolicy !== 'string' || sourcePolicy.length > 8192)) return invalid();
    const raw = new Uint8Array(wallet.keys.scanSecret);
    if (raw.length !== 32 || raw.every((b) => b === 0)) return invalid();
    const scope = bytesToHex(sha256(text.encode(`${DOMAIN}:${wallet.net.id}:${wallet.address}${sourcePolicy === undefined ? '' : `:source:${sourcePolicy}`}`)));
    const vault = new BtcScanVault(store, scope, wallet.net.id, guard);
    try {
      const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
      guard(); vault.base = base; return vault;
    } finally { zeroize(raw); }
  }

  public lock(): void { this.generation++; this.base = undefined; this.expected = undefined; }
  private key(): string { return `btc-scan:v1:${this.scope}`; }
  private guard(): () => void {
    const generation = this.generation;
    return () => { this.externalGuard(); if (this.base === undefined || generation !== this.generation) invalid(); };
  }
  private async derive(salt: string): Promise<CryptoKey> {
    const base = this.base; if (base === undefined) return invalid();
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: hexToBytes(salt),
      info: text.encode(`${DOMAIN}:${this.scope}`) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  private aad(e: Pick<Envelope, 'version' | 'scope' | 'salt' | 'iv'>): Uint8Array<ArrayBuffer> {
    return text.encode(`${DOMAIN}:${e.version}:${e.scope}:${e.salt}:${e.iv}`);
  }
  public async load(): Promise<ScanState | undefined> {
    const guard = this.guard(); guard();
    const stored = await this.store.read(this.key()); guard();
    if (stored === null) { this.expected = stored; return undefined; }
    if (stored.length > MAX_BYTES * 2 + 512) return invalid();
    let plain: Uint8Array<ArrayBuffer> | undefined;
    try {
      const e = JSON.parse(stored) as Envelope;
      if (e !== null && typeof e === 'object' && !Array.isArray(e) && Object.keys(e).sort().join('|') === 'forgotten|nonce|version' &&
        e.version === 1 && 'forgotten' in e && e.forgotten === true && 'nonce' in e && typeof e.nonce === 'string' && /^[0-9a-f]{64}$/.test(e.nonce)) {
        this.expected = stored; return undefined;
      }
      if (e === null || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).sort().join('|') !== 'ciphertext|iv|salt|scope|version' ||
        e.version !== 1 || e.scope !== this.scope || typeof e.salt !== 'string' || !/^[0-9a-f]{64}$/.test(e.salt) ||
        typeof e.iv !== 'string' || !/^[0-9a-f]{24}$/.test(e.iv) || typeof e.ciphertext !== 'string' ||
        !/^[0-9a-f]+$/.test(e.ciphertext) || e.ciphertext.length % 2 !== 0 || e.ciphertext.length < 32) return invalid();
      const key = await this.derive(e.salt); guard();
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(e.iv), additionalData: this.aad(e), tagLength: 128 }, key, hexToBytes(e.ciphertext)));
      guard();
      if (plain.length > MAX_BYTES) return invalid();
      const state = parseScanState(new TextDecoder('utf-8', { fatal: true }).decode(plain));
      if (state.network !== this.network) return invalid();
      this.expected = stored; return state;
    } catch { return invalid(); } finally { if (plain !== undefined) zeroize(plain); }
  }
  public async save(state: ScanState): Promise<void> {
    const guard = this.guard(); guard();
    if (this.expected === undefined || state.network !== this.network) return invalid();
    // Canonical parsing strips unknown fields (including accidentally attached private buffers) before encryption.
    const plain = text.encode(serializeScanState(parseScanState(serializeScanState(state))));
    if (plain.length > MAX_BYTES) { zeroize(plain); return invalid(); }
    const header = { version: 1 as const, scope: this.scope,
      salt: bytesToHex(crypto.getRandomValues(new Uint8Array(32))), iv: bytesToHex(crypto.getRandomValues(new Uint8Array(12))) };
    const expected = this.expected;
    try {
      const key = await this.derive(header.salt); guard();
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: hexToBytes(header.iv), additionalData: this.aad(header), tagLength: 128 }, key, plain);
      guard();
      const next = JSON.stringify({ ...header, ciphertext: bytesToHex(new Uint8Array(encrypted)) });
      if (!(await this.store.compareAndSwap(this.key(), expected, next, guard))) return invalid();
      guard(); this.expected = next;
    } finally { zeroize(plain); }
  }
  /** An explicit tombstone prevents a previously opened tab from reviving forgotten progress. */
  public async forget(): Promise<void> {
    const guard = this.guard(); guard();
    const expected = this.expected === undefined ? await this.store.read(this.key()) : this.expected;
    guard();
    const next = JSON.stringify({ version: 1, forgotten: true, nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) });
    if (!(await this.store.compareAndSwap(this.key(), expected, next, guard))) return invalid();
    guard(); this.expected = next;
  }
}
