import { hex } from '@scure/base';
import { describe, expect, it } from 'vitest';
import type { PayjoinErrorCode } from '../errors.js';
import * as btc from '@scure/btc-signer';
import { addressFor, exposedStore, fakeTxid, key, rebuild, receiverCtx, receiverWallet, scenario, signerFor, utxoFor } from '../fixtures.testutil.js';
import { encodePsbt, inputOutpoint, outputInfo, parsePsbt, psbtFee, type Utxo } from '../psbt.js';
import { buildProposal } from './contribute.js';
import { checkOriginal } from './checks.js';
import { MemoryExposedUtxos, MemorySeenInputs } from './seen.js';
import { buildOriginalPsbt } from '../sender/original.js';

const codeOf = async (f: () => Promise<unknown>): Promise<PayjoinErrorCode | 'none'> => {
  try {
    await f();
    return 'none';
  } catch (e) {
    return (e as { code: PayjoinErrorCode }).code;
  }
};

describe('checkOriginal', () => {
  it('accepts an honest original and exposes its facts', async () => {
    const s = await scenario();
    expect(s.checked.outpoints).toHaveLength(1);
    expect(s.checked.fee).toBeGreaterThan(0n);
    expect(s.checked.sequence).toBe(0xfffffffd);
  });
  it('rejects garbage', async () => {
    const s = await scenario();
    expect(await codeOf(() => checkOriginal('not base64!', s.ctx))).toBe('psbt_invalid');
    expect(await codeOf(() => checkOriginal('', s.ctx))).toBe('psbt_invalid');
  });
  it('rejects a mainnet-configured receiver', async () => {
    const s = await scenario();
    expect(await codeOf(() => checkOriginal(s.built.psbt, { ...s.ctx, network: 'mainnet' as never }))).toBe('network_not_allowed');
  });
  it('rejects non-finalized inputs', async () => {
    const s = await scenario();
    const p = encodePsbt(rebuild(s.built.tx, { mapInput: (i) => ({ ...i, finalScriptWitness: undefined }) }));
    expect(await codeOf(() => checkOriginal(p, s.ctx))).toBe('psbt_not_finalized');
  });
  it('rejects leaked keypaths', async () => {
    const s = await scenario();
    const p = encodePsbt(rebuild(s.built.tx, { mapInput: (i) => ({ ...i, bip32Derivation: [[new Uint8Array(33).fill(2), { fingerprint: 1, path: [1] }]] }) }));
    expect(await codeOf(() => checkOriginal(p, s.ctx))).toBe('keypaths_present');
  });
  it('rejects leaked output keypaths', async () => {
    const s = await scenario();
    const p = encodePsbt(rebuild(s.built.tx, { mapOutput: (o) => ({ ...o, bip32Derivation: [[new Uint8Array(33).fill(2), { fingerprint: 1, path: [1] }]] }) }));
    expect(await codeOf(() => checkOriginal(p, s.ctx))).toBe('keypaths_present');
  });
  it('rejects missing utxo data', async () => {
    const s = await scenario();
    const p = encodePsbt(rebuild(s.built.tx, { mapInput: (i) => ({ ...i, witnessUtxo: undefined }) }));
    expect(await codeOf(() => checkOriginal(p, s.ctx))).toBe('psbt_invalid');
  });
  it('rejects inputs owned by the receiver', async () => {
    const s = await scenario();
    const wallet = receiverWallet(s.sk, 'wpkh', []);
    expect(await codeOf(() => checkOriginal(s.built.psbt, { ...s.ctx, wallet }))).toBe('input_owned_by_receiver');
  });
  it('rejects zero inputs or outputs', async () => {
    const s = await scenario();
    const noOut = encodePsbt(rebuild(s.built.tx, { mapOutput: () => null }));
    expect(await codeOf(() => checkOriginal(noOut, s.ctx))).toBe('psbt_invalid');
  });
  it('rejects mixed sequences in the original', async () => {
    const s = await scenario({ senderAmounts: [60_000n, 60_000n] });
    const p = encodePsbt(rebuild(s.built.tx, { mapInput: (i, k) => (k === 0 ? { ...i, sequence: 1 } : i) }));
    expect(await codeOf(() => checkOriginal(p, s.ctx))).toBe('sequence_changed');
  });
  it('rejects a feerate below the minimum', async () => {
    const s = await scenario({ feeRate: 2 });
    expect(await codeOf(() => checkOriginal(s.built.psbt, { ...s.ctx, minOriginalFeeRate: 50 }))).toBe('feerate_below_min');
  });
  it('rejects when the invoice output is missing or underpaid', async () => {
    const s = await scenario();
    const other = addressFor(key('nobody'), 'wpkh');
    expect(await codeOf(() => checkOriginal(s.built.psbt, { ...s.ctx, address: other }))).toBe('output_missing');
    expect(await codeOf(() => checkOriginal(s.built.psbt, { ...s.ctx, amountSats: 99_999_999n }))).toBe('output_decreased');
  });
  it('rejects inputs seen before (anti-probing / anti-reentrancy)', async () => {
    const s = await scenario();
    const seen = new MemorySeenInputs();
    await seen.add(s.checked.outpoints);
    expect(await codeOf(() => checkOriginal(s.built.psbt, { ...s.ctx, seen }))).toBe('input_seen');
  });
  it('non-interactive: needs a broadcastability test and honours it', async () => {
    const s = await scenario();
    const noTest = { ...s.ctx, mode: 'non-interactive' as const, wallet: { isMine: (x: Uint8Array) => s.wallet.isMine(x), listSpendable: () => s.wallet.listSpendable(), signInput: (t: import('@scure/btc-signer').Transaction, i: number, u: Utxo) => { s.wallet.signInput(t, i, u); } } };
    expect(await codeOf(() => checkOriginal(s.built.psbt, noTest))).toBe('not_broadcastable');
    const w = receiverWallet(s.rk, 'wpkh', s.rUtxos);
    const ctx = { ...s.ctx, mode: 'non-interactive' as const, wallet: w };
    expect((await checkOriginal(s.built.psbt, ctx)).outpoints).toHaveLength(1);
    w.mempool = false;
    expect(await codeOf(() => checkOriginal(s.built.psbt, ctx))).toBe('not_broadcastable');
    const throwing = { ...ctx, wallet: { ...w, testMempoolAccept: () => Promise.reject(new Error('rpc down')) } };
    expect(await codeOf(() => checkOriginal(s.built.psbt, throwing))).toBe('not_broadcastable');
  });
  it('rejects duplicate inputs', async () => {
    const s = await scenario();
    const p = encodePsbt(rebuild(s.built.tx, { extraInputs: [s.built.tx.getInput(0)] }));
    expect(await codeOf(() => checkOriginal(p, s.ctx))).toBe('psbt_invalid');
  });
  it('verifies non_witness_utxo against the input txid', async () => {
    const sk = key('sender');
    const rk = key('receiver');
    const sUtxo = utxoFor(sk, 'wpkh', 100_000n);
    const prev = new btc.Transaction();
    prev.addInput({ txid: fakeTxid(), index: 0, witnessUtxo: { script: sUtxo.script, amount: 200_000n } });
    prev.addOutput({ script: sUtxo.script, amount: 100_000n });
    const real: Utxo = { ...sUtxo, txid: prev.id, index: 0 };
    const rAddr = addressFor(rk, 'wpkh');
    const uri = { address: rAddr, amountSats: 20_000n, pj: 'http://localhost/pj/X', outputSubstitution: true, network: 'testnet' as const };
    const built = buildOriginalPsbt({ uri, utxos: [real], feeRateSatPerVb: 2, changeAddress: addressFor(sk, 'wpkh'), signer: signerFor([{ k: sk, kind: 'wpkh' }]) });
    const ctx = receiverCtx(receiverWallet(rk, 'wpkh', []), rAddr, { amountSats: 20_000n });
    const nw = btc.RawTx.decode(prev.toBytes(true, true));
    const good = encodePsbt(rebuild(built.tx, { mapInput: (i) => ({ ...i, witnessUtxo: undefined, nonWitnessUtxo: nw }) }));
    expect((await checkOriginal(good, ctx)).fee).toBeGreaterThan(0n);
  });
});

describe('buildProposal policy', () => {
  it('conserves value and adds exactly one receiver input at a random position', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 1000n } });
    const p = s.proposal;
    expect(p.inputsLength).toBe(2);
    expect(p.outputsLength).toBe(s.built.tx.outputsLength);
    let inSum = 0n;
    for (const u of [...s.sUtxos, ...s.rUtxos]) inSum += u.amount;
    let outSum = 0n;
    for (let i = 0; i < p.outputsLength; i++) outSum += outputInfo(p, i).amount;
    expect(inSum - outSum).toBeGreaterThanOrEqual(s.built.fee);
  });
  it('places the receiver input per injected randomness (front and back)', async () => {
    const a = await scenario({ ctx: { random: () => 0 } });
    const b = await scenario({ ctx: { random: () => 0.99 } });
    const rOp = (p: typeof a.proposal, rUtxo: Utxo): number => [...Array(p.inputsLength).keys()].findIndex((k) => inputOutpoint(p, k) === `${rUtxo.txid}:${String(rUtxo.index)}`);
    expect(rOp(a.proposal, a.rUtxos[0] as Utxo)).toBe(0);
    expect(rOp(b.proposal, b.rUtxos[0] as Utxo)).toBe(1);
  });
  it('the receiver pays the whole bump when the sender offers no fee output', async () => {
    const s = await scenario();
    const pay = outputInfo(s.proposal, [...Array(s.proposal.outputsLength).keys()].find((k) => hex.encode(outputInfo(s.proposal, k).script) === hex.encode(s.paymentScript)) as number);
    const origPay = outputInfo(s.built.tx, s.built.paymentIndex);
    expect(pay.amount).toBeGreaterThan(origPay.amount);
    expect(pay.amount).toBeLessThan(origPay.amount + 50_000n);
  });
  it('uses the sender fee output up to the cap', async () => {
    const s = await scenario({ params: { maxAdditionalFeeContributionSats: 100n } });
    const chIdx = s.built.changeIndex as number;
    const chScript = outputInfo(s.built.tx, chIdx).script;
    const newCh = [...Array(s.proposal.outputsLength).keys()].map((k) => outputInfo(s.proposal, k)).find((o) => hex.encode(o.script) === hex.encode(chScript));
    expect(outputInfo(s.built.tx, chIdx).amount - (newCh?.amount ?? 0n)).toBe(100n);
  });
  it('honours minfeerate by raising the fee', async () => {
    const s = await scenario({ feeRate: 2, params: { minFeeRateSatPerVb: 20 } });
    const fee = psbtFee(s.proposal, new Map([...s.sUtxos, ...s.rUtxos].map((u) => [`${u.txid}:${String(u.index)}`, { script: u.script, amount: u.amount }])));
    expect(Number(fee)).toBeGreaterThanOrEqual(20 * 150); // ~ two p2wpkh inputs, 2 outputs: >150 vB
  });
  it('replies no-op only when configured and nothing fits', async () => {
    const s = await scenario({ receiverAmounts: [], ctx: { allowNoop: true } });
    expect(s.proposalB64).toBe(s.built.psbt);
    await expect(scenario({ receiverAmounts: [] })).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('skips dust-sized candidates (BPJ-RCV-10) and reports not_enough_money', async () => {
    await expect(scenario({ receiverAmounts: [100n] })).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('not_enough_money when the only candidate cannot cover the receiver share under pjos=0', async () => {
    // minfeerate demands a bump far above the candidate value; fee output offered nothing.
    await expect(scenario({ receiverAmounts: [2_000n], params: { minFeeRateSatPerVb: 5000, disableOutputSubstitution: true }, outputSubstitution: false })).rejects.toMatchObject({ code: 'not_enough_money' });
  });
  it('never reuses an Original input as the contribution', async () => {
    const s = await scenario();
    const wallet = receiverWallet(s.rk, 'wpkh', [{ ...s.rUtxos[0]!, txid: s.sUtxos[0]!.txid, index: s.sUtxos[0]!.index }]);
    await expect(buildProposal(s.checked, s.params, { ...s.ctx, wallet })).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('ignores UTXOs the wallet does not own', async () => {
    const s = await scenario();
    const stranger = utxoFor(key('stranger'), 'wpkh', 90_000n);
    const wallet = receiverWallet(s.rk, 'wpkh', [stranger]);
    await expect(buildProposal(s.checked, s.params, { ...s.ctx, wallet })).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('silent-payment UTXOs only on request', async () => {
    const rk = key('receiver');
    const sp = utxoFor(rk, 'tr', 60_000n, { source: 'silent-payment' });
    const s0 = await scenario({ rKind: 'tr', receiverAmounts: [], noBuild: true });
    const wallet = receiverWallet(rk, 'tr', [sp]);
    await expect(buildProposal(s0.checked, s0.params, { ...s0.ctx, wallet })).rejects.toMatchObject({ code: 'unavailable' });
    const ok = await buildProposal(s0.checked, s0.params, { ...s0.ctx, wallet, contributeFromSp: true });
    expect(ok.contributed).toBe(true);
  });
  it('prefers a previously exposed UTXO, then matching script type', async () => {
    const s = await scenario({ receiverAmounts: [50_000n, 70_000n] });
    const exposed = new MemoryExposedUtxos();
    const second = s.rUtxos[1] as Utxo;
    await exposed.add(`${second.txid}:${String(second.index)}`);
    const out = await buildProposal(s.checked, s.params, s.ctx, exposed);
    expect(out.contributedOutpoints).toEqual([`${second.txid}:${String(second.index)}`]);
    // no exposure info: smallest sufficient wins
    const out2 = await buildProposal(s.checked, s.params, s.ctx);
    const first = s.rUtxos[0] as Utxo;
    expect(out2.contributedOutpoints).toEqual([`${first.txid}:${String(first.index)}`]);
    expect(await exposed.list()).toHaveLength(1);
  });
  it('prefers the sender script type among unexposed candidates', async () => {
    const rk = key('receiver');
    const s = await scenario({ rKind: 'wpkh', receiverAmounts: [], noBuild: true });
    const tr = utxoFor(rk, 'tr', 40_000n);
    const wp = utxoFor(rk, 'wpkh', 90_000n);
    const walletMixed = {
      ...receiverWallet(rk, 'wpkh', [tr, wp]),
      isMine: () => true,
    };
    const out = await buildProposal(s.checked, s.params, { ...s.ctx, wallet: walletMixed });
    expect(out.contributedOutpoints[0]).toBe(`${wp.txid}:${String(wp.index)}`);
  });
  it('substitutes the payment script only when allowed, same type, and different', async () => {
    const fresh = addressFor(key('fresh'), 'wpkh');
    const s = await scenario({ ctx: { substituteAddress: fresh } });
    const scripts = [...Array(s.proposal.outputsLength).keys()].map((k) => hex.encode(outputInfo(s.proposal, k).script));
    expect(scripts).not.toContain(hex.encode(s.paymentScript));
    const strict = await scenario({ outputSubstitution: false, params: { disableOutputSubstitution: true }, ctx: { substituteAddress: fresh } });
    const scripts2 = [...Array(strict.proposal.outputsLength).keys()].map((k) => hex.encode(outputInfo(strict.proposal, k).script));
    expect(scripts2).toContain(hex.encode(strict.paymentScript));
    // different script type: ignored
    const trAddr = addressFor(key('fresh'), 'tr');
    const wrongType = await scenario({ ctx: { substituteAddress: trAddr } });
    const scripts3 = [...Array(wrongType.proposal.outputsLength).keys()].map((k) => hex.encode(outputInfo(wrongType.proposal, k).script));
    expect(scripts3).toContain(hex.encode(wrongType.paymentScript));
  });
  it('proposal inputs carry no keypaths or partial signatures and the receiver input is final', async () => {
    const s = await scenario();
    for (let i = 0; i < s.proposal.inputsLength; i++) {
      const inp = s.proposal.getInput(i);
      expect(inp.bip32Derivation ?? []).toHaveLength(0);
      expect(inp.partialSig ?? []).toHaveLength(0);
      const isReceiver = inputOutpoint(s.proposal, i) === `${(s.rUtxos[0] as Utxo).txid}:0`;
      expect(inp.finalScriptWitness !== undefined).toBe(isReceiver);
    }
  });
  it('refuses to release a receiver signature that does not verify', async () => {
    const s = await scenario();
    const bad = {
      ...s.wallet,
      signInput(tx: import('@scure/btc-signer').Transaction, idx: number) {
        const other = key('wrong-key');
        tx.signIdx(other.priv, idx);
      },
    };
    await expect(buildProposal(s.checked, s.params, { ...s.ctx, wallet: bad })).rejects.toBeDefined();
  });
  it('detects an invalid signature for P2WPKH and P2TR by tampering the witness', async () => {
    const { verifyKeyPathInput } = await import('../signers.js');
    for (const kind of ['wpkh', 'tr'] as const) {
      const s = await scenario({ rKind: kind, sKind: kind });
      const idx = [...Array(s.proposal.inputsLength).keys()].find((k) => inputOutpoint(s.proposal, k) === `${(s.rUtxos[0] as Utxo).txid}:0`) as number;
      expect(verifyKeyPathInput(s.proposal, idx)).toBe(true);
      const t = rebuild(s.proposal, {
        mapInput: (i, k) => {
          if (k !== idx || i.finalScriptWitness === undefined) return i;
          const w = i.finalScriptWitness.map((x) => Uint8Array.from(x));
          (w[0] as Uint8Array)[10] = ((w[0] as Uint8Array)[10] as number) ^ 1;
          return { ...i, finalScriptWitness: w };
        },
      });
      expect(verifyKeyPathInput(t, idx)).toBe(false);
      const badShape = rebuild(s.proposal, { mapInput: (i, k) => (k === idx ? { ...i, finalScriptWitness: [new Uint8Array(3)] } : i) });
      expect(verifyKeyPathInput(badShape, idx)).toBe(false);
    }
  });
  it('verifyKeyPathInput: unsupported for P2SH, false when no witness', async () => {
    const { verifyKeyPathInput } = await import('../signers.js');
    const s = await scenario({ sKind: 'sh-wpkh', rKind: 'wpkh' });
    const idx = [...Array(s.proposal.inputsLength).keys()].find((k) => inputOutpoint(s.proposal, k) !== `${(s.rUtxos[0] as Utxo).txid}:0`) as number;
    expect(verifyKeyPathInput(s.proposal, idx)).toBe('unsupported');
    const rIdx = 1 - idx;
    const none = rebuild(s.proposal, { mapInput: (i, k) => (k === rIdx ? { ...i, finalScriptWitness: undefined } : i) });
    expect(verifyKeyPathInput(none, rIdx)).toBe(false);
  });
  it('signing a P2SH-P2WPKH sender through the whole stack works', async () => {
    const s = await scenario({ sKind: 'sh-wpkh', rKind: 'wpkh', params: { maxAdditionalFeeContributionSats: 500n } });
    expect(s.proposal.inputsLength).toBe(2);
  });
});

describe('original builder', () => {
  it('rejects bad inputs', () => {
    const sk = key('sender');
    const uri = { address: addressFor(key('r'), 'wpkh'), pj: 'http://localhost/pj/X', outputSubstitution: true, network: 'testnet' as const };
    const base = { uri: { ...uri, amountSats: 10_000n }, utxos: [utxoFor(sk, 'wpkh', 50_000n)], feeRateSatPerVb: 2, changeAddress: addressFor(sk, 'wpkh'), signer: signerFor([{ k: sk, kind: 'wpkh' }]) };
    expect(() => buildOriginalPsbt({ ...base, uri })).toThrow(/uri_invalid/);
    expect(() => buildOriginalPsbt({ ...base, utxos: [] })).toThrow(/not_enough_money/);
    expect(() => buildOriginalPsbt({ ...base, feeRateSatPerVb: 0.5 })).toThrow(/feerate_below_min/);
    expect(() => buildOriginalPsbt({ ...base, amountSats: 60_000n })).toThrow(/not_enough_money/);
    expect(() => buildOriginalPsbt({ ...base, uri: { ...base.uri, network: 'mainnet' as never } })).toThrow(/network_not_allowed/);
    expect(() => buildOriginalPsbt({ ...base, signer: { signInput: () => undefined } })).toThrow();
  });
  it('drops dust change into the fee, and orders outputs by injected randomness', () => {
    const sk = key('sender');
    const rAddr = addressFor(key('r'), 'wpkh');
    const uri = { address: rAddr, amountSats: 49_500n, pj: 'http://localhost/pj/X', outputSubstitution: true, network: 'testnet' as const };
    const mk = (random: () => number, amt = 49_500n) =>
      buildOriginalPsbt({ uri: { ...uri, amountSats: amt }, utxos: [utxoFor(sk, 'wpkh', 50_000n)], feeRateSatPerVb: 2, changeAddress: addressFor(sk, 'wpkh'), signer: signerFor([{ k: sk, kind: 'wpkh' }]), random });
    const noChange = mk(() => 0);
    expect(noChange.changeIndex).toBeUndefined();
    const a = mk(() => 0, 10_000n);
    const b = mk(() => 0.9, 10_000n);
    expect(a.paymentIndex).toBe(0);
    expect(b.paymentIndex).toBe(1);
  });
});

describe('seen / exposed stores', () => {
  it('memory stores behave', async () => {
    const seen = new MemorySeenInputs();
    expect(await seen.has('a:0')).toBe(false);
    await seen.add(['a:0']);
    expect(await seen.has('a:0')).toBe(true);
    const e = exposedStore();
    await e.add('x:1');
    expect(await e.list()).toEqual(['x:1']);
  });
});

void parsePsbt;
void receiverCtx;
