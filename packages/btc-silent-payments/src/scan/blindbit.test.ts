import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from '../errors.js';
import { toHex } from '../ecc.js';
import { generateSilentPaymentKeys } from '../keys.js';
import { createLabelTable, silentPaymentAddress } from '../labels.js';
import { seededRng } from '../rng.testutil.js';
import { blockHashOf, makeBlock, p2wpkhInput } from '../fixtures.testutil.js';
import { BlindBitClient, type FetchLike, type FetchResponseLike } from './blindbit.js';
import { scanBlocks } from './scanner.js';

const alice = generateSilentPaymentKeys(seededRng('bb-alice'));
const addr = silentPaymentAddress(alice, 'mainnet');
const block = makeBlock(840000, [
  { inputs: [p2wpkhInput('bb')], recipients: [addr] },
  { inputs: [p2wpkhInput('bb2')], recipients: [addr] },
]);

const BASE = 'https://oracle.example/api';

function tweaksJson(h = 840000): unknown {
  return {
    block_identifier: { block_hash: blockHashOf(h), block_height: h },
    index: block.tweaks.tweaks.map((t) => toHex(t)),
  };
}
function utxosJson(h = 840000): unknown {
  return {
    block_identifier: { block_hash: blockHashOf(h), block_height: h },
    index: block.outputs.outputs.map((o) => ({
      txid: o.txid,
      vout: o.vout,
      pubkey: toHex(o.xOnlyPublicKey),
      amount: Number(o.amountSats),
    })),
  };
}

interface Recorded {
  url: string;
  init: Parameters<FetchLike>[1];
}

function server(routes: Record<string, unknown>): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const path = url.slice(BASE.length);
    const r = routes[path];
    if (r === undefined)
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(r) });
  };
  return { fetch, calls };
}

function code(e: unknown): string | undefined {
  return e instanceof SilentPaymentError ? e.code : 'OTHER';
}

describe('BlindBitClient (shape verified from the BlindBit-Oracle v2 server README)', () => {
  it('reads tip, tweaks and utxos with bare GETs', async () => {
    const s = server({
      '/info': { network: 'mainnet', height: 840001, tweaks_only: false },
      '/tweaks/840000': tweaksJson(),
      '/utxos/840000': utxosJson(),
    });
    const c = new BlindBitClient({ baseUrl: `${BASE}/`, fetch: s.fetch });
    expect(await c.getTipHeight()).toBe(840001);
    const tw = await c.getTweaks(840000);
    expect(tw.blockHash).toBe(blockHashOf(840000));
    expect(tw.tweaks.map(toHex)).toEqual(block.tweaks.tweaks.map(toHex));
    const out = await c.getOutputs(840000);
    expect(out.outputs.map((o) => toHex(o.xOnlyPublicKey))).toEqual(
      block.outputs.outputs.map((o) => toHex(o.xOnlyPublicKey)),
    );
    expect(out.outputs[0]?.amountSats).toBe(block.outputs.outputs[0]?.amountSats);
    expect(s.calls.map((x) => x.url)).toEqual([
      `${BASE}/info`,
      `${BASE}/tweaks/840000`,
      `${BASE}/utxos/840000`,
    ]);
    for (const call of s.calls) expect(Object.keys(call.init).sort()).toEqual(['method', 'signal']); // no body, no headers
  });

  it('end to end: scanning through the client finds the payments and sends only heights (privacy)', async () => {
    const s = server({
      '/info': { height: 840000 },
      '/tweaks/840000': tweaksJson(),
      '/utxos/840000': utxosJson(),
    });
    const c = new BlindBitClient({ baseUrl: BASE, fetch: s.fetch });
    const found = [];
    for await (const r of scanBlocks({
      source: c,
      keys: {
        scanSecret: alice.scanSecret,
        spendPublicKey: alice.spendPublicKey,
        labels: createLabelTable(alice.scanSecret, [1, 2]),
      },
      fromHeight: 840000,
      signal: new AbortController().signal,
    }))
      found.push(r);
    expect(found).toHaveLength(2);
    const allowed = new RegExp(`^${BASE.replaceAll('.', '\\.')}/(info|tweaks/[0-9]+|utxos/[0-9]+)$`);
    expect(s.calls.length).toBeGreaterThan(0);
    for (const call of s.calls) {
      expect(call.url).toMatch(allowed);
      expect(Object.keys(call.init).filter((k) => k !== 'signal' && k !== 'method')).toEqual([]);
      expect(call.init.method).toBe('GET');
      for (const secret of [
        toHex(new Uint8Array(alice.scanSecret)),
        toHex(new Uint8Array(alice.spendSecret)),
        toHex(alice.scanPublicKey),
        toHex(alice.spendPublicKey),
        addr,
      ]) {
        expect(call.url).not.toContain(secret);
        expect(JSON.stringify(call.init)).not.toContain(secret);
      }
    }
  });

  it('passes the abort signal through and maps aborts', async () => {
    const ctl = new AbortController();
    const seen: Array<AbortSignal | undefined> = [];
    const fetch: FetchLike = (_url, init) => {
      seen.push(init.signal);
      return ctl.signal.aborted
        ? Promise.reject(new Error('aborted'))
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ height: 1 }) });
    };
    const c = new BlindBitClient({ baseUrl: BASE, fetch });
    await c.getTipHeight(ctl.signal);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    ctl.abort();
    await expect(c.getTipHeight(ctl.signal)).rejects.toSatisfy((e) => code(e) === 'ABORTED');
  });

  it('maps transport failures, HTTP errors and non-JSON bodies without leaking details', async () => {
    const boom: FetchLike = () => Promise.reject(new Error('secret-url-detail'));
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: boom }).getTipHeight()).rejects.toSatisfy(
      (e) => code(e) === 'TRANSPORT_FAILURE',
    );
    const s = server({});
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: s.fetch }).getTipHeight()).rejects.toSatisfy(
      (e) => code(e) === 'TRANSPORT_FAILURE',
    );
    const badJson: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('x')),
      } satisfies FetchResponseLike);
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: badJson }).getTipHeight()).rejects.toSatisfy(
      (e) => code(e) === 'INVALID_RESPONSE',
    );
  });

  it.each([
    ['null body', null],
    ['array body', []],
    ['missing height', {}],
    ['negative height', { height: -1 }],
    ['float height', { height: 1.5 }],
    ['string height', { height: '5' }],
  ])('tip: rejects %s', async (_n, body) => {
    const s = server({ '/info': body });
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: s.fetch }).getTipHeight()).rejects.toSatisfy(
      (e) => code(e) === 'INVALID_RESPONSE',
    );
  });

  const goodId = { block_hash: blockHashOf(7), block_height: 7 };
  it.each([
    ['null body', null, 'INVALID_RESPONSE'],
    ['no block_identifier', { index: [] }, 'INVALID_RESPONSE'],
    ['block_identifier not an object', { block_identifier: 5, index: [] }, 'INVALID_RESPONSE'],
    [
      'wrong height (reorg or lying oracle)',
      { block_identifier: { ...goodId, block_height: 8 }, index: [] },
      'REORG_DETECTED',
    ],
    [
      'short block hash',
      { block_identifier: { ...goodId, block_hash: 'ab' }, index: [] },
      'INVALID_RESPONSE',
    ],
    [
      'non-hex block hash',
      { block_identifier: { ...goodId, block_hash: 'zz'.repeat(32) }, index: [] },
      'INVALID_RESPONSE',
    ],
    ['non-string hash', { block_identifier: { ...goodId, block_hash: 5 }, index: [] }, 'INVALID_RESPONSE'],
    ['index missing', { block_identifier: goodId }, 'INVALID_RESPONSE'],
    ['index not an array', { block_identifier: goodId, index: {} }, 'INVALID_RESPONSE'],
    ['tweak not a string', { block_identifier: goodId, index: [5] }, 'INVALID_RESPONSE'],
    ['tweak wrong length', { block_identifier: goodId, index: ['02'.repeat(5)] }, 'INVALID_RESPONSE'],
    ['tweak not on curve', { block_identifier: goodId, index: [`02${'ff'.repeat(32)}`] }, 'INVALID_RESPONSE'],
    [
      'tweak with bad prefix',
      { block_identifier: goodId, index: [`04${'11'.repeat(32)}`] },
      'INVALID_RESPONSE',
    ],
    [
      'too many entries',
      { block_identifier: goodId, index: new Array<string>(200_001).fill('') },
      'INVALID_RESPONSE',
    ],
  ])('tweaks: rejects %s', async (_n, body, expected) => {
    const s = server({ '/tweaks/7': body });
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: s.fetch }).getTweaks(7)).rejects.toSatisfy(
      (e) => code(e) === expected,
    );
  });

  const okOut = { txid: 'ab'.repeat(32), vout: 0, pubkey: '11'.repeat(32), amount: 5 };
  it.each([
    ['null body', null],
    ['entry not an object', { block_identifier: goodId, index: [5] }],
    ['bad pubkey', { block_identifier: goodId, index: [{ ...okOut, pubkey: '11' }] }],
    ['bad txid', { block_identifier: goodId, index: [{ ...okOut, txid: 'deadbeef' }] }],
    ['negative vout', { block_identifier: goodId, index: [{ ...okOut, vout: -1 }] }],
    ['float amount', { block_identifier: goodId, index: [{ ...okOut, amount: 0.5 }] }],
    ['string amount', { block_identifier: goodId, index: [{ ...okOut, amount: '5' }] }],
    ['index missing', { block_identifier: goodId }],
  ])('utxos: rejects %s', async (_n, body) => {
    const s = server({ '/utxos/7': body });
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: s.fetch }).getOutputs(7)).rejects.toSatisfy(
      (e) => code(e) === 'INVALID_RESPONSE',
    );
  });

  it('getInfo parses the documented /info payload strictly', async () => {
    const good = {
      network: 'signet',
      height: 834761,
      tweaks_only: false,
      tweaks_full_basic: true,
      tweaks_full_with_dust_filter: false,
      tweaks_cut_through_with_dust_filter: false,
    };
    const c = (body: unknown): BlindBitClient =>
      new BlindBitClient({ baseUrl: BASE, fetch: server({ '/info': body }).fetch });
    expect(await c(good).getInfo()).toEqual({
      network: 'signet',
      height: 834761,
      tweaksOnly: false,
      tweaksFullBasic: true,
      tweaksFullWithDustFilter: false,
      tweaksCutThroughWithDustFilter: false,
    });
    const bads: unknown[] = [
      null,
      { ...good, network: 5 },
      { ...good, network: '' },
      { ...good, height: -1 },
      { ...good, tweaks_only: 'no' },
      { ...good, tweaks_full_basic: undefined },
    ];
    for (const b of bads)
      await expect(c(b).getInfo()).rejects.toSatisfy((e) => code(e) === 'INVALID_RESPONSE');
  });

  it('validates the base URL and heights', async () => {
    const f = server({}).fetch;
    for (const bad of [
      '',
      'not a url',
      'ftp://x.example',
      'https://user:pw@x.example',
      'https://x.example/?q=1',
      'https://x.example/#f',
      'javascript:alert(1)',
    ]) {
      expect(() => new BlindBitClient({ baseUrl: bad, fetch: f }), bad).toThrow(SilentPaymentError);
    }
    const c = new BlindBitClient({ baseUrl: 'http://localhost:8000', fetch: f, allowInsecureLoopback: true });
    for (const h of [-1, 1.5, 2 ** 32, Number.NaN]) {
      await expect(c.getTweaks(h)).rejects.toSatisfy((e) => code(e) === 'INVALID_INPUT');
      await expect(c.getOutputs(h)).rejects.toSatisfy((e) => code(e) === 'INVALID_INPUT');
    }
  });

  it('TS-04: plain http is refused unless loopback is explicitly allowed', () => {
    const f = server({}).fetch;
    expect(() => new BlindBitClient({ baseUrl: 'http://oracle.example', fetch: f })).toThrow(
      SilentPaymentError,
    );
    expect(() => new BlindBitClient({ baseUrl: 'http://localhost:8000', fetch: f })).toThrow(
      SilentPaymentError,
    );
    expect(
      () => new BlindBitClient({ baseUrl: 'http://oracle.example', fetch: f, allowInsecureLoopback: true }),
    ).toThrow(SilentPaymentError);
    for (const u of ['http://127.0.0.1:1', 'http://[::1]:1', 'http://localhost']) {
      expect(() => new BlindBitClient({ baseUrl: u, fetch: f, allowInsecureLoopback: true })).not.toThrow();
    }
  });

  it('TS-04: rejects an absurd tip height from /info and /getInfo', async () => {
    const f = server({ '/info': { height: 4294967295 } }).fetch;
    const c = new BlindBitClient({ baseUrl: BASE, fetch: f });
    await expect(c.getTipHeight()).rejects.toSatisfy((e) => code(e) === 'INVALID_RESPONSE');
    const ok = new BlindBitClient({ baseUrl: BASE, fetch: f, maxTipHeight: 4294967295 });
    await expect(ok.getTipHeight()).resolves.toBe(4294967295);
  });

  it('TS-04: caps the streamed body and rejects an oversized content-length', async () => {
    const chunk = new TextEncoder().encode('{"height":1,"pad":"' + 'a'.repeat(100) + '"}');
    let cancelled = false;
    const streaming =
      (parts: Uint8Array[]): FetchLike =>
      () => {
        let i = 0;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error('must not be used')),
          body: {
            getReader: () => ({
              read: () =>
                Promise.resolve(i < parts.length ? { done: false, value: parts[i++] } : { done: true }),
              cancel: () => {
                cancelled = true;
                return Promise.resolve();
              },
            }),
          },
        });
      };
    const small = new BlindBitClient({ baseUrl: BASE, fetch: streaming([chunk]), maxBodyBytes: 50 });
    await expect(small.getTipHeight()).rejects.toSatisfy((e) => code(e) === 'INVALID_RESPONSE');
    expect(cancelled).toBe(true);
    const fine = new BlindBitClient({
      baseUrl: BASE,
      fetch: streaming([chunk.slice(0, 40), chunk.slice(40)]),
    });
    await expect(fine.getTipHeight()).resolves.toBe(1);
    const bad = new BlindBitClient({ baseUrl: BASE, fetch: streaming([new Uint8Array([0xff, 0xfe])]) });
    await expect(bad.getTipHeight()).rejects.toSatisfy((e) => code(e) === 'INVALID_RESPONSE');
    const failing: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        body: {
          getReader: () => ({ read: () => Promise.reject(new Error('x')), cancel: () => Promise.resolve() }),
        },
      });
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: failing }).getTipHeight()).rejects.toSatisfy(
      (e) => code(e) === 'TRANSPORT_FAILURE',
    );
    const lying: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ height: 1 }),
        headers: { get: () => '999999999' },
      });
    await expect(new BlindBitClient({ baseUrl: BASE, fetch: lying }).getTipHeight()).rejects.toSatisfy(
      (e) => code(e) === 'INVALID_RESPONSE',
    );
  });

  it('TS-04: times out a hung request and honours a pre-aborted signal', async () => {
    const hang: FetchLike = (_u, init) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      });
    const c = new BlindBitClient({ baseUrl: BASE, fetch: hang, timeoutMs: 20 });
    await expect(c.getTipHeight()).rejects.toSatisfy((e) => code(e) === 'TRANSPORT_FAILURE');
    const ctl = new AbortController();
    ctl.abort();
    await expect(c.getTipHeight(ctl.signal)).rejects.toSatisfy((e) => code(e) === 'ABORTED');
    expect(() => new BlindBitClient({ baseUrl: BASE, fetch: hang, timeoutMs: 0 })).toThrow(
      SilentPaymentError,
    );
    expect(() => new BlindBitClient({ baseUrl: BASE, fetch: hang, maxBodyBytes: 0 })).toThrow(
      SilentPaymentError,
    );
    expect(() => new BlindBitClient({ baseUrl: BASE, fetch: hang, maxTipHeight: -1 })).toThrow(
      SilentPaymentError,
    );
  });

  it('TS-04: getInfo applies the same tip bound', async () => {
    const info = {
      network: 'signet',
      height: 4294967295,
      tweaks_only: false,
      tweaks_full_basic: true,
      tweaks_full_with_dust_filter: false,
      tweaks_cut_through_with_dust_filter: false,
    };
    const c = new BlindBitClient({ baseUrl: BASE, fetch: server({ '/info': info }).fetch });
    await expect(c.getInfo()).rejects.toSatisfy((e) => code(e) === 'INVALID_RESPONSE');
  });
});
