import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Hex } from 'viem';
import { MockPoolAdapter, MockPoolLedger, MOCK_DEPOSITED_TOPIC, MOCK_POOL_ADDRESS, decodeMockData, deriveMockCreds } from './adapters/mock/index.js';
import { ALLOWED_CHAIN_IDS } from './guard.js';
import { planRoute } from './planner.js';
import { AdapterRegistry } from './registry.js';
import { recoverNotes } from './recovery.js';
import { TESTNET_MANIFEST } from './manifest-data.js';
import { D1, D2, S1, fakeChainReader, makeReceipt, makeRequest, makeSeed, makeSigner, stubTransport } from './testkit.js';
import { MemoryVaultStorage, Vault } from './vault.js';
import type { ExternalPoolAdapter, PoolNote, RouteRequest } from './types.js';

const KDF = { N: 1 << 14, r: 8, p: 1 };

function setup(): { ledger: MockPoolLedger; adapter: MockPoolAdapter; req: RouteRequest; clock: { now: number } } {
  const ledger = new MockPoolLedger();
  const clock = { now: 1_700_000_000_000 };
  const adapter = new MockPoolAdapter(ledger, { clock: () => clock.now });
  ledger.fund(S1, 'native', 10_000_000n);
  return { ledger, adapter, req: makeRequest({ amount: 1_000_000n }), clock };
}

async function enter(ledger: MockPoolLedger, adapter: MockPoolAdapter, req: RouteRequest, mineAfter = 5): Promise<PoolNote> {
  const q = await adapter.quoteEntry(req);
  const [tx] = await adapter.prepareEntry(req, q);
  const receipt = ledger.execute(tx!);
  ledger.mine(mineAfter);
  return adapter.recordEntry(req, q, ledger.receiptFor(receipt));
}

describe('MockPoolAdapter acceptance A1', () => {
  it('enter, age, exit to a fresh D, delete the vault and recover the same note ids', async () => {
    const { ledger, adapter, req, clock } = setup();
    ledger.entryFeeBps = 100; // 1% vetting fee
    const vault = await Vault.create(new MemoryVaultStorage(), 'correct horse battery', KDF);
    const note = await enter(ledger, adapter, req);
    expect(note.depositedAmount).toBe(990_000n); // from the log, not the request (EP-PP-4)
    expect(note.state).toBe('confirmed');
    expect(note.createdAt % 3600).toBe(0);
    await vault.putNote(note);
    await vault.registerSigner(S1, 'idx0');

    const quote = await adapter.quoteExit(note, { destination: D1, maxFeeBps: 100 });
    expect(quote.netAmount + quote.feeAmount).toBe(note.depositedAmount);
    const { transport } = stubTransport(() => new Response('no'), clock);
    const res = await adapter.executeExit(note, quote, transport);
    expect(res.newState).toBe('exited');
    expect(ledger.balanceOf(D1, 'native')).toBe(res.exitedAmount);
    expect(res.exitedAmount + res.feeAmount).toBe(note.depositedAmount);
    await vault.setState(note.noteId, 'exited');

    // vault deleted: rebuild from chain data only
    const vault2 = await Vault.create(new MemoryVaultStorage(), 'another long passphrase', KDF);
    const report = await recoverNotes([adapter], req.rootSeed, { chainId: 31337, chain: fakeChainReader(), stealthAddresses: [S1], fromBlock: 0n }, vault2);
    expect(report.errors).toEqual([]);
    expect(report.recovered.map((n) => n.noteId)).toEqual([note.noteId]);
    expect((await vault2.getNote(note.noteId))?.state).toBe('exited');
    expect(() => vault2.assertDepositAllowed('mock-pool:31337')).not.toThrow();
  });

  it('EP-GEN-6: emergency exit works with relayer offline, indexer down and the note not on the approval list', async () => {
    const { ledger, adapter, req } = setup();
    ledger.approveByDefault = false;
    const note = await enter(ledger, adapter, req);
    ledger.relayerOnline = false;
    ledger.indexerOnline = false;
    const { transport } = stubTransport(() => new Response('no'), { now: 1_700_000_000_000 });
    const q = await adapter.quoteExit(note, { destination: D1 });
    await expect(adapter.executeExit(note, q, transport)).rejects.toMatchObject({ code: 'RELAYER_REJECTED' });
    const before = ledger.balanceOf(S1, 'native');
    const txs = await adapter.prepareEmergencyExit(note);
    expect(txs).toHaveLength(1);
    expect(txs[0]?.from).toBe(S1);
    ledger.execute(txs[0]!);
    expect(ledger.balanceOf(S1, 'native') - before).toBe(note.depositedAmount);
    expect(() => ledger.execute(txs[0]!)).toThrow(/unknown or spent/);
  });

  it('only the depositor can ragequit', async () => {
    const { ledger, adapter, req } = setup();
    const note = await enter(ledger, adapter, req);
    const [tx] = await adapter.prepareEmergencyExit(note);
    expect(() => ledger.execute({ ...tx!, from: D2 })).toThrow(/original depositor/);
  });

  it('exit of an unapproved note fails; approval toggles it', async () => {
    const { ledger, adapter, req, clock } = setup();
    ledger.approveByDefault = false;
    const note = await enter(ledger, adapter, req);
    const { transport } = stubTransport(() => new Response('no'), clock);
    const q = await adapter.quoteExit(note, { destination: D1 });
    await expect(adapter.executeExit(note, q, transport)).rejects.toThrow(/approval list/);
    const d = decodeMockData(note.adapterData);
    expect(ledger.isApproved(d.commitment)).toBe(false);
    ledger.setApproved(d.commitment, true);
    expect((await adapter.executeExit(note, q, transport)).newState).toBe('exited');
    ledger.setApproved(d.commitment, false);
    expect(ledger.isApproved(d.commitment)).toBe(false);
  });

  it('recovery marks the scope incomplete when the indexer fails and blocks planning (EP-VAULT-4)', async () => {
    const { ledger, adapter, req } = setup();
    await enter(ledger, adapter, req);
    ledger.indexerOnline = false;
    const vault = await Vault.create(new MemoryVaultStorage(), 'correct horse battery', KDF);
    const report = await recoverNotes([adapter], req.rootSeed, { chainId: 31337, chain: fakeChainReader(), stealthAddresses: [S1], fromBlock: 0n }, vault);
    expect(report.errors[0]?.message).toContain('indexer is offline');
    const reg = new AdapterRegistry(TESTNET_MANIFEST);
    reg.register(adapter);
    await expect(planRoute(reg, req, 'mock-pool', { vault })).rejects.toMatchObject({ code: 'SCOPE_INCOMPLETE' });
    ledger.indexerOnline = true;
    await recoverNotes([adapter], req.rootSeed, { chainId: 31337, chain: fakeChainReader(), stealthAddresses: [S1], fromBlock: 0n }, vault);
    await expect(planRoute(reg, req, 'mock-pool', { vault })).resolves.toBeDefined();
  });

  it('recovery keeps an existing note and ignores deposits of other depositors', async () => {
    const { ledger, adapter, req } = setup();
    const note = await enter(ledger, adapter, req);
    const vault = await Vault.create(new MemoryVaultStorage(), 'correct horse battery', KDF);
    await vault.putNote({ ...note, state: 'exiting' });
    const rep = await recoverNotes([adapter], req.rootSeed, { chainId: 31337, chain: fakeChainReader(), stealthAddresses: [S1], fromBlock: 0n }, vault);
    expect(rep.recovered[0]?.state).toBe('exiting');
    const other = await recoverNotes([adapter], req.rootSeed, { chainId: 31337, chain: fakeChainReader(), stealthAddresses: [D2], fromBlock: 0n }, vault);
    expect(other.recovered).toEqual([]);
    await expect(recoverNotes([adapter], req.rootSeed, { chainId: 1, chain: fakeChainReader(), stealthAddresses: [], fromBlock: 0n }, vault)).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
  });
});

describe('MockPoolAdapter validation', () => {
  it('EP-GEN-1 on every entry point', async () => {
    const { ledger, adapter, req } = setup();
    const note = await enter(ledger, adapter, req);
    const { transport } = stubTransport(() => new Response('no'));
    for (const chainId of [1, 8453, 100]) {
      const bad = { ...req, chainId };
      const badNote = { ...note, chainId };
      await expect(async () => adapter.supports({ chainId, asset: 'native' })).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
      await expect(adapter.quoteEntry(bad)).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
      await expect(adapter.prepareEntry(bad, await adapter.quoteEntry(req))).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
      await expect(adapter.recordEntry(bad, await adapter.quoteEntry(req), makeReceipt({ transactionHash: '0x01' }))).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
      await expect(adapter.quoteExit(badNote, { destination: D1 })).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
      await expect(adapter.executeExit(badNote, await adapter.quoteExit(note, { destination: D1 }), transport)).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
      await expect(adapter.prepareEmergencyExit(badNote)).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
      const it = adapter.recover(req.rootSeed, { chainId, chain: fakeChainReader(), stealthAddresses: [S1], fromBlock: 0n })[Symbol.asyncIterator]();
      await expect(it.next()).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
    }
    expect(adapter.info().chains).toEqual(ALLOWED_CHAIN_IDS);
  });

  it('rejects deposits not from S1, bad receipts and a spoofed log', async () => {
    const { ledger, adapter, req } = setup();
    const q = await adapter.quoteEntry(req);
    const other = { ...req, stealth: { address: S1, signer: makeSigner(D2) } };
    await expect(adapter.prepareEntry(other, q)).rejects.toMatchObject({ code: 'DEPOSITOR_MISMATCH' });
    const [tx] = await adapter.prepareEntry(req, q);
    const receipt = ledger.execute(tx!);
    await expect(adapter.recordEntry(req, q, { ...receipt, status: 'reverted' })).rejects.toMatchObject({ code: 'RECEIPT_INVALID' });
    await expect(adapter.recordEntry(req, q, { ...receipt, from: D2 })).rejects.toMatchObject({ code: 'DEPOSITOR_MISMATCH' });
    await expect(adapter.recordEntry(req, q, { ...receipt, logs: [] })).rejects.toMatchObject({ code: 'RECEIPT_INVALID' });
    const log = receipt.logs[0]!;
    await expect(adapter.recordEntry(req, q, { ...receipt, logs: [{ ...log, topics: [MOCK_DEPOSITED_TOPIC, ('0x' + '11'.repeat(32)) as Hex, log.topics[2]!] }] })).rejects.toMatchObject({ code: 'RECEIPT_INVALID' });
    const pending = await adapter.recordEntry(req, q, { ...receipt, confirmations: 1 });
    expect(pending.state).toBe('pending');
    await expect(adapter.quoteExit(pending, { destination: D1 })).rejects.toMatchObject({ code: 'NOTE_STATE' });
  });

  it('quotes: below minimum, fee cap, self-broadcast, stale and foreign quotes, bad payloads', async () => {
    const { ledger, adapter, req, clock } = setup();
    ledger.minDeposit = 10n;
    await expect(adapter.quoteEntry({ ...req, amount: 5n })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const note = await enter(ledger, adapter, req);
    await expect(adapter.quoteExit(note, { destination: D1, maxFeeBps: 1 })).rejects.toMatchObject({ code: 'FEE_TOO_HIGH' });
    await expect(adapter.quoteExit(note, { destination: D1, selfBroadcast: true })).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    const q = await adapter.quoteExit(note, { destination: D1 });
    const { transport } = stubTransport(() => new Response('no'), clock);
    await expect(adapter.executeExit({ ...note, noteId: 'other' }, q, transport)).rejects.toMatchObject({ code: 'NOTE_STATE' });
    clock.now += 60_000;
    await expect(adapter.executeExit(note, q, transport)).rejects.toMatchObject({ code: 'RELAYER_REJECTED' });
    clock.now -= 60_000;
    await expect(adapter.executeExit(note, { ...q, feeBps: 9999 }, transport)).rejects.toMatchObject({ code: 'FEE_TOO_HIGH' });
    expect(() => decodeMockData(new TextEncoder().encode('{'))).toThrow();
    expect(() => decodeMockData(new TextEncoder().encode('{"v":2}'))).toThrow();
    expect(() => ledger.execute({ from: S1, to: D2, data: '0x01', value: 0n, chainId: 31337, description: '' })).toThrow();
    expect(() => ledger.execute({ from: S1, to: MOCK_POOL_ADDRESS, data: '0x09', value: 0n, chainId: 31337, description: '' })).toThrow(/selector/);
  });

  it('ledger refuses duplicate precommitments, underfunded and inactive deposits; quote skips used indexes', async () => {
    const { ledger, adapter, req } = setup();
    const n1 = await enter(ledger, adapter, req);
    const q2 = await adapter.quoteEntry(req);
    expect(q2.adapterData['index']).toBe('1');
    const [tx1] = await adapter.prepareEntry(req, { ...q2, adapterData: { index: '0' } });
    expect(() => ledger.execute(tx1!)).toThrow(/already used/);
    const poor = makeRequest({ amount: 99_999_999n });
    const [tx2] = await adapter.prepareEntry(poor, await adapter.quoteEntry(poor));
    expect(() => ledger.execute(tx2!)).toThrow(/insufficient/);
    ledger.lifecycle = 'sunset';
    const [tx3] = await adapter.prepareEntry(req, q2);
    expect(() => ledger.execute(tx3!)).toThrow(/not active/);
    expect(n1.state).toBe('confirmed');
    expect(await adapter.health()).toEqual({ lifecycle: 'sunset', reason: 'mock pool switched off' });
    expect(adapter.info().lifecycle).toBe('sunset');
  });

  it('exhausts deposit indexes', async () => {
    const { ledger, adapter, req } = setup();
    ledger.fund(S1, 'native', 1_000_000_000n);
    for (let i = 0; i < 64; i++) await enter(ledger, adapter, req, 0);
    await expect(adapter.quoteEntry(req)).rejects.toMatchObject({ code: 'PRECOMMITMENT_EXHAUSTED' });
  });

  it('works for ERC-20 assets and derives per-chain secrets', async () => {
    const { ledger, adapter } = setup();
    const token = '0x4444444444444444444444444444444444444444';
    ledger.fund(S1, token, 500n);
    const req = makeRequest({ asset: token, amount: 500n });
    const note = await enter(ledger, adapter, req);
    expect(note.asset).toBe(token);
    expect(ledger.balanceOf(S1, token)).toBe(0n);
    const a = deriveMockCreds(makeSeed(), 31337, 0);
    expect(a.precommitment).not.toBe(deriveMockCreds(makeSeed(), 84532, 0).precommitment);
    expect(a.precommitment).not.toBe(deriveMockCreds(makeSeed(), 31337, 1).precommitment);
    expect(a.precommitment).not.toBe(deriveMockCreds(makeSeed(9), 31337, 0).precommitment);
    expect(a.precommitment).toBe(deriveMockCreds(makeSeed(), 31337, 0).precommitment);
  });

  it('property EP-GEN-8: exited + fee == credited for any amount, entry fee and relayer fee', async () => {
    await fc.assert(
      fc.asyncProperty(fc.bigInt({ min: 1n, max: 10n ** 18n }), fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), async (amount, entryBps, relayBps) => {
        const ledger = new MockPoolLedger();
        ledger.entryFeeBps = entryBps;
        ledger.relayerFeeBps = relayBps;
        const clock = { now: 5 };
        const adapter = new MockPoolAdapter(ledger, { clock: () => clock.now });
        ledger.fund(S1, 'native', amount);
        const req = makeRequest({ amount });
        const note = await enter(ledger, adapter, req);
        const q = await adapter.quoteExit(note, { destination: D1 });
        const { transport } = stubTransport(() => new Response('x'), clock);
        const r = await adapter.executeExit(note, q, transport);
        expect(r.exitedAmount + r.feeAmount).toBe(note.depositedAmount);
        expect(ledger.balanceOf(D1, 'native')).toBe(r.exitedAmount);
      }),
      { numRuns: 40 },
    );
  });
});

describe('planner (EP-GEN-5/7, EP-INT-1, EP-UX-1)', () => {
  const reg = (ledger: MockPoolLedger): AdapterRegistry => {
    const r = new AdapterRegistry(TESTNET_MANIFEST);
    r.register(new MockPoolAdapter(ledger));
    return r;
  };

  it('requires an explicit route', async () => {
    const { ledger, req } = setup();
    await expect(planRoute(reg(ledger), req, undefined)).rejects.toMatchObject({ code: 'ROUTE_REQUIRED' });
  });

  it('EP-0 plan is the unchanged direct sweep (snapshot)', async () => {
    const { ledger, req } = setup();
    const p = await planRoute(reg(ledger), req, 'none');
    expect(p).toMatchInlineSnapshot(`
      {
        "entryEnabled": true,
        "info": null,
        "routeId": "none",
        "steps": [
          {
            "description": "Direct sweep to your destination (no pool).",
            "kind": "sweep-direct",
          },
        ],
        "warnings": [],
      }
    `);
  });

  it('builds steps, shows limits and keeps entry disabled until acknowledged', async () => {
    const { ledger, req } = setup();
    const p = await planRoute(reg(ledger), req, 'mock-pool');
    expect(p.entryEnabled).toBe(false);
    expect(p.steps.map((s) => s.kind)).toEqual(['deposit', 'wait', 'exit', 'emergency-exit']);
    expect(p.warnings.join(' ')).toContain('N1:');
    expect(p.warnings.join(' ')).toContain('No audit report');
    expect(p.quote?.routeId).toBe('mock-pool');
    expect((await planRoute(reg(ledger), req, 'mock-pool', { acknowledged: true })).entryEnabled).toBe(true);
  });

  it('refuses inactive pools, bad chains, unknown or unavailable routes, unsupported amounts', async () => {
    const { ledger, req } = setup();
    ledger.lifecycle = 'sunset';
    await expect(planRoute(reg(ledger), req, 'mock-pool')).rejects.toMatchObject({ code: 'POOL_NOT_ACTIVE', });
    await expect(planRoute(reg(ledger), req, 'mock-pool')).rejects.toThrow(/switched off/);
    ledger.lifecycle = 'active';
    await expect(planRoute(reg(ledger), { ...req, chainId: 1 }, 'mock-pool')).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
    await expect(planRoute(reg(ledger), req, 'railgun')).rejects.toMatchObject({ code: 'ROUTE_UNKNOWN' });
    ledger.minDeposit = 10_000_000_000n;
    await expect(planRoute(reg(ledger), req, 'mock-pool')).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('registry: duplicates and manifest gating', () => {
    const l = new MockPoolLedger();
    const r = reg(l);
    expect(() => r.register(new MockPoolAdapter(l))).toThrow(/already registered/);
    expect(r.ids()).toEqual(['mock-pool']);
    const fake = { id: 'railgun' } as ExternalPoolAdapter;
    r.register(fake);
    expect(() => r.get('railgun', 84532)).toThrow(/no manifest entry/);
    expect(r.get('railgun', 11155111)).toBe(fake);
  });

  it('rejects adapters that prepare transactions from another address or chain, unsupported assets, unavailable routes', async () => {
    const { ledger, req } = setup();
    const inner = new MockPoolAdapter(ledger);
    const evil = (over: Partial<ExternalPoolAdapter>): AdapterRegistry => {
      const r = new AdapterRegistry(TESTNET_MANIFEST);
      r.register(Object.assign(Object.create(inner) as ExternalPoolAdapter, over));
      return r;
    };
    await expect(planRoute(evil({ prepareEntry: async (rq, q) => (await inner.prepareEntry(rq, q)).map((t) => ({ ...t, from: D2 })) }), req, 'mock-pool')).rejects.toMatchObject({ code: 'DEPOSITOR_MISMATCH' });
    await expect(planRoute(evil({ prepareEntry: async (rq, q) => (await inner.prepareEntry(rq, q)).map((t) => ({ ...t, chainId: 1 })) }), req, 'mock-pool')).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
    await expect(planRoute(evil({ supports: () => Promise.resolve({ supported: false }) }), req, 'mock-pool')).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(planRoute(evil({ supports: () => Promise.resolve({ supported: false, reason: 'nope' }) }), req, 'mock-pool')).rejects.toThrow('nope');
    await expect(planRoute(evil({ info: () => ({ ...inner.info(), available: false }) }), req, 'mock-pool')).rejects.toMatchObject({ code: 'ROUTE_NOT_AVAILABLE' });
    await expect(planRoute(evil({ info: () => ({ ...inner.info(), available: false, unavailableReason: 'why' }) }), req, 'mock-pool')).rejects.toThrow('why');
    const approve = evil({ prepareEntry: async (rq, q) => (await inner.prepareEntry(rq, q)).map((t) => ({ ...t, kind: 'approve' as const })) });
    expect((await planRoute(approve, req, 'mock-pool')).steps[0]?.kind).toBe('approve');
    const shield = evil({ prepareEntry: async (rq, q) => (await inner.prepareEntry(rq, q)).map((t) => ({ ...t, kind: 'shield' as const })) });
    expect((await planRoute(shield, req, 'mock-pool')).steps[0]?.kind).toBe('shield');
    const audited = evil({ info: () => ({ ...inner.info(), auditStatus: { reportUrl: 'https://x', retrieved: '2026-10-21' } }) });
    expect((await planRoute(audited, req, 'mock-pool')).warnings.join(' ')).not.toContain('No audit');
    await expect(planRoute(evil({ health: () => Promise.resolve({ lifecycle: 'unknown' as const }) }), req, 'mock-pool')).rejects.toThrow('unknown');
  });
});
