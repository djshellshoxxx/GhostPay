// Killer tests for surviving Stryker mutants in packages/btc-silent-payments. Drop into packages/btc-silent-payments/src/.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { Address, NETWORK } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { hasEvenY, mulG, xOnly } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { fakeTxid, p2pkhInput, p2shP2wpkhInput, p2trInput, p2wpkhInput, secretFrom } from './fixtures.testutil.js';
import { extractInputPublicKey, spendsFutureSegwit } from './inputs.js';
import { generateSilentPaymentKeys } from './keys.js';
import { createLabelTable, silentPaymentAddress } from './labels.js';
import { computeTransactionTweak, scanOutputsForTweak, spendPrivateKey, type FoundOutput } from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { unsafeRevealSecret } from './secret.js';
import { createSilentPaymentOutputs } from './sender.js';
import { MAX_FEE_RATE_SAT_PER_VB, buildSpendTransaction, estimateKeyPathVsize, type BuildSpendParams, type SpendableOutput } from './spend.js';
import { parseWitness } from './tx.js';

const code = (f: () => unknown): string => {
  try { f(); } catch (e) { return e instanceof SilentPaymentError ? e.code : `OTHER:${(e as Error).message}`; }
  return 'NO_THROW';
};
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('killers: receiver.ts spendPrivateKey postcondition (receiver.ts:233)', () => {
  it('the returned private key always maps to the EVEN-y point whose x is xOnlyPublicKey', () => {
    let odd = 0;
    for (let i = 0; i < 48; i++) {
      const spend = secretFrom(`ks:${i}`);
      const tweak = secretFrom(`kt:${i}`);
      const raw = (bytesToNumberBE(spend) + bytesToNumberBE(tweak)) % secp256k1.Point.Fn.ORDER;
      if (!hasEvenY(mulG(raw))) odd++;
      const k = spendPrivateKey(spend, tweak);
      const pub = secp256k1.getPublicKey(unsafeRevealSecret(k.privateKey), true);
      expect(pub[0], `i=${i}`).toBe(0x02);
      expect(hex(pub.subarray(1))).toBe(hex(k.xOnlyPublicKey));
    }
    expect(odd).toBeGreaterThan(5);   // sanity: both parities were exercised
  });
});

describe('killers: receiver.ts computeTransactionTweak', () => {
  it('no inputs -> null; ineligible-only inputs -> null (receiver.ts:68)', () => {
    expect(computeTransactionTweak([])).toBeNull();
    const t = p2wpkhInput('ine').input;
    expect(computeTransactionTweak([{ ...t, prevoutScriptPubKey: Uint8Array.of(0x6a) }])).toBeNull();
  });
});

describe('killers: inputs.ts script classification is exact', () => {
  const flip = (b: Uint8Array, i: number) => { const o = b.slice(); o[i] = (o[i]! ^ 0x01) & 0xff; return o; };
  it('near-miss P2PKH scriptPubKeys are never eligible (inputs.ts:30)', () => {
    const t = p2pkhInput('nm1').input;
    expect(extractInputPublicKey(t)).not.toBeNull();
    for (const i of [0, 1, 2, 23, 24]) expect(extractInputPublicKey({ ...t, prevoutScriptPubKey: flip(t.prevoutScriptPubKey, i) }), `byte ${i}`).toBeNull();
    expect(extractInputPublicKey({ ...t, prevoutScriptPubKey: concatBytes(t.prevoutScriptPubKey, Uint8Array.of(0xac)) })).toBeNull();
    expect(extractInputPublicKey({ ...t, prevoutScriptPubKey: t.prevoutScriptPubKey.subarray(0, 24) })).toBeNull();
  });
  it('near-miss P2SH-P2WPKH (inputs.ts:34, 98)', () => {
    const t = p2shP2wpkhInput('nm2').input;
    expect(extractInputPublicKey(t)).not.toBeNull();
    for (const i of [0, 1, 22]) expect(extractInputPublicKey({ ...t, prevoutScriptPubKey: flip(t.prevoutScriptPubKey, i) }), `spk byte ${i}`).toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: t.scriptSig.subarray(0, 22) })).toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: concatBytes(t.scriptSig, Uint8Array.of(0)) })).toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: flip(t.scriptSig, 0) })).toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: flip(t.scriptSig, 1) })).toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: flip(t.scriptSig, 2) })).toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: flip(t.scriptSig, 10) })).toBeNull();   // redeem-script hash no longer matches
  });
  it('near-miss P2WPKH / P2TR / future segwit (inputs.ts:37-40, 59-61)', () => {
    const w = p2wpkhInput('nm3').input;
    expect(extractInputPublicKey(w)).not.toBeNull();
    for (const spk of [flip(w.prevoutScriptPubKey, 0), flip(w.prevoutScriptPubKey, 1), concatBytes(w.prevoutScriptPubKey, Uint8Array.of(0)), w.prevoutScriptPubKey.subarray(0, 21)]) {
      expect(extractInputPublicKey({ ...w, prevoutScriptPubKey: spk })).toBeNull();
    }
    const tr = p2trInput('nm4').input;
    expect(extractInputPublicKey(tr)).not.toBeNull();
    for (const spk of [flip(tr.prevoutScriptPubKey, 0), flip(tr.prevoutScriptPubKey, 1), concatBytes(tr.prevoutScriptPubKey, Uint8Array.of(0)), tr.prevoutScriptPubKey.subarray(0, 33)]) {
      expect(extractInputPublicKey({ ...tr, prevoutScriptPubKey: spk })).toBeNull();
    }
    // witness v2..v16 detection: exact length byte and length window 4..42
    const prog = (v: number, n: number) => concatBytes(Uint8Array.of(v, n), new Uint8Array(n).fill(7));
    const fut = (spk: Uint8Array) => spendsFutureSegwit({ ...w, prevoutScriptPubKey: spk });
    expect(fut(prog(0x52, 2))).toBe(true);            // shortest legal program (len 4)
    expect(fut(prog(0x60, 40))).toBe(true);           // longest legal program (len 42)
    expect(fut(prog(0x51, 32))).toBe(false);          // v1 is taproot, not "future"
    expect(fut(prog(0x61, 32))).toBe(false);
    expect(fut(prog(0x52, 41))).toBe(false);          // len 43
    expect(fut(Uint8Array.of(0x52, 1, 7))).toBe(false); // len 3
    expect(fut(concatBytes(Uint8Array.of(0x52, 5), new Uint8Array(32)))).toBe(false); // length byte mismatch
    expect(fut(new Uint8Array(0))).toBe(false);
  });
  it('P2TR: annex stripping, NUMS script-path exclusion, empty witness (inputs.ts:108-113)', () => {
    const tr = p2trInput('nm5').input;
    const NUMS = Uint8Array.from(Buffer.from('50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0', 'hex'));
    const cb = concatBytes(Uint8Array.of(0xc0), NUMS);                     // control block with the NUMS internal key
    const sig = new Uint8Array(64).fill(1);
    const annex = Uint8Array.of(0x50, 1, 2);
    expect(extractInputPublicKey({ ...tr, witness: [] })).toBeNull();
    expect(extractInputPublicKey({ ...tr, witness: [sig] })).not.toBeNull();                       // key path
    expect(extractInputPublicKey({ ...tr, witness: [sig, annex] })).not.toBeNull();                // key path + annex
    expect(extractInputPublicKey({ ...tr, witness: [annex] })).not.toBeNull();                     // single item is never an annex
    expect(extractInputPublicKey({ ...tr, witness: [sig, new Uint8Array(0)] })).not.toBeNull();    // empty last item is not an annex
    expect(extractInputPublicKey({ ...tr, witness: [sig, Uint8Array.of(0x51, 1)] })).not.toBeNull();   // last item: not 0x50-prefixed, not NUMS control block
    expect(extractInputPublicKey({ ...tr, witness: [sig, new Uint8Array(0x21).fill(0xc0)] })).not.toBeNull(); // random control block
    expect(extractInputPublicKey({ ...tr, witness: [sig, new Uint8Array(0), cb] })).toBeNull();    // script path with NUMS internal key
    expect(extractInputPublicKey({ ...tr, witness: [sig, new Uint8Array(0), cb, annex] })).toBeNull(); // ... and a trailing annex
    expect(extractInputPublicKey({ ...tr, witness: [cb, annex] })).not.toBeNull();                  // annex popped, one item left -> key path
  });
});

describe('killers: tx.ts parseWitness compact-size handling (tx.ts:81-94)', () => {
  const item = (n: number) => new Uint8Array(n).fill(0xab);
  const enc = (n: number): number[] => (n < 0xfd ? [n] : n <= 0xffff ? [0xfd, n & 0xff, n >> 8] : [0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
  const wit = (...items: Uint8Array[]) => hex(concatBytes(Uint8Array.of(...enc(items.length)), ...items.map((i) => concatBytes(Uint8Array.of(...enc(i.length)), i))));
  it('round-trips lengths around each compact-size boundary', () => {
    for (const n of [0, 1, 252, 253, 254, 255, 256, 65_535, 65_536, 70_000]) {
      const r = parseWitness(wit(item(n)));
      expect(r.length).toBe(1);
      expect(r[0]!.length).toBe(n);
    }
    expect(parseWitness('')).toEqual([]);
    expect(parseWitness('00')).toEqual([]);
  });
  it('rejects non-canonical, truncated and over-long encodings', () => {
    const body = (n: number) => hex(item(n));
    expect(code(() => parseWitness(`01fdfc00${body(252)}`))).toBe('INVALID_INPUT');             // 252 written with 0xfd
    expect(code(() => parseWitness(`01fe00ff0000${body(65_280)}`))).toBe('INVALID_INPUT');      // 65280 written with 0xfe
    expect(code(() => parseWitness(`01feffff0000${body(65_535)}`))).toBe('INVALID_INPUT');      // 65535 written with 0xfe
    expect(code(() => parseWitness(`01ff0000000001000000${'00'.repeat(4)}`))).toBe('INVALID_INPUT'); // 8-byte form, longer than the data
    expect(code(() => parseWitness(`01fd`))).toBe('INVALID_INPUT');                             // truncated width
    expect(code(() => parseWitness(`01fd0001`))).toBe('INVALID_INPUT');                         // value 256 > data
    expect(code(() => parseWitness(`02${wit(item(1)).slice(2)}`))).toBe('INVALID_INPUT');       // count 2, one item
    expect(code(() => parseWitness(`${wit(item(3))}00`))).toBe('INVALID_INPUT');                // trailing byte
    expect(code(() => parseWitness(`01${enc(5).map((x) => x.toString(16).padStart(2, '0')).join('')}00`))).toBe('INVALID_INPUT'); // item longer than data
  });
});

describe('killers: spend.ts fee, dust and input guards', () => {
  const wallet = generateSilentPaymentKeys(seededRng('killer-wallet'));
  const labels = createLabelTable(wallet.scanSecret, []);
  const keysFor = { scanSecret: wallet.scanSecret, spendPublicKey: wallet.spendPublicKey, labels };
  function fund(seed: string, amount: bigint, vout = 0): SpendableOutput {
    const t = p2wpkhInput(seed);
    const outs = createSilentPaymentOutputs({ inputs: [t.key], outpoints: [{ txid: t.input.txid, vout: t.input.vout }], recipients: [silentPaymentAddress(wallet, 'mainnet')], network: 'mainnet' });
    const tw = computeTransactionTweak([t.input])!;
    const f = scanOutputsForTweak(keysFor, tw.tweak, outs.map((o) => o.xOnlyPublicKey))[0] as FoundOutput;
    return { txid: fakeTxid(`fund-${seed}`), vout, amountSats: amount, xOnlyPublicKey: f.xOnlyPublicKey, spendTweak: f.spendTweak };
  }
  const WPKH = Address(NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(7) });
  const TR = Address(NETWORK).encode({ type: 'tr', pubkey: xOnly(mulG(5n)) });
  const base = (o: SpendableOutput[], over: Partial<BuildSpendParams> = {}): BuildSpendParams =>
    ({ outputs: o, spendSecret: wallet.spendSecret, destinations: [{ address: WPKH }], feeRate: 2, network: 'mainnet', ...over });
  const V1 = estimateKeyPathVsize(1, [22]);        // 1 input -> 1 P2WPKH output
  const FEE = BigInt(2 * V1);
  const DUST = 546n;

  it('sweep: net must be > 0 and >= dust (spend.ts:220-221)', () => {
    expect(code(() => buildSpendTransaction(base([fund('s1', FEE)])))).toBe('INSUFFICIENT_FUNDS');
    expect(code(() => buildSpendTransaction(base([fund('s2', FEE + 1n)])))).toBe('DUST_OUTPUT');
    expect(code(() => buildSpendTransaction(base([fund('s3', FEE + DUST - 1n)])))).toBe('DUST_OUTPUT');
    const ok = buildSpendTransaction(base([fund('s4', FEE + DUST)]));
    expect(ok.feeSats).toBe(FEE);
    expect(ok.changeSats).toBe(0n);
  });
  it('payment amounts: == dust allowed, dust-1 rejected (spend.ts:224)', () => {
    const o = [fund('p1', 100_000n)];
    expect(code(() => buildSpendTransaction(base(o, { destinations: [{ address: WPKH, amountSats: DUST - 1n }], changeAddress: TR })))).toBe('DUST_OUTPUT');
    expect(code(() => buildSpendTransaction(base(o, { destinations: [{ address: WPKH, amountSats: DUST }], changeAddress: TR })))).toBe('NO_THROW');
  });
  it('funds must cover payment + fee exactly (spend.ts:225)', () => {
    const paid = 10_000n;
    expect(code(() => buildSpendTransaction(base([fund('f1', paid + FEE - 1n)], { destinations: [{ address: WPKH, amountSats: paid }] })))).toBe('INSUFFICIENT_FUNDS');
    const r = buildSpendTransaction(base([fund('f2', paid + FEE)], { destinations: [{ address: WPKH, amountSats: paid }] }));
    expect(r.feeSats).toBe(FEE);
    expect(r.changeSats).toBe(0n);
  });
  it('change is created exactly when it reaches the dust limit (spend.ts:229)', () => {
    const paid = 10_000n;
    const VC = estimateKeyPathVsize(1, [22, 34]);
    const feeC = BigInt(2 * VC);
    const mk = (extra: bigint, seed: string) => buildSpendTransaction(base([fund(seed, paid + feeC + extra)], { destinations: [{ address: WPKH, amountSats: paid }], changeAddress: TR }));
    const atDust = mk(DUST, 'c1');
    expect(atDust.changeSats).toBe(DUST);
    expect(atDust.feeSats).toBe(feeC);
    // one satoshi short of a dust change: the leftover is too large to burn silently -> refused, never a sub-dust change output
    expect(code(() => mk(DUST - 1n, 'c2'))).toBe('INSUFFICIENT_FUNDS');
  });
  it('a leftover larger than dust is never silently burned without a change address (spend.ts:234)', () => {
    const paid = 10_000n;
    expect(code(() => buildSpendTransaction(base([fund('l1', paid + FEE + DUST + 1n)], { destinations: [{ address: WPKH, amountSats: paid }] })))).toBe('INSUFFICIENT_FUNDS');
    const r = buildSpendTransaction(base([fund('l2', paid + FEE + DUST)], { destinations: [{ address: WPKH, amountSats: paid }] }));
    expect(r.feeSats).toBe(FEE + DUST);
  });
  it('FEE_TOO_HIGH: fee above 10 000 sat AND above half the input total; both bounds are strict (spend.ts:237)', () => {
    const rate = Math.ceil(10_001 / V1);                 // fee > 10 000
    const fee = BigInt(rate * V1);
    expect(fee > 10_000n).toBe(true);
    expect(code(() => buildSpendTransaction(base([fund('h1', 2n * fee - 1n)], { feeRate: rate })))).toBe('FEE_TOO_HIGH');
    expect(code(() => buildSpendTransaction(base([fund('h2', 2n * fee)], { feeRate: rate })))).toBe('NO_THROW');
    // a large fee on a large input is fine; a small fee that is most of a tiny input is fine too (below 10 000)
    expect(code(() => buildSpendTransaction(base([fund('h3', 50n * fee)], { feeRate: rate })))).toBe('NO_THROW');
    expect(code(() => buildSpendTransaction(base([fund('h4', FEE + DUST)], { feeRate: 2 })))).toBe('NO_THROW');
    // a fee of 10 000 sat or less is never "too high" by this rule, even when it exceeds half of the input total
    const small = BigInt(Math.round(10 * V1));
    expect(small * 2n > small + DUST).toBe(true);
    expect(code(() => buildSpendTransaction(base([fund('h5', small + DUST)], { feeRate: 10 })))).toBe('NO_THROW');
    // exactly 10 000 sat (fractional rate 101.01 sat/vB * 99 vB = 9999.99 -> 10 000): still allowed; 10 001 is not
    expect(V1).toBe(99);
    const edge = buildSpendTransaction(base([fund('h6', 12_000n)], { feeRate: 101.01 }));
    expect(edge.feeSats).toBe(10_000n);
    expect(code(() => buildSpendTransaction(base([fund('h7', 12_000n)], { feeRate: 101.02 })))).toBe('FEE_TOO_HIGH');
  });
  it('fee-rate cap is inclusive; non-finite / non-positive rates are INVALID_INPUT (spend.ts:178-179)', () => {
    const big = [fund('r1', 10_000_000_000n)];
    expect(code(() => buildSpendTransaction(base(big, { feeRate: MAX_FEE_RATE_SAT_PER_VB })))).toBe('NO_THROW');
    expect(code(() => buildSpendTransaction(base(big, { feeRate: MAX_FEE_RATE_SAT_PER_VB + 1 })))).toBe('FEE_TOO_HIGH');
    for (const feeRate of [0, -1, NaN, Infinity]) expect(code(() => buildSpendTransaction(base(big, { feeRate })))).toBe('INVALID_INPUT');
    expect(code(() => buildSpendTransaction(base(big, { dustLimitSats: -1n })))).toBe('INVALID_INPUT');
    expect(code(() => buildSpendTransaction(base(big, { dustLimitSats: 0n })))).toBe('NO_THROW');
  });
  it('input list validation: count cap, txid shape, duplicate (case-insensitive), vout and key length (spend.ts:176,185-187)', () => {
    const o = fund('v1', 1_000_000n);
    expect(code(() => buildSpendTransaction(base([])))).toBe('INVALID_INPUT');
    expect(code(() => buildSpendTransaction(base(Array.from({ length: 5_001 }, (_, i) => ({ ...o, vout: i })))))).toBe('INVALID_INPUT');
    for (const txid of [`zz${o.txid.slice(2)}`, `${o.txid}0`, o.txid.slice(1), `x${o.txid}`, `${o.txid}x`]) {
      expect(code(() => buildSpendTransaction(base([{ ...o, txid }]))), txid).toBe('INVALID_INPUT');
    }
    expect(code(() => buildSpendTransaction(base([o, { ...o, txid: o.txid.toUpperCase() }])))).toBe('INVALID_INPUT');
    for (const vout of [-1, 1.5, 0x100000000, NaN]) expect(code(() => buildSpendTransaction(base([{ ...o, vout }]))), String(vout)).toBe('INVALID_INPUT');
    expect(code(() => buildSpendTransaction(base([{ ...o, vout: 0xffffffff }])))).toBe('NO_THROW');
    for (const n of [31, 33]) expect(code(() => buildSpendTransaction(base([{ ...o, xOnlyPublicKey: new Uint8Array(n) }])))).toBe('INVALID_INPUT');
    expect(code(() => buildSpendTransaction(base([{ ...o, amountSats: 0n }])))).toBe('INVALID_AMOUNT');
    expect(code(() => buildSpendTransaction(base([{ ...o, amountSats: 21_000_000n * 100_000_000n + 1n }])))).toBe('INVALID_AMOUNT');
    expect(code(() => buildSpendTransaction(base([{ ...o, amountSats: 5 as never }])))).toBe('INVALID_AMOUNT');
  });
  it('vsize estimate follows the BIP-141 weight formula at every compact-size boundary (spend.ts:75)', () => {
    const vi = (n: number) => (n < 0xfd ? 1 : n <= 0xffff ? 3 : 5);
    const ref = (nIn: number, outs: number[]) =>
      Math.ceil((4 * (4 + vi(nIn) + vi(outs.length) + 4) + 2 + nIn * (4 * 41 + 66) + outs.reduce((a, l) => a + 4 * (8 + vi(l) + l), 0)) / 4);
    for (const n of [1, 252, 253, 254, 65_535, 65_536]) expect(estimateKeyPathVsize(n, [22]), `n=${n}`).toBe(ref(n, [22]));
    for (const m of [1, 252, 253, 254]) expect(estimateKeyPathVsize(1, new Array<number>(m).fill(22)), `m=${m}`).toBe(ref(1, new Array<number>(m).fill(22)));
    for (const l of [22, 34, 252, 253, 254]) expect(estimateKeyPathVsize(1, [l]), `len=${l}`).toBe(ref(1, [l]));
  });
});

// ---- scan/ ----
import { toHex as toHex2 } from './ecc.js';
import { blockHashOf, makeBlock } from './fixtures.testutil.js';
import { BlindBitClient, type FetchLike } from './scan/blindbit.js';
import { InMemoryTweakSource } from './scan/memory.js';
import { scanBlocks, type ReceivedOutput } from './scan/scanner.js';
import { changeAddress } from './labels.js';

describe('killers: scan/blindbit.ts base URL hardening (blindbit.ts:100,103)', () => {
  const mk = (baseUrl: string) => () => new BlindBitClient({ baseUrl, fetch: (() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as never });
  it('rejects credentials (user-only and password-only), query, fragment and non-http(s) schemes', () => {
    for (const u of ['https://user@oracle.example/api', 'https://:pw@oracle.example/api', 'https://u:p@oracle.example', 'https://oracle.example/api?x=1', 'https://oracle.example/api#f', 'ftp://oracle.example', 'file:///etc/passwd', 'not a url', '']) {
      expect(code(mk(u)), u).toBe('INVALID_INPUT');
    }
    expect(code(mk('https://oracle.example/api'))).toBe('NO_THROW');
    expect(code(mk('http://127.0.0.1:8080'))).toBe('NO_THROW');
  });
  it('strips ALL trailing slashes before appending the path', async () => {
    const urls: string[] = [];
    const f: FetchLike = ((url: string) => { urls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({ height: 5 }) }); }) as never;
    await new BlindBitClient({ baseUrl: 'https://oracle.example/api///', fetch: f }).getTipHeight();
    expect(urls).toEqual(['https://oracle.example/api/info']);
  });
});

describe('killers: scan/scanner.ts range, abort and consistency checks', () => {
  const alice = generateSilentPaymentKeys(seededRng('kill-scan'));
  const addr = silentPaymentAddress(alice, 'mainnet');
  const keys = { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey };
  const src = () => new InMemoryTweakSource([
    makeBlock(0, [{ inputs: [p2wpkhInput('k0')], recipients: [addr] }]),
    makeBlock(1, [{ inputs: [p2wpkhInput('k1')], recipients: [addr] }]),
  ]);
  const collect = async (it: AsyncIterable<ReceivedOutput>) => { const o: ReceivedOutput[] = []; for await (const r of it) o.push(r); return o; };
  const run = async (p: Parameters<typeof scanBlocks>[0]) => { try { return { ok: await collect(scanBlocks(p)) }; } catch (e) { return { err: e instanceof SilentPaymentError ? e.code : `OTHER:${(e as Error).message}` }; } };

  it('height 0 is scannable; negative / fractional start heights are rejected (scanner.ts:47)', async () => {
    expect((await run({ source: src(), keys, fromHeight: 0 }) as { ok: ReceivedOutput[] }).ok.map((f) => f.height)).toEqual([0, 1]);
    for (const h of [-1, 0.5, NaN]) expect(await run({ source: src(), keys, fromHeight: h })).toEqual({ err: 'INVALID_INPUT' });
  });
  it('toHeight == fromHeight - 1 is an empty range; anything lower is invalid (scanner.ts:50)', async () => {
    expect(await run({ source: src(), keys, fromHeight: 1, toHeight: 0 })).toEqual({ ok: [] });
    expect(await run({ source: src(), keys, fromHeight: 1, toHeight: -1 })).toEqual({ err: 'INVALID_INPUT' });
    expect(await run({ source: src(), keys, fromHeight: 1, toHeight: 0.5 })).toEqual({ err: 'INVALID_INPUT' });
  });
  it('an already-aborted signal ends the scan before any source request (scanner.ts:48)', async () => {
    const s = src(); const ac = new AbortController(); ac.abort();
    expect(await run({ source: s, keys, fromHeight: 0, signal: ac.signal })).toEqual({ ok: [] });
    expect(s.requests).toEqual([]);
  });
  it('aborting between blocks / between tweaks stops without further requests (scanner.ts:53,67)', async () => {
    const s = src(); const ac = new AbortController();
    const out: ReceivedOutput[] = [];
    for await (const r of scanBlocks({ source: s, keys, fromHeight: 0, signal: ac.signal })) { out.push(r); ac.abort(); }
    expect(out.map((f) => f.height)).toEqual([0]);
    expect(s.requests.filter((r) => r.method === 'getTweaks').length).toBe(1);
  });
  it('tweak/output height or hash disagreement aborts with REORG_DETECTED (scanner.ts:58)', async () => {
    const b = makeBlock(1, [{ inputs: [p2wpkhInput('k1')], recipients: [addr] }]);
    const bad = (mut: (x: ReturnType<typeof makeBlock>) => ReturnType<typeof makeBlock>) => new InMemoryTweakSource([mut(structuredClone(b))]);
    expect(await run({ source: bad((x) => ({ ...x, outputs: { ...x.outputs, height: 2 } })), keys, fromHeight: 1, toHeight: 1 })).toEqual({ err: 'REORG_DETECTED' });
    expect(await run({ source: bad((x) => ({ ...x, outputs: { ...x.outputs, blockHash: blockHashOf(99) } })), keys, fromHeight: 1, toHeight: 1 })).toEqual({ err: 'REORG_DETECTED' });
    expect(toHex2(new Uint8Array(0))).toBe('');
  });
  it('outputs without txid / vout / amount metadata do not invent them (scanner.ts:72-74)', async () => {
    const b = makeBlock(1, [{ inputs: [p2wpkhInput('k1')], recipients: [addr] }]);
    const stripped = { ...b, outputs: { ...b.outputs, outputs: b.outputs.outputs.map((o) => ({ xOnlyPublicKey: o.xOnlyPublicKey })) } };
    const r = (await run({ source: new InMemoryTweakSource([stripped]), keys, fromHeight: 1, toHeight: 1 }) as { ok: ReceivedOutput[] }).ok;
    expect(r.length).toBe(1);
    expect('txid' in r[0]!).toBe(false);
    expect('vout' in r[0]!).toBe(false);
    expect('amountSats' in r[0]!).toBe(false);
    void changeAddress;
  });
  it('InMemoryTweakSource tip of an empty chain is -1 (memory.ts:30)', async () => {
    expect(await new InMemoryTweakSource([]).getTipHeight()).toBe(-1);
  });
});
