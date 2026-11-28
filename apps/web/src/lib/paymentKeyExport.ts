import { findChain, type RpcClient } from '@ghostpay/chain-adapters';
import { secretScalarFromBytes, zeroize, type SecretScalar } from '@ghostpay/core-crypto';
import { canonicalize } from '@ghostpay/invoice-schema';
import { SecretBox } from '@ghostpay/secret-box';
import { bytesToHex } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';
import { passphraseProblemMessage } from './keystore';
import { requireSecretExportAuthorization, type SecretExportCredential } from './keyVault';
import type { ScanMatch } from './scanClient';
import { captureSessionGuard, captureSessionVersionGuard, getSessionPublic, importSession, withSessionSecrets, withSessionSecretsAsync, type SessionPublic } from './session';
import {
  STEALTH_EXPORT_FILENAMES,
  STEALTH_EXPORT_LIMITS,
  buildVerifiedPayment,
  decryptMasterBackup,
  decryptPaymentKeys,
  detectStealthExportFormat,
  encryptMasterBackup,
  encryptPaymentKeys,
  formatRawPrivateKey,
  parsePublicRecord,
  serializePublicRecord,
  type StealthExportScope,
  type StealthKeypairHeader,
  type StealthMasterHeader,
  type StealthPublicRecord,
  type VerifiedStealthPayment,
} from './stealthExport';

/**
 * Spec 18 export and recovery orchestration for the browser (UI-free). Formats, crypto and the per-file checks are the
 * shared codec's (lib/stealthExport.ts); this module adds what only the app knows: which keys are loaded, re-authentication
 * against them (keyVault.requireSecretExportAuthorization), the scan's RPC for the EOA check, and cancellation.
 *
 * Every secret export runs under one session guard captured at its start and the caller's AbortSignal (its operation).
 * Both are checked after every await and once more immediately before the text is returned, so a lock, wipe, key
 * replacement, chain switch or a newer operation discards the result. Every derived or decrypted scalar is wiped in
 * `finally`; thrown errors carry only public descriptors.
 */

/** A downloadable export: fixed, secret-free filename (formats section 1.7) and its exact text. */
export interface StealthExportFile {
  readonly filename: string;
  readonly text: string;
  readonly type: 'application/json' | 'text/plain';
}

/** A code-check client bound to the scan's endpoint; an export's cancellation is independent of the scan's lifetime. */
export interface ExportRpc extends Pick<RpcClient, 'chainId'> {
  assertCurrent?(): void;
  request(method: string, params: readonly unknown[], signal?: AbortSignal): Promise<unknown>;
}

export interface SecretExportOptions {
  /** The operation: aborting it cancels the export and discards its result. */
  readonly signal?: AbortSignal;
  /** scrypt cost of the new file; production uses the codec default (2^17). Only tests lower it. */
  readonly N?: number;
}

export interface PaymentSecretExportOptions extends SecretExportOptions {
  /** The client the scan used (user-selected RPC or private scan endpoint). Without it the export is refused. */
  readonly rpc: ExportRpc | undefined;
}

const CANCELLED = { key: 'error.session.theSecretExportWasCancelled' } as const;

/** EIP-170 caps runtime code at 24,576 bytes; a longer `eth_getCode` answer is malformed. */
const MAX_CODE_HEX = 2 + 2 * 24_576;

function cost(N: number | undefined): { readonly N?: number } {
  return N === undefined ? {} : { N };
}

/** Starts an export for the keys loaded now; the returned check throws once the operation or the keys are gone. */
function startExport(signal: AbortSignal | undefined): () => void {
  const guard = captureSessionGuard();
  const check = (): void => {
    if (signal?.aborted === true) throw new UserFacingError(CANCELLED);
    guard();
  };
  check();
  return check;
}

/** Re-authentication, then a check that combines the export's own guard with the one the credential proved. */
async function authorize(credential: SecretExportCredential, signal: AbortSignal | undefined, check: () => void): Promise<() => void> {
  const authorized = await requireSecretExportAuthorization(credential, signal);
  const still = (): void => { check(); authorized(); };
  still();
  return still;
}

function requireNewPassphrase(passphrase: string): void {
  const problem = passphraseProblemMessage(passphrase);
  if (problem !== undefined) throw new UserFacingError(problem);
}

/** Only scheme-1 announcements found by the EVM scan of a known chain are eligible (spec 18 scope). */
function checkEligible(match: ScanMatch): void {
  if (findChain(match.chainId) === undefined) throw new UserFacingError({ key: 'error.paymentKeyExport.unsupportedChain' });
  if (match.announcement.schemeId !== 1n) throw new UserFacingError({ key: 'error.stealthExport.unsupportedScheme' });
  if (match.stealthAddress.toLowerCase() !== match.announcement.stealthAddress.toLowerCase()) throw new UserFacingError({ key: 'error.stealthExport.invalidAnnouncement' });
}

/** The scan's client must exist and serve the payment's chain; checked before any key work. */
function requireRpc(rpc: ExportRpc | undefined, chainId: number): ExportRpc {
  if (rpc === undefined) throw new UserFacingError({ key: 'error.paymentKeyExport.noRpc' });
  if (rpc.chainId !== chainId) throw new UserFacingError({ key: 'error.paymentKeyExport.wrongChain' });
  return rpc;
}

/**
 * Formats section 7: the address must hold no code at `latest` (no contract, no EIP-7702 delegation), checked through the
 * scan's RPC. Any failure or malformed answer refuses the export (fail closed); a cancellation reported meanwhile wins.
 */
async function assertPlainAccount(rpc: ExportRpc, address: string, check: () => void, signal?: AbortSignal): Promise<void> {
  let code: unknown;
  try {
    code = await rpc.request('eth_getCode', [address, 'latest'], signal);
  } catch {
    check();
    throw new UserFacingError({ key: 'error.paymentKeyExport.codeCheckFailed' });
  }
  check();
  if (typeof code !== 'string' || code.length > MAX_CODE_HEX || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) throw new UserFacingError({ key: 'error.paymentKeyExport.codeCheckFailed' });
  if (code !== '0x') throw new UserFacingError({ key: 'error.paymentKeyExport.contractAccount' });
}

/** Derives one payment's key with the loaded keys and verifies it controls the announced address; the caller wipes `secret`. */
function verifiedPayment(match: ScanMatch, exportedAt: Date): VerifiedStealthPayment {
  return withSessionSecrets((s) => buildVerifiedPayment({ chainId: match.chainId, announcement: match.announcement, keys: s.keys, exportedAt }));
}

function earlierLocator(x: ScanMatch, y: ScanMatch): boolean {
  const a = x.announcement;
  const b = y.announcement;
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber;
  if (a.logIndex !== b.logIndex) return a.logIndex < b.logIndex;
  const aHash = a.blockHash.toLowerCase();
  const bHash = b.blockHash.toLowerCase();
  if (aHash !== bHash) return aHash < bHash;
  // At one address, ephemeral key and locator, only the optional transaction hash and announced view tag can differ in
  // the eventual public record. Compare their canonical shape in the same order as formats section 4, without deriving
  // any secret or allowing input ordering to choose an archive's metadata.
  const tie = (announcement: ScanMatch['announcement']): string => canonicalize({
    announcement: announcement.transactionHash === undefined ? {} : { transactionHash: announcement.transactionHash.toLowerCase() },
    viewTag: announcement.metadata.slice(0, 4).toLowerCase(),
  });
  return tie(a) < tie(b);
}

/**
 * One match per one-time address, sorted by lowercase address (formats section 4): matches that repeat an address and its
 * ephemeral key (F1 router replays) collapse to the earliest locator; the same address with another ephemeral key cannot
 * come from scheme-1 derivation and refuses the whole export. Public data only; no key is derived.
 */
export function distinctPayments(matches: readonly ScanMatch[]): ScanMatch[] {
  const kept = new Map<string, ScanMatch>();
  for (const m of matches) {
    const address = m.stealthAddress.toLowerCase();
    const other = kept.get(address);
    if (other === undefined) kept.set(address, m);
    else if (other.announcement.ephemeralPublicKey.toLowerCase() !== m.announcement.ephemeralPublicKey.toLowerCase()) throw new UserFacingError({ key: 'error.stealthExport.conflict' });
    else if (earlierLocator(m, other)) kept.set(address, m);
  }
  return [...kept.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([, m]) => m);
}

/**
 * What a bulk export of `matches` would hold, shown before the user confirms: the distinct payment count and their chain.
 * Throws the refusal the export itself would give for mixed chains, ineligible matches, conflicts or too many payments.
 */
export function describePaymentArchive(matches: readonly ScanMatch[]): { readonly chainId: number; readonly count: number } {
  const first = matches[0];
  if (first === undefined) throw new UserFacingError({ key: 'error.paymentKeyExport.noPayments' });
  for (const m of matches) {
    checkEligible(m);
    if (m.chainId !== first.chainId) throw new UserFacingError({ key: 'error.stealthExport.mixedChains' });
  }
  const count = distinctPayments(matches).length;
  if (count > STEALTH_EXPORT_LIMITS.maxPayments) throw new UserFacingError({ key: 'error.stealthExport.tooMany', values: { maximum: String(STEALTH_EXPORT_LIMITS.maxPayments) } });
  return { chainId: first.chainId, count };
}

/** Public-only record of one payment (formats section 2). Holds no secret, so it needs no re-authentication or RPC. */
export function exportPublicRecord(match: ScanMatch): StealthExportFile {
  checkEligible(match);
  const { record, secret } = verifiedPayment(match, new Date());
  zeroize(secret);
  return { filename: STEALTH_EXPORT_FILENAMES.public, text: serializePublicRecord(record), type: 'application/json' };
}

/** Shared single-payment path: re-authenticate, check the address holds no code, then derive and hand the key to `seal`. */
async function exportOnePayment(match: ScanMatch, credential: SecretExportCredential, options: PaymentSecretExportOptions, beforeAuth: () => void, seal: (payment: VerifiedStealthPayment) => Promise<string> | string): Promise<string> {
  const check = startExport(options.signal);
  checkEligible(match);
  const rpc = requireRpc(options.rpc, match.chainId);
  beforeAuth();
  const authorized = await authorize(credential, options.signal, check);
  const still = (): void => { authorized(); rpc.assertCurrent?.(); };
  still();
  await assertPlainAccount(rpc, match.stealthAddress, still, options.signal);
  const payment = verifiedPayment(match, new Date());
  try {
    const text = await seal(payment);
    still();
    return text;
  } finally {
    zeroize(payment.secret);
  }
}

/** `ghostpay-stealth-keypair-v1` of one payment (scope `single`), encrypted under the new `passphrase`. */
export async function exportEncryptedPayment(match: ScanMatch, credential: SecretExportCredential, passphrase: string, options: PaymentSecretExportOptions): Promise<StealthExportFile> {
  const text = await exportOnePayment(match, credential, options, () => { requireNewPassphrase(passphrase); }, (payment) => encryptPaymentKeys([payment], { scope: 'single', passphrase, ...cost(options.N) }));
  return { filename: STEALTH_EXPORT_FILENAMES.keypair, text, type: 'application/json' };
}

/**
 * Raw private-key text of one payment (formats section 6). Only after re-authentication and the user's second
 * confirmation (`confirmed`); the caller downloads it and never shows or copies it.
 */
export async function exportRawPrivateKey(match: ScanMatch, credential: SecretExportCredential, confirmed: true, options: PaymentSecretExportOptions): Promise<StealthExportFile> {
  const text = await exportOnePayment(match, credential, options, () => {
    if ((confirmed as unknown) !== true) throw new UserFacingError({ key: 'error.paymentKeyExport.confirmRawKey' });
  }, (payment) => formatRawPrivateKey(payment.record, payment.secret));
  return { filename: STEALTH_EXPORT_FILENAMES.privateKey, text, type: 'text/plain' };
}

/**
 * Encrypted archive of the distinct payments among `matches` (formats section 4): one chain only, deduplicated before any
 * request, every address checked for code, then every key derived and sealed at once. Never master keys.
 */
export async function exportPaymentArchive(matches: readonly ScanMatch[], scope: StealthExportScope, credential: SecretExportCredential, passphrase: string, options: PaymentSecretExportOptions): Promise<StealthExportFile> {
  const check = startExport(options.signal);
  const { chainId, count } = describePaymentArchive(matches);
  if (scope === 'single' && count !== 1) throw new UserFacingError({ key: 'error.stealthExport.scopeMismatch' });
  const rpc = requireRpc(options.rpc, chainId);
  requireNewPassphrase(passphrase);
  const distinct = distinctPayments(matches);
  const authorized = await authorize(credential, options.signal, check);
  // Main's single-payment safeguard (07722292): the scan's saved route must still be selected before any address is sent
  // and before the archive is returned.
  const still = (): void => { authorized(); rpc.assertCurrent?.(); };
  still();
  for (const m of distinct) await assertPlainAccount(rpc, m.stealthAddress, still, options.signal);
  const payments: VerifiedStealthPayment[] = [];
  try {
    const exportedAt = new Date();
    for (const m of distinct) payments.push(verifiedPayment(m, exportedAt));
    const text = await encryptPaymentKeys(payments, { scope, passphrase, ...cost(options.N) });
    still();
    return { filename: scope === 'single' ? STEALTH_EXPORT_FILENAMES.keypair : STEALTH_EXPORT_FILENAMES.keypairs, text, type: 'application/json' };
  } finally {
    zeroize(...payments.map((p) => p.secret));
  }
}

/** `ghostpay-stealth-master-v1`: the loaded spending and viewing keys only, never the invoice-signing key. */
export async function exportMasterBackup(credential: SecretExportCredential, passphrase: string, options: SecretExportOptions = {}): Promise<StealthExportFile> {
  const check = startExport(options.signal);
  requireNewPassphrase(passphrase);
  const still = await authorize(credential, options.signal, check);
  const exportedAt = new Date();
  const text = await withSessionSecretsAsync((s) => encryptMasterBackup({ spendingSecret: s.keys.spendingSecret, viewingSecret: s.keys.viewingSecret }, { passphrase, exportedAt, ...cost(options.N) }));
  still();
  return { filename: STEALTH_EXPORT_FILENAMES.master, text, type: 'application/json' };
}

function closed(): never {
  throw new UserFacingError({ key: 'error.paymentKeyExport.recoveredKeysClosed' });
}

/** Lends a boxed key to `fn` as a scalar and wipes both copies afterwards; a disposed box reports a closed export. */
function useBoxed<T>(box: SecretBox | undefined, fn: (secret: SecretScalar) => T): T {
  if (box === undefined || box.disposed) return closed();
  return box.use((bytes) => {
    const secret = secretScalarFromBytes(bytes);
    try {
      return fn(secret);
    } finally {
      zeroize(secret);
    }
  });
}

/** Decrypted payment keys of an opened `ghostpay-stealth-keypair-v1` file, held boxed until {@link dispose}. */
export class RecoveredPaymentKeys {
  readonly #boxes: readonly SecretBox[];
  readonly #unchanged: () => void;

  private constructor(public readonly header: StealthKeypairHeader, boxes: readonly SecretBox[], unchanged: () => void) {
    this.#boxes = boxes;
    this.#unchanged = unchanged;
  }

  /** Moves the decrypted scalars into boxes (wiping the scalars, also when boxing fails). */
  public static take(header: StealthKeypairHeader, payments: readonly VerifiedStealthPayment[]): RecoveredPaymentKeys {
    const boxes: SecretBox[] = [];
    try {
      const unchanged = captureSessionVersionGuard();
      for (const p of payments) boxes.push(SecretBox.copyOf(p.secret, { label: 'payment' }));
      return new RecoveredPaymentKeys(header, boxes, unchanged);
    } catch (error) {
      for (const b of boxes) b.dispose();
      zeroize(...payments.map((p) => p.secret));
      throw error;
    }
  }

  /** Raw private-key text of entry `index`, after the user's second confirmation. */
  public rawKeyFile(index: number, confirmed: true): StealthExportFile {
    if ((confirmed as unknown) !== true) throw new UserFacingError({ key: 'error.paymentKeyExport.confirmRawKey' });
    const record = this.header.payments[index];
    if (record === undefined || this.disposed) return closed();
    try {
      // A resumed click or direct caller can precede browser lock events. Check the deadline and the recovery's
      // original session revision at each secret loan, including a recovery that began without loaded seller keys.
      this.#unchanged();
      const text = useBoxed(this.#boxes[index], (secret) => formatRawPrivateKey(record, secret));
      this.#unchanged();
      return { filename: STEALTH_EXPORT_FILENAMES.privateKey, text, type: 'text/plain' };
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get disposed(): boolean {
    return this.#boxes.every((b) => b.disposed);
  }

  /** Best-effort wipe of every held key. */
  public dispose(): void {
    for (const b of this.#boxes) b.dispose();
  }
}

/** Decrypted master keys of an opened `ghostpay-stealth-master-v1` file, held boxed until installed or disposed. */
export class RecoveredMasterKeys {
  readonly #spending: SecretBox;
  readonly #viewing: SecretBox;
  readonly #unchanged: () => void;

  private constructor(public readonly header: StealthMasterHeader, spending: SecretBox, viewing: SecretBox, unchanged: () => void) {
    this.#spending = spending;
    this.#viewing = viewing;
    this.#unchanged = unchanged;
  }

  /** Moves the decrypted scalars into boxes (wiping the scalars, also when boxing fails). */
  public static take(header: StealthMasterHeader, spending: SecretScalar, viewing: SecretScalar): RecoveredMasterKeys {
    let spendingBox: SecretBox | undefined;
    try {
      const unchanged = captureSessionVersionGuard();
      spendingBox = SecretBox.copyOf(spending, { label: 'spending' });
      return new RecoveredMasterKeys(header, spendingBox, SecretBox.copyOf(viewing, { label: 'viewing' }), unchanged);
    } catch (error) {
      spendingBox?.dispose();
      throw error;
    } finally {
      zeroize(spending, viewing);
    }
  }

  /** True when the loaded keys already are these spending and viewing keys. */
  public get loaded(): boolean {
    return getSessionPublic()?.metaAddress === this.header.metaAddress;
  }

  public get disposed(): boolean {
    return this.#spending.disposed || this.#viewing.disposed;
  }

  /**
   * Loads the keys through the hex-import path with a newly generated invoice-signing key (the master format never holds
   * one), replacing any loaded keys; the caller has already applied the unsaved-keys confirmation (L1-01). Disposes the
   * boxes on every path. The hex text exists only for this call (JavaScript strings cannot be wiped).
   */
  public install(): SessionPublic {
    try {
      if (this.disposed) return closed();
      this.#unchanged();
      const spendingKeyHex = useBoxed(this.#spending, (s) => bytesToHex(s));
      const viewingKeyHex = useBoxed(this.#viewing, (s) => bytesToHex(s));
      this.#unchanged();
      return importSession({ spendingKeyHex, viewingKeyHex });
    } finally {
      this.dispose();
    }
  }

  /** Best-effort wipe of both held keys. */
  public dispose(): void {
    this.#spending.dispose();
    this.#viewing.dispose();
  }
}

export type OpenedStealthExport =
  | { readonly kind: 'public'; readonly record: StealthPublicRecord }
  | { readonly kind: 'keypair'; readonly keys: RecoveredPaymentKeys }
  | { readonly kind: 'master'; readonly keys: RecoveredMasterKeys };

/** Authenticated public metadata only; verification never returns or installs decrypted keys. */
export type VerifiedStealthExport =
  | { readonly kind: 'keypair'; readonly header: StealthKeypairHeader }
  | { readonly kind: 'master'; readonly header: StealthMasterHeader };

export interface OpenStealthExportOptions {
  /** Requires this chain for public/payment files. Chain-neutral master files cannot satisfy this constraint. */
  readonly expectedChainId?: number;
  /** Closing the panel aborts: a file decrypted afterwards is wiped and nothing is returned. */
  readonly signal?: AbortSignal;
}

/**
 * Recovery (spec 18 flow 4): opens any `ghostpay-stealth-*` file in this browser without the original installation or
 * loaded keys. Every check of the codec applies and import is atomic. A public record needs no passphrase and proves no
 * ownership. Decrypted keys come back boxed; the caller disposes them.
 */
export async function openStealthExport(text: string, passphrase: string, options: OpenStealthExportOptions = {}): Promise<OpenedStealthExport> {
  const assertOpen = (): void => { if (options.signal?.aborted === true) throw new UserFacingError(CANCELLED); };
  assertOpen();
  const unchanged = captureSessionVersionGuard();
  if (text.length > STEALTH_EXPORT_LIMITS.keypairFileBytes) throw new UserFacingError({ key: 'error.stealthExport.tooLarge' });
  const format = detectStealthExportFormat(text);
  if (format === 'public') {
    const record = parsePublicRecord(text);
    if (options.expectedChainId !== undefined && record.chainId !== options.expectedChainId) throw new UserFacingError({ key: 'error.stealthExport.wrongChain' });
    return { kind: 'public', record };
  }
  if (format === 'keypair') {
    const opened = await decryptPaymentKeys(text, passphrase, options.expectedChainId === undefined ? {} : { expectedChainId: options.expectedChainId });
    const keys = RecoveredPaymentKeys.take(opened.header, opened.payments);
    try {
      assertOpen();
      unchanged();
      return { kind: 'keypair', keys };
    } catch (error) {
      keys.dispose();
      throw error;
    }
  }
  if (format === 'master') {
    if (options.expectedChainId !== undefined) throw new UserFacingError({ key: 'error.stealthExport.wrongChain' });
    const opened = await decryptMasterBackup(text, passphrase);
    const keys = RecoveredMasterKeys.take(opened.header, opened.spendingSecret, opened.viewingSecret);
    try {
      assertOpen();
      unchanged();
      return { kind: 'master', keys };
    } catch (error) {
      keys.dispose();
      throw error;
    }
  }
  throw new UserFacingError({ key: 'error.stealthExport.invalidFile' });
}

/**
 * Checks an existing backup without importing it or changing the current wallet's custody status. Authentication and
 * address/key validation use the recovery path; owned key boxes are disposed before returning even on cancellation or a
 * session change. A public record has no spending authority and can never count as a recoverable backup.
 */
export async function verifyStealthExport(text: string, passphrase: string, options: OpenStealthExportOptions = {}): Promise<VerifiedStealthExport> {
  const unchanged = captureSessionVersionGuard();
  const opened = await openStealthExport(text, passphrase, options);
  if (opened.kind === 'public') throw new UserFacingError({ key: 'error.paymentKeyExport.publicRecordIsNotBackup' });
  try {
    unchanged();
    if (options.signal?.aborted === true) throw new UserFacingError(CANCELLED);
    return opened.kind === 'keypair'
      ? { kind: 'keypair', header: opened.keys.header }
      : { kind: 'master', header: opened.keys.header };
  } finally {
    opened.keys.dispose();
  }
}

// i18n-use: error.paymentKeyExport.unsupportedChain error.paymentKeyExport.noRpc error.paymentKeyExport.wrongChain error.paymentKeyExport.codeCheckFailed error.paymentKeyExport.contractAccount error.paymentKeyExport.noPayments error.paymentKeyExport.confirmRawKey error.paymentKeyExport.recoveredKeysClosed error.paymentKeyExport.publicRecordIsNotBackup
