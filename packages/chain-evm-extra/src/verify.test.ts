import { describe, expect, it } from 'vitest';
import { ARACHNID_DEPLOYER, CANONICAL_ANNOUNCER } from './address.js';
import { findExtraChain, type ExtraChainEntry } from './chains.js';
import { keccakHex } from './hex.js';
import { verifyChain, type ChainRpc } from './verify.js';

const linea = findExtraChain(59144) as ExtraChainEntry;
const ANN_CODE = '0x6080604052';
const DEP_CODE = '0x7fffffff';
const annHash = keccakHex(ANN_CODE);
const depHash = keccakHex(DEP_CODE);

interface Fake { chainId?: unknown; codes?: Record<string, unknown>; calls: string[] }
function fake(f: Partial<Fake> = {}): ChainRpc & { calls: string[] } {
  const calls: string[] = [];
  const codes = f.codes ?? { [CANONICAL_ANNOUNCER]: ANN_CODE, [ARACHNID_DEPLOYER]: DEP_CODE };
  return {
    calls,
    getChainId: () => {
      calls.push('chainId');
      const v = 'chainId' in f ? f.chainId : 59144;
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v as number);
    },
    getCode: (a) => {
      calls.push(a);
      const v = codes[a];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v as string);
    },
  };
}
const hang: ChainRpc = { getChainId: () => new Promise(() => undefined), getCode: () => new Promise(() => undefined) };

describe('verifyChain', () => {
  it('ok with matching reference hashes', async () => {
    const r = await verifyChain(linea, fake(), { expectedAnnouncerCodeHash: annHash.toUpperCase().replace('0X', '0x'), expectedDeployerCodeHash: depHash });
    expect(r.result).toBe('ok');
    expect(r.announcer.runtimeCodeHash).toBe(annHash);
    expect(r.notes).toEqual([]);
  });
  it('accepts bigint chain id; ok even if deployer absent, with note', async () => {
    const r = await verifyChain(linea, fake({ chainId: 59144n, codes: { [CANONICAL_ANNOUNCER]: ANN_CODE, [ARACHNID_DEPLOYER]: '0x' } }), { expectedAnnouncerCodeHash: annHash });
    expect(r.result).toBe('ok');
    expect(r.notes).toHaveLength(1);
  });
  it('unverified without a reference hash (never ok)', async () => {
    expect((await verifyChain(linea, fake())).result).toBe('unverified');
  });
  it('chain id mismatch stops before code reads', async () => {
    const rpc = fake({ chainId: 1 });
    const r = await verifyChain(linea, rpc, { expectedAnnouncerCodeHash: annHash });
    expect(r.result).toBe('chain_mismatch');
    expect(r.observedChainId).toBe('1');
    expect(rpc.calls).toEqual(['chainId']);
  });
  it('empty code: announcer_missing vs deployer_missing', async () => {
    const a = await verifyChain(linea, fake({ codes: { [CANONICAL_ANNOUNCER]: '0x', [ARACHNID_DEPLOYER]: DEP_CODE } }));
    expect(a.result).toBe('announcer_missing');
    expect(a.announcer.present).toBe(false);
    const b = await verifyChain(linea, fake({ codes: { [CANONICAL_ANNOUNCER]: '0x', [ARACHNID_DEPLOYER]: '0x' } }));
    expect(b.result).toBe('deployer_missing');
  });
  it('wrong code hash', async () => {
    const r = await verifyChain(linea, fake(), { expectedAnnouncerCodeHash: '0x' + '22'.repeat(32) });
    expect(r.result).toBe('code_mismatch');
    expect(r.announcer.matchesReference).toBe(false);
    const d = await verifyChain(linea, fake(), { expectedAnnouncerCodeHash: annHash, expectedDeployerCodeHash: '0x' + '22'.repeat(32) });
    expect(d.result).toBe('code_mismatch');
  });
  it('network errors are rpc_error and leak no provider text', async () => {
    const e = new Error('https://secret.example/KEY');
    for (const f of [{ chainId: e }, { codes: { [CANONICAL_ANNOUNCER]: e } }, { codes: { [CANONICAL_ANNOUNCER]: ANN_CODE, [ARACHNID_DEPLOYER]: e } }]) {
      const r = await verifyChain(linea, fake(f), { expectedAnnouncerCodeHash: annHash });
      expect(r.result).toBe('rpc_error');
      expect(JSON.stringify(r)).not.toContain('secret');
    }
  });
  it('malformed responses fail closed', async () => {
    expect((await verifyChain(linea, fake({ chainId: '0xe708' }))).result).toBe('rpc_error');
    expect((await verifyChain(linea, fake({ codes: { [CANONICAL_ANNOUNCER]: 'garbage' } }))).result).toBe('rpc_error');
    expect((await verifyChain(linea, fake({ codes: { [CANONICAL_ANNOUNCER]: undefined } }))).result).toBe('rpc_error');
  });
  it('timeout', async () => {
    const r = await verifyChain(linea, hang, { timeoutMs: 20 });
    expect(r.result).toBe('rpc_error');
    expect(r.notes[0]).toContain('timeout');
  });
  it('abort: pre-aborted, mid-flight, and rejecting after abort', async () => {
    const pre = new AbortController();
    pre.abort();
    const rpc = fake();
    expect((await verifyChain(linea, rpc, { signal: pre.signal })).result).toBe('aborted');
    expect(rpc.calls).toEqual([]);
    const mid = new AbortController();
    const p = verifyChain(linea, hang, { signal: mid.signal });
    setTimeout(() => { mid.abort(); }, 10);
    expect((await p).result).toBe('aborted');
    const mid2 = new AbortController();
    const rej: ChainRpc = {
      getChainId: (o) => new Promise((_, rj) => { o?.signal.addEventListener('abort', () => { rj(new Error('x')); }); }),
      getCode: () => Promise.reject(new Error('x')),
    };
    const p2 = verifyChain(linea, rej, { signal: mid2.signal });
    setTimeout(() => { mid2.abort(); }, 10);
    expect((await p2).result).toBe('aborted');
  });
  it('rejects zkSync (non-standard CREATE2) before any RPC call', async () => {
    const zk = findExtraChain(324) as ExtraChainEntry;
    const rpc = fake({ chainId: 324 });
    const r = await verifyChain(zk, rpc, { expectedAnnouncerCodeHash: annHash });
    expect(r.result).toBe('unsupported_create2');
    expect(rpc.calls).toEqual([]);
  });
  it('rejects bad options', async () => {
    await expect(verifyChain(linea, fake(), { expectedAnnouncerCodeHash: '0x12' })).rejects.toThrow(RangeError);
    await expect(verifyChain(linea, fake(), { expectedDeployerCodeHash: 'zz' })).rejects.toThrow(RangeError);
    await expect(verifyChain(linea, fake(), { timeoutMs: 0 })).rejects.toThrow(RangeError);
  });
});
