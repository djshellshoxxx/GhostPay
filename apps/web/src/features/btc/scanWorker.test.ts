import { createScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { describe, expect, it, vi } from 'vitest';
import { EsploraClient, type EsploraFetch } from './esplora';
import { mockChain, walletA } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { scanForPayments, wipeFound } from './scan';
import { scanForPaymentsInWorker, type BtcScanWorker } from './scanWorkerClient';
import type { BtcScanRequest, BtcScanResponse } from './scanWorkerMessages';
import { InlineBtcScanWorker } from './scanWorker.testutil';
import { BtcScanProtocol } from './scanWorkerProtocol';

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
  it('rejects a forged outpoint request before any network access when the session did not opt in', async () => {
    const f = await fixture(); const fetchFn = vi.fn<EsploraFetch>();
    let fake!: BtcScanWorker; let id = 0; const terminate = vi.fn();
    const running = scanForPaymentsInWorker(f, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate, postMessage: (m) => { id = m.id; },
    }), fetchFn);
    fake.onmessage?.({ data: { type: 'source', id, requestId: 1, path: `/tx/${'ab'.repeat(32)}/outspend/1` } });
    await expect(running).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchFn).not.toHaveBeenCalled(); expect(terminate).toHaveBeenCalledOnce();
  });

  it('rejects provider status from a worker when the active scan did not grant provider consent', async () => {
    const f = await fixture(); const result = await scanForPayments(f);
    let fake!: BtcScanWorker; let id = 0;
    const running = scanForPaymentsInWorker(f, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate: () => {}, postMessage: (m) => { id = m.id; },
    }), f.chain.fetchFn);
    fake.onmessage?.({ data: { type: 'done', id, result: { ...result, spentStatus: 'provider' } } });
    await expect(running).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(result.found[0]!.spendTweak.every((b) => b === 0)).toBe(true);
  });

  it.each([
    ['hex', false], ['merkle-proof', false], ['hex', true], ['merkle-proof', true],
  ] as const)('rejects a forged matched %s request in full mode with provider consent %s', async (suffix, consent) => {
    const f = await fixture(); const ac = new AbortController();
    const fetchFn = vi.fn<EsploraFetch>(() => Promise.resolve(new Response('untrusted proof')));
    let fake!: BtcScanWorker; let id = 0; const terminate = vi.fn();
    const running = scanForPaymentsInWorker({ ...f, signal: ac.signal, providerSpentCheck: consent,
      oracle: { kind: 'http', url: 'https://oracle.test', mode: 'full' },
    }, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate, postMessage: (m) => { id = m.id; },
    }), fetchFn);
    const settled = running.then((result) => { wipeFound(result.found); }, () => {});
    try {
      fake.onmessage?.({ data: { type: 'source', id, requestId: 1, path: `/tx/${'ab'.repeat(32)}/${suffix}` } });
      expect(fetchFn).not.toHaveBeenCalled();
      await expect(running).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(terminate).toHaveBeenCalledOnce();
    } finally { ac.abort(); await settled; }
  });

  it.each([
    ['hex', false], ['merkle-proof', false], ['hex', true], ['merkle-proof', true],
  ] as const)('the worker independently refuses matched %s requests in full mode with provider consent %s', async (suffix, consent) => {
    const f = await fixture(); const sent: BtcScanResponse[] = [];
    let finish!: () => void; const finished = new Promise<void>((resolve) => { finish = resolve; });
    const protocol = new BtcScanProtocol((m) => {
      sent.push(m);
      if (m.type === 'source') protocol.handle({ type: 'sourceError', id: m.id, requestId: m.requestId, code: 'INVALID_RESPONSE' });
      if (m.type === 'error') finish();
    });
    const tip = vi.spyOn(EsploraClient.prototype, 'tipHeight').mockImplementation(async function (this: EsploraClient, signal) {
      if (suffix === 'hex') await this.rawTransaction('ab'.repeat(32), signal);
      else await this.merkleProof('ab'.repeat(32), signal);
      return 4;
    });
    try {
      protocol.handle({ type: 'start', id: 7, network: f.wallet.net.id, baseUrl: f.client.baseUrl,
        scanSecret: new Uint8Array(f.wallet.keys.scanSecret), spendPublicKey: new Uint8Array(f.wallet.keys.spendPublicKey),
        headers: f.headers.toJSON(), fromHeight: f.fromHeight, checkpoints: false, providerSpentCheck: consent,
        oracle: { kind: 'http', url: 'https://oracle.test', mode: 'full' },
      });
      await finished;
      expect(sent.filter((m) => m.type === 'source')).toEqual([]);
      expect(sent).toEqual([{ type: 'error', id: 7, code: 'TRANSPORT_FAILURE' }]);
    } finally { tip.mockRestore(); protocol.dispose(); }
  });

  it.each(['local', 'unknown'] as const)('rejects a consented light worker claiming %s status and wipes its tweak', async (spentStatus) => {
    const f = await fixture(); const result = await scanForPayments(f); const fetchFn = vi.fn<EsploraFetch>();
    let fake!: BtcScanWorker; let id = 0; const terminate = vi.fn();
    const running = scanForPaymentsInWorker({ ...f, providerSpentCheck: true,
      oracle: { kind: 'http', url: 'https://oracle.test', mode: 'light' },
    }, () => (fake = {
      onmessage: null, onerror: null, onmessageerror: null, terminate, postMessage: (m) => { id = m.id; },
    }), fetchFn);
    fake.onmessage?.({ data: { type: 'done', id, result: { ...result, spentStatus } } });
    const outcome: unknown = await running.then((accepted) => { wipeFound(accepted.found); return { resolved: true }; }, (error: unknown) => error);
    expect(outcome).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(result.found[0]!.spendTweak.every((b) => b === 0)).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled(); expect(terminate).toHaveBeenCalledOnce();
  });

  it.each([undefined, false, 'true'])('rejects light scans with provider consent %s before worker creation', async (consent) => {
    const f = await fixture(); const factory = vi.fn(() => new InlineBtcScanWorker());
    await expect(scanForPaymentsInWorker({ ...f, oracle: { kind: 'http', url: 'https://oracle.test', mode: 'light' },
      ...(consent === undefined ? {} : { providerSpentCheck: consent as boolean }),
    }, factory, f.chain.fetchFn)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([false, 'true'])('the worker independently rejects light start messages with invalid consent %s', async (consent) => {
    const f = await fixture(); f.chain.requests.length = 0;
    class InvalidConsentWorker extends InlineBtcScanWorker {
      public override postMessage(m: BtcScanRequest): void {
        super.postMessage(m.type === 'start' ? { ...m, providerSpentCheck: consent as boolean } : m);
      }
    }
    await expect(scanForPaymentsInWorker({ ...f, providerSpentCheck: true,
      oracle: { kind: 'http', url: 'https://oracle.test', mode: 'light' },
    }, () => new InvalidConsentWorker(), f.chain.fetchFn)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(f.chain.requests).toEqual([]);
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
});
