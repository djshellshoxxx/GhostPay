import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from './errors.js';
import { blockHashOf, fakeTxid, makeBlock, p2wpkhInput } from './fixtures.testutil.js';
import { generateSilentPaymentKeys } from './keys.js';
import { silentPaymentAddress } from './labels.js';
import { seededRng } from './rng.testutil.js';
import { BlindBitClient, type FetchLike, type FetchResponseLike } from './scan/blindbit.js';
import { InMemoryTweakSource } from './scan/memory.js';
import { DEFAULT_MAX_SCAN_BLOCKS, MAX_SCAN_HEIGHT, scanBlocks, type ReceivedOutput, type ScanBlocksParams } from './scan/scanner.js';
import type { BlockOutput, TweakSource } from './scan/types.js';
import { buildBitcoinUri, parseBitcoinUri } from './uri.js';

const alice = generateSilentPaymentKeys(seededRng('r4b-alice'));
const addr = silentPaymentAddress(alice, 'mainnet');
const keys = { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey };

const codeAsync = async (f: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : `OTHER:${String(e)}`;
  }
  return undefined;
};
const codeSync = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : `OTHER:${String(e)}`;
  }
  return undefined;
};
async function collect(p: ScanBlocksParams): Promise<ReceivedOutput[]> {
  const out: ReceivedOutput[] = [];
  for await (const r of scanBlocks(p)) out.push(r);
  return out;
}
const block = (h = 600) => makeBlock(h, [{ inputs: [p2wpkhInput(`r4b-${String(h)}`)], recipients: [addr] }]);
const withOutputs = (h: number, mod: (o: BlockOutput[]) => BlockOutput[]) => {
  const b = block(h);
  return { tweaks: b.tweaks, outputs: { ...b.outputs, outputs: mod([...b.outputs.outputs]) } };
};

describe('item 1: hostile tip height (scanner)', () => {
  const tipSource = (tip: number): TweakSource => ({
    getTipHeight: () => Promise.resolve(tip),
    getTweaks: () => Promise.reject(new SilentPaymentError('TRANSPORT_FAILURE')),
    getOutputs: () => Promise.reject(new SilentPaymentError('TRANSPORT_FAILURE')),
  });
  it('rejects a tip above u32 and a span above maxBlocks before any block request', async () => {
    const src = tipSource(2 ** 40);
    expect(await codeAsync(() => collect({ source: src, keys, fromHeight: 0 }))).toBe('INVALID_INPUT');
    expect(await codeAsync(() => collect({ source: tipSource(MAX_SCAN_HEIGHT), keys, fromHeight: 0 }))).toBe('INVALID_INPUT');
    expect(DEFAULT_MAX_SCAN_BLOCKS).toBeLessThan(MAX_SCAN_HEIGHT);
    expect(await codeAsync(() => collect({ source: tipSource(10), keys, fromHeight: 0, maxBlocks: 10 }))).toBe('INVALID_INPUT');
    expect(await codeAsync(() => collect({ source: new InMemoryTweakSource([block(5)]), keys, fromHeight: 5, maxBlocks: 1 }))).toBeUndefined();
  });
  it.each([0, -1, 1.5, Number.NaN])('rejects maxBlocks %s', async (m) => {
    expect(await codeAsync(() => collect({ source: new InMemoryTweakSource([block(5)]), keys, fromHeight: 5, maxBlocks: m }))).toBe('INVALID_INPUT');
  });
  it('rejects fromHeight above u32', async () => {
    expect(await codeAsync(() => collect({ source: tipSource(0), keys, fromHeight: 2 ** 32, toHeight: 2 ** 32 }))).toBe('INVALID_INPUT');
  });
  it('BlindBitClient: tip / info height above u32 is INVALID_RESPONSE', async () => {
    const mk = (h: number): FetchLike => () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ height: h, network: 'main', tweaks_only: true, tweaks_full_basic: true, tweaks_full_with_dust_filter: true, tweaks_cut_through_with_dust_filter: true }),
      });
    const c = (h: number) => new BlindBitClient({ baseUrl: 'https://o.example', fetch: mk(h) });
    expect(await codeAsync(() => c(2 ** 32).getTipHeight())).toBe('INVALID_RESPONSE');
    expect(await codeAsync(() => c(2 ** 32).getInfo())).toBe('INVALID_RESPONSE');
    expect(await c(0xffffffff).getTipHeight()).toBe(0xffffffff);
  });
});

describe('item 4: output metadata bounds in the scanner (any TweakSource)', () => {
  it.each([
    ['vout above u32', { vout: 2 ** 32 }],
    ['negative vout', { vout: -1 }],
    ['fractional vout', { vout: 1.5 }],
    ['amount above MAX_MONEY', { amountSats: 2_100_000_000_000_001n }],
    ['negative amount', { amountSats: -1n }],
    ['number amount', { amountSats: 5 as unknown as bigint }],
    ['short txid', { txid: 'ab' }],
    ['uppercase txid', { txid: 'AB'.repeat(32) }],
  ])('rejects %s', async (_n, over) => {
    const b = withOutputs(600, (o) => o.map((x) => ({ ...x, ...over })));
    expect(await codeAsync(() => collect({ source: new InMemoryTweakSource([b]), keys, fromHeight: 600 }))).toBe('INVALID_RESPONSE');
  });
  it('accepts the boundary values', async () => {
    const b = withOutputs(600, (o) => o.map((x) => ({ ...x, vout: 0xffffffff, amountSats: 2_100_000_000_000_000n })));
    expect(await collect({ source: new InMemoryTweakSource([b]), keys, fromHeight: 600 })).toHaveLength(1);
  });
  it('outputs without txid/vout/amount are still accepted (optional fields)', async () => {
    const b = withOutputs(600, (o) => o.map((x) => ({ xOnlyPublicKey: x.xOnlyPublicKey })));
    const r = await collect({ source: new InMemoryTweakSource([b]), keys, fromHeight: 600 });
    expect(r).toHaveLength(1);
    expect(r[0]?.txid).toBeUndefined();
  });
});

describe('item 4 / M1 / M2: optional cross-check hooks (off by default)', () => {
  const primary = (): InMemoryTweakSource => new InMemoryTweakSource([block(600)]);
  it('crossCheck: an agreeing second source is only asked about blocks with payments', async () => {
    const second = new InMemoryTweakSource([block(600), block(601)]);
    const r = await collect({ source: new InMemoryTweakSource([block(600), makeBlock(601, [])]), keys, fromHeight: 600, crossCheck: second });
    expect(r).toHaveLength(1);
    expect(second.requests).toEqual([{ method: 'getOutputs', height: 600 }]);
  });
  it('crossCheck: forged amount, txid, vout or a missing output fails closed', async () => {
    for (const over of [{ amountSats: 1n }, { txid: fakeTxid('forged') }, { vout: 9 }]) {
      const forged = withOutputs(600, (o) => o.map((x) => ({ ...x, ...over })));
      const code = await codeAsync(() => collect({ source: new InMemoryTweakSource([forged]), keys, fromHeight: 600, crossCheck: primary() }));
      expect(code, Object.keys(over).join()).toBe('INVALID_RESPONSE');
    }
    const omitted = withOutputs(600, () => []);
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, crossCheck: new InMemoryTweakSource([omitted]) }))).toBe('INVALID_RESPONSE');
  });
  it('crossCheck: a different block hash or height is REORG_DETECTED; second-source failures and bad data propagate typed', async () => {
    const b = block(600);
    const other = { tweaks: b.tweaks, outputs: { ...b.outputs, blockHash: blockHashOf(9999) } };
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, crossCheck: new InMemoryTweakSource([other]) }))).toBe('REORG_DETECTED');
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, crossCheck: new InMemoryTweakSource([]) }))).toBe('TRANSPORT_FAILURE');
    const bad = withOutputs(600, (o) => o.map((x) => ({ ...x, vout: -1 })));
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, crossCheck: new InMemoryTweakSource([bad]) }))).toBe('INVALID_RESPONSE');
  });
  it('verifyOutput: true accepts; false, non-boolean and throwing hooks are typed rejections', async () => {
    const seen: ReceivedOutput[] = [];
    const ok = await collect({ source: primary(), keys, fromHeight: 600, verifyOutput: (o) => { seen.push(o); return Promise.resolve(true); } });
    expect(ok).toHaveLength(1);
    expect(seen[0]?.txid).toBe(ok[0]?.txid);
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, verifyOutput: () => false }))).toBe('INVALID_RESPONSE');
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, verifyOutput: (() => 1) as never }))).toBe('INVALID_RESPONSE');
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, verifyOutput: () => { throw new Error('node down'); } }))).toBe('TRANSPORT_FAILURE');
    expect(await codeAsync(() => collect({ source: primary(), keys, fromHeight: 600, verifyOutput: () => Promise.reject(new SilentPaymentError('ABORTED')) }))).toBe('ABORTED');
  });
  it('no hook, no extra requests (default behaviour unchanged)', async () => {
    const p = primary();
    await collect({ source: p, keys, fromHeight: 600 });
    expect(p.requests.map((r) => r.method).sort()).toEqual(['getOutputs', 'getTipHeight', 'getTweaks']);
  });
});

describe('item 5: BlindBit byte cap (R2 / static F1)', () => {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const stream = (chunks: Uint8Array[], extra: Partial<FetchResponseLike> = {}): FetchResponseLike => ({
    ok: true,
    status: 200,
    json: () => Promise.reject(new Error('unused')),
    body: new ReadableStream<Uint8Array>({
      pull(c) {
        const n = chunks.shift();
        if (n === undefined) c.close();
        else c.enqueue(n);
      },
    }),
    ...extra,
  });
  it('a streamed body WITHOUT content-length is capped while reading', async () => {
    const f: FetchLike = () => Promise.resolve(stream([enc('{"height":'), enc('9'.repeat(200)), enc('}')], { headers: { get: () => null } }));
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: 'https://o.example', fetch: f, maxResponseBytes: 64 }).getTipHeight())).toBe('INVALID_RESPONSE');
  });
  it('a lying (small) content-length does not lift the streamed cap', async () => {
    const f: FetchLike = () => Promise.resolve(stream([enc('{"height":'), enc('9'.repeat(200)), enc('}')], { headers: { get: () => '10' } }));
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: 'https://o.example', fetch: f, maxResponseBytes: 64 }).getTipHeight())).toBe('INVALID_RESPONSE');
  });
  it('a Response without .body is rejected on an oversized content-length; without a header only json() remains (documented limit: fakes only)', async () => {
    const big: FetchLike = () => Promise.resolve({ ok: true, status: 200, headers: { get: () => '1000' }, json: () => Promise.resolve({ height: 1 }) });
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: 'https://o.example', fetch: big, maxResponseBytes: 100 }).getTipHeight())).toBe('INVALID_RESPONSE');
    const none: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ height: 1 }) });
    expect(await new BlindBitClient({ baseUrl: 'https://o.example', fetch: none, maxResponseBytes: 100 }).getTipHeight()).toBe(1);
  });
  it('non-numeric content-length is ignored and the stream cap still applies', async () => {
    const f: FetchLike = () => Promise.resolve(stream([enc('{"height":'), enc('9'.repeat(200)), enc('}')], { headers: { get: () => 'abc' } }));
    expect(await codeAsync(() => new BlindBitClient({ baseUrl: 'https://o.example', fetch: f, maxResponseBytes: 64 }).getTipHeight())).toBe('INVALID_RESPONSE');
  });
});

describe('item 5: typed errors and linear-time parsing', () => {
  it('base URL: very long slash runs are rejected quickly, not parsed quadratically', () => {
    const t0 = Date.now();
    const f: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    expect(codeSync(() => new BlindBitClient({ baseUrl: `https://o.example/${'/'.repeat(300_000)}x`, fetch: f }))).toBe('INVALID_INPUT');
    expect(Date.now() - t0).toBeLessThan(1000);
    // inside the length cap the trailing slashes are still trimmed
    const fetched: string[] = [];
    const g: FetchLike = (u) => {
      fetched.push(u);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ height: 3 }) });
    };
    return new BlindBitClient({ baseUrl: `https://o.example/a/${'/'.repeat(500)}`, fetch: g }).getTipHeight().then(() => {
      expect(fetched).toEqual(['https://o.example/a/info']);
    });
  });
  it.each([123, null, undefined, {}, ['https://o.example']])('base URL %j is INVALID_INPUT', (v) => {
    const f: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    expect(codeSync(() => new BlindBitClient({ baseUrl: v as never, fetch: f }))).toBe('INVALID_INPUT');
  });
  it('uri: hostile and wrong-typed inputs only ever raise SilentPaymentError', () => {
    let state = 12345;
    const next = (): number => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state >>> 8;
    };
    const alphabet = ['%', '%zz', '%E2%80%AE', '%00', '&', '=', '?', 'sp', 'amount', 'label', 'message', 'req-x', '#', 'bitcoin:', '\ud800', '9', '.', 'é'];
    const pick = (n: number): number => next() % n;
    for (let i = 0; i < 400; i++) {
      let s = pick(2) === 0 ? 'bitcoin:?' : '';
      for (let j = 0; j < 1 + pick(8); j++) s += alphabet[pick(alphabet.length)];
      const c = codeSync(() => parseBitcoinUri(s));
      expect(c === undefined || !c.startsWith('OTHER'), s).toBe(true);
    }
    for (const bad of [5, null, undefined, {}, Symbol('x')]) {
      expect(codeSync(() => parseBitcoinUri(bad as never))).toBe('INVALID_URI');
    }
    expect(codeSync(() => buildBitcoinUri({ address: addr, label: Symbol('x') as never }))).toBe('INVALID_URI');
    expect(codeSync(() => buildBitcoinUri({ address: addr, message: '\udc00' }))).toBe('INVALID_URI');
    expect(codeSync(() => buildBitcoinUri({ address: 5 as never }))).toMatch(/^INVALID_/);
    expect(codeSync(() => buildBitcoinUri({ address: addr, amountSats: 5 as never }))).toMatch(/^INVALID_/);
  });
});
