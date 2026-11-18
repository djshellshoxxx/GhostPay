import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHex, toHex } from '../ecc.js';
import { generateSilentPaymentKeys } from '../keys.js';
import { seededRng } from '../rng.testutil.js';
import { makeBlock, p2wpkhInput } from '../fixtures.testutil.js';
import { silentPaymentAddress } from '../labels.js';
import { scanBlocks } from './scanner.js';
import { BlindBitGrpcClient, type GrpcWebFetch } from './blindbitGrpc.js';
import { BlockHashResponseSchema, BlockHeightRequestSchema, FullBlockResponseSchema, InfoResponseSchema } from './proto/indexing_server_pb.js';

const HASH = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
const TXID = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b';
const key = generateSilentPaymentKeys(seededRng('grpc-fixture')).spendPublicKey;
const le = (s: string): Uint8Array => parseHex(s, 32).reverse();
function frame(payload: Uint8Array, flag = 0): Uint8Array {
  const out = new Uint8Array(payload.length + 5); out[0] = flag;
  new DataView(out.buffer).setUint32(1, payload.length); out.set(payload, 5); return out;
}
function join(...arrays: Uint8Array[]): Uint8Array { const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0)); let at = 0; for (const a of arrays) { out.set(a, at); at += a.length; } return out; }
const trailer = (text = 'grpc-status: 0\r\n'): Uint8Array => frame(new TextEncoder().encode(text), 0x80);
const info = () => create(InfoResponseSchema, { network: 'mainnet', height: 840000n, tweaksFullBasic: true });
const block = () => create(FullBlockResponseSchema, { blockIdentifier: { blockHash: le(HASH), blockHeight: 840000n }, index: [{ txid: le(TXID), tweak: key, inputs: new Uint8Array(36), utxos: [{ vout: 2, amount: 2_100_000_000_000_000n, pubkey: key.slice(1) }] }] });
function response(bytes: Uint8Array, split = false, cancel = vi.fn()): Response {
  let at = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(c) { if (at === bytes.length) c.close(); else { const n = split ? 1 : bytes.length; c.enqueue(bytes.slice(at, at + n)); at += Math.min(n, bytes.length - at); } }, cancel }), { headers: { 'content-type': 'application/grpc-web+proto' } });
}
function server(overrides: Partial<Record<string, () => Response>> = {}) {
  const calls: { url: string; init: Parameters<GrpcWebFetch>[1] }[] = [];
  const fetch: GrpcWebFetch = (url, init) => {
    calls.push({ url, init }); const method = url.split('/').at(-1)!;
    if (overrides[method]) return Promise.resolve(overrides[method]());
    const payload = method === 'GetInfo' ? toBinary(InfoResponseSchema, info()) : method === 'GetBlockHashByHeight' ? toBinary(BlockHashResponseSchema, create(BlockHashResponseSchema, { blockHash: le(HASH) })) : toBinary(FullBlockResponseSchema, block());
    return Promise.resolve(response(join(frame(payload), trailer()), true));
  };
  return { fetch, calls };
}
const client = (fetch: GrpcWebFetch, extra = {}) => new BlindBitGrpcClient({ baseUrl: 'https://oracle.example/grpc', network: 'mainnet', fetch, ...extra });
afterEach(() => { vi.useRealTimers(); });

describe('BlindBit unary gRPC-Web adapter', () => {
  it('reads canonical full outputs with exact uint64 satoshis and known Bitcoin display hash order', async () => {
    const s = server(); const c = client(s.fetch);
    expect(await c.getTipHeight()).toBe(840000);
    const outputs = await c.getOutputs(840000);
    expect(outputs).toEqual({ height: 840000, blockHash: HASH, outputs: [{ txid: TXID, vout: 2, amountSats: 2_100_000_000_000_000n, xOnlyPublicKey: key.slice(1) }] });
    expect((await c.getTweaks(840000)).tweaks.map(toHex)).toEqual([toHex(key)]);
    for (const { url, init } of s.calls) {
      expect(url.startsWith('https://oracle.example/grpc/blindbit.oracle.v1.OracleService/')).toBe(true);
      expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
      const bytes = init.body;
      expect(bytes[0]).toBe(0);
      if (url.endsWith('/GetInfo')) expect(bytes.length).toBe(5);
      else expect(fromBinary(BlockHeightRequestSchema, bytes.slice(5))).toEqual(create(BlockHeightRequestSchema, { blockHeight: 840000n }));
      expect(toHex(bytes)).not.toContain(toHex(key));
    }
  });
  it.each(['http://oracle.example', 'https://user:pass@oracle.example', 'https://oracle.example/?token=x', 'https://oracle.example/#x', 'file:///tmp/x'])('rejects unsafe endpoint %s before network', (baseUrl) => {
    const s = server(); expect(() => new BlindBitGrpcClient({ baseUrl, network: 'mainnet', fetch: s.fetch })).toThrow(); expect(s.calls).toHaveLength(0);
  });
  it.each([-1, 1.5, 0x1_0000_0000])('rejects invalid heights %s without network', async (height) => { const s = server(); await expect(client(s.fetch).getOutputs(height)).rejects.toMatchObject({ code: 'INVALID_INPUT' }); expect(s.calls).toHaveLength(0); });
  it('checks network and storage support before requesting block data', async () => {
    for (const patch of [{ network: 'signet' }, { tweaksOnly: true }, { tweaksFullBasic: false }]) {
      const s = server({ GetInfo: () => response(join(frame(toBinary(InfoResponseSchema, { ...info(), ...patch })), trailer())) });
      await expect(client(s.fetch).getOutputs(840000)).rejects.toThrow(); expect(s.calls).toHaveLength(1);
    }
  });
  it('rejects impossible uint64 chain heights', async () => { const s = server({ GetInfo: () => response(join(frame(toBinary(InfoResponseSchema, { ...info(), height: 1n << 60n })), trailer())) }); await expect(client(s.fetch).getTipHeight()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); });
  it.each(['grpc-status: 7\r\n', 'grpc-message: okay\r\n', 'grpc-status: 0\r\ngrpc-status: 7\r\n', 'grpc-status: 00\r\n'])('rejects forged or invalid trailers %s', async (text) => { const s = server({ GetInfo: () => response(join(frame(toBinary(InfoResponseSchema, info())), trailer(text))) }); await expect(client(s.fetch).getTipHeight()).rejects.toThrow(); });
  it('requires a terminal successful trailer and exactly one data message', async () => {
    const data = frame(toBinary(InfoResponseSchema, info()));
    for (const bytes of [data, join(data, data, trailer()), join(data, trailer(), data), join(trailer(), data), join(data, trailer()).slice(0, -1), frame(new Uint8Array(), 1), new Uint8Array([0, 0, 0])]) {
      await expect(client(server({ GetInfo: () => response(bytes) }).fetch).getTipHeight()).rejects.toThrow();
    }
  });
  it('rejects HTTP and wrong content-type responses and cancels bodies', async () => {
    const cancel = vi.fn();
    const s = server({ GetInfo: () => new Response(new ReadableStream({ cancel }), { status: 500 }) });
    await expect(client(s.fetch).getTipHeight()).rejects.toThrow(); expect(cancel).toHaveBeenCalledOnce();
    await expect(client(server({ GetInfo: () => new Response('html', { headers: { 'content-type': 'text/html' } }) }).fetch).getTipHeight()).rejects.toThrow();
  });
  it('rejects declared, framed and actual overflows without waiting on hostile cancellation', async () => {
    for (const mode of ['declared', 'frame', 'actual']) {
      const cancel = vi.fn(() => new Promise<void>(() => undefined));
      const s = server({ GetInfo: () => {
        const bytes = mode === 'frame' ? new Uint8Array([0, 0, 0, 16, 0]) : new Uint8Array(200);
        return new Response(new ReadableStream({ start(c) { c.enqueue(bytes); }, cancel }), { headers: { 'content-type': 'application/grpc-web+proto', ...(mode === 'declared' ? { 'content-length': '10000' } : {}) } });
      } });
      await expect(client(s.fetch, { maxResponseBytes: 128 }).getTipHeight()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it('enforces an absolute deadline even when a transport ignores abort and cleans late responses', async () => {
    vi.useFakeTimers(); let done: (r: Response) => void = () => undefined; let signal: AbortSignal | undefined;
    const fetch: GrpcWebFetch = (_url, init) => { signal = init.signal; return new Promise((resolve) => { done = resolve; }); };
    const promise = client(fetch, { timeoutMs: 20 }).getTipHeight(); const failed = expect(promise).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
    await vi.advanceTimersByTimeAsync(21); await failed; expect(signal?.aborted).toBe(true);
    const cancel = vi.fn(); done(new Response(new ReadableStream({ cancel }))); await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce();
  });
  it('aborts a stalled body immediately and refuses an already-aborted request', async () => {
    const stop = new AbortController(); const cancel = vi.fn();
    const s = server({ GetInfo: () => new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/grpc-web+proto' } }) });
    const p = client(s.fetch).getTipHeight(stop.signal); await Promise.resolve(); stop.abort(); await expect(p).rejects.toMatchObject({ code: 'ABORTED' }); expect(cancel).toHaveBeenCalledOnce();
    const s2 = server(); await expect(client(s2.fetch).getTipHeight(stop.signal)).rejects.toMatchObject({ code: 'ABORTED' }); expect(s2.calls).toHaveLength(0);
  });
  it('rejects malformed/unknown/duplicate protobuf fields', async () => {
    const valid = toBinary(InfoResponseSchema, info());
    for (const payload of [new Uint8Array([0x0a, 0x7f]), join(valid, new Uint8Array([0x38, 1])), join(valid, valid)]) {
      await expect(client(server({ GetInfo: () => response(join(frame(payload), trailer())) }).fetch).getTipHeight()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
  it('rejects changed block hashes and height substitution', async () => {
    for (const patch of [{ blockHash: new Uint8Array(32) }, { blockHeight: 1n }]) {
      const b = block(); b.blockIdentifier = { ...b.blockIdentifier!, ...patch };
      await expect(client(server({ GetFullBlock: () => response(join(frame(toBinary(FullBlockResponseSchema, b)), trailer())) }).fetch).getOutputs(840000)).rejects.toMatchObject({ code: 'REORG_DETECTED' });
    }
  });
  it('rejects malformed curve points, flat inputs, oversupply amounts and duplicate output identity', async () => {
    for (const mutate of [
      (b: ReturnType<typeof block>) => { b.index[0]!.tweak = new Uint8Array(33); },
      (b: ReturnType<typeof block>) => { b.index[0]!.inputs = new Uint8Array(35); },
      (b: ReturnType<typeof block>) => { b.index[0]!.utxos[0]!.pubkey = new Uint8Array(32).fill(255); },
      (b: ReturnType<typeof block>) => { b.index[0]!.utxos[0]!.amount = 2_100_000_000_000_001n; },
      (b: ReturnType<typeof block>) => { b.index[0]!.utxos.push(b.index[0]!.utxos[0]!); },
      (b: ReturnType<typeof block>) => { b.index.push(b.index[0]!); },
    ]) { const b = block(); mutate(b); await expect(client(server({ GetFullBlock: () => response(join(frame(toBinary(FullBlockResponseSchema, b)), trailer())) }).fetch).getOutputs(840000)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); }
  });
  it('bounds repeated messages before decoding them', async () => { const b = block(); b.index[0]!.utxos.push({ ...b.index[0]!.utxos[0]!, vout: 3 }); await expect(client(server({ GetFullBlock: () => response(join(frame(toBinary(FullBlockResponseSchema, b)), trailer())) }).fetch, { maxEntries: 1 }).getOutputs(840000)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); });
  it('captures configuration and rejects invalid resource limits', async () => {
    const s = server(); const options = { baseUrl: 'https://oracle.example', network: 'mainnet', fetch: s.fetch };
    const c = new BlindBitGrpcClient(options); options.network = 'signet'; expect(await c.getTipHeight()).toBe(840000);
    for (const bad of [{ network: 'unknown' }, { timeoutMs: 0 }, { timeoutMs: 60_001 }, { timeoutMs: 1.5 }, { maxResponseBytes: 63 }, { maxResponseBytes: 33 * 1024 * 1024 }, { maxEntries: 0 }, { maxEntries: 200_001 }, { maxEntries: 1.5 }]) expect(() => client(s.fetch, bad)).toThrow();
    expect(() => new BlindBitGrpcClient({ ...options, baseUrl: 'bad' })).toThrow();
    expect(() => new BlindBitGrpcClient({ ...options, baseUrl: 'https://oracle.example/' + 'x'.repeat(2048) })).toThrow();
  });
  it('bounds concurrent transport work and releases the capacity on abort', async () => {
    const stop = new AbortController();
    const fetch: GrpcWebFetch = () => new Promise<Response>(() => undefined);
    const c = client(fetch); const a = c.getTipHeight(stop.signal); const b = c.getTipHeight(stop.signal);
    await expect(c.getTipHeight()).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
    stop.abort(); await Promise.all([expect(a).rejects.toMatchObject({ code: 'ABORTED' }), expect(b).rejects.toMatchObject({ code: 'ABORTED' })]);
  });
  it('fails closed on rejected fetch, errored body and failed cancellation', async () => {
    await expect(client(() => Promise.reject(new Error('remote detail'))).getTipHeight()).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
    const bad = server({ GetInfo: () => new Response(new ReadableStream({ pull(c) { c.error(new Error('read')); } }), { headers: { 'content-type': 'application/grpc-web+proto' } }) });
    await expect(client(bad.fetch).getTipHeight()).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
    const s = server({ GetInfo: () => new Response(new ReadableStream({ cancel() { return Promise.reject(new Error('cancel')); } }), { status: 400 }) });
    await expect(client(s.fetch).getTipHeight()).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
  });
  it('rejects error status headers even when a body looks successful', async () => {
    const s = server({ GetInfo: () => { const r = response(join(frame(toBinary(InfoResponseSchema, info())), trailer())); r.headers.set('grpc-status', '13'); return r; } });
    await expect(client(s.fetch).getTipHeight()).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
    await expect(client(server({ GetInfo: () => new Response(null, { headers: { 'content-type': 'application/grpc-web+proto' } }) }).fetch).getTipHeight()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('accepts exact byte budgets and malformed length only when the streamed bytes fit', async () => {
    const data = frame(toBinary(InfoResponseSchema, info()));
    const bytes = join(data, trailer('grpc-status: 0\r\nx-pad: ' + 'a'.repeat(80) + '\r\n'));
    const s = server({ GetInfo: () => { const r = response(bytes); r.headers.set('content-length', 'not-a-size'); return r; } });
    expect(await client(s.fetch, { maxResponseBytes: bytes.length }).getTipHeight()).toBe(840000);
    await expect(client(s.fetch, { maxResponseBytes: bytes.length - 1 }).getTipHeight()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects bad trailer text, malformed protobuf wire types and oversized fields', async () => {
    const data = frame(toBinary(InfoResponseSchema, info()));
    for (const end of [trailer('grpc-status: 0'), trailer('Grpc-Status: 0\r\n'), trailer('grpc-status: 0\r\ninvalid\r\n'), frame(new Uint8Array([255]), 128), trailer('x-pad: ' + 'x'.repeat(4096) + '\r\n')]) await expect(client(server({ GetInfo: () => response(join(data, end)) }).fetch).getTipHeight()).rejects.toThrow();
    for (const payload of [new Uint8Array([8, 1]), new Uint8Array([16, 128]), toBinary(InfoResponseSchema, { ...info(), network: 'a'.repeat(33) })]) await expect(client(server({ GetInfo: () => response(join(frame(payload), trailer())) }).fetch).getTipHeight()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects absent identifiers, malformed hash widths and excess flat input counts', async () => {
    for (const mutate of [
      (b: ReturnType<typeof block>) => { delete b.blockIdentifier; },
      (b: ReturnType<typeof block>) => { b.index[0]!.txid = new Uint8Array(31); },
      (b: ReturnType<typeof block>) => { b.index[0]!.inputs = new Uint8Array(72); },
    ]) { const b = block(); mutate(b); await expect(client(server({ GetFullBlock: () => response(join(frame(toBinary(FullBlockResponseSchema, b)), trailer())) }).fetch, { maxEntries: 1 }).getOutputs(840000)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); }
    const s = server({ GetBlockHashByHeight: () => response(join(frame(toBinary(BlockHashResponseSchema, create(BlockHashResponseSchema, { blockHash: new Uint8Array(31) }))), trailer())) });
    await expect(client(s.fetch).getOutputs(840000)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const behind = server({ GetInfo: () => response(join(frame(toBinary(InfoResponseSchema, { ...info(), height: 5n })), trailer())) });
    await expect(client(behind.fetch).getOutputs(840000)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('finds a synthetic BIP-352 payment end-to-end without sending wallet material', async () => {
    const wallet = generateSilentPaymentKeys(seededRng('grpc-wallet'));
    const fixture = makeBlock(840000, [{ inputs: [p2wpkhInput('grpc-pay')], recipients: [silentPaymentAddress(wallet, 'mainnet')] }]);
    const o = fixture.outputs.outputs[0]!;
    const full = create(FullBlockResponseSchema, { blockIdentifier: { blockHeight: 840000n, blockHash: le(fixture.outputs.blockHash) }, index: [{ txid: le(o.txid!), tweak: fixture.tweaks.tweaks[0]!, inputs: new Uint8Array(36), utxos: [{ vout: o.vout!, amount: o.amountSats!, pubkey: o.xOnlyPublicKey }] }] });
    const s = server({ GetBlockHashByHeight: () => response(join(frame(toBinary(BlockHashResponseSchema, create(BlockHashResponseSchema, { blockHash: le(fixture.outputs.blockHash) }))), trailer())), GetFullBlock: () => response(join(frame(toBinary(FullBlockResponseSchema, full)), trailer())) });
    const matches = [];
    for await (const found of scanBlocks({ source: client(s.fetch), keys: { scanSecret: wallet.scanSecret, spendPublicKey: wallet.spendPublicKey }, fromHeight: 840000, toHeight: 840000 })) matches.push(found);
    expect(matches).toHaveLength(1); expect(matches[0]?.amountSats).toBe(o.amountSats);
    for (const { init } of s.calls) { const wire = toHex(init.body); expect(wire).not.toContain(toHex(wallet.scanSecret)); expect(wire).not.toContain(toHex(wallet.spendSecret)); expect(wire).not.toContain(o.txid!); }
  });

});
