import { describe, expect, it } from 'vitest';
import { PoolRelayerClient, type FetchLike } from './relayerClient.js';
import { parseAddress, parseChainId, parseProofWire, parseWithdrawalWire, proofToWire, toCalldataProof, withdrawalToWire } from './wire.js';
import { A1, A2, POOL } from './fixtures.testutil.js';
import type { Withdrawal } from './withdrawal.js';

const w: Withdrawal = { recipient: A1, relayer: A2, relayerFee: 5n, feeTo: A2, deadline: 77n, aspPublisher: '0x0000000000000000000000000000000000000000', announce: '0xabcd' };
const proof = toCalldataProof({ pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] }, ['1', '2', '3', '4'], 4);

describe('wire', () => {
  it('swaps G2 coordinates like soliditycalldata', () => {
    expect(proof.pB).toEqual([[4n, 3n], [6n, 5n]]);
    expect(proof.pA).toEqual([1n, 2n]);
  });
  it('rejects malformed snarkjs proofs', () => {
    expect(() => toCalldataProof({ pi_a: ['1'], pi_b: [['1', '1'], ['1', '1']], pi_c: ['1', '1'] }, [], 0)).toThrow();
    expect(() => toCalldataProof({ pi_a: ['1', '1'], pi_b: [['1', '1'], ['1', '1']], pi_c: ['1', '1'] }, ['1'], 2)).toThrow();
    expect(() => toCalldataProof({ pi_a: ['1', '1'], pi_b: [['1'], ['1', '1']], pi_c: ['1', '1'] }, [], 0)).toThrow();
    expect(() => toCalldataProof({ pi_a: ['x', '1'], pi_b: [['1', '1'], ['1', '1']], pi_c: ['1', '1'] }, [], 0)).toThrow(/decimal/);
    const P = '21888242871839275222246405745257275088548364400416034343698204186575808495617';
    expect(() => toCalldataProof({ pi_a: [P, '1'], pi_b: [['1', '1'], ['1', '1']], pi_c: ['1', '1'] }, [], 0)).toThrow(/field/);
  });
  it('roundtrips withdrawal and proof', () => {
    expect(parseWithdrawalWire(JSON.parse(JSON.stringify(withdrawalToWire(w))))).toEqual(w);
    expect(parseProofWire(JSON.parse(JSON.stringify(proofToWire(proof))), 4)).toEqual(proof);
  });
  it('strict parsing', () => {
    const wire = withdrawalToWire(w);
    for (const bad of [null, 5, { ...wire, recipient: 'x' }, { ...wire, relayerFee: '-1' }, { ...wire, relayerFee: 5 }, { ...wire, announce: '0xzz' }, { ...wire, announce: 5 }, { ...wire, deadline: '01' }]) {
      expect(() => parseWithdrawalWire(bad)).toThrow();
    }
    const p = proofToWire(proof);
    for (const bad of [null, 5, { ...p, pA: ['1'] }, { ...p, pB: [['1', '2']] }, { ...p, pB: [['1', '2'], 5] }, { ...p, pubSignals: ['1'] }, { ...p, pC: 'x' }, { ...p, pubSignals: ['1', '2', '3', 'x'] }]) {
      expect(() => parseProofWire(bad, 4)).toThrow();
    }
    expect(() => parseChainId('1')).toThrow(/number/);
    expect(() => parseChainId(1)).toThrow(/testnet/);
    expect(parseChainId(84532)).toBe(84532);
    expect(parseAddress(A1.toLowerCase(), 'a')).toBe(A1);
    expect(() => parseAddress(5, 'a')).toThrow();
  });
});

function mkFetch(status: number, body: unknown, seen: { url?: string; init?: Parameters<FetchLike>[1] } = {}): FetchLike {
  return (url, init) => {
    seen.url = url;
    seen.init = init;
    return Promise.resolve({ status, text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)) });
  };
}

describe('PoolRelayerClient', () => {
  it('url policy', () => {
    expect(() => new PoolRelayerClient('nope')).toThrow(/not a URL/);
    expect(() => new PoolRelayerClient('http://example.com')).toThrow(/https/);
    expect(() => new PoolRelayerClient('https://u:p@example.com')).toThrow(/credentials/);
    expect(() => new PoolRelayerClient('http://127.0.0.1:8787')).not.toThrow();
    expect(() => new PoolRelayerClient('https://relay.example')).not.toThrow();
  });
  it('info / quote / relay', async () => {
    const seen: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    const info = { chainIds: [31337], pools: [{ chainId: 31337, pool: POOL }], relayer: A2, feeTo: A2, maxFeeBps: 500, version: '1' };
    expect((await new PoolRelayerClient('https://r.example', { fetch: mkFetch(200, info, seen) }).info()).relayer).toBe(A2);
    expect(seen.url).toBe('https://r.example/v1/info');
    const q = await new PoolRelayerClient('https://r.example', { fetch: mkFetch(200, { relayer: A2, feeTo: A2, relayerFee: '12', deadline: '99' }, seen) }).quote(31337, POOL, 1000n);
    expect(q.relayerFee).toBe(12n);
    expect(seen.init?.body).toContain('"withdrawnValue":"1000"');
    const tx = `0x${'12'.repeat(32)}`;
    const c = new PoolRelayerClient('https://r.example', { fetch: mkFetch(200, { txHash: tx }, seen) });
    expect(await c.relay(31337, POOL, w, { ...proof, pubSignals: [1n, 2n] })).toBe(tx);
    const sent = String(seen.init?.body);
    expect(sent).toContain('"relayerFee":"5"');
    expect(sent).not.toMatch(/nullifier|secret|seed/);
  });
  it('errors', async () => {
    const C = (f: FetchLike) => new PoolRelayerClient('https://r.example', { fetch: f, timeoutMs: 50 });
    await expect(C(mkFetch(200, 'not json')).info()).rejects.toThrow(/non-JSON/);
    await expect(C(mkFetch(429, { error: 'rate_limited' })).info()).rejects.toThrow(/rate_limited/);
    await expect(C(mkFetch(500, { x: 1 })).info()).rejects.toThrow(/refused: error/);
    await expect(C(mkFetch(400, { error: { code: 'bad_fee' } })).info()).rejects.toThrow(/refused: bad_fee/);
    await expect(C(() => Promise.reject(new Error('net'))).info()).rejects.toThrow(/request failed/);
    await expect(C(mkFetch(200, { chainIds: [1], pools: [], maxFeeBps: 1, version: 'x', relayer: A1, feeTo: A1 })).info()).rejects.toThrow(/testnet/);
    await expect(C(mkFetch(200, { chainIds: [31337], pools: [{ chainId: 1, pool: POOL }], maxFeeBps: 1, version: 'x', relayer: A1, feeTo: A1 })).info()).rejects.toThrow(/testnet/);
    await expect(C(mkFetch(200, { chainIds: ['x'], pools: [], maxFeeBps: 1, version: 'x', relayer: A1, feeTo: A1 })).info()).rejects.toThrow(/bad chain/);
    await expect(C(mkFetch(200, { chainIds: [], pools: [{ chainId: 'x' }], maxFeeBps: 1, version: 'x', relayer: A1, feeTo: A1 })).info()).rejects.toThrow(/bad pool/);
    await expect(C(mkFetch(200, {})).info()).rejects.toThrow(/bad \/v1\/info/);
    await expect(C(mkFetch(200, { relayerFee: 'x', deadline: '1' })).quote(31337, POOL, 1n)).rejects.toThrow(/bad quote/);
    await expect(C(mkFetch(200, { txHash: '0x12' })).relay(31337, POOL, w, proof)).rejects.toThrow(/txHash/);
    await expect(C(mkFetch(200, {})).quote(1, POOL, 1n)).rejects.toThrow(/testnet/);
    await expect(C(mkFetch(200, {})).relay(1, POOL, w, proof)).rejects.toThrow(/testnet/);
  });
  it('uses global fetch by default', async () => {
    const c = new PoolRelayerClient('http://127.0.0.1:1', { timeoutMs: 200 });
    await expect(c.info()).rejects.toThrow(/request failed/);
  });
});
