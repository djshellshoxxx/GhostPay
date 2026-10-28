import {
  encodeMetaAddress,
  generateKeySet,
  parseCompressedPoint,
  randomScalar,
  secretScalarFromBytes,
  zeroize,
  type CompressedPoint,
  type SecretScalar,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { SecretBox, wipe } from '@ghostpay/secret-box';
import { hexToBytes } from '@noble/hashes/utils.js';
import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { decryptKeystore, encryptKeystore, type KeystoreOptions } from './keystore';
import { UserFacingError } from './errors';

/**
 * In-memory seller key holder. The three private scalars are held as `SecretBox` values (closure/WeakMap storage, not
 * `Uint8Array` subtypes), so spread, `structuredClone`/`postMessage`, `Array.from` and `slice` of the stored value see no
 * key bytes (audit S3-08). Code that needs a scalar borrows a temporary `SecretScalar` through `withSessionSecrets`,
 * which wipes it afterwards. Nothing here touches web storage. React state only ever receives the public summary.
 */
export interface SessionPublic {
  readonly metaAddress: string;
  readonly signerPublicKey: string;
  readonly spendingPublicKey: string;
  readonly viewingPublicKey: string;
}

export interface SessionSecrets {
  readonly keys: StealthKeySet;
  readonly signingKey: SecretScalar;
}

interface Stored {
  readonly spending: SecretBox;
  readonly viewing: SecretBox;
  readonly signing: SecretBox;
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
}

/**
 * Where copies of the loaded keys exist (L1-01) and which encrypted vault record guards spending and export (L1-02).
 * It is reset whenever keys are installed or wiped, and kept apart from `SessionPublic`, so recording a backup never looks
 * like a key change to the views that reset on one.
 */
interface Custody {
  /**
   * The user holds a copy outside this browser profile: the keys were imported (a keystore, or hex with its signing key)
   * or a keystore was downloaded.
   */
  readonly external: boolean;
  /** The vault record these keys were unlocked from, saved to or verified against. Kept after the record is deleted. */
  readonly vaultRecord: string | undefined;
  /** That record is still saved in this browser, as far as this tab knows. */
  readonly vaultStored: boolean;
  /** The seller typed the waiver to invoice and share before backing up. */
  readonly waived: boolean;
}

/** React-facing summary of the custody state; it holds no ciphertext. */
export interface SessionBackup {
  /** A copy of the loaded keys exists outside this tab's memory. Until then the idle lock never wipes them (L1-01). */
  readonly backedUp: boolean;
  /** The seller typed the waiver: invoicing and sharing are allowed, the keys are still not backed up. */
  readonly waived: boolean;
  /** Sweeps and key export need the passphrase of the vault these keys are tied to (L1-02). */
  readonly vaultStepUp: boolean;
}

let current: Stored | undefined;
let custody: Custody | undefined;
let backupSummary: SessionBackup | undefined;
// Changes even across empty -> populated -> empty transitions, so an async decrypt cannot install stale keys.
let sessionRevision = 0;
/** Compatibility copies handed out by {@link requireSession}; wiped when the session clears (bounded). */
let issued: SecretScalar[] = [];
const MAX_ISSUED = 8;
const listeners = new Set<() => void>();
const backupListeners = new Set<() => void>();
const idleLockListeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
  for (const l of backupListeners) l();
}

/** Subscribes to session changes (used by `useSyncExternalStore`). */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribes to backup-state changes, which never count as session changes (used by `useSyncExternalStore`). */
export function subscribeSessionBackup(listener: () => void): () => void {
  backupListeners.add(listener);
  return () => backupListeners.delete(listener);
}

/**
 * Subscribes to the app's idle lock, which runs also while keys stay loaded (unsaved keys) or none are: views forget the
 * key hex and passphrases typed into them (G2-05, KL-26).
 */
export function subscribeIdleLock(listener: () => void): () => void {
  idleLockListeners.add(listener);
  return () => idleLockListeners.delete(listener);
}

/** Called by the idle lock (App.tsx) whether or not it wipes the keys. */
export function notifyIdleLock(): void {
  for (const l of [...idleLockListeners]) l();
}

/** Snapshot for `useSyncExternalStore`; undefined without keys, stable identity between changes. */
export function getSessionBackup(): SessionBackup | undefined {
  return backupSummary;
}

function setCustody(next: Custody | undefined, notify: boolean): void {
  custody = next;
  const summary = next === undefined ? undefined : { backedUp: next.external || next.vaultStored, waived: next.waived, vaultStepUp: next.vaultRecord !== undefined };
  const same = summary?.backedUp === backupSummary?.backedUp && summary?.waived === backupSummary?.waived && summary?.vaultStepUp === backupSummary?.vaultStepUp;
  if (same && (summary === undefined) === (backupSummary === undefined)) return;
  backupSummary = summary;
  if (notify) for (const l of backupListeners) l();
}

function updateCustody(guard: () => void, change: (c: Custody) => Custody): void {
  guard();
  if (custody !== undefined) setCustody(change(custody), true);
}

/** Records that the loaded keys were downloaded as an encrypted keystore; `guard` must still accept the session. */
export function markKeystoreDownloaded(guard: () => void): void {
  updateCustody(guard, (c) => ({ ...c, external: true }));
}

/** Records the typed waiver: invoices and the meta-address may be shared before a backup exists (L1-01). */
export function waiveSessionBackup(): void {
  updateCustody(() => undefined, (c) => ({ ...c, waived: true }));
}

/** The vault record that guards spending and export for the loaded keys, if any (L1-02). */
export function sessionVaultRecord(): string | undefined {
  return custody?.vaultRecord;
}

/** True when a copy exists outside this browser profile (imported keys or a downloaded keystore). */
export function sessionHasExternalCopy(): boolean {
  return custody?.external === true;
}

/**
 * Ties the loaded keys to a vault record that holds them (L1-02). `replace` is for a record the user just saved after any
 * step-up; otherwise the first record stays, so a vault saved elsewhere later cannot swap the step-up passphrase.
 * `stored` marks a record saved here whose passphrase the user chose or proved, which makes it a backup (L1-01).
 */
export function armSessionVault(record: string, guard: () => void, options: { readonly replace?: boolean; readonly stored?: boolean } = {}): void {
  updateCustody(guard, (c) => ({
    ...c,
    vaultRecord: c.vaultRecord === undefined || options.replace === true ? record : c.vaultRecord,
    vaultStored: options.stored === true ? true : c.vaultStored,
  }));
}

/** `record` is no longer saved here (deleted, or found missing); if it was the keys' backup they count as unsaved again. The step-up stays armed. */
export function forgetSessionVaultCopy(record: string): void {
  if (custody?.vaultRecord === record) setCustody({ ...custody, vaultStored: false }, true);
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function summarize(s: SessionSecrets): SessionPublic {
  return {
    metaAddress: encodeMetaAddress(s.keys),
    signerPublicKey: signerPublicKeyHex(s.signingKey),
    spendingPublicKey: toHex(s.keys.spendingPublicKey),
    viewingPublicKey: toHex(s.keys.viewingPublicKey),
  };
}

/** Moves freshly created scalars into boxes (wiping the scalars) and returns the stored form. */
function box(next: SessionSecrets): Stored {
  return {
    spending: SecretBox.copyOf(next.keys.spendingSecret, { label: 'spending' }),
    viewing: SecretBox.copyOf(next.keys.viewingSecret, { label: 'viewing' }),
    signing: SecretBox.copyOf(next.signingKey, { label: 'signing' }),
    spendingPublicKey: next.keys.spendingPublicKey,
    viewingPublicKey: next.keys.viewingPublicKey,
  };
}

function scalarOf(b: SecretBox): SecretScalar {
  return b.use((bytes) => secretScalarFromBytes(bytes));
}

function open(s: Stored): SessionSecrets {
  return {
    keys: { spendingSecret: scalarOf(s.spending), viewingSecret: scalarOf(s.viewing), spendingPublicKey: s.spendingPublicKey, viewingPublicKey: s.viewingPublicKey },
    signingKey: scalarOf(s.signing),
  };
}

function wipeOpened(o: SessionSecrets): void {
  zeroize(o.keys.spendingSecret, o.keys.viewingSecret, o.signingKey);
}

let publicSummary: SessionPublic | undefined;

/** Snapshot for `useSyncExternalStore`; stable identity between changes. */
export function getSessionPublic(): SessionPublic | undefined {
  return publicSummary;
}

/** How freshly installed keys can be recovered: generated keys exist nowhere else yet. */
type Origin = { readonly from: 'generated' | 'import' } | { readonly from: 'vault'; readonly record: string };

function install(next: SessionSecrets, origin: Origin): SessionPublic {
  if (next.signingKey.every((byte, i) => byte === next.keys.spendingSecret[i]) || next.signingKey.every((byte, i) => byte === next.keys.viewingSecret[i])) throw new UserFacingError('The invoice-signing key must be independent of spending and viewing keys.');
  clearSession(false);
  // Summarize first: boxing wipes the scalars.
  publicSummary = summarize(next);
  current = box(next);
  const vault = origin.from === 'vault' ? origin.record : undefined;
  setCustody({ external: origin.from === 'import', vaultRecord: vault, vaultStored: vault !== undefined, waived: false }, false);
  emit();
  return publicSummary;
}

/** Generates fresh, independent spending, viewing and invoice-signing keys. They have no backup until one is made. */
export function generateSession(): SessionPublic {
  return install({ keys: generateKeySet(), signingKey: randomScalar() }, { from: 'generated' });
}

export interface ImportedHex {
  readonly spendingKeyHex: string;
  readonly viewingKeyHex: string;
  /**
   * Optional: when omitted a fresh invoice-signing key is generated (it is a separate key by design, ADR-0002). That key
   * exists only in this tab, so the keys count as unsaved until a keystore download or a vault save (C-R6).
   */
  readonly signingKeyHex?: string;
}

function scalarFromHex(hex: string, label: string): SecretScalar {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new UserFacingError(`${label} must be 64 hexadecimal characters.`);
  const bytes = Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16));
  try {
    return secretScalarFromBytes(bytes);
  } catch {
    throw new UserFacingError(`${label} is not a valid secp256k1 private key.`);
  } finally {
    zeroize(bytes);
  }
}

function keySetFromScalars(spending: SecretScalar, viewing: SecretScalar): StealthKeySet {
  if (spending.every((b, i) => b === viewing[i])) throw new UserFacingError('Spending and viewing keys must differ.');
  const pub = (secret: SecretScalar): CompressedPoint => parseCompressedPoint(hexToBytes(signerPublicKeyHex(secret)));
  return { spendingSecret: spending, viewingSecret: viewing, spendingPublicKey: pub(spending), viewingPublicKey: pub(viewing) };
}

/** Imports keys typed or pasted by the user. Keys stay in memory only. */
export function importSession(input: ImportedHex): SessionPublic {
  let spending: SecretScalar | undefined;
  let viewing: SecretScalar | undefined;
  let signing: SecretScalar | undefined;
  try {
    spending = scalarFromHex(input.spendingKeyHex, 'Spending key');
    viewing = scalarFromHex(input.viewingKeyHex, 'Viewing key');
    const generatedSigner = input.signingKeyHex === undefined || input.signingKeyHex.trim() === '';
    signing = generatedSigner ? randomScalar() : scalarFromHex(input.signingKeyHex, 'Signing key');
    // The user typed or pasted these keys, so a copy exists outside this tab; a signing key generated here does not.
    return install({ keys: keySetFromScalars(spending, viewing), signingKey: signing }, { from: generatedSigner ? 'generated' : 'import' });
  } finally {
    if (spending !== undefined) zeroize(spending);
    if (viewing !== undefined) zeroize(viewing);
    if (signing !== undefined) zeroize(signing);
  }
}

/**
 * Runs `fn` with temporary scalars derived from the boxed keys and wipes them afterwards, also when `fn` throws.
 *
 * @param fn Must not keep the scalars or return them.
 * @throws {UserFacingError} when no keys are loaded.
 */
export function withSessionSecrets<T>(fn: (s: SessionSecrets) => T): T {
  if (current === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  const opened = open(current);
  try {
    return fn(opened);
  } finally {
    wipeOpened(opened);
  }
}

/** Async variant of {@link withSessionSecrets}: the temporaries are wiped when the promise settles. */
export async function withSessionSecretsAsync<T>(fn: (s: SessionSecrets) => Promise<T>): Promise<T> {
  if (current === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  const opened = open(current);
  try {
    return await fn(opened);
  } finally {
    wipeOpened(opened);
  }
}

/** A fresh plain copy of the viewing key for the scanner worker; the receiver must wipe it (runScan does). */
export function revealViewingKey(): Uint8Array {
  if (current === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  return current.viewing.use((b) => b.slice());
}

/**
 * Compatibility accessor: temporary scalars that live until the session is cleared (at most eight are kept; older
 * copies are wiped). Prefer {@link withSessionSecrets}, which wipes immediately.
 *
 * @deprecated WEB-APP-07 / L1-07: opens all three scalars and keeps them readable until the session clears. Invoice
 * signing no longer uses it; it stays exported only until the remaining callers (Scan, pay.test, sweep.test) move to
 * withSessionSecrets, and is then deleted.
 * @throws {UserFacingError} when no keys are loaded.
 */
export function requireSession(): SessionSecrets {
  if (current === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  const opened = open(current);
  issued.push(opened.keys.spendingSecret, opened.keys.viewingSecret, opened.signingKey);
  while (issued.length > MAX_ISSUED * 3) zeroize(issued.shift() as SecretScalar);
  return opened;
}

export function hasSession(): boolean {
  return current !== undefined;
}

/** Captures session identity even when empty, for async operations that begin before reading a saved vault. */
export function captureSessionVersionGuard(): () => void {
  const revision = sessionRevision;
  return () => {
    if (sessionRevision !== revision) throw new UserFacingError('Seller keys changed during this action. Try again.');
  };
}

/** Captures the loaded key holder and rejects use if it is cleared or replaced during an async operation. */
export function captureSessionGuard(): () => void {
  const expected = current;
  const revision = sessionRevision;
  if (expected === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  return () => {
    if (current !== expected || sessionRevision !== revision) throw new UserFacingError('Seller keys changed during this action. Try again.');
  };
}

/**
 * Verifies an explicit spending step-up against the saved encrypted vault and the currently loaded public identity.
 * The decrypted key bytes and temporary scalars are wiped before this promise resolves.
 */
export async function verifyVaultForCurrentSession(ciphertext: string, passphrase: string): Promise<() => void> {
  const guard = captureSessionGuard();
  const expected = publicSummary;
  if (expected === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  const secrets = await decryptKeystore(ciphertext, passphrase);
  let spending: SecretScalar | undefined;
  let viewing: SecretScalar | undefined;
  let signing: SecretScalar | undefined;
  try {
    spending = secretScalarFromBytes(secrets.spendingKey);
    viewing = secretScalarFromBytes(secrets.viewingKey);
    signing = secretScalarFromBytes(secrets.signingKey);
    const candidate = summarize({ keys: keySetFromScalars(spending, viewing), signingKey: signing });
    if (candidate.metaAddress !== expected.metaAddress || candidate.signerPublicKey !== expected.signerPublicKey) {
      throw new UserFacingError('The saved encrypted vault does not match the loaded seller keys.');
    }
    guard();
    return guard;
  } finally {
    if (spending !== undefined) zeroize(spending);
    if (viewing !== undefined) zeroize(viewing);
    if (signing !== undefined) zeroize(signing);
    wipe(secrets.spendingKey, secrets.viewingKey, secrets.signingKey);
  }
}

/** Best-effort wipe and forget. */
export function clearSession(notify = true): void {
  sessionRevision++;
  if (current !== undefined) {
    current.spending.dispose();
    current.viewing.dispose();
    current.signing.dispose();
  }
  zeroize(...issued);
  issued = [];
  current = undefined;
  publicSummary = undefined;
  setCustody(undefined, false);
  if (notify) emit();
}

/** Encrypted backup text. Raw keys exist only for the duration of the call. */
export async function exportKeystore(passphrase: string, options: KeystoreOptions = {}): Promise<string> {
  if (current === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  const { spending, viewing, signing } = current;
  const pub = publicSummary as SessionPublic;
  const spendingKey = spending.use((b) => b.slice());
  const viewingKey = viewing.use((b) => b.slice());
  const signingKey = signing.use((b) => b.slice());
  try {
    return await encryptKeystore({ spendingKey, viewingKey, signingKey }, { metaAddress: pub.metaAddress, signer: pub.signerPublicKey }, passphrase, options);
  } finally {
    wipe(spendingKey, viewingKey, signingKey);
  }
}

/**
 * Decrypts a keystore and loads it into memory. `from: 'vault'` (keyVault.ts) ties the keys to that vault record for the
 * spending step-up (L1-02); a keystore file is a copy outside this browser (L1-01).
 */
export async function importKeystore(text: string, passphrase: string, signal?: AbortSignal, from: 'file' | 'vault' = 'file'): Promise<SessionPublic> {
  const assertOpen = (): void => { if (signal?.aborted === true) throw new UserFacingError('The keystore import was closed.'); };
  assertOpen();
  const revision = sessionRevision;
  const secrets = await decryptKeystore(text, passphrase);
  let spending: SecretScalar | undefined;
  let viewing: SecretScalar | undefined;
  let signing: SecretScalar | undefined;
  try {
    assertOpen();
    if (sessionRevision !== revision) throw new UserFacingError('Seller keys changed while the keystore was unlocking. Try again.');
    spending = secretScalarFromBytes(secrets.spendingKey);
    viewing = secretScalarFromBytes(secrets.viewingKey);
    signing = secretScalarFromBytes(secrets.signingKey);
    return install({ keys: keySetFromScalars(spending, viewing), signingKey: signing }, from === 'vault' ? { from: 'vault', record: text } : { from: 'import' });
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError('The keystore contains invalid keys.');
  } finally {
    if (spending !== undefined) zeroize(spending);
    if (viewing !== undefined) zeroize(viewing);
    if (signing !== undefined) zeroize(signing);
    zeroize(secrets.spendingKey, secrets.viewingKey, secrets.signingKey);
  }
}
