import { describe, expect, it } from 'vitest';
import { PayjoinError } from '../errors.js';
import { addressFor, key } from '../fixtures.testutil.js';
import { parseParams } from '../params.js';
import { buildPayjoinUri } from '../uri.js';
import { FfiTransport, PINNED_PAYJOIN_VERSION, loadPayjoinFfi, type FfiBackend } from './index.js';

const FRAG = 'EX1WKV8CEC-OH1QYPM59NK2LXXS4890SUAXXYT25Z2VAPHP0X7YEYCJXGWAG6UG9ZU6NQ-RK1Q0DJS3VVDXWQQTLQ8022QGXSX7ML9PHZ6EDSF6AKEWQG758JPS2EV';
const ADDR = addressFor(key('f'), 'wpkh');
const V2URI = buildPayjoinUri({ address: ADDR, pj: `https://dir.example/TXJCGKTKXLUUZ#${FRAG}`, outputSubstitution: true, network: 'testnet' });
const V2PJ = `HTTPS://DIR.EXAMPLE/TXJCGKTKXLUUZ#${FRAG}`;
const codeOf = async (f: () => unknown): Promise<string> => {
  try {
    await f();
    return 'none';
  } catch (e) {
    return (e as { code?: string }).code ?? 'other';
  }
};

describe('loadPayjoinFfi (BPJ-FFI-1)', () => {
  it('pins the inspected version', () => {
    expect(PINNED_PAYJOIN_VERSION).toBe('0.25.0');
  });
  it('missing module -> transport_failed with a clear hint', async () => {
    expect(await codeOf(() => loadPayjoinFfi(() => Promise.reject(new Error('Cannot find package'))))).toBe('transport_failed');
  });
  it('unexpected shape and failed init -> transport_failed', async () => {
    expect(await codeOf(() => loadPayjoinFfi(() => Promise.resolve({})))).toBe('transport_failed');
    expect(await codeOf(() => loadPayjoinFfi(() => Promise.resolve({ uniffiInitAsync: () => Promise.reject(new Error('wasm')), payjoin: {} })))).toBe('transport_failed');
  });
  it('initializes and returns the namespace', async () => {
    let inited = false;
    const ns = { marker: 1 };
    const out = await loadPayjoinFfi(() => Promise.resolve({ uniffiInitAsync: () => ((inited = true), Promise.resolve()), payjoin: ns }));
    expect(inited).toBe(true);
    expect(out).toBe(ns);
  });
  it('default importer reports a clean error or works when the optional dependency is installed', async () => {
    const r = await loadPayjoinFfi().then(
      () => 'loaded',
      (e: unknown) => (e as { code?: string }).code,
    );
    expect(['loaded', 'transport_failed']).toContain(r);
  });
});

function backend(log: string[] = []): FfiBackend {
  return {
    openReceiver: (req) => {
      log.push(`open:${req.directoryUrl}:${req.ohttpRelay}:${String(req.outputSubstitution)}`);
      return Promise.resolve({
        uri: V2URI,
        pollOriginal: () => Promise.resolve({ originalPsbt: 'ORIG', params: parseParams('v=1') }),
        reply: (o, p) => (log.push(`reply:${o}:${typeof p === 'string' ? p : p.error}`), Promise.resolve()),
        close: () => (log.push('close'), Promise.resolve()),
      });
    },
    sendOriginal: (req) => {
      log.push(`send:${req.ohttpRelay}`);
      return Promise.resolve({ pollProposal: () => Promise.resolve({ proposalPsbt: 'PROP' }) });
    },
  };
}
const policy = (over: Partial<import('./index.js').V2Policy> = {}) => ({
  directoryUrls: ['https://dir.example'],
  ohttpRelayUrls: ['https://relay.example'],
  now: () => 1_700_000_000,
  ...over,
});

describe('FfiTransport (BPJ-V2-3 and adapter plumbing)', () => {
  it('opens a receiver session through an allowlisted directory and separate relay', async () => {
    const log: string[] = [];
    const t = new FfiTransport(backend(log), policy());
    const s = await t.openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 600 });
    expect(s.uri.pj).toBe(V2PJ);
    expect(log[0]).toBe('open:https://dir.example:https://relay.example:true');
    const inc = await s.poll();
    expect(inc?.originalPsbt).toBe('ORIG');
    await inc?.reply({ error: 'unavailable' });
    await inc?.reply('PSBT');
    await s.close();
    expect(log).toContain('reply:ORIG:unavailable');
    expect(log).toContain('reply:ORIG:PSBT');
    expect(log).toContain('close');
    expect(t.kind).toBe('v2-ohttp');
  });
  it('rejects directories outside the allowlist and same-operator relays by default', async () => {
    const t = new FfiTransport(backend(), policy());
    expect(await codeOf(() => t.openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 5, directoryUrl: 'https://evil.example' }))).toBe('transport_failed');
    const same = new FfiTransport(backend(), policy({ ohttpRelayUrls: ['https://dir.example'] }));
    expect(await codeOf(() => same.openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 5 }))).toBe('transport_failed');
    const allowed = new FfiTransport(backend(), policy({ ohttpRelayUrls: ['https://dir.example'], allowSameOperator: true }));
    expect((await allowed.openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 5 })).uri.address).toBe(ADDR);
    const noDir = new FfiTransport(backend(), policy({ directoryUrls: [] }));
    expect(await codeOf(() => noDir.openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 5 }))).toBe('transport_failed');
    // caller-supplied relays must also be allowlisted
    expect(await codeOf(() => t.openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 5, ohttpRelays: ['https://other-relay.example'] }))).toBe('transport_failed');
    expect(await codeOf(() => t.openReceiverSession({ address: ADDR, network: 'mainnet' as never, expirySeconds: 5 }))).toBe('network_not_allowed');
    expect(await codeOf(() => new FfiTransport(backend(), policy({ directoryUrls: ['nope'] })).openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 5, directoryUrl: 'nope' }))).toBe('uri_invalid');
  });
  it('closes the backend session and fails when the backend returns an expired or bad URI', async () => {
    const log: string[] = [];
    const t = new FfiTransport(backend(log), policy({ now: () => 1_800_000_000 }));
    expect(await codeOf(() => t.openReceiverSession({ address: ADDR, network: 'testnet', expirySeconds: 5 }))).toBe('session_expired');
    expect(log).toContain('close');
  });
  it('sender side: validates the v2 pj, picks a separate relay, maps backend errors', async () => {
    const log: string[] = [];
    const t = new FfiTransport(backend(log), policy());
    const uri = { address: ADDR, pj: V2PJ, outputSubstitution: true, network: 'testnet' as const };
    const s = await t.sendOriginal(uri, 'ORIG', parseParams(''));
    expect(await s.poll()).toEqual({ proposalPsbt: 'PROP' });
    expect(log).toContain('send:https://relay.example');
    expect(await codeOf(() => t.sendOriginal({ ...uri, pj: 'https://dir.example/plain' }, 'O', parseParams('')))).toBe('uri_invalid');
    expect(await codeOf(() => t.sendOriginal({ ...uri, network: 'mainnet' as never }, 'O', parseParams('')))).toBe('network_not_allowed');
    const late = new FfiTransport(backend(), policy({ now: () => 1_800_000_000 }));
    expect(await codeOf(() => late.sendOriginal(uri, 'O', parseParams('')))).toBe('session_expired');
    const failing: FfiBackend = { ...backend(), sendOriginal: () => Promise.resolve({ pollProposal: () => Promise.reject(new PayjoinError('unavailable')) }) };
    const f = await new FfiTransport(failing, policy()).sendOriginal(uri, 'O', parseParams(''));
    expect(await f.poll()).toEqual({ error: 'unavailable' });
    const failing2: FfiBackend = { ...backend(), sendOriginal: () => Promise.resolve({ pollProposal: () => Promise.reject(new Error('wasm trap')) }) };
    const f2 = await new FfiTransport(failing2, policy()).sendOriginal(uri, 'O', parseParams(''));
    expect(await f2.poll()).toEqual({ error: 'transport_failed' });
  });
});
