import {
  buildSpendTransactionWithSigner,
  decodeSilentPaymentAddress,
  previewSweep,
  SoftwareSilentPaymentSigner,
  satsToBtcString,
  SilentPaymentError,
  type SpendableOutput,
} from '@ghostpay/btc-silent-payments';
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
  const warnings: string[] = [];
  // Common-input ownership: inputs spent together are publicly attributed to one owner (PRIVACY-E2E-03).
  if (selected.length > 1) {
    warnings.push(`This sweep spends ${String(selected.length)} payments in one transaction, which links them publicly: anyone can see they have one owner. To keep them apart, sweep one payment at a time, each to a different new address (separate sweeps to the same address also link them).`);
  }
  if (feeRate > HIGH_FEE_RATE) warnings.push(`Fee rate ${String(feeRate)} sat/vB is high even for a test network.`);
  if (pv.feeSats * 10n > totalSats) warnings.push('The fee is more than 10% of the swept amount.');
  if (dest === wallet.address) warnings.push('The destination is this wallet\'s own receive address.');
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
    warnings,
  };
}

export interface SignedSweep {
  readonly txid: string;
  readonly rawHex: string;
  readonly feeSats: bigint;
  readonly vsize: number;
}

/** Which signer the view uses. Hardware wallets: interface only (spec 11), no device driver is shipped. */
export const SIGNER_DESCRIPTION =
  'Software signer in this browser tab (reference implementation of the hardware-signer interface). It re-checks inputs, refuses non-default sighash and foreign inputs, re-derives silent-payment outputs, and confirms the reviewed destination before signing. No hardware wallet driver is included.';

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
}

export function formatBtc(sats: bigint): string {
  return `${satsToBtcString(sats)} BTC`;
}

/** Plain-language message for package errors; never echoes input values. */
export function btcErrorMessage(e: unknown): string {
  if (e instanceof SilentPaymentError) {
    const m: Partial<Record<string, string>> = {
      INVALID_ADDRESS: 'That address is not valid for this network.',
      INVALID_INPUT: 'Some input was missing or out of range.',
      INVALID_AMOUNT: 'Invalid amount.',
      INSUFFICIENT_FUNDS: 'The selected funds do not cover the fee.',
      DUST_OUTPUT: 'The amount left after the fee is below the dust limit.',
      FEE_TOO_HIGH: 'The fee is too high compared with the amount.',
      NETWORK_MISMATCH: 'The server is not on the network you selected.',
      TRANSPORT_FAILURE: 'The server could not be reached or refused the request.',
      INVALID_RESPONSE: 'The server returned data this app cannot trust.',
      REORG_DETECTED: 'The chain changed while scanning. Run the scan again.',
      ABORTED: 'Cancelled.',
      SIGNATURE_INVALID: 'Signing check failed; nothing was produced.',
      SIGNER_REFUSED: 'The signer refused: the transaction did not match what you reviewed.',
      INVALID_HEADER: 'The server sent a block header that breaks the chain rules.',
    };
    return m[e.code] ?? 'Bitcoin operation failed.';
  }
  return e instanceof Error ? e.message : 'Bitcoin operation failed.';
}
