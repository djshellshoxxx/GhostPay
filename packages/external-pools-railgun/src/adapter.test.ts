import { describe, expect, it } from 'vitest';
import { asHex, MemoryVaultStorage, Vault, recoverNotes, makeSeed, makeSigner, TESTNET_MANIFEST, type PoolNote } from '@ghostpay/external-pools';
import { decodeFunctionData, getAddress, type Hex } from 'viem';
import { RailgunAdapter, decodeRgData, encodeRgData } from './adapter.js';
import { erc20Abi, railgunAbi } from './abi.js';
import { D1, D2, FakeWallet, OTHER_TOKEN, PROXY, S1, TOKEN, approveData, manifestFor, rig, shieldCalldata, shieldReceipt, transactCalldata } from './fakes.testutil.js';
import { RG_HKDF_INFO, withEntropy } from './derive.js';

const KDF = { N: 1 << 14, r: 8, p: 1 };
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? `other:${(e as Error).message}`;
  }
  return 'none';
};

function make(o: Parameters<typeof rig>[0] = {}, deps: Partial<ConstructorParameters<typeof RailgunAdapter>[0]> = {}) {
  const r = rig(o);
  const adapter = new RailgunAdapter({ ...r.adapterDeps, ...deps });
  const enter = async (confirmations = 5): Promise<PoolNote> => {
    const q = await adapter.quoteEntry(r.req);
    const txs = await adapter.prepareEntry(r.req, q);
    expect(txs).toHaveLength(2);
    return adapter.recordEntry(r.req, q, shieldReceipt({ from: S1, token: TOKEN, amount: r.req.amount, shieldFeeBps: r.fees.shield, confirmations }));
  };
  return { ...r, adapter, enter };
}

describe('entry (EP-RG-2, EP-RG-4)', () => {
  it('reads the fee from the proxy, approves exactly the amount to the proxy, and shields from S1', async () => {
    const t = make();
    const q = await t.adapter.quoteEntry(t.req);
    expect(q).toMatchObject({ feeAmount: 2_500n, creditedAmount: 997_500n });
    expect(q.fee).toMatchObject({ entryFeeBps: 25, source: 'RailgunSmartWallet.shieldFee()' });
    const [approve, shield] = await t.adapter.prepareEntry(t.req, q);
    expect(approve).toMatchObject({ kind: 'approve', from: S1, to: TOKEN });
    expect(decodeFunctionData({ abi: erc20Abi, data: approve!.data }).args).toEqual([PROXY, 1_000_000n]);
    expect(shield).toMatchObject({ kind: 'shield', from: S1, to: PROXY, value: 0n });
    expect(decodeFunctionData({ abi: railgunAbi, data: shield!.data }).functionName).toBe('shield');
    // the shield key comes from a signature of the SDK message by the stealth signer
    expect(t.wallet.signatures).toHaveLength(1);
    expect(t.wallet.keys[0]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(t.wallet.opened).toHaveLength(1);
  });

  it('records the net value from the Shield log (not the request) and the note holds no secrets', async () => {
    const t = make();
    const n = await t.enter();
    expect(n.depositedAmount).toBe(997_500n);
    expect(n.state).toBe('confirmed');
    expect(n.depositor).toBe(S1);
    expect(n.createdAt % 3600).toBe(0);
    const d = decodeRgData(n.adapterData);
    expect(d).toMatchObject({ v: 1, treeNumber: '0', position: '5', shieldFee: '2500' });
    expect(new TextDecoder().decode(n.adapterData)).not.toMatch(/mnemonic|secret|private/i);
    expect(decodeRgData(encodeRgData(d))).toEqual(d);
    expect((await make({}, { minConfirmations: 9 }).enter(5)).state).toBe('pending');
    // a note the wallet does not see (shield built to someone else's key) is never confirmed
    const foreign = make();
    foreign.wallet.owns = false;
    expect((await foreign.enter()).state).toBe('pending');
  });

  it('EP-RG-4: refuses fees above the limit, with the limit configurable', async () => {
    const t = make({ fees: { shield: 101n, unshield: 25n } });
    expect(await code(t.adapter.quoteEntry(t.req))).toBe('FEE_TOO_HIGH');
    const ok = make({ fees: { shield: 101n, unshield: 25n } }, { maxFeeBps: 150 });
    expect((await ok.adapter.quoteEntry(ok.req)).fee.entryFeeBps).toBe(101);
  });

  it('EP-RG-2: rejects SDK shield transactions that target another contract, carry value or shield something else', async () => {
    const cases: [string, (t: ReturnType<typeof make>) => void, string][] = [
      ['target', (t) => { t.wallet.shieldTo = D2; }, 'MANIFEST_MISMATCH'],
      ['value', (t) => { t.wallet.shieldValue = 1n; }, 'SDK_OUTPUT_REJECTED'],
      ['not a shield', (t) => { t.wallet.shieldData = () => '0x12345678'; }, 'SDK_OUTPUT_REJECTED'],
      ['wrong function', (t) => { t.wallet.shieldData = () => transactCalldata({ token: TOKEN, dest: D1, value: 1n }); }, 'SDK_OUTPUT_REJECTED'],
      ['two requests', (t) => { t.wallet.shieldData = (tok, a) => shieldCalldata(tok, a, undefined, { two: true }); }, 'SDK_OUTPUT_REJECTED'],
      ['other token', (t) => { t.wallet.shieldData = (_tok, a) => shieldCalldata(OTHER_TOKEN, a); }, 'SDK_OUTPUT_REJECTED'],
      ['other amount', (t) => { t.wallet.shieldData = (tok, a) => shieldCalldata(tok, a + 1n); }, 'SDK_OUTPUT_REJECTED'],
      ['nft', (t) => { t.wallet.shieldData = (tok, a) => shieldCalldata(tok, a, undefined, { tokenType: 1 }); }, 'SDK_OUTPUT_REJECTED'],
      ['npk zero', (t) => { t.wallet.shieldData = (tok, a) => shieldCalldata(tok, a, `0x${'00'.repeat(32)}`); }, 'SDK_OUTPUT_REJECTED'],
      ['npk out of field', (t) => { t.wallet.shieldData = (tok, a) => shieldCalldata(tok, a, `0x${'ff'.repeat(32)}`); }, 'SDK_OUTPUT_REJECTED'],
    ];
    for (const [name, setup, want] of cases) {
      const t = make();
      setup(t);
      const q = await t.adapter.quoteEntry(t.req);
      expect(await code(t.adapter.prepareEntry(t.req, q)), name).toBe(want);
    }
  });

  it('validates requests, quotes, signer and receipts', async () => {
    const t = make();
    const q = await t.adapter.quoteEntry(t.req);
    expect(await code(t.adapter.quoteEntry({ ...t.req, asset: 'native' }))).toBe('NOT_SUPPORTED');
    expect(await code(t.adapter.prepareEntry({ ...t.req, asset: 'native' }, q))).toBe('NOT_SUPPORTED');
    expect(await code(t.adapter.recordEntry({ ...t.req, asset: 'native' }, q, shieldReceipt({ from: S1, token: TOKEN, amount: 1n, shieldFeeBps: 0n })))).toBe('NOT_SUPPORTED');
    expect(await code(t.adapter.quoteEntry({ ...t.req, amount: 0n }))).toBe('INVALID_INPUT');
    expect(await code(t.adapter.quoteEntry({ ...t.req, amount: 1n << 120n }))).toBe('INVALID_INPUT');
    expect(await code(t.adapter.prepareEntry({ ...t.req, stealth: { address: S1, signer: makeSigner(D2) } }, q))).toBe('DEPOSITOR_MISMATCH');
    expect(await code(t.adapter.prepareEntry({ ...t.req, stealth: { address: S1, signer: { address: S1 } } }, q))).toBe('NOT_SUPPORTED');
    expect(await code(t.adapter.prepareEntry({ ...t.req, amount: 5n }, q))).toBe('INVALID_INPUT');
    expect(await code(t.adapter.prepareEntry(t.req, { ...q, adapterData: { ...q.adapterData, proxy: D2 } }))).toBe('MANIFEST_MISMATCH');
    const rec = shieldReceipt({ from: S1, token: TOKEN, amount: 1_000_000n, shieldFeeBps: 25n });
    expect(await code(t.adapter.recordEntry(t.req, q, { ...rec, status: 'reverted' }))).toBe('RECEIPT_INVALID');
    expect(await code(t.adapter.recordEntry(t.req, q, { ...rec, from: D2 }))).toBe('DEPOSITOR_MISMATCH');
    expect(await code(t.adapter.recordEntry({ ...t.req, stealth: { address: S1, signer: makeSigner(D2) } }, q, rec))).toBe('DEPOSITOR_MISMATCH');
    expect(await code(t.adapter.recordEntry(t.req, { ...q, adapterData: { ...q.adapterData, proxy: D2 } }, rec))).toBe('MANIFEST_MISMATCH');
    expect(await code(t.adapter.recordEntry(t.req, q, { ...rec, logs: [] }))).toBe('RECEIPT_INVALID');
    expect(await code(t.adapter.recordEntry(t.req, q, shieldReceipt({ from: S1, token: TOKEN, amount: 1_000_000n, shieldFeeBps: 25n, to: D2 })))).toBe('RECEIPT_INVALID');
    expect(await code(t.adapter.recordEntry(t.req, q, shieldReceipt({ from: S1, token: OTHER_TOKEN, amount: 1_000_000n, shieldFeeBps: 25n })))).toBe('RECEIPT_INVALID');
    expect(await code(t.adapter.recordEntry(t.req, q, shieldReceipt({ from: S1, token: TOKEN, amount: 1_000_000n, shieldFeeBps: 25n, extraToken: true })))).toBe('RECEIPT_INVALID');
    expect(await code(t.adapter.recordEntry({ ...t.req, amount: 100n }, { ...q, amount: 100n }, rec))).toBe('RECEIPT_INVALID');
    expect(() => decodeRgData(new Uint8Array([1]))).toThrow();
    expect(() => decodeRgData(new TextEncoder().encode('{"v":1}'))).toThrow();
  });

  it('EP-GEN-3/4: unverified manifests, missing entries and tampered code are refused', async () => {
    expect(await code(make({ manifest: manifestFor({ status: 'unverified' }) }).adapter.quoteEntry(rig().req))).toBe('POOL_NOT_ACTIVE');
    const t = make({ code: '0x00' });
    expect(await code(t.adapter.quoteEntry(t.req))).toBe('CODE_HASH_MISMATCH');
    expect(await code(make({ manifest: manifestFor({ chainId: 84532 }) }).adapter.quoteEntry(rig().req))).toBe('ROUTE_NOT_AVAILABLE');
    expect(await code(make({ manifest: manifestFor({ contracts: {}, codeHashes: {}, status: 'unverified' }) }).adapter.quoteEntry(rig().req))).toBe('POOL_NOT_ACTIVE');
    // the shipped testnet manifest stays unverified: Railgun is `unknown` until an operator pins code hashes
    const shipped = new RailgunAdapter({ ...rig().adapterDeps, manifest: TESTNET_MANIFEST });
    expect(await shipped.health(11155111)).toEqual({ lifecycle: 'unknown', reason: 'manifest entry is unverified' });
    expect(shipped.info().chains).toEqual([11155111]);
  });
});

describe('health, support and chain guard (EP-GEN-1)', () => {
  it('reports lifecycle from the manifest and chain state', async () => {
    const t = make();
    expect(await t.adapter.health()).toEqual({ lifecycle: 'active' });
    expect(await t.adapter.health(31337)).toEqual({ lifecycle: 'active' });
    expect((await t.adapter.health(84532)).reason).toBe('no manifest entry');
    expect((await make({ code: '0x00' }).adapter.health()).lifecycle).toBe('unknown');
    expect((await make({ fees: { shield: 5000n, unshield: 25n } }).adapter.health()).lifecycle).toBe('unknown');
    expect((await make({ manifest: manifestFor({ status: 'unverified' }) }).adapter.health()).lifecycle).toBe('unknown');
    expect(await t.adapter.supports({ chainId: 31337, asset: TOKEN })).toEqual({ supported: true });
    expect((await t.adapter.supports({ chainId: 31337, asset: 'native' })).supported).toBe(false);
    expect((await t.adapter.supports({ chainId: 84532, asset: TOKEN })).supported).toBe(false);
    expect(t.adapter.info().chains).toEqual([31337]);
  });

  it('rejects mainnet ids on every entry point before touching the chain or the wallet', async () => {
    const t = make();
    const note = await t.enter();
    const q = await t.adapter.quoteEntry(t.req);
    const seen = t.chain.seen.length;
    const opened = t.wallet.opened.length;
    const bad = { ...t.req, chainId: 1 };
    const badNote = { ...note, chainId: 8453 };
    for (const p of [
      Promise.resolve().then(() => t.adapter.supports({ chainId: 100, asset: TOKEN })),
      t.adapter.health(1),
      t.adapter.quoteEntry(bad),
      t.adapter.prepareEntry(bad, q),
      t.adapter.recordEntry(bad, q, shieldReceipt({ from: S1, token: TOKEN, amount: 1n, shieldFeeBps: 0n })),
      t.adapter.quoteExit(badNote, { destination: D1 }),
      t.adapter.executeExit(badNote, {} as never, t.transport),
      t.adapter.prepareEmergencyExit(badNote, t.req.rootSeed),
      t.adapter.prepareSelfUnshield(badNote, {} as never, D1),
    ]) expect(await code(p)).toBe('CHAIN_NOT_ALLOWED');
    const it = t.adapter.recover(t.req.rootSeed, { chainId: 1, chain: t.chain, stealthAddresses: [S1], fromBlock: 0n })[Symbol.asyncIterator]();
    expect(await code(it.next())).toBe('CHAIN_NOT_ALLOWED');
    expect(t.chain.seen.length).toBe(seen);
    expect(t.wallet.opened.length).toBe(opened);
  });
});

describe('exit through a broadcaster (EP-RG-5)', () => {
  it('quotes both fees, builds the unshield with the SDK, verifies the destination and broadcasts', async () => {
    const t = make();
    const note = await t.enter();
    const q = await t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed, maxFeeBps: 100 });
    expect(q).toMatchObject({ via: 'broadcaster', grossAmount: 997_500n, feeAmount: 2_493n + 100n, feeBps: 25 });
    expect(q.netAmount + q.feeAmount).toBe(997_500n);
    expect(q.adapterData).toMatchObject({ ppoiStatus: 'valid', walletId: 'wallet-1' });
    const res = await t.adapter.executeExit(note, q, t.transport);
    expect(res).toMatchObject({ newState: 'exited', destination: D1, exitedAmount: q.netAmount });
    expect(t.wallet.broadcasts).toHaveLength(1);
    expect(t.wallet.unshieldCalls[0]).toMatchObject({ sendWithPublicWallet: false, recipient: D1, amount: 997_500n });
  });

  it('refuses hostile broadcasters: other fee token, fee above limits, none reachable', async () => {
    const t = make();
    const note = await t.enter();
    t.wallet.broadcasterFee = { feeToken: OTHER_TOKEN, feeAmount: 1n };
    expect(await code(t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed }))).toBe('FEE_TOO_HIGH');
    t.wallet.broadcasterFee = { feeToken: TOKEN, feeAmount: 10_000n }; // > 1% of 997 500
    expect(await code(t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed }))).toBe('FEE_TOO_HIGH');
    t.wallet.broadcasterFee = { feeToken: TOKEN, feeAmount: 5_000n };
    expect(await code(t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed, maxFeeBps: 10 }))).toBe('FEE_TOO_HIGH');
    expect((await t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed })).feeAmount).toBe(2_493n + 5_000n);
    t.wallet.broadcasterFee = { feeToken: TOKEN, feeAmount: -1n };
    expect(await code(t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed }))).toBe('FEE_TOO_HIGH');
    t.wallet.broadcasterFee = undefined;
    expect(await code(t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed }))).toBe('RELAYER_NOT_ALLOWED');
    expect(await code(t.adapter.quoteExit(note, { destination: D1 }))).toBe('INVALID_INPUT');
    expect(await code(t.adapter.quoteExit({ ...note, state: 'pending' }, { destination: D1, rootSeed: t.req.rootSeed }))).toBe('NOTE_STATE');
    expect(await code(t.adapter.quoteExit({ ...note, adapterData: encodeRgData({ ...decodeRgData(note.adapterData), proxy: D2 }) }, { destination: D1, rootSeed: t.req.rootSeed }))).toBe('MANIFEST_MISMATCH');
  });

  it('EP-RG-5: the unshield transaction must pay the chosen destination and token (hostile SDK output)', async () => {
    const mk = async (build: (a: { token: `0x${string}`; value: bigint }) => { to?: `0x${string}`; data: Hex; value?: bigint }): Promise<string> => {
      const t = make();
      const note = await t.enter();
      const q = await t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed });
      t.wallet.unshieldTx = (a) => ({ to: PROXY, value: 0n, ...build({ token: a.token, value: a.amount - (a.broadcasterFee?.feeAmount ?? 0n) }) });
      return code(t.adapter.executeExit(note, q, t.transport));
    };
    expect(await mk(({ token, value }) => ({ data: transactCalldata({ token, dest: D2, value }) }))).toBe('SDK_OUTPUT_REJECTED'); // destination
    expect(await mk(({ value }) => ({ data: transactCalldata({ token: OTHER_TOKEN, dest: D1, value }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token, value }) => ({ data: transactCalldata({ token, dest: D1, value, tokenType: 1 }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token, value }) => ({ data: transactCalldata({ token, dest: D1, value, chainId: 1 }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token, value }) => ({ data: transactCalldata({ token, dest: D1, value, unshield: 0 }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token, value }) => ({ data: transactCalldata({ token, dest: D1, value, count: 2 }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token, value }) => ({ data: transactCalldata({ token, dest: D1, value, count: 0 }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token }) => ({ data: transactCalldata({ token, dest: D1, value: 10n ** 30n }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token }) => ({ data: transactCalldata({ token, dest: D1, value: 0n }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token, value }) => ({ to: D2, data: transactCalldata({ token, dest: D1, value }) }))).toBe('MANIFEST_MISMATCH');
    expect(await mk(({ token, value }) => ({ value: 5n, data: transactCalldata({ token, dest: D1, value }) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(() => ({ data: '0xdeadbeef' }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token }) => ({ data: shieldCalldata(token, 1n) }))).toBe('SDK_OUTPUT_REJECTED');
    expect(await mk(({ token, value }) => ({ data: transactCalldata({ token, dest: D1, value: value - 1n }) }))).toBe('ACCOUNTING_MISMATCH');
  });

  it('re-checks the quote at execution and surfaces PPOI status', async () => {
    const t = make();
    const note = await t.enter();
    const q = await t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed });
    expect(await code(t.adapter.executeExit(note, { ...q, noteId: 'x' }, t.transport))).toBe('NOTE_STATE');
    expect(await code(t.adapter.executeExit({ ...note, state: 'exiting' }, q, t.transport))).toBe('NOTE_STATE');
    expect(await code(t.adapter.executeExit(note, { ...q, via: 'self' }, t.transport))).toBe('NOT_SUPPORTED');
    t.clock.now += 120_000;
    expect(await code(t.adapter.executeExit(note, q, t.transport))).toBe('RELAYER_REJECTED');
    t.clock.now -= 120_000;
    expect(await code(t.adapter.executeExit(note, { ...q, adapterData: { ...q.adapterData, feeToken: OTHER_TOKEN } }, t.transport))).toBe('FEE_TOO_HIGH');
    expect(await code(t.adapter.executeExit(note, { ...q, adapterData: { ...q.adapterData, broadcasterFee: 'x' } }, t.transport))).toBe('INVALID_INPUT');
    // EP-RG-7: a blocked note is shown as blocked and is not submitted
    t.wallet.poi = 'blocked';
    const blocked = await t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed });
    expect(blocked.adapterData['ppoiStatus']).toBe('blocked');
    expect(await code(t.adapter.executeExit(note, blocked, t.transport))).toBe('NOTE_STATE');
    t.wallet.poi = 'pending';
    expect((await t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed })).adapterData['ppoiStatus']).toBe('pending');
    expect(t.wallet.broadcasts).toHaveLength(0);
  });
});

describe('operator-free exit (EP-GEN-6, EP-RG-6)', () => {
  it('emergency exit needs no broadcaster, no PPOI and no fetch, even if fees were raised', async () => {
    const t = make({ fees: { shield: 25n, unshield: 9_000n } }); // governance raised the unshield fee far above the cap
    const note = await t.enter();
    t.wallet.broadcasterFee = undefined;
    t.wallet.poi = 'blocked';
    const txs = await t.adapter.prepareEmergencyExit(note, t.req.rootSeed);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ kind: 'unshield', from: S1, to: PROXY });
    expect(t.wallet.unshieldCalls[0]).toMatchObject({ sendWithPublicWallet: true, recipient: S1, amount: 997_500n });
    expect(t.wallet.broadcasts).toHaveLength(0);
    expect(await code(t.adapter.prepareEmergencyExit(note))).toBe('INVALID_INPUT');
  });

  it('self-broadcast to a chosen address is gated by the N3 acknowledgement', async () => {
    const t = make();
    const note = await t.enter();
    expect(await code(t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed, selfBroadcast: true }))).toBe('ACK_REQUIRED');
    const q = await t.adapter.quoteExit(note, { destination: D1, rootSeed: t.req.rootSeed, selfBroadcast: true, ackN3: true });
    expect(q).toMatchObject({ via: 'self', feeAmount: 2_493n, netAmount: 995_007n });
    const [tx] = await t.adapter.prepareSelfUnshield(note, q, D2);
    expect(tx).toMatchObject({ from: D2, to: PROXY, kind: 'unshield' });
    expect(t.wallet.unshieldCalls[0]).toMatchObject({ recipient: D1, sendWithPublicWallet: true });
    expect(await code(t.adapter.prepareSelfUnshield(note, { ...q, via: 'broadcaster' }, D2))).toBe('NOTE_STATE');
    // a self-unshield must move the whole note
    t.wallet.unshieldTx = (a) => ({ to: PROXY, value: 0n, data: transactCalldata({ token: a.token, dest: a.recipient, value: a.amount - 1n }) });
    expect(await code(t.adapter.prepareSelfUnshield(note, q, D2))).toBe('SDK_OUTPUT_REJECTED');
  });
});

describe('recovery and derivation', () => {
  it('rebuilds notes from the engine rescan, keeping only shields sent by our stealth addresses', async () => {
    const t = make();
    const w = t.wallet;
    const base = { txHash: asHex(`0x${'22'.repeat(32)}`), logIndex: 1, blockNumber: 9n, token: TOKEN, amount: 500n, treeNumber: 0n, position: 3n, fee: 1n };
    w.scanned = [{ ...base, spent: false, depositor: S1 }, { ...base, txHash: asHex(`0x${'33'.repeat(32)}`), spent: true, depositor: S1 }, { ...base, spent: false, depositor: D2 }];
    const vault = await Vault.create(new MemoryVaultStorage(), 'correct horse battery', KDF);
    const rep = await recoverNotes([t.adapter], t.req.rootSeed, { chainId: 31337, chain: t.chain, stealthAddresses: [S1], fromBlock: 0n }, vault);
    expect(rep.errors).toEqual([]);
    expect((await vault.listNotes()).map((n) => n.state).sort()).toEqual(['confirmed', 'exited']);
    w.scanError = new Error('engine offline');
    const bad = await recoverNotes([t.adapter], t.req.rootSeed, { chainId: 31337, chain: t.chain, stealthAddresses: [S1], fromBlock: 0n }, vault);
    expect(bad.errors[0]?.message).toBe('engine offline');
    expect(() => vault.assertDepositAllowed('railgun:31337')).toThrow(/incomplete/);
  });

  it('uses a Railgun-specific HKDF domain and never the raw seed (EP-RG-1)', async () => {
    const t = make();
    await t.adapter.quoteEntry(t.req);
    await t.adapter.prepareEntry(t.req, await t.adapter.quoteEntry(t.req));
    const e = withEntropy(t.req.rootSeed, (x) => Buffer.from(x).toString('hex'));
    expect(t.wallet.opened[0]).toBe(`0x${e}`);
    expect(withEntropy(t.req.rootSeed, (x) => Buffer.from(x).toString('hex'), 'ghostpay/ext-pools/privacy-pools/v1')).not.toBe(e);
    expect(withEntropy(makeSeed(5), (x) => Buffer.from(x).toString('hex'))).not.toBe(e);
    expect(RG_HKDF_INFO).toBe('ghostpay/ext-pools/railgun/v1');
    expect(new FakeWallet().digests).toEqual({});
    expect(getAddress(D1)).toBe(D1);
    expect(approveData(PROXY, 1n)).toMatch(/^0x095ea7b3/);
  });
});
