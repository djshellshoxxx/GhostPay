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
import { purgeInvoiceDrafts } from './invoiceDraftSlots';

/**
 * In-memory seller key holder. The three private scalars are held as `SecretBox` values (closure/WeakMap storage, not
 * `Uint8Array` subtypes), so spread, `structuredClone`/`postMessage`, `Array.from` and `slice` of the stored value see no
 * key bytes (audit S3-08). Code that needs a scalar borrows a temporary `SecretScalar` through `withSessionSecrets`,
 * which wipes it afterwards. Nothing here stores anything in web storage; clearing the keys only removes the opt-in invoice
 * drafts from tab storage ({@link clearSession}). React state only ever receives the public summary.
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
   * A copy outside this browser profile. `verified`: the keys were imported (a keystore, or hex with its signing key), or a
   * downloaded keystore was opened again with its passphrase and holds exactly these keys. `unverified`: a keystore was
   * downloaded, but nothing proves the file reached the disk intact (GP-PAGES-02); it grants neither verification nor permission to wipe.
   */
  readonly external: 'none' | 'unverified' | 'verified';
  /**
   * The user holds the spending and viewing keys outside this browser profile, so payments to them stay sweepable without
   * this tab: they were imported, also as hex whose signing key was generated here (C-R10).
   */
  readonly paymentKeysExternal: boolean;
  /** The vault record these keys were unlocked from, saved to or verified against. Kept after the record is deleted. */
  readonly vaultRecord: string | undefined;
  /** That record is still saved in this browser, as far as this tab knows. */
  readonly vaultStored: boolean;
  /** The seller typed the waiver to invoice and share before backing up. */
  readonly waived: boolean;
}

/** React-facing summary of the custody state; it holds no ciphertext. */
export interface SessionBackup {
  /** A copy of the loaded keys exists outside this tab's memory. Unconfirmed copies stay retained, with authority suspended, at idle. */
  readonly backedUp: boolean;
  /**
   * That copy is proven: imported keys, a vault record whose passphrase the user chose or proved, or a downloaded keystore
   * verified against the loaded keys. A download alone is `backedUp` but not `verified`, and the idle lock keeps the keys
   * until it is (GP-PAGES-02).
   */
  readonly verified: boolean;
  /**
   * Not backed up, but only the invoice-signing key generated at a hex import lacks a copy. Payments stay sweepable with
   * the typed hex; idle retains the sole signer for encrypted recovery while ordinary key use stays suspended.
   */
  readonly signerOnly: boolean;
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
let suspended = false;
const asyncSecretCopies = new Set<readonly Uint8Array[]>();
const expiryChecks = new Set<() => void>();
let checkingExpiry = false;
const listeners = new Set<() => void>();
const backupListeners = new Set<() => void>();

function notifyObservers(observers: ReadonlySet<() => void>): void {
  // One view must not prevent the remaining observers from receiving a revocation.
  for (const listener of [...observers]) {
    try { listener(); } catch { /* Continue notifying the remaining consumers. */ }
  }
}

function emit(): void {
  notifyObservers(listeners);
  notifyObservers(backupListeners);
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

/** Registers a synchronous deadline check at private-key and async-result boundaries. */
export function subscribeSessionExpiryCheck(check: () => void): () => void {
  expiryChecks.add(check);
  return () => expiryChecks.delete(check);
}

function checkSessionExpiry(): void {
  if (checkingExpiry) return;
  checkingExpiry = true;
  try {
    for (const check of [...expiryChecks]) check();
  } finally {
    checkingExpiry = false;
  }
}

function wipeAsyncCopies(): void {
  for (const copies of asyncSecretCopies) wipe(...copies);
  asyncSecretCopies.clear();
}

/** True while a retained copy is available only for encrypted backup and normal restoration. */
export function isSessionSuspended(): boolean {
  return suspended;
}

/** Revokes active authority immediately without destroying a potentially sole recoverable copy. */
export function suspendSession(): void {
  sessionRevision++;
  suspended = current !== undefined;
  wipeAsyncCopies();
  emit();
}

/** Snapshot for `useSyncExternalStore`; undefined without keys, stable identity between changes. */
export function getSessionBackup(): SessionBackup | undefined {
  return backupSummary;
}

function setCustody(next: Custody | undefined, notify: boolean): void {
  custody = next;
  const backedUp = next !== undefined && (next.external !== 'none' || next.vaultStored);
  const verified = next !== undefined && (next.external === 'verified' || next.vaultStored);
  const summary = next === undefined ? undefined : { backedUp, verified, signerOnly: !backedUp && next.paymentKeysExternal, waived: next.waived, vaultStepUp: next.vaultRecord !== undefined };
  const same = summary?.backedUp === backupSummary?.backedUp && summary?.verified === backupSummary?.verified && summary?.signerOnly === backupSummary?.signerOnly && summary?.waived === backupSummary?.waived && summary?.vaultStepUp === backupSummary?.vaultStepUp;
  if (same && (summary === undefined) === (backupSummary === undefined)) return;
  backupSummary = summary;
  if (notify) notifyObservers(backupListeners);
}

function updateCustody(guard: () => void, change: (c: Custody) => Custody): void {
  guard();
  if (custody !== undefined) setCustody(change(custody), true);
}

/**
 * Records that the loaded keys were downloaded as an encrypted keystore; `guard` must still accept the session. The copy
 * counts as unverified until {@link verifyDownloadedBackup} opens the file again (GP-PAGES-02); a verified copy stays verified.
 */
export function markKeystoreDownloaded(guard: () => void): void {
  updateCustody(guard, (c) => ({ ...c, external: c.external === 'verified' ? 'verified' : 'unverified' }));
}

/** Records the typed waiver: invoices and the meta-address may be shared before a backup exists (L1-01). */
export function waiveSessionBackup(): void {
  updateCustody(() => undefined, (c) => ({ ...c, waived: true }));
}

/** The vault record that guards spending and export for the loaded keys, if any (L1-02). */
export function sessionVaultRecord(): string | undefined {
  return custody?.vaultRecord;
}

/** True when a proven copy exists outside this browser profile (imported keys, or a downloaded keystore verified against them). */
export function sessionHasExternalCopy(): boolean {
  return custody?.external === 'verified';
}

/** True when a keystore was downloaded but never verified against the loaded keys (GP-PAGES-02). */
export function sessionHasUnverifiedCopy(): boolean {
  return custody?.external === 'unverified';
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
  let spending: SecretBox | undefined;
  let viewing: SecretBox | undefined;
  let signing: SecretBox | undefined;
  try {
    spending = SecretBox.copyOf(next.keys.spendingSecret, { label: 'spending' });
    viewing = SecretBox.copyOf(next.keys.viewingSecret, { label: 'viewing' });
    signing = SecretBox.copyOf(next.signingKey, { label: 'signing' });
    return { spending, viewing, signing, spendingPublicKey: next.keys.spendingPublicKey, viewingPublicKey: next.keys.viewingPublicKey };
  } catch (error) {
    spending?.dispose(); viewing?.dispose(); signing?.dispose();
    throw error;
  }
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

/**
 * How freshly installed keys can be recovered: generated keys exist nowhere else yet, and hex imported without its signing
 * key loads the spending and viewing keys again, but not the signing key generated for it here (C-R10).
 */
type Origin = { readonly from: 'generated' | 'import' | 'import-new-signer' } | { readonly from: 'vault'; readonly record: string };

function install(next: SessionSecrets, origin: Origin): SessionPublic {
  let nextSummary: SessionPublic;
  let nextStored: Stored;
  try {
    if (next.signingKey.every((byte, i) => byte === next.keys.spendingSecret[i]) || next.signingKey.every((byte, i) => byte === next.keys.viewingSecret[i])) throw new UserFacingError({ key: 'error.session.theInvoiceSigningKeyMustBeIndependentOfSpendingAnd' });
    // Prepare the complete replacement before wiping the current wallet. A failed allocation must preserve its keys,
    // custody state and revision. Summarize first because boxing consumes the new scalars.
    nextSummary = summarize(next);
    nextStored = box(next);
  } finally {
    wipeOpened(next);
  }
  clearSession(false);
  publicSummary = nextSummary;
  current = nextStored;
  const vault = origin.from === 'vault' ? origin.record : undefined;
  const imported = origin.from === 'import' || origin.from === 'import-new-signer';
  setCustody({ external: origin.from === 'import' ? 'verified' : 'none', paymentKeysExternal: imported, vaultRecord: vault, vaultStored: vault !== undefined, waived: false }, false);
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
   * exists only in this tab, so the keys count as unsaved until a keystore download or a vault save (C-R6); since the hex
   * loads the spending and viewing keys again, only the signing key is reported missing, and the idle lock wipes them (C-R10).
   */
  readonly signingKeyHex?: string;
}

const KEY_ERRORS = {
  'Spending key': { format: 'error.session.spendingFormat', invalid: 'error.session.spendingInvalid' },
  'Viewing key': { format: 'error.session.viewingFormat', invalid: 'error.session.viewingInvalid' },
  'Signing key': { format: 'error.session.signingFormat', invalid: 'error.session.signingInvalid' },
} as const;
function scalarFromHex(hex: string, label: keyof typeof KEY_ERRORS): SecretScalar {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new UserFacingError({ key: KEY_ERRORS[label].format });
  const bytes = Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16));
  try {
    return secretScalarFromBytes(bytes);
  } catch {
    throw new UserFacingError({ key: KEY_ERRORS[label].invalid });
  } finally {
    zeroize(bytes);
  }
}

function keySetFromScalars(spending: SecretScalar, viewing: SecretScalar): StealthKeySet {
  if (spending.every((b, i) => b === viewing[i])) throw new UserFacingError({ key: 'error.session.spendingAndViewingKeysMustDiffer' });
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
    return install({ keys: keySetFromScalars(spending, viewing), signingKey: signing }, { from: generatedSigner ? 'import-new-signer' : 'import' });
  } finally {
    if (spending !== undefined) zeroize(spending);
    if (viewing !== undefined) zeroize(viewing);
    if (signing !== undefined) zeroize(signing);
  }
}

function activeSession(): Stored {
  checkSessionExpiry();
  if (current === undefined) throw new UserFacingError({ key: 'error.session.loadOrGenerateSellerKeysFirstSellerKeys' });
  if (suspended) throw new UserFacingError({ key: 'error.session.lockedBackupOnly' });
  return current;
}

/**
 * Runs `fn` with temporary scalars derived from the boxed keys and wipes them afterwards, also when `fn` throws.
 *
 * @param fn Must not keep the scalars or return them.
 * @throws {UserFacingError} when no keys are loaded.
 */
export function withSessionSecrets<T>(fn: (s: SessionSecrets) => T): T {
  const opened = open(activeSession());
  try {
    return fn(opened);
  } finally {
    wipeOpened(opened);
  }
}

/** Async variant of {@link withSessionSecrets}: the temporaries are wiped when the promise settles. */
export async function withSessionSecretsAsync<T>(fn: (s: SessionSecrets) => Promise<T>): Promise<T> {
  const holder = activeSession();
  const guard = keyHolderGuard(holder, sessionRevision);
  const opened = open(holder);
  const copies = [opened.keys.spendingSecret, opened.keys.viewingSecret, opened.signingKey];
  asyncSecretCopies.add(copies);
  try {
    const result = await fn(opened);
    guard();
    return result;
  } finally {
    asyncSecretCopies.delete(copies);
    wipeOpened(opened);
  }
}

/** A fresh plain copy of the viewing key for the scanner worker; the receiver must wipe it (runScan does). */
export function revealViewingKey(): Uint8Array {
  return activeSession().viewing.use((b) => b.slice());
}

export function hasSession(): boolean {
  return current !== undefined;
}

/**
 * Tracks session revision even when empty or suspended, including recovery reads before a saved vault is known.
 * This is a stale-result guard, not permission for ordinary private-key or wallet operations.
 */
export function captureSessionVersionGuard(): () => void {
  checkSessionExpiry();
  const revision = sessionRevision;
  return () => {
    checkSessionExpiry();
    if (sessionRevision !== revision) throw new UserFacingError({ key: 'error.session.sellerKeysChangedDuringThisActionTryAgain' });
  };
}

/** Active authority for payer operations that do not require loaded seller keys. */
export function captureActiveSessionVersionGuard(): () => void {
  const guard = captureSessionVersionGuard();
  if (suspended) throw new UserFacingError({ key: 'error.session.lockedBackupOnly' });
  return guard;
}

/** Captures the loaded key holder and rejects use if it is cleared or replaced during an async operation. */
export function captureSessionGuard(): () => void {
  const holder = activeSession();
  return keyHolderGuard(holder, sessionRevision);
}

/**
 * A retained copy may be encrypted and verified without authorizing payment, scanning, signing or raw-key disclosure.
 * A second idle boundary still invalidates this guard and any in-flight recovery operation.
 */
export function captureSessionBackupGuard(): () => void {
  checkSessionExpiry();
  if (current === undefined) throw new UserFacingError({ key: 'error.session.loadOrGenerateSellerKeysFirstSellerKeys' });
  return keyHolderGuard(current, sessionRevision);
}

function keyHolderGuard(expected: Stored, revision: number): () => void {
  return () => {
    checkSessionExpiry();
    if (current !== expected || sessionRevision !== revision) throw new UserFacingError({ key: 'error.session.sellerKeysChangedDuringThisActionTryAgain' });
  };
}

/**
 * Decrypts `ciphertext` with `passphrase` and checks that it holds exactly the loaded keys: meta-address, invoice signer
 * and the spending and viewing public keys. Loads and replaces nothing. The decrypted key bytes and temporary scalars are
 * wiped before this promise settles, also when `assertOpen` throws. Resolves to a guard for the same keys.
 */
async function matchLoadedSession(ciphertext: string, passphrase: string, assertOpen: () => void, mismatch: UserFacingError, captureGuard: () => () => void = captureSessionGuard): Promise<() => void> {
  const guard = captureGuard();
  const expected = publicSummary;
  if (expected === undefined) throw new UserFacingError({ key: 'error.session.loadOrGenerateSellerKeysFirstSellerKeys' });
  assertOpen();
  const secrets = await decryptKeystore(ciphertext, passphrase);
  let spending: SecretScalar | undefined;
  let viewing: SecretScalar | undefined;
  let signing: SecretScalar | undefined;
  try {
    assertOpen();
    guard();
    spending = secretScalarFromBytes(secrets.spendingKey);
    viewing = secretScalarFromBytes(secrets.viewingKey);
    signing = secretScalarFromBytes(secrets.signingKey);
    const candidate = summarize({ keys: keySetFromScalars(spending, viewing), signingKey: signing });
    if (candidate.metaAddress !== expected.metaAddress || candidate.signerPublicKey !== expected.signerPublicKey || candidate.spendingPublicKey !== expected.spendingPublicKey || candidate.viewingPublicKey !== expected.viewingPublicKey) {
      throw mismatch;
    }
    guard();
    return guard;
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw mismatch;
  } finally {
    if (spending !== undefined) zeroize(spending);
    if (viewing !== undefined) zeroize(viewing);
    if (signing !== undefined) zeroize(signing);
    wipe(secrets.spendingKey, secrets.viewingKey, secrets.signingKey);
  }
}

/**
 * Verifies an explicit spending step-up against the saved encrypted vault and the currently loaded public identity.
 * The decrypted key bytes and temporary scalars are wiped before this promise resolves.
 */
export async function verifyVaultForCurrentSession(ciphertext: string, passphrase: string): Promise<() => void> {
  return matchLoadedSession(ciphertext, passphrase, () => undefined, new UserFacingError({ key: 'error.session.theSavedEncryptedVaultDoesNotMatchTheLoadedSeller' }));
}

/**
 * Re-authentication for a spec 18 secret export: `text` (a vault record or a keystore backup file) must open with
 * `passphrase` and hold exactly the loaded keys. Resolves to a guard for those keys. Unlike {@link verifyDownloadedBackup}
 * it records nothing: custody, backup and vault state stay as they are, and nothing is loaded or replaced. Rejects when
 * `signal` aborts or the keys change meanwhile; every decrypted secret is wiped on every path.
 */
export async function verifyCredentialForCurrentSession(text: string, passphrase: string, source: 'vault' | 'keystore', signal?: AbortSignal): Promise<() => void> {
  const assertOpen = (): void => { if (signal?.aborted === true) throw new UserFacingError({ key: 'error.session.theSecretExportWasCancelled' }); };
  const mismatch = new UserFacingError({ key: source === 'vault' ? 'error.session.theSavedEncryptedVaultDoesNotMatchTheLoadedSeller' : 'error.session.theBackupFileDoesNotHoldTheLoadedSellerKeys' });
  const guard = await matchLoadedSession(text, passphrase, assertOpen, mismatch);
  assertOpen();
  return guard;
}

/**
 * "Verify backup" (GP-PAGES-02): opens a downloaded keystore file with its passphrase and, only on an exact match with the
 * loaded keys, records the copy as verified, which lets the idle lock and an explicit wipe treat the keys as recoverable.
 * Nothing is loaded or replaced; a wrong passphrase, a damaged file or another seller's keystore change nothing. Rejects
 * when `signal` aborts or the keys change meanwhile; every secret is wiped on every path.
 */
export async function verifyDownloadedBackup(text: string, passphrase: string, signal?: AbortSignal): Promise<void> {
  const assertOpen = (): void => { if (signal?.aborted === true) throw new UserFacingError({ key: 'error.session.theBackupVerificationWasClosed' }); };
  const guard = await matchLoadedSession(text, passphrase, assertOpen, new UserFacingError({ key: 'error.session.theBackupFileDoesNotHoldTheLoadedSellerKeys' }), captureSessionBackupGuard);
  assertOpen();
  updateCustody(guard, (c) => ({ ...c, external: 'verified' }));
}

/**
 * Best-effort wipe and forget. An explicit clear (`notify`, the default) also removes this tab's opt-in encrypted invoice
 * drafts, which have no timer of their own and need no keys to find. Replacing keys (`install` passes `false`) leaves them: a
 * reload, an import of the same keys and a resume of the draft is the documented flow. A suspension keeps them as well.
 */
export function clearSession(notify = true): void {
  sessionRevision++;
  suspended = false;
  wipeAsyncCopies();
  if (current !== undefined) {
    current.spending.dispose();
    current.viewing.dispose();
    current.signing.dispose();
  }
  current = undefined;
  publicSummary = undefined;
  setCustody(undefined, false);
  if (notify) {
    purgeInvoiceDrafts();
    emit();
  }
}

/** Encrypted backup text. Raw keys exist only for the duration of the call. */
export async function exportKeystore(passphrase: string, options: KeystoreOptions = {}): Promise<string> {
  const guard = captureSessionBackupGuard();
  if (current === undefined) throw new UserFacingError({ key: 'error.session.loadOrGenerateSellerKeysFirstSellerKeys' });
  const { spending, viewing, signing } = current;
  const pub = publicSummary as SessionPublic;
  const spendingKey = spending.use((b) => b.slice());
  const viewingKey = viewing.use((b) => b.slice());
  const signingKey = signing.use((b) => b.slice());
  const copies = [spendingKey, viewingKey, signingKey];
  asyncSecretCopies.add(copies);
  try {
    const encrypted = await encryptKeystore({ spendingKey, viewingKey, signingKey }, { metaAddress: pub.metaAddress, signer: pub.signerPublicKey }, passphrase, options);
    guard();
    return encrypted;
  } finally {
    asyncSecretCopies.delete(copies);
    wipe(spendingKey, viewingKey, signingKey);
  }
}

/**
 * Decrypts a keystore and loads it into memory. `from: 'vault'` (keyVault.ts) ties the keys to that vault record for the
 * spending step-up (L1-02); a keystore file is a copy outside this browser (L1-01).
 */
export async function importKeystore(text: string, passphrase: string, signal?: AbortSignal, from: 'file' | 'vault' = 'file'): Promise<SessionPublic> {
  const assertOpen = (): void => { if (signal?.aborted === true) throw new UserFacingError({ key: 'error.session.theKeystoreImportWasClosed' }); };
  assertOpen();
  checkSessionExpiry();
  const revision = sessionRevision;
  const secrets = await decryptKeystore(text, passphrase);
  let spending: SecretScalar | undefined;
  let viewing: SecretScalar | undefined;
  let signing: SecretScalar | undefined;
  try {
    assertOpen();
    checkSessionExpiry();
    if (sessionRevision !== revision) throw new UserFacingError({ key: 'error.session.sellerKeysChangedWhileTheKeystoreWasUnlockingTryAgain' });
    spending = secretScalarFromBytes(secrets.spendingKey);
    viewing = secretScalarFromBytes(secrets.viewingKey);
    signing = secretScalarFromBytes(secrets.signingKey);
    return install({ keys: keySetFromScalars(spending, viewing), signingKey: signing }, from === 'vault' ? { from: 'vault', record: text } : { from: 'import' });
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError({ key: 'error.session.theKeystoreContainsInvalidKeys' });
  } finally {
    if (spending !== undefined) zeroize(spending);
    if (viewing !== undefined) zeroize(viewing);
    if (signing !== undefined) zeroize(signing);
    zeroize(secrets.spendingKey, secrets.viewingKey, secrets.signingKey);
  }
}

// i18n-use: error.session.theInvoiceSigningKeyMustBeIndependentOfSpendingAnd error.session.spendingAndViewingKeysMustDiffer error.session.loadOrGenerateSellerKeysFirstSellerKeys error.session.sellerKeysChangedDuringThisActionTryAgain error.session.theSavedEncryptedVaultDoesNotMatchTheLoadedSeller error.session.theKeystoreImportWasClosed error.session.sellerKeysChangedWhileTheKeystoreWasUnlockingTryAgain error.session.theKeystoreContainsInvalidKeys error.session.theBackupVerificationWasClosed error.session.theBackupFileDoesNotHoldTheLoadedSellerKeys

// i18n-use: error.session.spendingFormat

// i18n-use: error.session.spendingInvalid

// i18n-use: error.session.viewingFormat

// i18n-use: error.session.viewingInvalid

// i18n-use: error.session.signingFormat

// i18n-use: error.session.signingInvalid

// i18n-use: error.session.theSecretExportWasCancelled

// i18n-use: error.session.lockedBackupOnly
