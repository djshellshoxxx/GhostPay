import { CHAINS, type RpcClient } from '@ghostpay/chain-adapters';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UserFacingError } from './errors';
import { FAKE_ANNOUNCER } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import {
  DEFAULT_SCAN_PRIVACY,
  SCAN_PRIVACY_KEY,
  SCAN_ROUTE_CHANGED,
  UNREADABLE_SCAN_PRIVACY,
  describeScanDisclosureMessages,
  guardScanClient,
  isScanRouteChanged,
  loadScanPrivacy,
  openScanClients,
  planScan,
  privatePathForbidsDirect,
  saveScanPrivacy,
  type ScanPrivacySettings,
} from './scanPrivacy';

// W3: saved scan privacy intent is never silently weakened, and a scan never keeps using a route the user changed.
const chain = CHAINS.find((c) => c.chainId === 84532)!;
const SEED = 20261125;

function memory(initial?: string): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; m: Map<string, string> } {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set(SCAN_PRIVACY_KEY, initial);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, m };
}
const stored = (value: unknown) => memory(JSON.stringify(value));

function expectLocked(s: ScanPrivacySettings): void {
  expect(s.unreadable).toBe(true);
  expect(s.requireProxy).toBe(true);
  const plan = planScan(s, chain);
  expect(plan.kind).toBe('blocked');
  if (plan.kind === 'blocked') expect(plan.reasonMessage.key).toBe('scanPrivacy.blocked.settingsUnreadable');
  expect(privatePathForbidsDirect(s)).toBe(true);
  const rows = describeScanDisclosureMessages(s, { hasSecondary: true });
  expect(rows[0]?.party.key).toBe('scanPrivacy.disclosure.unreadableParty');
  expect(rows.some((r) => r.party.key === 'scanPrivacy.disclosure.secondParty')).toBe(false);
  expect(rows.find((r) => r.party.key === 'scanPrivacy.disclosure.sweepParty')?.learns.key).toBe('scanPrivacy.disclosure.sweepOnRequest');
}

/** A route that can be changed by the test, as Settings in this or another tab would. */
function route(): { assert: () => void; change: () => void } {
  let current = true;
  return { assert: () => { if (!current) throw new UserFacingError(SCAN_ROUTE_CHANGED); }, change: () => { current = false; } };
}

describe('saved scan privacy intent', () => {
  it('nothing saved, or no storage API at all, gives the defaults', () => {
    expect(loadScanPrivacy(memory())).toBe(DEFAULT_SCAN_PRIVACY);
    expect(loadScanPrivacy(undefined)).toBe(DEFAULT_SCAN_PRIVACY);
  });

  it('valid settings and older saved versions without newer fields load as saved', () => {
    const proxy: ScanPrivacySettings = { ...DEFAULT_SCAN_PRIVACY, transport: 'local-proxy', endpoints: { '84532': 'http://127.0.0.1:8545' }, requireProxy: true };
    const st = memory();
    expect(saveScanPrivacy(st, proxy)).toBe(true);
    const loaded = loadScanPrivacy(st);
    expect(loaded.unreadable).toBeUndefined();
    expect(loaded.transport).toBe('local-proxy');
    expect(planScan(loaded, chain).kind).toBe('ready');
    const older = loadScanPrivacy(stored({ transport: 'tor-browser', requireProxy: true }));
    expect(older.unreadable).toBeUndefined();
    expect(older).toMatchObject({ transport: 'tor-browser', requireProxy: true, windowBlocks: DEFAULT_SCAN_PRIVACY.windowBlocks });
  });

  it.each<[string, string]>([
    ['corrupt JSON', '{"transport":"local-proxy","requireProxy":tru'],
    ['not a record', '"local-proxy"'],
    ['an unknown transport', JSON.stringify({ transport: 'tor', requireProxy: false })],
    ['a non-boolean requirement', JSON.stringify({ transport: 'local-proxy', requireProxy: 'yes' })],
    ['an out-of-range window', JSON.stringify({ requireProxy: true, windowBlocks: -1 })],
    ['a proxy endpoint that is not on this computer', JSON.stringify({ transport: 'local-proxy', requireProxy: true, endpoints: { 84532: 'https://rpc.example.org' } })],
    ['an unknown log source', JSON.stringify({ source: 'indexr' })],
    ['inverted delays', JSON.stringify({ jitterMinMs: 5, jitterMaxMs: 1 })],
  ])('%s is unreadable: scanning is blocked and nothing falls back to Direct', (_name, text) => {
    expectLocked(loadScanPrivacy(memory(text)));
  });

  it('a storage read the browser refuses is unreadable, not Direct', () => {
    const refusing = { getItem: (): string | null => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => undefined };
    const s = loadScanPrivacy(refusing);
    expect(s).toBe(UNREADABLE_SCAN_PRIVACY);
    expectLocked(s);
  });

  it('saving reviewed settings clears the lock, and the lock itself is never saved', () => {
    const st = memory('{broken');
    const locked = loadScanPrivacy(st);
    expectLocked(locked);
    expect(saveScanPrivacy(st, { ...locked, transport: 'tor-browser' })).toBe(true);
    expect(st.m.get(SCAN_PRIVACY_KEY)).not.toContain('unreadable');
    const reviewed = loadScanPrivacy(st);
    expect(reviewed.unreadable).toBeUndefined();
    expect(reviewed).toMatchObject({ transport: 'tor-browser', requireProxy: true });
  });

  it('fuzz: no saved value is ever weakened to an unrequired Direct scan', () => {
    const known = ['transport', 'requireProxy', 'windowBlocks', 'jitterMinMs', 'jitterMaxMs', 'source', 'endpoints', 'indexerUrls', 'openLaneBudget', 'unknownField'] as const;
    const plausible = fc.oneof(
      fc.constantFrom<unknown>('direct', 'tor-browser', 'local-proxy', 'rpc', 'indexer', true, false, 0, 1000, 20_000, -1, 1e9, null,
        { 84532: 'http://127.0.0.1:8545' }, { 84532: 'https://rpc.example.org' }, { x: 1 }, []),
      fc.jsonValue({ maxDepth: 2 }),
    );
    fc.assert(fc.property(fc.dictionary(fc.constantFrom(...known), plausible, { maxKeys: 6 }), (value) => {
      const v: Record<string, unknown> = value;
      const s = loadScanPrivacy(stored(v));
      // A saved requirement is kept, readable or not.
      if (v['requireProxy'] === true) expect(s.requireProxy).toBe(true);
      if (s.unreadable === true) {
        expect(planScan(s, chain).kind).toBe('blocked');
        expect(privatePathForbidsDirect(s)).toBe(true);
        return;
      }
      // Readable: every present field was kept as saved.
      if ('transport' in v) expect(s.transport).toBe(v['transport']);
      if ('requireProxy' in v) expect(s.requireProxy).toBe(v['requireProxy']);
      if ('source' in v) expect(s.source).toBe(v['source']);
      // Direct without the requirement only when that is what was saved (or nothing was).
      if (s.transport === 'direct' && !s.requireProxy) {
        expect(v['transport'] === undefined || v['transport'] === 'direct').toBe(true);
        expect(v['requireProxy'] === undefined || v['requireProxy'] === false).toBe(true);
      }
    }), { numRuns: 400, seed: SEED });
  });
});

describe('per-request scan route checks', () => {
  it('checks before sending, refuses after a change and discards a delayed answer', async () => {
    const r = route();
    const inner = mockRpc(84532, (m) => (m === 'eth_blockNumber' ? '0x10' : null));
    const guarded = guardScanClient(inner, r.assert);
    await expect(guarded.blockNumber()).resolves.toBe(16n);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: RpcClient = { ...inner, request: async (method, params) => { await gate; return inner.request(method, params); } };
    const pending = guardScanClient(slow, r.assert).request('eth_blockNumber', []);
    r.change();
    release();
    await expect(pending).rejects.toSatisfy(isScanRouteChanged);

    const sent = inner.calls.length;
    await expect(guarded.getLogs({ address: FAKE_ANNOUNCER, topics: [], fromBlock: 0n, toBlock: 1n })).rejects.toSatisfy(isScanRouteChanged);
    await expect(guarded.getBlock(1n)).rejects.toSatisfy(isScanRouteChanged);
    expect(inner.calls.length).toBe(sent);
  });

  it('a failure that arrives after a change reports the change', async () => {
    const r = route();
    const failing: RpcClient = { ...mockRpc(84532, () => null), request: () => { r.change(); return Promise.reject(new Error('network down')); } };
    await expect(guardScanClient(failing, r.assert).request('eth_blockNumber', [])).rejects.toSatisfy(isScanRouteChanged);
  });

  /** JSON-RPC over a fake fetch: chain 84532, head 0x10. Counts every request that would leave the page. */
  function endpoint(onFetch?: (n: number) => void | 'fail'): { fetchImpl: (url: string, init: RequestInit) => Promise<Response>; sent: () => number } {
    let n = 0;
    const fetchImpl = (_url: string, init: RequestInit): Promise<Response> => {
      n += 1;
      if (onFetch?.(n) === 'fail') return Promise.reject(new TypeError('network down'));
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as { id: number; method: string };
      const result = body.method === 'eth_chainId' ? '0x14a34' : body.method === 'eth_blockNumber' ? '0x10' : null;
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } }));
    };
    return { fetchImpl, sent: () => n };
  }
  const endpointPlan = () => {
    const plan = planScan({ ...DEFAULT_SCAN_PRIVACY, transport: 'tor-browser', endpoints: { '84532': 'https://scan.example.org' } }, chain);
    if (plan.kind !== 'ready') throw new Error('plan');
    return plan;
  };

  it('on a scan endpoint, nothing more is sent once the route changes', async () => {
    const r = route();
    const net = endpoint();
    const clients = await openScanClients({ plan: endpointPlan(), chain, announcer: FAKE_ANNOUNCER, appRpc: () => Promise.resolve(undefined), fetchImpl: net.fetchImpl, sleep: () => Promise.resolve(), assertCurrent: r.assert });
    expect(clients).toBeDefined();
    await expect(clients!.base.blockNumber()).resolves.toBe(16n);
    const sent = net.sent();
    r.change();
    await expect(clients!.base.blockNumber()).rejects.toSatisfy(isScanRouteChanged);
    await expect(clients!.scan.blockNumber()).rejects.toSatisfy(isScanRouteChanged);
    expect(net.sent()).toBe(sent);
  });

  it('a transport retry after a change is not sent, and the change is reported', async () => {
    const r = route();
    let failAt = 0;
    const net = endpoint((n) => { if (n === failAt) { r.change(); return 'fail'; } });
    const clients = await openScanClients({ plan: endpointPlan(), chain, announcer: FAKE_ANNOUNCER, appRpc: () => Promise.resolve(undefined), fetchImpl: net.fetchImpl, sleep: () => Promise.resolve(), assertCurrent: r.assert });
    failAt = net.sent() + 1;
    await expect(clients!.base.blockNumber()).rejects.toSatisfy(isScanRouteChanged);
    // The failed attempt was the last request: no retry and no chain re-check left the page.
    expect(net.sent()).toBe(failAt);
  });

  it('a change during the initial chain check reports the change, not an unusable endpoint', async () => {
    const r = route();
    const net = endpoint((n) => { if (n === 1) r.change(); });
    await expect(openScanClients({ plan: endpointPlan(), chain, announcer: FAKE_ANNOUNCER, appRpc: () => Promise.resolve(undefined), fetchImpl: net.fetchImpl, sleep: () => Promise.resolve(), assertCurrent: r.assert }))
      .rejects.toSatisfy(isScanRouteChanged);
  });

  it("guards the scan's use of the cached app RPC without changing the cached client", async () => {
    const r = route();
    const cached = mockRpc(84532, (m) => (m === 'eth_blockNumber' ? '0x10' : null));
    const plan = planScan(DEFAULT_SCAN_PRIVACY, chain);
    if (plan.kind !== 'ready') throw new Error('plan');
    const clients = await openScanClients({ plan, chain, announcer: FAKE_ANNOUNCER, appRpc: () => Promise.resolve(cached), fetchImpl: () => Promise.reject(new Error('no fetch')), sleep: () => Promise.resolve(), assertCurrent: r.assert });
    await expect(clients!.base.blockNumber()).resolves.toBe(16n);
    r.change();
    await expect(clients!.base.blockNumber()).rejects.toSatisfy(isScanRouteChanged);
    // Other views keep using the cached client under their own checks.
    await expect(cached.blockNumber()).resolves.toBe(16n);
    expect(cached.calls.map((c) => c.method)).toEqual(['eth_blockNumber', 'eth_blockNumber']);
  });

  it('without a route check, openScanClients behaves as before', async () => {
    const cached = mockRpc(84532, (m) => (m === 'eth_blockNumber' ? '0x10' : null));
    const plan = planScan(DEFAULT_SCAN_PRIVACY, chain);
    if (plan.kind !== 'ready') throw new Error('plan');
    const clients = await openScanClients({ plan, chain, announcer: FAKE_ANNOUNCER, appRpc: () => Promise.resolve(cached), fetchImpl: () => Promise.reject(new Error('no fetch')), sleep: () => Promise.resolve() });
    expect(clients!.base).toBe(cached);
  });
});
