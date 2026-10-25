import { Address, NETWORK, OutScript, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { mulG, toHex, xOnly } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { fakeTxid, p2wpkhInput } from './fixtures.testutil.js';
import { generateSilentPaymentKeys } from './keys.js';
import { changeAddress, createLabelTable, silentPaymentAddress } from './labels.js';
import { computeTransactionTweak, scanOutputsForTweak, type FoundOutput } from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { createSilentPaymentOutputs } from './sender.js';
import {
  buildSpendTransaction,
  buildSpendTransactionWithSigner,
  SoftwareSilentPaymentSigner,
  verifyKeyPathSpend,
  type BuildSpendParams,
  type SignSpendRequest,
  type SilentPaymentSigner,
  type SpendableOutput,
  type SpendSummary,
} from './spend.js';

const wallet = generateSilentPaymentKeys(seededRng('signer-wallet'));
const payee = generateSilentPaymentKeys(seededRng('signer-payee'));
const keysFor = { scanSecret: wallet.scanSecret, spendPublicKey: wallet.spendPublicKey, labels: createLabelTable(wallet.scanSecret, []) };
const walletAddr = silentPaymentAddress(wallet, 'mainnet');
const payeeAddr = silentPaymentAddress(payee, 'mainnet');
const regular = Address(NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(7) });

function receive(seed: string, amounts: bigint[]): SpendableOutput[] {
  const t = p2wpkhInput(seed);
  const outs = createSilentPaymentOutputs({
    inputs: [t.key],
    outpoints: [{ txid: t.input.txid, vout: t.input.vout }],
    recipients: amounts.map(() => walletAddr),
    network: 'mainnet',
  });
  const tw = computeTransactionTweak([t.input]);
  if (tw === null) throw new Error('ineligible');
  const found = scanOutputsForTweak(keysFor, tw.tweak, outs.map((o) => o.xOnlyPublicKey));
  return outs.map((o, i) => {
    const f = found.find((x) => toHex(x.xOnlyPublicKey) === toHex(o.xOnlyPublicKey)) as FoundOutput;
    return { txid: fakeTxid(`fund-${seed}`), vout: i, amountSats: amounts[i] as bigint, xOnlyPublicKey: f.xOnlyPublicKey, spendTweak: f.spendTweak };
  });
}

const outputs = [...receive('a', [60_000n, 30_000n]), ...receive('b', [20_000n])];
const base: Omit<BuildSpendParams, 'spendSecret'> = {
  outputs,
  destinations: [{ address: payeeAddr, amountSats: 50_000n }, { address: regular, amountSats: 10_000n }],
  changeAddress: changeAddress(wallet, 'mainnet'),
  feeRate: 2,
  network: 'mainnet',
};

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : `OTHER:${String(e)}`;
  }
}

/** A signer that lets a test tamper with requests or answers while delegating to the real one. */
function wrap(over: Partial<SilentPaymentSigner> & { mapReq?: (r: SignSpendRequest) => SignSpendRequest }): SilentPaymentSigner {
  const real = new SoftwareSilentPaymentSigner(wallet.spendSecret);
  return {
    kind: 'hardware',
    getSpendPublicKey: over.getSpendPublicKey ?? ((s) => real.getSpendPublicKey(s)),
    computeEcdhShare: over.computeEcdhShare ?? ((r, s) => real.computeEcdhShare(r, s)),
    signSpend: over.signSpend ?? ((r, s) => real.signSpend(over.mapReq ? over.mapReq(r) : r, s)),
  };
}

/** Rebuilds the request PSBT after `edit` changes the transaction. */
function editPsbt(r: SignSpendRequest, edit: (tx: Transaction) => void): SignSpendRequest {
  const tx = Transaction.fromPSBT(r.psbt, { allowUnknownOutputs: true });
  edit(tx);
  return { ...r, psbt: tx.toPSBT() };
}

describe('buildSpendTransactionWithSigner + SoftwareSilentPaymentSigner', () => {
  it('produces the same transaction as the in-process path, with silent-payment destination and change', async () => {
    const summaries: SpendSummary[] = [];
    const signer = new SoftwareSilentPaymentSigner(wallet.spendSecret, { confirm: (s) => { summaries.push(s); return true; } });
    const viaSigner = await buildSpendTransactionWithSigner(base, signer);
    const inProcess = buildSpendTransaction({ ...base, spendSecret: wallet.spendSecret });
    expect(viaSigner.txid).toBe(inProcess.txid); // txid excludes signatures (BIP-340 aux randomness)
    expect([viaSigner.feeSats, viaSigner.changeSats, viaSigner.vsize, viaSigner.changeIndex]).toEqual([
      inProcess.feeSats, inProcess.changeSats, inProcess.vsize, inProcess.changeIndex,
    ]);
    const prevouts = outputs.map((o) => ({ script: Uint8Array.of(0x51, 0x20, ...o.xOnlyPublicKey), amountSats: o.amountSats }));
    expect(verifyKeyPathSpend(viaSigner.rawTx, prevouts)).toBe(true);
    expect(summaries).toHaveLength(1);
    const s = summaries[0] as SpendSummary;
    expect(s.inputsSats).toBe(110_000n);
    expect(s.feeSats).toBe(viaSigner.feeSats);
    expect(s.outputs.map((o) => [o.address, o.amountSats, o.silentPayment])).toEqual([
      [payeeAddr, 50_000n, true],
      [regular, 10_000n, false],
      [changeAddress(wallet, 'mainnet'), viaSigner.changeSats, true],
    ]);
  });

  it('pays the payee so that the payee scanner finds the output', async () => {
    const r = await buildSpendTransactionWithSigner(base, new SoftwareSilentPaymentSigner(wallet.spendSecret));
    const tx = Transaction.fromRaw(r.rawTx);
    const out0 = tx.getOutput(0).script as Uint8Array;
    const inputs = outputs.map((o) => ({ txid: o.txid, vout: o.vout, scriptSig: new Uint8Array(0), witness: [new Uint8Array(64)], prevoutScriptPubKey: Uint8Array.of(0x51, 0x20, ...o.xOnlyPublicKey) }));
    const tw = computeTransactionTweak(inputs);
    expect(tw).not.toBeNull();
    const found = scanOutputsForTweak({ scanSecret: payee.scanSecret, spendPublicKey: payee.spendPublicKey }, (tw as { tweak: Uint8Array }).tweak, [out0.subarray(2)]);
    expect(found).toHaveLength(1);
  });

  it('works for a plain sweep without silent-payment outputs (no ECDH request)', async () => {
    let ecdh = 0;
    const s = wrap({ computeEcdhShare: () => { ecdh++; return Promise.reject(new Error('unused')); } });
    const r = await buildSpendTransactionWithSigner({ ...base, destinations: [{ address: regular }] }, s);
    expect(r.changeIndex).toBeNull();
    expect(ecdh).toBe(0);
  });

  it('asks for one ECDH share per distinct scan key', async () => {
    const calls: string[] = [];
    const real = new SoftwareSilentPaymentSigner(wallet.spendSecret);
    const s = wrap({ computeEcdhShare: (r, sig) => { calls.push(toHex(r.scanPublicKey)); return real.computeEcdhShare(r, sig); } });
    await buildSpendTransactionWithSigner({ ...base, destinations: [{ address: payeeAddr, amountSats: 20_000n }, { address: payeeAddr, amountSats: 20_000n }] }, s);
    expect(calls).toEqual([toHex(payee.scanPublicKey), toHex(wallet.scanPublicKey)]);
  });

  it('signer refuses when the user declines or the confirm step throws', async () => {
    expect(await code(buildSpendTransactionWithSigner(base, new SoftwareSilentPaymentSigner(wallet.spendSecret, { confirm: () => false })))).toBe('SIGNER_REFUSED');
    expect(await code(buildSpendTransactionWithSigner(base, new SoftwareSilentPaymentSigner(wallet.spendSecret, { confirm: () => { throw new Error('x'); } })))).toBe('SIGNER_REFUSED');
    expect(await code(buildSpendTransactionWithSigner(base, new SoftwareSilentPaymentSigner(wallet.spendSecret, { confirm: () => 'yes' as never })))).toBe('SIGNER_REFUSED');
  });

  it('signer refuses a tampered PSBT (hostile host)', async () => {
    const attacker = Uint8Array.of(0x51, 0x20, ...xOnly(mulG(12345n)));
    const cases: ((r: SignSpendRequest) => SignSpendRequest)[] = [
      (r) => editPsbt(r, (tx) => { tx.updateOutput(0, { script: attacker }); }), // SP output redirected
      (r) => editPsbt(r, (tx) => { tx.updateInput(0, { witnessUtxo: { script: Uint8Array.of(0x51, 0x20, ...outputs[0]!.xOnlyPublicKey), amount: 1n } }); }), // amount lie
      (r) => editPsbt(r, (tx) => { tx.updateInput(1, { sighashType: 0x81 }); }), // ALL|ANYONECANPAY
      (r) => editPsbt(r, (tx) => { tx.addInput({ txid: fakeTxid('foreign'), index: 0, witnessUtxo: { script: attacker, amount: 1000n } }); }), // foreign input
      (r) => ({ ...r, inputs: [r.inputs[1]!, r.inputs[0]!, r.inputs[2]!] }), // order mismatch
      (r) => ({ ...r, inputs: r.inputs.map((i, j) => (j === 0 ? { ...i, spendTweak: outputs[1]!.spendTweak } : i)) }), // wrong tweak
      (r) => ({ ...r, silentPaymentOutputs: [r.silentPaymentOutputs[0]!, r.silentPaymentOutputs[0]!] }), // duplicate index
      (r) => ({ ...r, silentPaymentOutputs: [{ ...r.silentPaymentOutputs[0]!, outputIndex: 9 }, r.silentPaymentOutputs[1]!] }),
      (r) => editPsbt(r, (tx) => { tx.updateOutput(1, { amount: 200_000n }); }), // outputs exceed inputs
      (r) => ({ ...r, psbt: Uint8Array.of(1, 2, 3) }),
      (r) => ({ ...r, inputs: [] }),
    ];
    for (const [i, mapReq] of cases.entries()) expect(await code(buildSpendTransactionWithSigner(base, wrap({ mapReq }))), `case ${String(i)}`).toBe("SIGNER_REFUSED");
  });

  it('shows an undeclared silent-payment output as its raw taproot address, never as the silent payment address', async () => {
    const summaries: SpendSummary[] = [];
    const real = new SoftwareSilentPaymentSigner(wallet.spendSecret, { confirm: (s) => { summaries.push(s); return true; } });
    const s = wrap({ signSpend: (r, sig) => real.signSpend({ ...r, silentPaymentOutputs: [] }, sig) });
    const r = await buildSpendTransactionWithSigner(base, s);
    const out0 = Transaction.fromRaw(r.rawTx).getOutput(0).script as Uint8Array;
    expect(summaries[0]?.outputs[0]).toEqual({ index: 0, amountSats: 50_000n, address: Address(NETWORK).encode(OutScript.decode(out0)), silentPayment: false });
    expect(summaries[0]?.outputs[0]?.address.startsWith('bc1p')).toBe(true);
  });

  it('signer refuses to sign twice over an already signed input and outputs it cannot show', async () => {
    const opReturn = (r: SignSpendRequest) => editPsbt(r, (tx) => { tx.addOutput({ script: OutScript.encode({ type: 'unknown', script: Uint8Array.of(0x6a, 0x01, 0x00) }), amount: 0n }); });
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ mapReq: opReturn })))).toBe('SIGNER_REFUSED');
    const presigned = (r: SignSpendRequest) => editPsbt(r, (tx) => { tx.updateInput(0, { tapKeySig: new Uint8Array(64).fill(1) }); });
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ mapReq: presigned })))).toBe('SIGNER_REFUSED');
  });

  it('host refuses a hostile or broken signer', async () => {
    const real = new SoftwareSilentPaymentSigner(wallet.spendSecret);
    // Wrong spend key: claimed outputs do not belong to it.
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ getSpendPublicKey: () => Promise.resolve(payee.spendPublicKey) })))).toBe('INVALID_INPUT');
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ getSpendPublicKey: () => Promise.resolve(new Uint8Array(33) as never) })))).toBe('SIGNER_REFUSED');
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ computeEcdhShare: () => Promise.resolve('x' as never) })))).toBe('SIGNER_REFUSED');
    // A valid but wrong share makes the host derive wrong outputs; a compliant signer re-derives and refuses.
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ computeEcdhShare: () => Promise.resolve(wallet.spendPublicKey) })))).toBe('SIGNER_REFUSED');
    // Bad signatures are caught by the host's independent verification.
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ signSpend: () => Promise.resolve(outputs.map(() => new Uint8Array(64).fill(3))) })))).toBe('SIGNATURE_INVALID');
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ signSpend: (r, s) => real.signSpend(r, s).then((x) => x.slice(1)) })))).toBe('SIGNER_REFUSED');
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ signSpend: () => Promise.resolve([new Uint8Array(63), new Uint8Array(64), new Uint8Array(64)]) })))).toBe('SIGNER_REFUSED');
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ signSpend: () => Promise.resolve('nope' as never) })))).toBe('SIGNER_REFUSED');
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ signSpend: () => Promise.reject(new Error('usb')) })))).toBe('TRANSPORT_FAILURE');
    expect(await code(buildSpendTransactionWithSigner(base, wrap({ getSpendPublicKey: () => Promise.reject(new SilentPaymentError('ABORTED')) })))).toBe('ABORTED');
  });

  it('applies the same plan checks as the in-process path before contacting the signer', async () => {
    let touched = false;
    const s = wrap({ getSpendPublicKey: () => { touched = true; return Promise.resolve(wallet.spendPublicKey); } });
    expect(await code(buildSpendTransactionWithSigner({ ...base, feeRate: 0 }, s))).toBe('INVALID_INPUT');
    expect(await code(buildSpendTransactionWithSigner({ ...base, destinations: [{ address: regular, amountSats: 10_000_000n }] }, s))).toBe('INSUFFICIENT_FUNDS');
    expect(touched).toBe(false);
  });

  it('honours an aborted signal at every signer step', async () => {
    const ac = new AbortController();
    ac.abort();
    const s = new SoftwareSilentPaymentSigner(wallet.spendSecret);
    expect(await code(buildSpendTransactionWithSigner(base, s, ac.signal))).toBe('ABORTED');
    const inputs = outputs.map((o) => ({ ...o }));
    expect(await code(s.computeEcdhShare({ inputs, scanPublicKey: payee.scanPublicKey }, ac.signal))).toBe('ABORTED');
    expect(await code(s.signSpend({ psbt: new Uint8Array(0), inputs, silentPaymentOutputs: [], network: 'mainnet' }, ac.signal))).toBe('ABORTED');
  });

  it('rejects an invalid spend secret at construction', () => {
    expect(() => new SoftwareSilentPaymentSigner(new Uint8Array(32) as never)).toThrow(/invalid secret scalar/);
  });
});
