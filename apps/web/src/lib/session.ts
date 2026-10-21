import {
  encodeMetaAddress,
  generateKeySet,
  parseCompressedPoint,
  randomScalar,
  secretScalarFromBytes,
  unsafeRevealSecret,
  zeroize,
  type CompressedPoint,
  type SecretScalar,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { hexToBytes } from '@noble/hashes/utils.js';
import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { decryptKeystore, encryptKeystore, type KeystoreOptions } from './keystore';
import { UserFacingError } from './errors';

/**
 * In-memory seller key holder. Secrets exist only as redacting `SecretScalar` values inside this module's closure:
 * they cannot be JSON-serialized, stringified or logged, and nothing here touches web storage. React state only ever
 * receives the public summary.
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

let current: SessionSecrets | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Subscribes to session changes (used by `useSyncExternalStore`). */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

let publicSummary: SessionPublic | undefined;

/** Snapshot for `useSyncExternalStore`; stable identity between changes. */
export function getSessionPublic(): SessionPublic | undefined {
  return publicSummary;
}

function install(next: SessionSecrets): SessionPublic {
  clearSession(false);
  current = next;
  publicSummary = summarize(next);
  emit();
  return publicSummary;
}

/** Generates fresh, independent spending, viewing and invoice-signing keys. */
export function generateSession(): SessionPublic {
  return install({ keys: generateKeySet(), signingKey: randomScalar() });
}

export interface ImportedHex {
  readonly spendingKeyHex: string;
  readonly viewingKeyHex: string;
  /** Optional: when omitted a fresh invoice-signing key is generated (it is a separate key by design, ADR-0002). */
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
  const spending = scalarFromHex(input.spendingKeyHex, 'Spending key');
  const viewing = scalarFromHex(input.viewingKeyHex, 'Viewing key');
  const signing = input.signingKeyHex === undefined || input.signingKeyHex.trim() === '' ? randomScalar() : scalarFromHex(input.signingKeyHex, 'Signing key');
  return install({ keys: keySetFromScalars(spending, viewing), signingKey: signing });
}

/** Secrets for an operation that needs them (sign, scan, sweep). Throws when no keys are loaded. */
export function requireSession(): SessionSecrets {
  if (current === undefined) throw new UserFacingError('Load or generate seller keys first (Seller keys).');
  return current;
}

export function hasSession(): boolean {
  return current !== undefined;
}

/** Best-effort wipe and forget. */
export function clearSession(notify = true): void {
  if (current !== undefined) {
    zeroize(current.keys.spendingSecret, current.keys.viewingSecret, current.signingKey);
  }
  current = undefined;
  publicSummary = undefined;
  if (notify) emit();
}

/** Encrypted backup text. Raw keys exist only for the duration of the call. */
export async function exportKeystore(passphrase: string, options: KeystoreOptions = {}): Promise<string> {
  const s = requireSession();
  const pub = summarize(s);
  const spendingKey = unsafeRevealSecret(s.keys.spendingSecret);
  const viewingKey = unsafeRevealSecret(s.keys.viewingSecret);
  const signingKey = unsafeRevealSecret(s.signingKey);
  try {
    return await encryptKeystore({ spendingKey, viewingKey, signingKey }, { metaAddress: pub.metaAddress, signer: pub.signerPublicKey }, passphrase, options);
  } finally {
    zeroize(spendingKey, viewingKey, signingKey);
  }
}

/** Decrypts a keystore and loads it into memory. */
export async function importKeystore(text: string, passphrase: string): Promise<SessionPublic> {
  const secrets = await decryptKeystore(text, passphrase);
  try {
    const spending = secretScalarFromBytes(secrets.spendingKey);
    const viewing = secretScalarFromBytes(secrets.viewingKey);
    const signing = secretScalarFromBytes(secrets.signingKey);
    return install({ keys: keySetFromScalars(spending, viewing), signingKey: signing });
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError('The keystore contains invalid keys.');
  } finally {
    zeroize(secrets.spendingKey, secrets.viewingKey, secrets.signingKey);
  }
}
