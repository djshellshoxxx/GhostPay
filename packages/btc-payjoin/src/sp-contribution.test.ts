import { schnorr } from '@noble/curves/secp256k1.js';
import { hex } from '@scure/base';
import type * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { buildProposal } from './receiver/contribute.js';
import { fakeTxid, key, scenario } from './fixtures.testutil.js';
import { inputOutpoint, type Utxo } from './psbt.js';
import { verifyKeyPathInput } from './signers.js';
import { verifyProposal } from './sender/checks.js';

/**
 * BPJ-RCV-9: a detected silent-payment P2TR output (final output key, NO BIP-341
 * tweak) can be the receiver's contributed input. The wallet signs with the
 * per-output key via the single-input signer that btc-silent-payments must
 * export (see wiring/btc-payjoin.md). Here the same logic is inlined with noble.
 */
describe('silent-payment UTXO as the contributed input', () => {
  it('signs an untweaked P2TR key-path input and the proposal verifies', async () => {
    let k = key('sp-output-0');
    for (let i = 1; k.pub[0] !== 2; i++) k = key(`sp-output-${String(i)}`); // even-y so no negation is needed
    const xonly = k.pub.slice(1);
    const script = Uint8Array.of(0x51, 0x20, ...xonly);
    const spUtxo: Utxo = { txid: fakeTxid(), index: 1, amount: 80_000n, script, source: 'silent-payment', inputVsize: 58 };
    const s = await scenario({ rKind: 'wpkh', receiverAmounts: [], noBuild: true });
    const wallet = {
      isMine: (sc: Uint8Array) => hex.encode(sc) === hex.encode(script),
      listSpendable: () => Promise.resolve([spUtxo]),
      signInput(tx: btc.Transaction, index: number) {
        const scripts: Uint8Array[] = [];
        const amounts: bigint[] = [];
        for (let i = 0; i < tx.inputsLength; i++) {
          const w = tx.getInput(i).witnessUtxo as { script: Uint8Array; amount: bigint };
          scripts.push(w.script);
          amounts.push(w.amount);
        }
        const digest = tx.preimageWitnessV1(index, scripts, 0, amounts);
        tx.updateInput(index, { tapKeySig: schnorr.sign(digest, k.priv) });
      },
    };
    const off = await buildProposal(s.checked, s.params, { ...s.ctx, wallet }).then(
      () => 'built',
      (e: unknown) => (e as { code: string }).code,
    );
    expect(off).toBe('unavailable'); // not contributed unless asked
    const out = await buildProposal(s.checked, s.params, { ...s.ctx, wallet, contributeFromSp: true });
    expect(out.contributed).toBe(true);
    const proposal = (await import('./psbt.js')).parsePsbt(out.psbt);
    const idx = [...Array(proposal.inputsLength).keys()].find((i) => inputOutpoint(proposal, i) === `${spUtxo.txid}:1`) as number;
    expect(verifyKeyPathInput(proposal, idx)).toBe(true);
    expect(verifyProposal(s.built.tx, proposal, s.params, { paymentScript: s.paymentScript }).addedInputs).toBe(1);
  });
});
