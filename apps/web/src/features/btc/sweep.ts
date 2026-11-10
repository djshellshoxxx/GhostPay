import {
  buildSpendTransactionWithSigner,
  decodeSilentPaymentAddress,
  previewSweep,
  SoftwareSilentPaymentSigner,
  satsToBtcString,
  SilentPaymentError,
  type SpendableOutput,
} from '@ghostpay/btc-silent-payments';
import type { MessageKey } from '../../i18n/catalog';
import { SOURCE_TRANSLATOR } from '../../i18n/source';
import type { Translator } from '../../i18n/translator';
import { UserFacingError, displayMessage, type MessageDescriptor } from '../../lib/errors';
import type { FoundPayment } from './scan';
import type { BtcWallet } from './wallet';

/** Everything the user must see and approve before any key is used. Contains no secret. */
export interface SweepReview {
  readonly networkLabel: string;
  readonly inputs: readonly { readonly txid: string; readonly vout: number; readonly amountSats: bigint }[];
  readonly totalSats: bigint;
  readonly destination: string;
  readonly destinationKind: 'silent payment address' | 'regular address';
  readonly feeRate: number;
  readonly vsize: number;
  readonly feeSats: bigint;
  /** Amount the destination receives (inputs minus fee; a sweep has no change output). */
  readonly sendSats: bigint;
  readonly rbf: true;
  readonly warnings: readonly string[];
  /** Public descriptors render with the language current at review time, without rebuilding the transaction. */
  readonly warningMessages: readonly MessageDescriptor[];
}

export const HIGH_FEE_RATE = 50;

/**
 * Checks a sweep destination for the wallet's network; no payment needs to be selected and no amount is involved.
 * Silent payment addresses are decoded in full, as signing decodes them, not only recognised by their prefix.
 * @returns The trimmed address.
 * @throws {SilentPaymentError} `INVALID_INPUT` when empty, `INVALID_ADDRESS` when not valid for the network.
 */
export function checkDestination(wallet: BtcWallet, destination: string): string {
  const dest = destination.trim();
  if (dest === '') throw new SilentPaymentError('INVALID_INPUT');
  if (/^t?sp1/i.test(dest)) {
    try {
      decodeSilentPaymentAddress(dest, wallet.net.spNetwork);
    } catch {
      throw new SilentPaymentError('INVALID_ADDRESS');
    }
    return dest;
  }
  // The same regular-address decoding as review and signing; the 1 BTC placeholder input only keeps the amount checks quiet.
  previewSweep({ inputAmountsSats: [100_000_000n], address: dest, feeRate: 1, network: wallet.net.spNetwork, regtest: wallet.net.regtest });
  return dest;
}

export function reviewSweep(
  wallet: BtcWallet,
  selected: readonly FoundPayment[],
  destination: string,
  feeRate: number,
): SweepReview {
  const dest = destination.trim();
  if (dest === '' || selected.length === 0) throw new SilentPaymentError('INVALID_INPUT');
  checkDestination(wallet, dest);
  const pv = previewSweep({
    inputAmountsSats: selected.map((s) => s.amountSats),
    address: dest,
    feeRate,
    network: wallet.net.spNetwork,
    regtest: wallet.net.regtest,
  });
  const totalSats = selected.reduce((a, s) => a + s.amountSats, 0n);
  const warningMessages: MessageDescriptor[] = [];
  // Common-input ownership: inputs spent together are publicly attributed to one owner (PRIVACY-E2E-03).
  if (selected.length > 1) {
    warningMessages.push({ key: 'btc.sweep.linked', values: { count: String(selected.length) } });
  }
  if (feeRate > HIGH_FEE_RATE) warningMessages.push({ key: 'btc.sweep.highFeeRate', values: { rate: String(feeRate) } });
  if (pv.feeSats * 10n > totalSats) warningMessages.push({ key: 'btc.sweep.largeFee' });
  if (dest === wallet.address) warningMessages.push({ key: 'btc.sweep.ownAddress' });
  return {
    networkLabel: wallet.net.label,
    inputs: selected.map((s) => ({ txid: s.txid, vout: s.vout, amountSats: s.amountSats })),
    totalSats,
    destination: dest,
    destinationKind: pv.destinationIsSilentPayment ? 'silent payment address' : 'regular address',
    feeRate,
    vsize: pv.vsize,
    feeSats: pv.feeSats,
    sendSats: pv.sendSats,
    rbf: true,
    warnings: warningMessages.map((message) => displayMessage(message)),
    warningMessages,
  };
}

export interface SignedSweep {
  readonly txid: string;
  readonly rawHex: string;
  readonly feeSats: bigint;
  readonly vsize: number;
}

/** Which signer the view uses. Hardware wallets: interface only (spec 11), no device driver is shipped. */
export const SIGNER_DESCRIPTION = SOURCE_TRANSLATOR.t('btc.sweep.signer');

/**
 * Signs the reviewed sweep through the {@link SilentPaymentSigner} interface (here the software reference
 * signer). Call only after the user approved the exact `review`. The signer's confirmation step re-checks that
 * the transaction pays only the reviewed destination; the result is checked against the review (fee and size)
 * and nothing is returned on any mismatch.
 */
export async function signSweep(wallet: BtcWallet, selected: readonly FoundPayment[], review: SweepReview): Promise<SignedSweep> {
  const same =
    selected.length === review.inputs.length &&
    selected.every((s, i) => {
      const r = review.inputs[i];
      return r !== undefined && r.txid === s.txid && r.vout === s.vout && r.amountSats === s.amountSats;
    });
  if (!same) throw new SilentPaymentError('INVALID_INPUT');
  const outputs: SpendableOutput[] = selected.map((s) => ({
    txid: s.txid,
    vout: s.vout,
    amountSats: s.amountSats,
    xOnlyPublicKey: s.xOnlyPublicKey,
    spendTweak: s.spendTweak,
  }));
  const signer = new SoftwareSilentPaymentSigner(wallet.keys.spendSecret, {
    // Stand-in for a device screen: exactly one output, to the reviewed destination.
    confirm: (s) => s.outputs.length === 1 && s.outputs[0]?.address === review.destination,
  });
  try {
    const r = await buildSpendTransactionWithSigner(
      {
        outputs,
        destinations: [{ address: review.destination }],
        feeRate: review.feeRate,
        network: wallet.net.spNetwork,
        regtest: wallet.net.regtest,
        rbf: review.rbf,
      },
      signer,
    );
    if (r.feeSats !== review.feeSats || r.vsize !== review.vsize) throw new SilentPaymentError('SIGNATURE_INVALID');
    let hex = '';
    for (const b of r.rawTx) hex += b.toString(16).padStart(2, '0');
    return { txid: r.txid, rawHex: hex, feeSats: r.feeSats, vsize: r.vsize };
  } finally {
    // Best effort: wipes the signer's own copy of the spend secret. The wallet's keys stay until Lock.
    signer.dispose();
  }
}

export function formatBtc(sats: bigint): string {
  return `${satsToBtcString(sats)} BTC`;
}

const FRIENDLY: Readonly<Record<string, MessageKey>> = {
  INVALID_ADDRESS: 'btc.error.invalidAddress',
  INVALID_INPUT: 'btc.error.invalidInput',
  INVALID_AMOUNT: 'btc.error.invalidAmount',
  INSUFFICIENT_FUNDS: 'btc.error.insufficientFunds',
  DUST_OUTPUT: 'btc.error.dustOutput',
  FEE_TOO_HIGH: 'btc.error.feeTooHigh',
  NETWORK_MISMATCH: 'btc.error.networkMismatch',
  TRANSPORT_FAILURE: 'btc.error.transportFailure',
  INVALID_RESPONSE: 'btc.error.invalidResponse',
  REORG_DETECTED: 'btc.error.reorgDetected',
  ABORTED: 'btc.error.aborted',
  SIGNATURE_INVALID: 'btc.error.signatureInvalid',
  SIGNER_REFUSED: 'btc.error.signerRefused',
  INVALID_HEADER: 'btc.error.invalidHeader',
};

/** Capture known public diagnostics only. Never retain an arbitrary exception message or a secret-bearing cause. */
export function captureBtcErrorMessage(e: unknown): MessageDescriptor {
  if (e instanceof UserFacingError && e.translation !== undefined) return e.translation;
  return { key: e instanceof SilentPaymentError ? FRIENDLY[e.code] ?? 'btc.error.failed' : 'btc.error.failed' };
}

/** Compatible source-English API; UI state retains the descriptor and supplies its current translator on render. */
export function btcErrorMessage(e: unknown, t: Translator['t'] = SOURCE_TRANSLATOR.t): string {
  return displayMessage(captureBtcErrorMessage(e), t);
}

// i18n-use: btc.sweep.linked btc.sweep.highFeeRate btc.sweep.largeFee btc.sweep.ownAddress btc.error.invalidAddress btc.error.invalidInput btc.error.invalidAmount btc.error.insufficientFunds btc.error.dustOutput btc.error.feeTooHigh btc.error.networkMismatch btc.error.transportFailure btc.error.invalidResponse btc.error.reorgDetected btc.error.aborted btc.error.signatureInvalid btc.error.signerRefused btc.error.invalidHeader btc.error.failed
