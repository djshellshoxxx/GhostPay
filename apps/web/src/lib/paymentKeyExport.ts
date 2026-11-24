import { findChain, type RpcClient } from '@ghostpay/chain-adapters';
import { zeroize } from '@ghostpay/core-crypto';
import { UserFacingError } from './errors';
import { passphraseProblemMessage } from './keystore';
import { requireSecretExportAuthorization, type SecretExportCredential } from './keyVault';
import type { ScanMatch } from './scanClient';
import { captureSessionGuard, withSessionSecrets } from './session';
import {
  STEALTH_EXPORT_FILENAMES, buildVerifiedPayment, encryptPaymentKeys,
  formatRawPrivateKey, serializePublicRecord, type VerifiedStealthPayment,
} from './stealthExport';

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

// i18n-use: error.paymentKeyExport.unsupportedChain error.paymentKeyExport.noRpc error.paymentKeyExport.wrongChain error.paymentKeyExport.codeCheckFailed error.paymentKeyExport.contractAccount error.paymentKeyExport.confirmRawKey
