import { createScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { oracleFixture } from './oracle.testutil';
import { scanForPaymentsInWorker } from './scanWorkerClient';
import { wipeFound } from './scan';

describe('selected oracle through the production worker bridge', () => {
  it.each(['http', 'grpc'] as const)('checks every full block through %s without sending wallet secrets', async (kind) => {
    const f = await oracleFixture();
    const result = await scanForPaymentsInWorker({ ...f, oracle: { kind, url: 'https://oracle.test', mode: 'full' } }, f.factory, f.fetchFn);
    expect(result.found).toHaveLength(1); expect(result.found[0]!.amountSats).toBe(50_000n);
    const oracle = f.calls.filter((c) => c.url.startsWith('https://oracle.test/'));
    expect(oracle.length).toBeGreaterThan(4);
    for (const c of oracle) {
      expect(c.init).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
      expect(c.url).not.toContain(bytesToHex(f.wallet.keys.scanSecret));
      if (c.init.body instanceof Uint8Array) expect(c.init.body.length).toBeLessThanOrEqual(11);
    }
    expect(f.workers[0]!.terminated).toBe(true); wipeFound(result.found);
  });
  it.each(['http', 'grpc'] as const)('light %s verifies exact matched outputs without downloading full blocks', async (kind) => {
    const f = await oracleFixture();
    const result = await scanForPaymentsInWorker({ ...f, oracle: { kind, url: 'https://oracle.test', mode: 'light' } }, f.factory, f.fetchFn);
    expect(result.found).toHaveLength(1);
    expect(f.chain.requests.some((path) => path.includes('/txs/'))).toBe(false);
    expect(f.chain.requests.filter((path) => path.endsWith('/merkle-proof'))).toHaveLength(1);
    expect(f.chain.requests.filter((path) => path.endsWith('/hex'))).toHaveLength(1);
    wipeFound(result.found);
  });
  it.each(['amount', 'proof', 'raw'] as const)('light mode refuses forged %s evidence before the matching block checkpoint', async (bad) => {
    const f = await oracleFixture(); const commits: number[] = [];
    f.controls.badProof = bad === 'proof'; f.controls.badRaw = bad === 'raw';
    if (bad === 'amount') f.controls.edit = (b) => ({ ...b, outputs: { ...b.outputs, outputs: b.outputs.outputs.map((o) => ({ ...o, amountSats: o.amountSats! + 1n })) } });
    await expect(scanForPaymentsInWorker({ ...f, oracle: { kind: 'http', url: 'https://oracle.test', mode: 'light' },
      resumeState: createScanState('regtest', 1), onState: (s) => { commits.push(s.lastHeight); } }, f.factory, f.fetchFn)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(commits).toEqual([1, 2]);
  });
  it('checks no-match blocks against the second oracle and refuses omitted data', async () => {
    const f = await oracleFixture();
    f.controls.edit = (b, origin) => origin.includes('second') && b.tweaks.height === 1 ? { ...b, tweaks: { ...b.tweaks, tweaks: [] } } : b;
    await expect(scanForPaymentsInWorker({ ...f, oracle: { kind: 'http', url: 'https://oracle.test', mode: 'light', second: { kind: 'http', url: 'https://second.test' } } }, f.factory, f.fetchFn))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(f.chain.requests.some((path) => path.endsWith('/merkle-proof'))).toBe(false);
  });
  it('revalidates restored light matches and cannot use a saved match as spend authority', async () => {
    const f = await oracleFixture(); const oracle = { kind: 'http' as const, url: 'https://oracle.test', mode: 'light' as const };
    let saved: ScanState = createScanState('regtest', 1);
    const first = await scanForPaymentsInWorker({ ...f, oracle, resumeState: saved, onState: (s) => { saved = s; } }, f.factory, f.fetchFn); wipeFound(first.found);
    f.controls.badProof = true;
    await expect(scanForPaymentsInWorker({ ...f, oracle, resumeState: saved }, f.factory, f.fetchFn)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it.each(['network', 'capability'])('rejects incompatible %s before oracle block reads', async (bad) => {
    const f = await oracleFixture(); f.controls.network = bad === 'network' ? 'testnet' : 'regtest'; f.controls.full = bad !== 'capability';
    await expect(scanForPaymentsInWorker({ ...f, oracle: { kind: 'http', url: 'https://oracle.test' } }, f.factory, f.fetchFn)).rejects.toMatchObject({ code: bad === 'network' ? 'NETWORK_MISMATCH' : 'UNSUPPORTED' });
    expect(f.calls.filter((c) => c.url.startsWith('https://oracle.test/')).map((c) => new URL(c.url).pathname)).toEqual(['/info']);
  });
  it('cancels a stalled oracle immediately and disposes a late response', async () => {
    const f = await oracleFixture(); const stop = new AbortController(); let release!: (r: Response) => void;
    const pending = scanForPaymentsInWorker({ ...f, signal: stop.signal, oracle: { kind: 'http', url: 'https://oracle.test' } }, f.factory,
      (url, init) => url.startsWith('https://oracle.test/') ? new Promise((resolve) => { release = resolve; }) : f.fetchFn(url, init));
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' }); await vi.waitFor(() => expect(release).toBeDefined()); stop.abort(); await rejected;
    const cancel = vi.fn(); release(new Response(new ReadableStream({ cancel }))); await Promise.resolve(); await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce(); expect(f.workers[0]!.terminated).toBe(true);
  });
});
