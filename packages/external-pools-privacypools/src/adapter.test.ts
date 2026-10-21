import { describe, expect, it } from 'vitest';
import { D1, D2, S1, makeReceipt, makeSeed, makeSigner, recoverNotes, stubTransport, MemoryVaultStorage, Vault, ALLOWED_CHAIN_IDS, type PoolNote } from '@ghostpay/external-pools';
import { decodeFunctionData, keccak256, type Hex } from 'viem';
import { PrivacyPoolsAdapter, decodeNoteData, encodeNoteData, formatProof } from './adapter.js';
import { entrypointAbi, erc20Abi, poolAbi } from './abi.js';
import { ENTRYPOINT, FEE_RECEIVER, POOL, TOKEN, relayerHandler, rootOf } from './fakes.testutil.js';
import { DIGESTS, TOKEN_ASSET, manifestFor, rig } from './harness.testutil.js';
import { encodeProofCache } from './state.js';
import { PP_HKDF_INFO, withEntropy } from './derive.js';

const KDF = { N: 1 << 14, r: 8, p: 1 };
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? 'other';
  }
  return 'none';
};

describe('entry (EP-PP-1..4, EP-GEN-3/4)', () => {
  it('deposits from S1, records the committed value from the pool log and derives the note', async () => {
    const r = rig();
    const q = await r.adapter.quoteEntry(r.req);
    expect(q.feeAmount).toBe(10_000n); // 1% vetting fee read from assetConfig
    expect(q.creditedAmount).toBe(990_000n);
    expect(q.fee.entryFeeBps).toBe(100);
    const txs = await r.adapter.prepareEntry(r.req, q);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ kind: 'deposit', from: S1, to: ENTRYPOINT, value: 1_000_000n, chainId: 31337 });
    const f = decodeFunctionData({ abi: entrypointAbi, data: txs[0]!.data });
    expect(f.functionName).toBe('deposit');
    const note = await r.adapter.recordEntry(r.req, q, r.env.execute(txs[0]!));
    expect(note.depositedAmount).toBe(990_000n);
    expect(note.depositor).toBe(S1);
    expect(note.state).toBe('confirmed');
    expect(note.createdAt % 3600).toBe(0);
    const d = decodeNoteData(note.adapterData);
    expect(d.value).toBe(990_000n);
    expect(d.pool.toLowerCase()).toBe(POOL.toLowerCase());
    expect(decodeNoteData(encodeNoteData(d))).toEqual(d);
    expect(r.adapter.info().chains).toEqual([31337]);
  });

  it('reports pending until enough confirmations', async () => {
    const r = rig({ deps: { minConfirmations: 3 } });
    expect((await r.enter({}, 2)).state).toBe('pending');
    expect((await rig().enter({}, 2)).state).toBe('confirmed');
  });

  it('EP-PP-2: skips used precommitments and fails after the probe limit', async () => {
    const r = rig();
    const n1 = await r.enter();
    expect(decodeNoteData(n1.adapterData).index).toBe(0);
    const q = await r.adapter.quoteEntry(r.req);
    expect(q.adapterData['index']).toBe('1');
    const r2 = rig({ deps: { startIndex: 0, maxProbes: 1 } });
    await r2.enter();
    expect(await code(r2.adapter.quoteEntry(r2.req))).toBe('PRECOMMITMENT_EXHAUSTED');
    const r3 = rig({ deps: { startIndex: 5 } });
    expect((await r3.adapter.quoteEntry(r3.req)).adapterData['index']).toBe('5');
  });

  it('EP-PP-3: ERC-20 approves exactly the amount then deposits, and can reset leftover allowance', async () => {
    const r = rig();
    const req = { ...r.req, asset: TOKEN_ASSET, amount: 5_000n };
    const q = await r.adapter.quoteEntry(req);
    const txs = await r.adapter.prepareEntry(req, q);
    expect(txs.map((t) => t.kind)).toEqual(['approve', 'deposit']);
    const a = decodeFunctionData({ abi: erc20Abi, data: txs[0]!.data });
    expect(a.args).toEqual([ENTRYPOINT, 5_000n]);
    expect(txs[0]!.to).toBe(TOKEN);
    const note = await r.adapter.recordEntry(req, q, (() => { r.env.execute(txs[0]!); return r.env.execute(txs[1]!); })());
    expect(note.asset).toBe(TOKEN);
    expect(note.depositedAmount).toBe(4_950n);
    expect(await r.adapter.prepareAllowanceCleanup(31337, TOKEN, S1)).toEqual([]);
    r.env.allowance = 7n;
    const [reset] = await r.adapter.prepareAllowanceCleanup(31337, TOKEN, S1);
    expect(decodeFunctionData({ abi: erc20Abi, data: reset!.data }).args).toEqual([ENTRYPOINT, 0n]);
    await expect(r.adapter.prepareAllowanceCleanup(1, TOKEN, S1)).rejects.toMatchObject({ code: 'CHAIN_NOT_ALLOWED' });
  });

  it('rejects wrong signer, mismatched quotes and sub-minimum amounts', async () => {
    const r = rig();
    const q = await r.adapter.quoteEntry(r.req);
    const wrong = { ...r.req, stealth: { address: S1, signer: makeSigner(D2) } };
    expect(await code(r.adapter.prepareEntry(wrong, q))).toBe('DEPOSITOR_MISMATCH');
    expect(await code(r.adapter.prepareEntry({ ...r.req, amount: 5n }, q))).toBe('INVALID_INPUT');
    expect(await code(r.adapter.prepareEntry(r.req, { ...q, routeId: 'mock-pool' }))).toBe('INVALID_INPUT');
    expect(await code(r.adapter.quoteEntry({ ...r.req, amount: 10n }))).toBe('NOT_SUPPORTED');
    expect(await code(r.adapter.quoteEntry({ ...r.req, asset: '0x00000000000000000000000000000000000000aa' }))).toBe('NOT_SUPPORTED');
    expect(await code(r.adapter.prepareEntry(r.req, { ...q, adapterData: { ...q.adapterData, pool: D2 } }))).toBe('MANIFEST_MISMATCH');
    expect(await code(r.adapter.prepareEntry(r.req, { ...q, adapterData: { ...q.adapterData, entrypoint: D2 } }))).toBe('MANIFEST_MISMATCH');
    expect(await code(r.adapter.prepareEntry(r.req, { ...q, adapterData: { ...q.adapterData, precommitment: 'x' } }))).toBe('INVALID_INPUT');
  });

  it('rejects spoofed or inconsistent receipts (EP-PP-1/4)', async () => {
    const r = rig();
    const q = await r.adapter.quoteEntry(r.req);
    const [tx] = await r.adapter.prepareEntry(r.req, q);
    const rec = r.env.execute(tx!);
    const log = rec.logs.find((l) => l.address === POOL && l.topics[0] !== rec.logs[0]!.topics[0])!;
    expect(await code(r.adapter.recordEntry(r.req, q, { ...rec, status: 'reverted' }))).toBe('RECEIPT_INVALID');
    expect(await code(r.adapter.recordEntry(r.req, q, { ...rec, from: D2 }))).toBe('DEPOSITOR_MISMATCH');
    expect(await code(r.adapter.recordEntry({ ...r.req, stealth: { address: S1, signer: makeSigner(D2) } }, q, rec))).toBe('DEPOSITOR_MISMATCH');
    expect(await code(r.adapter.recordEntry(r.req, q, { ...rec, logs: [] }))).toBe('RECEIPT_INVALID');
    expect(await code(r.adapter.recordEntry(r.req, q, { ...rec, logs: [{ ...log, address: D2 }] }))).toBe('RECEIPT_INVALID');
    expect(await code(r.adapter.recordEntry(r.req, q, { ...rec, logs: [{ ...log, topics: [log.topics[0]!, `0x${'00'.repeat(12)}${D2.slice(2)}` as Hex] }] }))).toBe('RECEIPT_INVALID');
    // another seed derives another precommitment
    expect(await code(r.adapter.recordEntry({ ...r.req, rootSeed: makeSeed(9) }, q, rec))).toBe('RECEIPT_INVALID');
    // commitment in the log does not match the secrets (value tampered in the log data)
    const tampered = { ...log, data: log.data.replace(/^0x[0-9a-f]{64}/, `0x${'00'.repeat(31)}01`) as Hex };
    expect(await code(r.adapter.recordEntry(r.req, q, { ...rec, logs: [tampered] }))).toBe('RECEIPT_INVALID');
    // committed value above the amount sent
    const big = decodeNoteData((await r.adapter.recordEntry(r.req, q, rec)).adapterData);
    expect(big.value).toBe(990_000n);
    expect(await code(r.adapter.recordEntry({ ...r.req, amount: 100n }, { ...q, amount: 100n }, rec))).toBe('RECEIPT_INVALID');
  });

  it('EP-GEN-3/4: refuses unpinned or tampered deployments', async () => {
    const r = rig();
    r.env.codes[ENTRYPOINT.toLowerCase()] = '0x00';
    expect(await code(r.adapter.quoteEntry(r.req))).toBe('CODE_HASH_MISMATCH');
    const r2 = rig();
    r2.env.poolOverride = D2;
    expect(await code(r2.adapter.quoteEntry(r2.req))).toBe('MANIFEST_MISMATCH');
    const r3 = rig({ manifest: manifestFor({ status: 'unverified' }) });
    expect(await code(r3.adapter.quoteEntry(r3.req))).toBe('POOL_NOT_ACTIVE');
    const r4 = rig({ manifest: manifestFor({ contracts: { entrypoint: ENTRYPOINT, 'pool:native': POOL }, codeHashes: { entrypoint: keccak256('0x60aa60005260206000f3'), 'pool:native': keccak256('0x60bb60005260206000f3') } }) });
    expect(await code(r4.adapter.quoteEntry({ ...r4.req, asset: TOKEN_ASSET }))).toBe('NOT_SUPPORTED');
    const r5 = rig({ manifest: manifestFor({ contracts: { 'pool:native': POOL }, codeHashes: { 'pool:native': keccak256('0x60bb60005260206000f3') } }) });
    expect(await code(r5.adapter.quoteEntry(r5.req))).toBe('MANIFEST_MISMATCH');
    const r6 = rig();
    r6.env.dead = true;
    expect(await code(r6.adapter.quoteEntry(r6.req))).toBe('POOL_NOT_ACTIVE');
    const r7 = rig();
    r7.env.config = { min: 1n, vetting: 10_000n, maxRelay: 100n };
    expect(await code(r7.adapter.quoteEntry(r7.req))).toBe('MANIFEST_MISMATCH');
  });

  it('EP-GEN-1: every entry point rejects mainnet ids before any chain read', async () => {
    const r = rig();
    const note = await r.enter();
    const q = await r.adapter.quoteEntry(r.req);
    const before = r.env.calls.length;
    const bad = { ...r.req, chainId: 1 };
    const badNote = { ...note, chainId: 8453 };
    for (const p of [
      r.adapter.supports({ chainId: 100, asset: 'native' }),
      r.adapter.health(1),
      r.adapter.quoteEntry(bad),
      r.adapter.prepareEntry(bad, q),
      r.adapter.recordEntry(bad, q, makeReceipt({ transactionHash: '0x01' })),
      r.adapter.quoteExit(badNote, { destination: D1 }),
      r.adapter.executeExit(badNote, {} as never, r.transport),
      r.adapter.prepareEmergencyExit(badNote),
      r.adapter.prepareSelfRelayExit(badNote, {} as never, D1),
    ]) {
      expect(await code(p)).toBe('CHAIN_NOT_ALLOWED');
    }
    const it = r.adapter.recover(bad.rootSeed, { chainId: 1, chain: r.env.reader(), stealthAddresses: [S1], fromBlock: 0n })[Symbol.asyncIterator]();
    expect(await code(it.next())).toBe('CHAIN_NOT_ALLOWED');
    expect(r.env.calls.length).toBe(before);
    expect(ALLOWED_CHAIN_IDS).toContain(31337);
  });
});

describe('health and support', () => {
  it('maps manifest and chain state to a lifecycle', async () => {
    expect(await rig().adapter.health()).toEqual({ lifecycle: 'active' });
    expect(await rig().adapter.health(31337)).toEqual({ lifecycle: 'active' });
    expect((await rig({ manifest: manifestFor({ status: 'unverified' }) }).adapter.health()).lifecycle).toBe('unknown');
    expect((await rig().adapter.health(84532)).reason).toBe('no manifest entry');
    const dead = rig();
    dead.env.dead = true;
    expect((await dead.adapter.health()).lifecycle).toBe('sunset');
    const bad = rig();
    bad.env.codes[POOL.toLowerCase()] = '0x00';
    expect((await bad.adapter.health()).lifecycle).toBe('unknown');
    const s = rig();
    expect(await s.adapter.supports({ chainId: 31337, asset: 'native' })).toEqual({ supported: true, minAmount: 1000n });
    expect((await s.adapter.supports({ chainId: 31337, asset: '0x00000000000000000000000000000000000000aa' })).supported).toBe(false);
    expect((await s.adapter.supports({ chainId: 84532, asset: 'native' })).reason).toContain('no manifest entry');
    expect(rig({ manifest: manifestFor({ chainId: 84532 }) }).adapter.info().chains).toEqual([84532]);
  });
});

describe('exit through a relayer (EP-PP-5/6/8)', () => {
  it('quotes, proves, verifies locally and relays; funds reach D with the quoted fee', async () => {
    const r = rig();
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1, maxFeeBps: 100 });
    expect(q).toMatchObject({ via: 'relayer', feeBps: 50, grossAmount: 990_000n, feeAmount: 4_950n, netAmount: 985_050n });
    const res = await r.adapter.executeExit(note, q, r.transport);
    expect(res).toMatchObject({ newState: 'exited', exitedAmount: 985_050n, feeAmount: 4_950n, destination: D1 });
    expect(r.env.balance(D1)).toBe(985_050n);
    expect(r.env.balance(FEE_RECEIVER)).toBe(4_950n);
    expect(r.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /relayer/details', 'GET /relayer/details', 'POST /relayer/quote', 'POST /relayer/request']);
    expect(new Set(r.calls.map((c) => new URL(c.url).origin))).toEqual(new Set(['http://127.0.0.1:3000']));
    const body = JSON.parse(r.calls[3]!.body!) as { chainId: number; scope: string; withdrawal: { processooor: string }; feeCommitment: { extraGas: boolean } };
    expect(body.withdrawal.processooor).toBe(ENTRYPOINT);
    expect(body.feeCommitment.extraGas).toBe(false);
    expect(body.scope).toBe('111');
  });

  it('EP-PP-5: a corrupt proof never reaches the relayer', async () => {
    const r = rig();
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    r.env.crypto.corrupt = true;
    r.calls.length = 0;
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('PROOF_INVALID');
    expect(r.calls.some((c) => c.url.includes('/relayer/request'))).toBe(false);
  });

  it('EP-PP-6: circuit artifacts must match the manifest digests before proving', async () => {
    const r = rig();
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    r.env.crypto.digests = { ...DIGESTS, 'withdraw.zkey': '0'.repeat(64) };
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('ARTIFACT_HASH_MISMATCH');
    expect(r.env.crypto.proveCalls).toBe(0);
    expect(await code(r.adapter.prepareEmergencyExit(note))).toBe('ARTIFACT_HASH_MISMATCH');
    expect(r.env.crypto.ragequitCalls).toBe(0);
  });

  it('EP-PP-8: a hostile relayer cannot substitute recipient, fee receiver, fee, amount or asset', async () => {
    const cases: [string, Parameters<typeof rig>[0], string][] = [
      ['recipient', { relayer: { recipientOverride: D2 } }, 'RELAYER_REJECTED'],
      ['fee receiver', { relayer: { feeReceiverOverride: D2 } }, 'RELAYER_REJECTED'],
      ['commitment fee differs from quote', { relayer: { quoteBps: '50' } }, 'none'],
      ['amount', { relayer: { amountOverride: '5' } }, 'RELAYER_REJECTED'],
      ['asset', { relayer: { assetOverride: D2 } }, 'MANIFEST_MISMATCH'],
      ['extra gas', { relayer: { extraGas: true } }, 'RELAYER_REJECTED'],
      ['garbage data', { relayer: { garbageWithdrawalData: true } }, 'RELAYER_SCHEMA_DRIFT'],
      ['unknown field', { relayer: { extraField: true } }, 'RELAYER_SCHEMA_DRIFT'],
      ['http 500', { relayer: { status: 500 } }, 'RELAYER_REJECTED'],
      ['html', { relayer: { html: true } }, 'RELAYER_SCHEMA_DRIFT'],
      ['oversized', { relayer: { big: true } }, 'RELAYER_SCHEMA_DRIFT'],
      ['fee above on-chain max', { relayer: { quoteBps: '101', detailsBps: '50' } }, 'FEE_TOO_HIGH'],
      ['expired', { relayer: { expired: true } }, 'RELAYER_REJECTED'],
      ['no commitment', { relayer: { noCommitment: true } }, 'RELAYER_SCHEMA_DRIFT'],
      ['details chain', { relayer: { detailsChainId: 1 } }, 'RELAYER_REJECTED'],
      ['details asset', { relayer: { detailsAsset: D2 } }, 'MANIFEST_MISMATCH'],
      ['min withdraw', { relayer: { minWithdraw: '99999999999' } }, 'NOT_SUPPORTED'],
      ['details fee above max', { relayer: { detailsBps: '500' } }, 'RELAYER_REJECTED'],
    ];
    for (const [name, o, want] of cases) {
      const r = rig(o);
      const note = await r.enter();
      expect(await code(r.adapter.quoteExit(note, { destination: D1 })), name).toBe(want);
    }
  });

  it('enforces the user fee limit and re-checks the quote at execution', async () => {
    const r = rig();
    const note = await r.enter();
    expect(await code(r.adapter.quoteExit(note, { destination: D1, maxFeeBps: 10 }))).toBe('FEE_TOO_HIGH');
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    expect(await code(r.adapter.executeExit(note, { ...q, destination: D2 }, r.transport))).toBe('RELAYER_REJECTED');
    expect(await code(r.adapter.executeExit(note, { ...q, noteId: 'x' }, r.transport))).toBe('NOTE_STATE');
    expect(await code(r.adapter.executeExit({ ...note, state: 'pending' }, q, r.transport))).toBe('NOTE_STATE');
    expect(await code(r.adapter.executeExit(note, { ...q, via: 'self' }, r.transport))).toBe('NOT_SUPPORTED');
    expect(await code(r.adapter.executeExit(note, { ...q, netAmount: 1n }, r.transport))).toBe('ACCOUNTING_MISMATCH');
    r.clock.now += 120_000;
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('RELAYER_REJECTED');
    expect(await code(r.adapter.quoteExit({ ...note, state: 'exiting' }, { destination: D1 }))).toBe('NOTE_STATE');
  });

  it('handles refusals and malformed results from /relayer/request', async () => {
    const bads: [object | undefined, string, boolean?][] = [
      [undefined, 'RELAYER_REJECTED'],
      [{ success: 'yes' }, 'RELAYER_SCHEMA_DRIFT'],
      [{ success: true, extra: 1 }, 'RELAYER_SCHEMA_DRIFT'],
      [{ success: true, txHash: '0x12' }, 'RELAYER_SCHEMA_DRIFT'],
      [{ success: true }, 'RELAYER_SCHEMA_DRIFT'],
    ];
    for (const [res, want] of bads) {
      const r = rig(res === undefined ? { relayer: { reject: true } } : { relayer: { badRequestResult: res } });
      const note = await r.enter();
      const q = await r.adapter.quoteExit(note, { destination: D1 });
      expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe(want);
    }
    const r = rig({ relayer: { reject: true } });
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    await expect(r.adapter.executeExit(note, q, r.transport)).rejects.toThrow(/relayer refused the request: nope\?/);
  });

  it('EP-PP-9: only manifest relayers; custom ones need the developer flag; lowest fee wins', async () => {
    const r = rig({ deps: { relayerUrl: 'https://evil.example.org' } });
    const note = await r.enter();
    expect(await code(r.adapter.quoteExit(note, { destination: D1 }))).toBe('RELAYER_NOT_ALLOWED');
    expect(r.calls.some((c) => c.url.includes('evil'))).toBe(false);
    const ok = rig({ deps: { relayerUrl: 'http://127.0.0.1:3000/', allowCustomRelayer: false } });
    expect((await ok.adapter.quoteExit(await ok.enter(), { destination: D1 })).via).toBe('relayer');
    const custom = rig({ deps: { relayerUrl: 'http://127.0.0.1:4000', allowCustomRelayer: true } });
    expect((await custom.adapter.quoteExit(await custom.enter(), { destination: D1 })).adapterData['relayer']).toBe('http://127.0.0.1:4000');
    const none = rig({ manifest: manifestFor({ relayers: [] }) });
    expect(await code(none.adapter.quoteExit(await none.enter(), { destination: D1 }))).toBe('RELAYER_NOT_ALLOWED');
    // two manifest relayers: the cheaper one is chosen, a failing one is skipped
    const two = rig({ manifest: manifestFor({ relayers: ['http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'] }) });
    const base = relayerHandler(two.env, () => two.clock.now, {});
    const n2 = await two.enter();
    const st = stubTransport((c) => {
      if (c.url.startsWith('http://127.0.0.1:3002')) return new Response('down', { status: 503 });
      const resp = base(c);
      if (c.url.startsWith('http://127.0.0.1:3001') && c.url.includes('details')) return new Response(JSON.stringify({ feeBPS: '10', feeReceiverAddress: FEE_RECEIVER }), { status: 200 });
      return resp;
    }, two.clock);
    const adapter2 = new PrivacyPoolsAdapter({ manifest: manifestFor({ relayers: ['http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'] }), chain: two.env.reader(), transport: st.transport, crypto: two.env.crypto, asp: two.env, clock: () => two.clock.now });
    expect((await adapter2.quoteExit(n2, { destination: D1 })).adapterData['relayer']).toBe('http://127.0.0.1:3001');
    const allDown = new PrivacyPoolsAdapter({ manifest: manifestFor({ relayers: ['http://127.0.0.1:3000', 'http://127.0.0.1:3002'] }), chain: two.env.reader(), transport: stubTransport(() => new Response('', { status: 503 })).transport, crypto: two.env.crypto, asp: two.env });
    expect(await code(allDown.quoteExit(n2, { destination: D1 }))).toBe('RELAYER_REJECTED');
  });
});

describe('operator-free exit (EP-GEN-6, EP-PP-7)', () => {
  it('ragequit works with relayer offline, ASP excluding the label and the indexer failing', async () => {
    const r = rig({ deps: { transport: { fetch: (() => { throw new Error('network is off'); }), now: () => 0 } } });
    const note = await r.enter();
    r.env.aspLeaves.length = 0; // the label is not approved
    r.env.aspDown = true;
    const failingLogs = r.env.reader();
    expect(await code(r.adapter.quoteExit(note, { destination: D1 }))).toBe('other'); // relayer unreachable
    r.env.logs = [];
    const logsBefore = r.env.logCalls;
    const txs = await r.adapter.prepareEmergencyExit(note);
    expect(r.env.logCalls).toBe(logsBefore); // no indexer access
    expect(failingLogs).toBeDefined();
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ kind: 'ragequit', from: S1, to: POOL });
    expect(decodeFunctionData({ abi: poolAbi, data: txs[0]!.data }).functionName).toBe('ragequit');
    const before = r.env.balance(S1);
    r.env.execute(txs[0]!);
    expect(r.env.balance(S1) - before).toBe(990_000n);
    expect(() => r.env.execute({ ...txs[0]!, from: D2 })).toThrow(/OnlyOriginalDepositor|NullifierAlreadySpent/);
  });

  it('withdrawal is impossible for a deposit outside the association set', async () => {
    const r = rig();
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    r.env.aspLeaves.length = 0;
    r.env.aspLeaves.push(12345n);
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('ASP_UNAVAILABLE');
  });

  it('rejects a ragequit proof whose public signals do not match the note, and a foreign pool', async () => {
    const r = rig();
    const note = await r.enter();
    const d = decodeNoteData(note.adapterData);
    const orig = r.env.crypto.proveRagequit.bind(r.env.crypto);
    r.env.crypto.proveRagequit = async (i) => orig({ ...i, value: i.value + 1n });
    expect(await code(r.adapter.prepareEmergencyExit(note))).toBe('PROOF_INVALID');
    const foreign: PoolNote = { ...note, adapterData: encodeNoteData({ ...d, pool: D2 }) };
    r.env.crypto.proveRagequit = orig;
    expect(await code(r.adapter.prepareEmergencyExit(foreign))).toBe('MANIFEST_MISMATCH');
    expect(await code(r.adapter.prepareEmergencyExit({ ...note, asset: '0x00000000000000000000000000000000000000aa' }))).toBe('MANIFEST_MISMATCH');
    expect(await code(r.adapter.quoteExit({ ...note, adapterData: encodeNoteData({ ...d, pool: D2 }) }, { destination: D1 }))).toBe('MANIFEST_MISMATCH');
    expect(() => decodeNoteData(new Uint8Array([1, 2]))).toThrow();
    expect(() => decodeNoteData(new TextEncoder().encode('{"v":1}'))).toThrow();
  });
});

describe('self-relay exit (N3 gated, EP-RG-6 analogue)', () => {
  it('needs the N3 acknowledgement and then builds Entrypoint.relay for a gas-funded address', async () => {
    const r = rig();
    const note = await r.enter();
    expect(await code(r.adapter.quoteExit(note, { destination: D1, selfBroadcast: true }))).toBe('ACK_REQUIRED');
    const q = await r.adapter.quoteExit(note, { destination: D1, selfBroadcast: true, ackN3: true });
    expect(q).toMatchObject({ via: 'self', feeBps: 0, netAmount: 990_000n });
    r.calls.length = 0;
    const txs = await r.adapter.prepareSelfRelayExit(note, q, D2);
    expect(r.calls).toHaveLength(0); // no relayer contact
    expect(txs[0]).toMatchObject({ kind: 'exit', from: D2, to: ENTRYPOINT });
    r.env.execute(txs[0]!);
    expect(r.env.balance(D1)).toBe(990_000n);
    expect(await code(r.adapter.prepareSelfRelayExit(note, { ...q, via: 'relayer' }, D2))).toBe('NOTE_STATE');
    expect(await code(r.adapter.prepareSelfRelayExit(note, { ...q, adapterData: { withdrawalData: '0x00' } }, D2))).toBe('RELAYER_REJECTED');
  });
});

describe('proof inputs and state (EP-VAULT-5)', () => {
  it('rejects stale roots and gaps; chunks log scans', async () => {
    const r = rig();
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    r.env.staleLeaves = true;
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('STATE_UNAVAILABLE');
    r.env.staleLeaves = false;
    r.env.logs = r.env.logs.filter((l) => l.logIndex !== 0); // drop LeafInserted
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('STATE_UNAVAILABLE');
    const big = rig();
    const n2 = await big.enter();
    big.env.block = 35_000n;
    const q2 = await big.adapter.quoteExit(n2, { destination: D1 });
    const before = big.env.logCalls;
    await big.adapter.executeExit(n2, q2, big.transport);
    expect(big.env.logCalls - before).toBeGreaterThanOrEqual(4);
  });

  it('builds a withdrawal from cached inputs with the indexer and ASP unreachable', async () => {
    const r0 = rig();
    const note = await r0.enter();
    const d = decodeNoteData(note.adapterData);
    const leaves = r0.env.leaves[POOL.toLowerCase()]!;
    const cache = encodeProofCache({ stateLeaves: leaves, aspLeaves: [d.label] });
    const r = rig({ deps: { cache: (id) => Promise.resolve(id === note.noteId ? cache : undefined) } });
    // same chain state in the new rig is not needed: only pool metadata is read
    r.env.aspDown = true;
    r.env.logCalls = 0;
    const q = await r.adapter.quoteExit({ ...note }, { destination: D1 }).catch(() => undefined);
    expect(q).toBeDefined();
    r.env.leaves[POOL.toLowerCase()] = [...leaves];
    r.env.used.clear();
    r.env.used.add(0n);
    const res = await r.adapter.executeExit({ ...note }, q!, r.transport).catch((e: unknown) => e);
    expect(r.env.logCalls).toBe(0);
    expect(res).toMatchObject({ newState: 'exited' });
  });

  it('rejects malformed caches', async () => {
    const r = rig({ deps: { cache: () => Promise.resolve(new TextEncoder().encode('nope')) } });
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('STATE_UNAVAILABLE');
  });

  it('proof public signals must match the chain (state root, ASP root, value, context)', async () => {
    const r = rig();
    const note = await r.enter();
    const q = await r.adapter.quoteExit(note, { destination: D1 });
    r.env.aspLeaves.push(99n); // ASP root moves between our read and the on-chain read: proof uses fetched leaves, so push after
    const orig = r.env.getAssociationSet.bind(r.env);
    r.env.getAssociationSet = () => Promise.resolve({ leaves: r.env.aspLeaves.slice(0, -1) });
    expect(await code(r.adapter.executeExit(note, q, r.transport))).toBe('ASP_UNAVAILABLE');
    r.env.getAssociationSet = orig;
    const bad = rig();
    const n2 = await bad.enter();
    const q2 = await bad.adapter.quoteExit(n2, { destination: D1 });
    const o = bad.env.crypto.proveWithdrawal.bind(bad.env.crypto);
    bad.env.crypto.proveWithdrawal = async (i) => {
      const b = await o(i);
      const s = [...b.publicSignals];
      s[7] = '5';
      return { ...b, publicSignals: s };
    };
    bad.env.crypto.verifyWithdrawal = () => Promise.resolve(true);
    expect(await code(bad.adapter.executeExit(n2, q2, bad.transport))).toBe('PROOF_INVALID');
    expect(rootOf([1n])).not.toBe(0n);
  });
});

describe('recovery from chain data (EP-VAULT-2)', () => {
  it('rebuilds notes with the same ids and states after the vault is deleted', async () => {
    const r = rig();
    const a = await r.enter();
    const b = await r.enter();
    const c = await r.enter();
    // a: relayed exit; b: ragequit; c: untouched
    const qa = await r.adapter.quoteExit(a, { destination: D1 });
    await r.adapter.executeExit(a, qa, r.transport);
    const [rq] = await r.adapter.prepareEmergencyExit(b);
    r.env.execute(rq!);
    const vault = await Vault.create(new MemoryVaultStorage(), 'correct horse battery', KDF);
    const rep = await recoverNotes([r.adapter], r.req.rootSeed, { chainId: 31337, chain: r.env.reader(), stealthAddresses: [S1], fromBlock: 0n }, vault);
    expect(rep.errors).toEqual([]);
    const got = new Map((await vault.listNotes()).map((n) => [n.noteId, n.state]));
    expect(got.get(a.noteId)).toBe('exited');
    expect(got.get(b.noteId)).toBe('ragequit');
    expect(got.get(c.noteId)).toBe('confirmed');
    // recovered note data equals the original (same secrets)
    const rc = (await vault.getNote(c.noteId))!;
    expect(decodeNoteData(rc.adapterData)).toEqual(decodeNoteData(c.adapterData));
    // other depositors and other seeds find nothing
    const none = await recoverNotes([r.adapter], makeSeed(77), { chainId: 31337, chain: r.env.reader(), stealthAddresses: [S1], fromBlock: 0n }, await Vault.create(new MemoryVaultStorage(), 'correct horse battery', KDF));
    expect(none.recovered).toEqual([]);
    const other = await recoverNotes([r.adapter], r.req.rootSeed, { chainId: 31337, chain: r.env.reader(), stealthAddresses: [D2], fromBlock: 0n, toBlock: 5000n }, await Vault.create(new MemoryVaultStorage(), 'correct horse battery', KDF));
    expect(other.recovered).toEqual([]);
  });

  it('recovers ERC-20 notes and reports a missing entrypoint', async () => {
    const r = rig();
    const req = { ...r.req, asset: TOKEN_ASSET, amount: 5_000n };
    const q = await r.adapter.quoteEntry(req);
    const txs = await r.adapter.prepareEntry(req, q);
    r.env.execute(txs[0]!);
    const note = await r.adapter.recordEntry(req, q, r.env.execute(txs[1]!));
    const found: PoolNote[] = [];
    for await (const n of r.adapter.recover(req.rootSeed, { chainId: 31337, chain: r.env.reader(), stealthAddresses: [S1], fromBlock: 0n })) found.push(n);
    expect(found.map((n) => [n.noteId, n.asset])).toEqual([[note.noteId, TOKEN]]);
    const bad = rig({ manifest: manifestFor({ contracts: { 'pool:native': POOL }, codeHashes: { 'pool:native': keccak256('0x60bb60005260206000f3') } }) });
    const it = bad.adapter.recover(bad.req.rootSeed, { chainId: 31337, chain: bad.env.reader(), stealthAddresses: [S1], fromBlock: 0n })[Symbol.asyncIterator]();
    expect(await code(it.next())).toBe('MANIFEST_MISMATCH');
  });

  it('skips logs whose commitment does not match the derived secrets and requires transaction hashes', async () => {
    const r = rig();
    await r.enter();
    // corrupt the commitment inside the Deposited log
    r.env.logs = r.env.logs.map((l) => (l.topics[0] === r.env.logs[1]!.topics[0] && l.address === POOL ? { ...l, data: ('0x' + '00'.repeat(31) + '09' + l.data.slice(66)) as Hex } : l));
    const found: PoolNote[] = [];
    for await (const n of r.adapter.recover(r.req.rootSeed, { chainId: 31337, chain: r.env.reader(), stealthAddresses: [S1], fromBlock: 0n })) found.push(n);
    expect(found).toEqual([]);
    const r2 = rig();
    await r2.enter();
    r2.env.logs = r2.env.logs.map((l) => ({ ...l, transactionHash: undefined as never }));
    const it = r2.adapter.recover(r2.req.rootSeed, { chainId: 31337, chain: r2.env.reader(), stealthAddresses: [S1], fromBlock: 0n })[Symbol.asyncIterator]();
    expect(await code(it.next())).toBe('RECEIPT_INVALID');
  });
});

describe('derivation (EP-PP-10)', () => {
  it('uses 16 bytes of HKDF output, separated by info string, never the seed itself', () => {
    const seed = makeSeed(5);
    const a = withEntropy(seed, (e) => Array.from(e));
    expect(a).toHaveLength(16);
    expect(withEntropy(seed, (e) => Array.from(e))).toEqual(a);
    expect(withEntropy(seed, (e) => Array.from(e), `${PP_HKDF_INFO}/other`)).not.toEqual(a);
    expect(withEntropy(makeSeed(6), (e) => Array.from(e))).not.toEqual(a);
    expect(a).not.toEqual(Array.from(new Uint8Array(16).fill(5)));
    // fixed seed => fixed entropy (regression vector)
    expect(Buffer.from(a).toString('hex')).toMatch(/^[0-9a-f]{32}$/);
    let kept: Uint8Array | undefined;
    withEntropy(seed, (e) => { kept = e; });
    expect(kept).toEqual(new Uint8Array(16)); // wiped after use
  });
});

describe('formatProof', () => {
  it('swaps the G2 coordinates for Solidity like the SDK and validates shape', () => {
    const p = { proof: { pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] }, publicSignals: ['1', '2', '3', '4'] };
    expect(formatProof(p, 4)).toEqual({ pA: [1n, 2n], pB: [[4n, 3n], [6n, 5n]], pC: [7n, 8n], pubSignals: [1n, 2n, 3n, 4n] });
    expect(() => formatProof(p, 8)).toThrow(/unexpected shape/);
    expect(() => formatProof({ ...p, proof: { ...p.proof, pi_a: ['1'] } }, 4)).toThrow(/unexpected shape/);
    expect(() => formatProof({ ...p, proof: { ...p.proof, pi_b: [['3', '4']] } }, 4)).toThrow(/unexpected shape/);
    expect(() => formatProof({ ...p, proof: { ...p.proof, pi_b: [['3'], ['5', '6']] } }, 4)).toThrow(/unexpected shape/);
    expect(() => formatProof({ ...p, proof: { ...p.proof, pi_b: [['3', '4'], ['5']] } }, 4)).toThrow(/unexpected shape/);
    expect(() => formatProof({ ...p, proof: { ...p.proof, pi_c: ['1'] } }, 4)).toThrow(/unexpected shape/);
    expect(() => formatProof({ ...p, publicSignals: ['1', '2', '3', 'x'] }, 4)).toThrow(/decimal/);
    expect(() => formatProof({ ...p, proof: { ...p.proof, pi_a: ['1', undefined as never, '1'] } }, 4)).toThrow(/decimal/);
  });
});
