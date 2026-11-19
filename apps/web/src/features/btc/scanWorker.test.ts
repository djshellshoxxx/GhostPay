import { createScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { describe, expect, it, vi } from 'vitest';
import { EsploraClient, type EsploraFetch } from './esplora';
import { mockChain, walletA } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { scanForPayments, wipeFound } from './scan';
import { scanForPaymentsInWorker, type BtcScanWorker } from './scanWorkerClient';
import type { BtcScanRequest, BtcScanResponse } from './scanWorkerMessages';
import { InlineBtcScanWorker } from './scanWorker.testutil';

async function fixture() {
  const wallet = walletA(); const chain = mockChain('regtest', wallet);
  const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
  const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
  await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
  const workers: InlineBtcScanWorker[] = [];
  const factory = () => { const w = new InlineBtcScanWorker(); workers.push(w); return w; };
  return { wallet, chain, client, headers, workers, factory, fromHeight: 1 };
}

describe('BTC dedicated worker message integration', () => {
  it('requires an injected transport before creating a worker', async () => {
    const f = await fixture(); const factory = vi.fn(() => { throw new Error('must not start'); });
    await expect(scanForPaymentsInWorker(f, factory, undefined as unknown as EsploraFetch)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('carries the provider spent-check opt-in into the worker and the spent status back out', async () => {
    const f = await fixture();
    const local = await scanForPaymentsInWorker(f, f.factory, f.chain.fetchFn);
    expect(local.spentStatus).toBe('local'); expect(f.chain.requests.some((r) => r.includes('/outspend/'))).toBe(false);
    const start = f.workers[0]!.received[0]!; if (start.type !== 'start') throw new Error('missing start');
    expect('providerSpentCheck' in start).toBe(false); wipeFound(local.found);
    const checked = await scanForPaymentsInWorker({ ...f, providerSpentCheck: true }, f.factory, f.chain.fetchFn);
    expect(checked.spentStatus).toBe('provider'); expect(f.chain.requests.some((r) => r.includes('/outspend/'))).toBe(true);
    expect(f.workers[1]!.received[0]).toMatchObject({ type: 'start', providerSpentCheck: true }); wipeFound(checked.found);
  });

  it('matches direct scanning through cloned messages without sending spend secrets and wipes worker copies', async () => {
    const f = await fixture(); const direct = await scanForPayments(f);
    const result = await scanForPaymentsInWorker(f, f.factory, f.chain.fetchFn);
    expect(result).toEqual(direct); expect(result.found).toHaveLength(1);
    const worker = f.workers[0]!; expect(worker.terminated).toBe(true);
    const request = worker.received[0]!;
    expect(request).toMatchObject({ type: 'start', network: 'regtest' });
    expect('wallet' in request).toBe(false); expect('spendSecret' in request).toBe(false);
    if (request.type !== 'start') throw new Error('missing start');
    expect(request.scanSecret.every((b) => b === 0)).toBe(true);
    expect(f.wallet.keys.scanSecret.some((b) => b !== 0)).toBe(true);
    expect(result.found[0]!.spendTweak.some((b) => b !== 0)).toBe(true);
    expect(f.chain.requests.every((s) => !s.includes(Buffer.from(f.wallet.keys.scanSecret).toString('hex')))).toBe(true);
    expect(() => JSON.stringify(result.found[0]!.spendTweak)).toThrow();
    wipeFound(result.found); wipeFound(direct.found);
  });

  it('awaits each checkpoint commit, resumes from committed state and freshly validates old matches', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const commits: number[] = [];
    const scan = scanForPaymentsInWorker({ ...f, resumeState: saved, onState: async (s: ScanState) => {
      commits.push(s.lastHeight); if (s.lastHeight === 1) await gate; saved = s;
    } }, f.factory, f.chain.fetchFn);
    await vi.waitFor(() => expect(commits).toEqual([1]));
    expect(saved.lastHeight).toBe(0); expect(f.chain.requests).not.toContain('GET /block/' + f.chain.blocks[2]!.hash + '/txs');
    release(); const result = await scan; expect(commits).toEqual([1, 2, 3, 4]); wipeFound(result.found);
    f.chain.requests.length = 0;
    const resumed = await scanForPaymentsInWorker({ ...f, resumeState: saved }, f.factory, f.chain.fetchFn);
    expect(resumed.found).toHaveLength(1); expect(f.chain.requests).toContain('GET /block-height/3');
    expect(f.chain.requests).not.toContain('GET /block-height/1'); wipeFound(resumed.found);
  });

  it('cancels while a checkpoint is pending, terminates immediately and never acknowledges it later', async () => {
    const f = await fixture(); const ac = new AbortController();
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; }); const commit = vi.fn(() => gate);
    const scan = scanForPaymentsInWorker({ ...f, signal: ac.signal, resumeState: createScanState('regtest', 1), onState: commit }, f.factory, f.chain.fetchFn);
    const rejected = expect(scan).rejects.toMatchObject({ code: 'ABORTED' });
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1)); ac.abort(); await rejected;
    expect(f.workers[0]!.terminated).toBe(true); release(); await Promise.resolve(); await Promise.resolve();
    expect(f.workers[0]!.received.filter((m) => m.type === 'checkpointAck')).toHaveLength(0);
  });

  it('propagates a refused encrypted commit and stops before the next block', async () => {
    const f = await fixture(); const refused = new Error('CAS conflict');
    await expect(scanForPaymentsInWorker({ ...f, resumeState: createScanState('regtest', 1), onState: () => { throw refused; } }, f.factory, f.chain.fetchFn)).rejects.toBe(refused);
    expect(f.workers[0]!.terminated).toBe(true);
  });

  it('rejects worker startup and message errors without leaving an active session', async () => {
    const f = await fixture();
    await expect(scanForPaymentsInWorker(f, () => { throw new Error('CSP'); }, f.chain.fetchFn)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    let worker!: BtcScanWorker; const terminate = vi.fn();
    const done = scanForPaymentsInWorker(f, () => (worker = { onmessage: null, onerror: null, onmessageerror: null, postMessage: () => {}, terminate }), f.chain.fetchFn);
    worker.onmessageerror?.(); await expect(done).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(terminate).toHaveBeenCalledOnce();
  });
});


describe('BTC worker stale and untrusted boundary', () => {
  it.each(['hex', 'merkle-proof'])('rejects an unexpected matched-transaction %s query outside opted-in light mode', async (method) => {
    const f = await fixture(); const abort = new AbortController(); let posted!: BtcScanRequest; let fake!: BtcScanWorker;
    f.chain.requests.length = 0;
    const running = scanForPaymentsInWorker({ ...f, signal: abort.signal, providerSpentCheck: true }, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate: () => {}, postMessage: (m) => { posted = m; },
    }), f.chain.fetchFn);
    const settled = running.catch((e: unknown) => e);
    fake.onmessage?.({ data: { type: 'source', id: posted.id, requestId: 1, path: `/tx/${'ab'.repeat(32)}/${method}` } });
    try { expect(f.chain.requests).toHaveLength(0); await expect(settled).resolves.toMatchObject({ code: 'INVALID_RESPONSE' }); }
    finally { abort.abort(); await settled; }
  });
  it('rejects a worker outpoint query when the owner did not enable provider checks', async () => {
    const f = await fixture(); let posted!: BtcScanRequest; let fake!: BtcScanWorker;
    const abort = new AbortController();
    f.chain.requests.length = 0;
    const running = scanForPaymentsInWorker({ ...f, signal: abort.signal }, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate: () => {},
      postMessage: (m) => { posted = m; },
    }), f.chain.fetchFn);
    const settled = running.catch((e: unknown) => e);
    fake.onmessage?.({ data: { type: 'source', id: posted.id, requestId: 1, path: `/tx/${'ab'.repeat(32)}/outspend/0` } });
    try {
      expect(f.chain.requests).toHaveLength(0);
      await expect(settled).resolves.toMatchObject({ code: 'INVALID_RESPONSE' });
    } finally { abort.abort(); await settled; }
  });

  it('rejects a provider-labelled result without consent and wipes its transferred tweak', async () => {
    const f = await fixture(); const result = await scanForPayments(f);
    let posted!: BtcScanRequest; let fake!: BtcScanWorker;
    const running = scanForPaymentsInWorker(f, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate: () => {},
      postMessage: (m) => { posted = m; },
    }), f.chain.fetchFn);
    const transferred = structuredClone(result);
    fake.onmessage?.({ data: { type: 'done', id: posted.id, result: { ...transferred, spentStatus: 'provider' } } });
    await expect(running).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(transferred.found[0]!.spendTweak.every((b) => b === 0)).toBe(true);
    wipeFound(result.found);
  });

  it.each(['local', 'unknown'] as const)('rejects a %s-labelled result after an authorized provider query', async (spentStatus) => {
    const f = await fixture(); const result = await scanForPayments(f);
    const transferred = structuredClone(result); const terminate = vi.fn(); const abort = new AbortController();
    let id = 0; let fake!: BtcScanWorker; let reply!: BtcScanRequest; let received!: () => void;
    const response = new Promise<void>((resolve) => { received = resolve; });
    f.chain.requests.length = 0;
    const running = scanForPaymentsInWorker({ ...f, providerSpentCheck: true, signal: abort.signal }, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate,
      postMessage: (m) => { if (m.type === 'start') id = m.id; else { reply = m; received(); } },
    }), f.chain.fetchFn);
    const output = result.found[0]!; const path = `/tx/${output.txid}/outspend/${String(output.vout)}`;
    try {
      fake.onmessage?.({ data: { type: 'source', id, requestId: 1, path } });
      await response;
      expect(reply).toMatchObject({ type: 'sourceResult', id, requestId: 1, status: 200 });
      expect(f.chain.requests).toEqual([`GET ${path}`]);
      fake.onmessage?.({ data: { type: 'done', id, result: { ...transferred, spentStatus } } });
      await expect(running).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(transferred.found[0]!.spendTweak.every((b) => b === 0)).toBe(true);
      expect(terminate).toHaveBeenCalledOnce(); expect(fake.onmessage).toBeNull();
    } finally {
      abort.abort();
      await running.then((accepted) => { wipeFound(accepted.found); }, () => {});
      wipeFound(transferred.found); wipeFound(result.found);
    }
  });

  it.each(['range', 'chain', 'duplicate', 'local-gap', 'history-page'] as const)('binds a same-session worker result to the requested %s evidence', async (bad) => {
    const f = await fixture(); const result = await scanForPayments(f);
    let posted!: BtcScanRequest; let fake!: BtcScanWorker;
    const running = scanForPaymentsInWorker(f, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate: () => {},
      postMessage: (m) => { posted = m; },
    }), f.chain.fetchFn);
    const transferred = structuredClone(result);
    const altered = { ...transferred,
      ...(bad === 'range' ? { fromHeight: f.fromHeight + 1 } : {}),
      ...(bad === 'chain' ? { found: transferred.found.map((o) => ({ ...o, blockHash: 'ab'.repeat(32) })) } : {}),
      ...(bad === 'duplicate' ? { found: [...transferred.found, ...transferred.found] } : {}),
      ...(bad === 'local-gap' ? { toHeight: 3 } : {}),
      ...(bad === 'history-page' ? { recoveredHistory: { offset: 0, end: 2, total: 1 } } : {}),
    };
    fake.onmessage?.({ data: { type: 'done', id: posted.id, result: altered } });
    await expect(running).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(transferred.found[0]!.spendTweak.every((b) => b === 0)).toBe(true);
    wipeFound(result.found);
  });

  it('ignores another request and wipes a late result after cancellation', async () => {
    const f = await fixture(); const result = await scanForPayments(f); const ac = new AbortController();
    let posted!: BtcScanRequest; let fake!: BtcScanWorker; const terminate = vi.fn();
    const running = scanForPaymentsInWorker({ ...f, signal: ac.signal }, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate,
      postMessage: (m) => { posted = structuredClone(m); },
    }), f.chain.fetchFn);
    const handler = fake.onmessage!;
    handler({ data: { type: 'error', id: posted.id + 1, code: 'INVALID_INPUT' } });
    expect(terminate).not.toHaveBeenCalled();
    const rejected = expect(running).rejects.toMatchObject({ code: 'ABORTED' }); ac.abort(); await rejected;
    const late = structuredClone(result);
    handler({ data: { type: 'done', id: posted.id, result: late } });
    expect(late.found[0]!.spendTweak.every((b) => b === 0)).toBe(true);
    expect(terminate).toHaveBeenCalledOnce(); wipeFound(result.found);
    if (posted.type === 'start') posted.scanSecret.fill(0);
  });

  it('rejects malformed responses and wipes any valid tweak buffers they carry', async () => {
    const f = await fixture(); let fake!: BtcScanWorker; let id = 0; const tweak = new Uint8Array(32).fill(4);
    const running = scanForPaymentsInWorker(f, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate: () => {}, postMessage: (m) => { id = m.id; },
    }), f.chain.fetchFn);
    fake.onmessage?.({ data: { type: 'done', id, result: { found: [null, { spendTweak: tweak }] } } as unknown as BtcScanResponse });
    await expect(running).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(tweak.every((b) => b === 0)).toBe(true);
  });

  it('rechecks the pinned header checkpoint before making a worker network request', async () => {
    const f = await fixture(); f.chain.requests.length = 0;
    class BadAnchor extends InlineBtcScanWorker {
      public override postMessage(m: BtcScanRequest): void {
        super.postMessage(m.type === 'start' ? { ...m, headers: { ...m.headers, checkpoint: { ...m.headers.checkpoint, hash: '00'.repeat(32) } } } : m);
      }
    }
    await expect(scanForPaymentsInWorker(f, () => new BadAnchor(), f.chain.fetchFn)).rejects.toMatchObject({ code: 'INVALID_HEADER' });
    expect(f.chain.requests).toHaveLength(0);
  });

  it('rejects a forged light-mode start without consent inside the worker before requesting source data', async () => {
    const f = await fixture(); f.chain.requests.length = 0;
    class NoConsentLight extends InlineBtcScanWorker {
      public override postMessage(m: BtcScanRequest): void {
        super.postMessage(m.type === 'start' ? { ...m, providerSpentCheck: false, oracle: { kind: 'http', url: 'https://oracle.test', mode: 'light' } } : m);
      }
    }
    await expect(scanForPaymentsInWorker(f, () => new NoConsentLight(), f.chain.fetchFn)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(f.chain.requests).toHaveLength(0);
  });
});
