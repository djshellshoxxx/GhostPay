import { Address, NETWORK } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { toHex, mulG, xOnly } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { blockHashOf, makeBlock, p2wpkhInput, fakeTxid } from './fixtures.testutil.js';
import { generateSilentPaymentKeys } from './keys.js';
import { silentPaymentAddress } from './labels.js';
import { seededRng } from './rng.testutil.js';
import { BlindBitClient, type FetchLike, type FetchResponseLike } from './scan/blindbit.js';
import { InMemoryTweakSource } from './scan/memory.js';
import { scanBlocks, type ReceivedOutput } from './scan/scanner.js';
import { buildBitcoinUri } from './uri.js';
import { buildSpendTransaction, estimateKeyPathVsize } from './spend.js';
import { createSilentPaymentOutputs } from './sender.js';
import { computeTransactionTweak, scanOutputsForTweak } from './receiver.js';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : `OTHER:${String(e)}`;
  }
  return undefined;
};
const codeAsync = async (f: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : `OTHER:${String(e)}`;
  }
  return undefined;
};

const alice = generateSilentPaymentKeys(seededRng('audit-alice'));
const aliceAddr = silentPaymentAddress(alice, 'mainnet');

describe('B1 scanner: two block outputs sharing one x-only key', () => {
  it('reports each occurrence with its own txid / vout / amount', async () => {
    const b = makeBlock(500, [{ inputs: [p2wpkhInput('b1')], recipients: [aliceAddr] }]);
    const real = b.outputs.outputs[0];
    if (real === undefined) throw new Error('fixture');
    const copy = { xOnlyPublicKey: real.xOnlyPublicKey, txid: fakeTxid('copycat'), vout: 7, amountSats: 99n };
    const block = { tweaks: b.tweaks, outputs: { ...b.outputs, outputs: [copy, real] } };
    const found: ReceivedOutput[] = [];
    for await (const r of scanBlocks({
      source: new InMemoryTweakSource([block]),
      keys: { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey },
      fromHeight: 500,
    }))
      found.push(r);
    expect(found.map((f) => [f.txid, f.vout, f.amountSats])).toEqual([
      [copy.txid, 7, 99n],
      [real.txid, real.vout, real.amountSats],
    ]);
    expect(new Set(found.map((f) => toHex(f.xOnlyPublicKey))).size).toBe(1);
  });
});

// ---------------------------------------------------------------- spend
const wallet = generateSilentPaymentKeys(seededRng('audit-spend'));
const dest = Address(NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(7) });
const destTr = Address(NETWORK).encode({ type: 'tr', pubkey: xOnly(mulG(5n)) });
function fund(seed: string, amount: bigint) {
  const t = p2wpkhInput(seed);
  const outs = createSilentPaymentOutputs({
    inputs: [t.key],
    outpoints: [{ txid: t.input.txid, vout: t.input.vout }],
    recipients: [silentPaymentAddress(wallet, 'mainnet')],
    network: 'mainnet',
  });
  const tw = computeTransactionTweak([t.input]);
  if (tw === null) throw new Error('ineligible');
  const [f] = scanOutputsForTweak({ scanSecret: wallet.scanSecret, spendPublicKey: wallet.spendPublicKey }, tw.tweak, outs.map((o) => o.xOnlyPublicKey));
  if (f === undefined) throw new Error('not found');
  return [{ txid: fakeTxid(`f-${seed}`), vout: 0, amountSats: amount, xOnlyPublicKey: f.xOnlyPublicKey, spendTweak: f.spendTweak }];
}
const base = { spendSecret: wallet.spendSecret, network: 'mainnet' as const };

describe('B2 spend: tiny fee rate must not produce a zero fee', () => {
  it('rejects rates that round to 0 millisat/vB, accepts 0.001 with fee >= 1', () => {
    const o = fund('b2', 100_000n);
    const p = { ...base, outputs: o, destinations: [{ address: dest, amountSats: 50_000n }], changeAddress: destTr };
    expect(code(() => buildSpendTransaction({ ...p, feeRate: 0.0001 }))).toBe('INVALID_INPUT');
    expect(code(() => buildSpendTransaction({ ...p, feeRate: 1e-9 }))).toBe('INVALID_INPUT');
    expect(buildSpendTransaction({ ...p, feeRate: 0.001 }).feeSats).toBeGreaterThanOrEqual(1n);
    expect(code(() => buildSpendTransaction({ ...p, destinations: [{ address: dest }], feeRate: 0.0001 }))).toBe('INVALID_INPUT');
  });
});

describe('B3 spend: leftover without change address (boundary pinned, matches DEVIATIONS)', () => {
  it('folds at most `dust` beyond the no-change fee into the fee, refuses 1 sat more', () => {
    const vs = estimateKeyPathVsize(1, [22]);
    const feeNoChange = BigInt(vs); // rate 1 sat/vB
    const paid = 50_000n;
    const mk = (total: bigint) => buildSpendTransaction({ ...base, outputs: fund(`b3-${String(total)}`, total), destinations: [{ address: dest, amountSats: paid }], feeRate: 1 });
    expect(mk(paid + feeNoChange + 546n).feeSats).toBe(feeNoChange + 546n);
    expect(code(() => mk(paid + feeNoChange + 547n))).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('B6 spend: fee sanity guard (behaviour pinned)', () => {
  it('a fee above half of the inputs is only refused once it also exceeds 10 000 sats', () => {
    // 2000 sat input, sweep at 10 sat/vB: fee ~1100 sats (>50% of the input) is still allowed
    const o = fund('b6', 2_000n);
    const r = buildSpendTransaction({ ...base, outputs: o, destinations: [{ address: dest }], feeRate: 12 });
    expect(r.feeSats * 2n > 2_000n).toBe(true);
  });
});

describe('B5 uri: lone surrogates give a typed error', () => {
  it('buildBitcoinUri maps URIError to INVALID_URI', () => {
    expect(code(() => buildBitcoinUri({ address: aliceAddr, label: '\ud800' }))).toBe('INVALID_URI');
    expect(code(() => buildBitcoinUri({ address: aliceAddr, message: 'x\udfff' }))).toBe('INVALID_URI');
    expect(buildBitcoinUri({ address: aliceAddr, label: 'café' })).toContain('label=caf%C3%A9');
  });
});

// ---------------------------------------------------------------- blindbit
const BASE = 'https://oracle.example/api';
const goodId = { block_hash: blockHashOf(7), block_height: 7 };
const jsonRes = (body: unknown): FetchResponseLike => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
function streamRes(chunks: Uint8Array[], extra: Partial<FetchResponseLike> = {}, cancelSpy?: () => void): FetchResponseLike {
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      const next = chunks.shift();
      if (next === undefined) c.close();
      else c.enqueue(next);
    },
    cancel() {
      cancelSpy?.();
    },
  });
  return { ok: true, status: 200, json: () => Promise.reject(new Error('unused')), body, ...extra };
}
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('B4 BlindBitClient hardening', () => {
  it('requires https except for loopback', () => {
    const f: FetchLike = () => Promise.resolve(jsonRes({}));
    for (const bad of ['http://oracle.example', 'http://10.0.0.5:8000', 'http://localhost.evil.test']) {
      expect(code(() => new BlindBitClient({ baseUrl: bad, fetch: f })), bad).toBe('INVALID_INPUT');
    }
    for (const ok of ['https://oracle.example', 'http://localhost:8000', 'http://127.0.0.1:8000/x', 'http://[::1]:8000']) {
      expect(code(() => new BlindBitClient({ baseUrl: ok, fetch: f })), ok).toBeUndefined();
    }
  });
  it('validates timeout / byte-cap options', () => {
    const f: FetchLike = () => Promise.resolve(jsonRes({}));
    for (const o of [{ timeoutMs: 0 }, { timeoutMs: Number.NaN }, { timeoutMs: Infinity }, { maxResponseBytes: 0 }, { maxResponseBytes: 1.5 }]) {
      expect(code(() => new BlindBitClient({ baseUrl: BASE, fetch: f, ...o }))).toBe('INVALID_INPUT');
    }
  });
  it('applies a default-on deadline: a hanging server fails with TRANSPORT_FAILURE', async () => {
    const hang: FetchLike = () => new Promise<FetchResponseLike>(() => undefined);
    const c = new BlindBitClient({ baseUrl: BASE, fetch: hang, timeoutMs: 20 });
    expect(await codeAsync(() => c.getTipHeight())).toBe('TRANSPORT_FAILURE');
    const slowBody: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => undefined) });
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: BASE, fetch: slowBody, timeoutMs: 20 }).getTipHeight())).toBe('TRANSPORT_FAILURE');
  });
  it('a caller abort during a hang still maps to ABORTED', async () => {
    const ctl = new AbortController();
    const hang: FetchLike = () => new Promise<FetchResponseLike>((_r, rej) => { ctl.signal.addEventListener('abort', () => { rej(new Error('x')); }); });
    const c = new BlindBitClient({ baseUrl: BASE, fetch: hang });
    const p = codeAsync(() => c.getTipHeight(ctl.signal));
    ctl.abort();
    expect(await p).toBe('ABORTED');
  });
  it('caps the streamed body and cancels the stream', async () => {
    let cancelled = 0;
    const f: FetchLike = () => Promise.resolve(streamRes([enc('{"height":'), enc('1'.repeat(100)), enc('}')], {}, () => { cancelled++; }));
    const c = new BlindBitClient({ baseUrl: BASE, fetch: f, maxResponseBytes: 50 });
    expect(await codeAsync(() => c.getTipHeight())).toBe('INVALID_RESPONSE');
    expect(cancelled).toBe(1);
  });
  it('rejects an oversized Content-Length without reading; reads small streamed bodies', async () => {
    const hdr = { headers: { get: (n: string) => (n === 'content-length' ? '999999' : null) } };
    const big: FetchLike = () => Promise.resolve(streamRes([enc('{"height":1}')], hdr));
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: BASE, fetch: big, maxResponseBytes: 100 }).getTipHeight())).toBe('INVALID_RESPONSE');
    const ok: FetchLike = () => Promise.resolve(streamRes([enc('{"hei'), enc('ght":42}')]));
    expect(await new BlindBitClient({ baseUrl: BASE, fetch: ok }).getTipHeight()).toBe(42);
  });
  it('bad JSON in a stream and a null body are INVALID_RESPONSE; non-2xx cancels its body', async () => {
    const bad: FetchLike = () => Promise.resolve(streamRes([enc('{nope')]));
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: BASE, fetch: bad }).getTipHeight())).toBe('INVALID_RESPONSE');
    const nul: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), body: null });
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: BASE, fetch: nul }).getTipHeight())).toBe('INVALID_RESPONSE');
    let cancelled = 0;
    const err: FetchLike = () => Promise.resolve(streamRes([enc('x')], { ok: false, status: 500 }, () => { cancelled++; }));
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: BASE, fetch: err }).getTipHeight())).toBe('TRANSPORT_FAILURE');
    expect(cancelled).toBe(1);
  });
  it.each([
    ['vout above u32', { vout: 2 ** 32 }],
    ['amount above 21M BTC', { amount: 2_100_000_000_000_001 }],
  ])('utxos: rejects %s', async (_n, over) => {
    const entry = { txid: 'ab'.repeat(32), vout: 0, pubkey: '11'.repeat(32), amount: 5, ...over };
    const f: FetchLike = () => Promise.resolve(jsonRes({ block_identifier: goodId, index: [entry] }));
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: BASE, fetch: f }).getOutputs(7))).toBe('INVALID_RESPONSE');
    const edge = { ...entry, vout: 0xffffffff, amount: 2_100_000_000_000_000 };
    const g: FetchLike = () => Promise.resolve(jsonRes({ block_identifier: goodId, index: [edge] }));
    expect((await new BlindBitClient({ baseUrl: BASE, fetch: g }).getOutputs(7)).outputs[0]?.vout).toBe(0xffffffff);
  });
});
