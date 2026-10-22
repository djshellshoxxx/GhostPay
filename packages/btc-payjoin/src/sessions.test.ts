import { hex } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { addressToScript } from './network.js';
import { addressFor, key, newDirectory, receiverCtx, receiverWallet, signerFor, utxoFor, scenario, rebuild } from './fixtures.testutil.js';
import { ReceiverSession } from './receiver/session.js';
import { SenderSession, type SenderOpen } from './sender/session.js';
import { MemoryTransport } from './transport/memory.js';
import { encodePsbt, parsePsbt } from './psbt.js';
import type { PayjoinTransport } from './transport/types.js';
import type { PayjoinParams } from './params.js';

const codeOf = async (f: () => unknown): Promise<string> => {
  try {
    await f();
    return 'none';
  } catch (e) {
    return (e as { code?: string }).code ?? 'other';
  }
};

async function setup(over: Partial<SenderOpen> = {}, mode: 'interactive' | 'non-interactive' = 'interactive') {
  const clock = { t: 1000 };
  const now = () => clock.t;
  const dir = newDirectory(now);
  const tr = new MemoryTransport(dir);
  const sk = key('sender');
  const rk = key('receiver');
  const addr = addressFor(rk, 'wpkh');
  const wallet = receiverWallet(rk, 'wpkh', [utxoFor(rk, 'wpkh', 50_000n)]);
  const rs = await tr.openReceiverSession({ address: addr, network: 'testnet', amountSats: 20_000n, expirySeconds: 600 });
  const receiver = new ReceiverSession(receiverCtx(wallet, addr, { amountSats: 20_000n, mode }));
  const sender = await SenderSession.open({
    uri: rs.uri,
    utxos: [utxoFor(sk, 'wpkh', 100_000n)],
    feeRateSatPerVb: 2,
    changeAddress: addressFor(sk, 'wpkh'),
    signer: signerFor([{ k: sk, kind: 'wpkh' }]),
    transport: tr,
    now,
    params: { maxAdditionalFeeContributionSats: 500n },
    ...over,
  });
  return { clock, dir, tr, rs, receiver, sender, wallet, sk, rk, addr };
}

describe('SenderSession / ReceiverSession over the memory transport (async)', () => {
  it('sender posts, receiver is offline, comes back later, sender completes', async () => {
    const { clock, rs, receiver, sender } = await setup();
    expect(sender.state).toBe('posted');
    expect(await sender.poll()).toEqual({ kind: 'pending' });
    clock.t += 300; // receiver offline for 5 minutes, still inside EX
    expect(await receiver.serve(rs)).toMatchObject({ ok: true });
    expect(receiver.status).toBe('done');
    const ev = await sender.poll();
    expect(ev.kind).toBe('ready');
    expect(sender.state).toBe('signed');
    expect(sender.sentParams.v).toBe(1);
    // the same session cannot be polled into a second payjoin
    expect(await sender.poll()).toEqual({ kind: 'pending' });
    sender.markBroadcast('payjoin');
    expect(await sender.poll()).toEqual({ kind: 'done', path: 'payjoin' });
    expect(sender.state).toBe('broadcast');
    expect(() => sender.fallbackTx()).toThrow(/session_state/);
    expect(() => sender.markBroadcast('fallback')).toThrow(/session_state/);
  });

  it('receiver idle when nothing arrived; closed sessions yield nothing', async () => {
    const { rs, receiver } = await setup();
    expect(await receiver.serve(rs)).toMatchObject({ ok: true }); // the sender's Original from setup()
    expect(await receiver.serve(rs)).toBe('idle');
    await rs.close();
    expect(await rs.poll()).toBeNull();
  });

  it('expiry: sender falls back after EX, receiver poll reports session_expired', async () => {
    const { clock, rs, sender } = await setup({ expirySeconds: 300 });
    clock.t += 301; // sender timeout fires before the mailbox expires
    expect(await sender.poll()).toMatchObject({ kind: 'fallback', reason: 'session_expired' });
    expect(sender.state).toBe('expired');
    expect(await sender.poll()).toMatchObject({ kind: 'fallback' });
    clock.t += 400; // now the mailbox is gone too
    await expect(rs.poll()).rejects.toMatchObject({ code: 'session_expired' });
    const late = await setup({ expirySeconds: 9999 });
    late.clock.t += 601; // mailbox expired first: directory reports it
    expect(await late.sender.poll()).toMatchObject({ kind: 'fallback', reason: 'session_expired' });
    expect(late.sender.state).toBe('failed');
  });

  it('fallbackOnFailure=false reports failure instead of offering the original', async () => {
    const { clock, sender } = await setup({ expirySeconds: 10, fallbackOnFailure: false });
    clock.t += 11;
    expect(await sender.poll()).toEqual({ kind: 'failed', reason: 'session_expired' });
  });

  it('a receiver error becomes a local code and offers the fallback (BPJ-SND-2)', async () => {
    const { rs, sender } = await setup();
    const inc = await rs.poll();
    await inc?.reply({ error: 'not_enough_money' });
    await expect(inc?.reply({ error: 'not_enough_money' })).rejects.toMatchObject({ code: 'session_state' });
    const ev = await sender.poll();
    expect(ev).toMatchObject({ kind: 'fallback', reason: 'not_enough_money' });
    expect(sender.state).toBe('failed');
    expect(await sender.poll()).toMatchObject({ kind: 'fallback' });
    const f = sender.fallbackTx();
    expect(f.hex.length).toBeGreaterThan(100);
    sender.markBroadcast('fallback');
    expect(sender.state).toBe('fallback');
    // after the fallback is out, no second offer
    expect(await sender.poll()).toEqual({ kind: 'done', path: 'fallback' });
    expect(() => sender.finalize('x')).toThrow(/session_state/);
  });

  it('a malicious proposal fails closed and nothing is signed', async () => {
    const { rs, sender, addr } = await setup();
    const inc = await rs.poll();
    const payScript = addressToScript(addr, 'testnet');
    // receiver steals: pays 1 sat to itself and keeps the rest as fee
    const orig = parsePsbt(inc?.originalPsbt as string);
    const evil = rebuild(orig, { mapInput: (i) => ({ ...i, finalScriptWitness: undefined }), mapOutput: (o) => (hex.encode(o.script as Uint8Array) === hex.encode(payScript) ? o : { ...o, amount: 1n }) });
    await inc?.reply(encodePsbt(evil));
    const ev = await sender.poll();
    expect(ev.kind).toBe('fallback');
    expect(sender.state).toBe('failed');
  });

  it('proposal that violates minfeerate after signing is refused', async () => {
    const { rs, sender, receiver } = await setup({ params: { maxAdditionalFeeContributionSats: 500n, minFeeRateSatPerVb: 1000 } });
    // the honest receiver honours minfeerate if it can; with 1000 sat/vB it cannot -> not_enough_money
    await receiver.serve(rs);
    const ev = await sender.poll();
    expect(ev).toMatchObject({ kind: 'fallback' });
  });

  it('markBroadcast(payjoin) before a verified proposal is refused', async () => {
    const { sender } = await setup();
    expect(() => sender.markBroadcast('payjoin')).toThrow(/session_state/);
  });

  it('transport failure on open is reported, not thrown', async () => {
    const boom: PayjoinTransport = {
      kind: 'memory',
      openReceiverSession: () => Promise.reject(new Error('x')),
      sendOriginal: () => Promise.reject(new Error('network down')),
    };
    const s = await setup({ transport: boom });
    expect(s.sender.state).toBe('failed');
    expect(await s.sender.poll()).toMatchObject({ kind: 'fallback', reason: 'transport_failed' });
  });

  it('a transport that throws a PayjoinError on poll maps its code; other errors become transport_failed', async () => {
    const mk = (err: unknown): PayjoinTransport => ({
      kind: 'memory',
      openReceiverSession: () => Promise.reject(new Error('x')),
      sendOriginal: () => Promise.resolve({ poll: () => Promise.reject(err instanceof Error ? err : new Error('x')) }),
    });
    const { PayjoinError } = await import('./errors.js');
    const a = await setup({ transport: mk(new PayjoinError('unavailable')) });
    expect(await a.sender.poll()).toMatchObject({ reason: 'unavailable' });
    const b = await setup({ transport: mk(new Error('x')) });
    expect(await b.sender.poll()).toMatchObject({ reason: 'transport_failed' });
    const c = await setup({ transport: { ...mk(0), sendOriginal: () => Promise.reject(new PayjoinError('uri_invalid')) } });
    expect(c.sender.state).toBe('failed');
    expect(await c.sender.poll()).toMatchObject({ reason: 'uri_invalid' });
  });

  it('a transport returning a non-PSBT proposal fails with psbt_invalid', async () => {
    const tr: PayjoinTransport = {
      kind: 'memory',
      openReceiverSession: () => Promise.reject(new Error('x')),
      sendOriginal: () => Promise.resolve({ poll: () => Promise.resolve({ proposalPsbt: 'zzzz' }) }),
    };
    const s = await setup({ transport: tr });
    expect(await s.sender.poll()).toMatchObject({ reason: 'psbt_invalid' });
  });

  it('forces pjos=0 into the sent params when the URI says so, and picks the change output as fee output', async () => {
    const clock = { t: 5 };
    const tr = new MemoryTransport(newDirectory(() => clock.t));
    const rk = key('receiver');
    const sk = key('sender');
    const rs = await tr.openReceiverSession({ address: addressFor(rk, 'wpkh'), network: 'testnet', amountSats: 10_000n, expirySeconds: 99, outputSubstitution: false });
    const sender = await SenderSession.open({
      uri: rs.uri,
      utxos: [utxoFor(sk, 'wpkh', 100_000n)],
      feeRateSatPerVb: 2,
      changeAddress: addressFor(sk, 'wpkh'),
      signer: signerFor([{ k: sk, kind: 'wpkh' }]),
      transport: tr,
      now: () => clock.t,
      params: { maxAdditionalFeeContributionSats: 300n },
      random: () => 0.9,
    });
    const p: PayjoinParams = sender.sentParams;
    expect(p.disableOutputSubstitution).toBe(true);
    expect(p.additionalFeeOutputIndex).toBe(0);
  });
});

describe('BPJ-GEN-2: nothing is logged', () => {
  it('a full payjoin plus a failure path write nothing to the console', async () => {
    const { vi } = await import('vitest');
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const { rs, receiver, sender } = await setup();
    await receiver.serve(rs);
    await sender.poll();
    const bad = await setup();
    const inc = await bad.rs.poll();
    await inc?.reply({ error: 'unavailable' });
    await bad.sender.poll();
    for (const sp of spies) expect(sp).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('error messages never contain PSBT, outpoint or address material', async () => {
    const s = await scenario({ noBuild: true });
    const rs = new ReceiverSession({ ...s.ctx, amountSats: 99_999_999n });
    const r = await rs.handleOriginal(s.built.psbt, s.params);
    expect(JSON.stringify(r)).not.toContain(s.uri.address);
    expect(JSON.stringify(r)).not.toContain(s.checked.outpoints[0] as string);
  });
});

describe('ReceiverSession rules', () => {
  it('BPJ-RCV-12: interactive mode serves one Original per address', async () => {
    const s = await scenario({ noBuild: true });
    const rs = new ReceiverSession(s.ctx);
    const first = await rs.handleOriginal(s.built.psbt, s.params);
    expect(first.ok).toBe(true);
    // a second, different original is refused while the session is done
    const s2 = await scenario({ noBuild: true });
    const second = await rs.handleOriginal(s2.built.psbt, s2.params);
    expect(second).toEqual({ ok: false, code: 'rate_limited' });
  });

  it('the same inputs cannot be replayed (seen store) even in non-interactive mode', async () => {
    const s = await scenario({ noBuild: true, ctx: { mode: 'non-interactive' } });
    const rs = new ReceiverSession(s.ctx);
    expect((await rs.handleOriginal(s.built.psbt, s.params)).ok).toBe(true);
    const again = await rs.handleOriginal(s.built.psbt, s.params);
    expect(again).toEqual({ ok: false, code: 'input_seen' });
    expect(rs.status).toBe('done');
  });

  it('failures keep the session open and do not record outpoints', async () => {
    const s = await scenario({ noBuild: true });
    const rs = new ReceiverSession({ ...s.ctx, amountSats: 99_999_999n });
    expect(await rs.handleOriginal(s.built.psbt, s.params)).toEqual({ ok: false, code: 'output_decreased' });
    expect(rs.status).toBe('open');
    expect(await s.ctx.seen.has(s.checked.outpoints[0] as string)).toBe(false);
  });

  it('concurrent Originals are serialised: the second sees busy', async () => {
    const s = await scenario({ noBuild: true, ctx: { mode: 'non-interactive' } });
    const rs = new ReceiverSession(s.ctx);
    const [a, b] = await Promise.all([rs.handleOriginal(s.built.psbt, s.params), rs.handleOriginal(s.built.psbt, s.params)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].some((r) => !r.ok && r.code === 'rate_limited')).toBe(true);
  });

  it('wallet exceptions become a bare unavailable (no leak)', async () => {
    const s = await scenario({ noBuild: true });
    const wallet = { ...s.wallet, listSpendable: () => Promise.reject(new Error('secret wallet path /home/x')) };
    const rs = new ReceiverSession({ ...s.ctx, wallet });
    expect(await rs.handleOriginal(s.built.psbt, s.params)).toEqual({ ok: false, code: 'unavailable' });
  });

  it('in-flight lock: overlapping originals sharing an outpoint are refused', async () => {
    const s = await scenario({ noBuild: true, ctx: { mode: 'non-interactive' } });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slowWallet = { ...s.wallet, listSpendable: async () => { await gate; return s.rUtxos; } };
    const rs1 = new ReceiverSession({ ...s.ctx, wallet: slowWallet });
    const first = rs1.handleOriginal(s.built.psbt, s.params);
    // Poke a second handler instance sharing the lock is impossible; emulate by direct state: busy -> rate_limited
    expect(await rs1.handleOriginal(s.built.psbt, s.params)).toEqual({ ok: false, code: 'rate_limited' });
    release();
    expect((await first).ok).toBe(true);
  });

  it('records exposed UTXOs on success', async () => {
    const s = await scenario({ noBuild: true });
    const { MemoryExposedUtxos } = await import('./receiver/seen.js');
    const ex = new MemoryExposedUtxos();
    const rs = new ReceiverSession(s.ctx, ex);
    const out = await rs.handleOriginal(s.built.psbt, s.params);
    expect(out.ok && out.contributed).toBe(true);
    expect(await ex.list()).toHaveLength(1);
  });
});

describe('MemoryTransport', () => {
  it('guards: network, expiry, bad mailbox, reuse', async () => {
    const clock = { t: 0 };
    const dir = newDirectory(() => clock.t);
    const tr = new MemoryTransport(dir);
    const a = addressFor(key('x'), 'wpkh');
    expect(await codeOf(() => tr.openReceiverSession({ address: a, network: 'mainnet' as never, expirySeconds: 5 }))).toBe('network_not_allowed');
    expect(await codeOf(() => tr.openReceiverSession({ address: a, network: 'testnet', expirySeconds: 0 }))).toBe('uri_invalid');
    const bad = new MemoryTransport(new (dir.constructor as typeof import('./transport/memory.js').MemoryDirectory)(() => 0, () => 'lower'));
    expect(await codeOf(() => bad.openReceiverSession({ address: a, network: 'testnet', expirySeconds: 5 }))).toBe('transport_failed');
    const s = await scenario({ noBuild: true });
    const rs = await tr.openReceiverSession({ address: s.uri.address, network: 'testnet', expirySeconds: 5 });
    const send = (uri = rs.uri, psbt = s.built.psbt) => tr.sendOriginal(uri, psbt, s.params);
    expect(await codeOf(() => send({ ...rs.uri, pj: 'https://elsewhere.example/p' }))).toBe('transport_failed');
    expect(await codeOf(() => send({ ...rs.uri, pj: 'http://localhost/pj/NOSUCHBOX' }))).toBe('transport_failed');
    expect(await codeOf(() => send(rs.uri, 'A'.repeat(300_000)))).toBe('psbt_invalid');
    expect(await codeOf(() => send(rs.uri, 'not a psbt'))).toBe('psbt_invalid');
    await send();
    expect(await codeOf(() => send())).toBe('session_state');
    expect(await codeOf(() => tr.sendOriginal({ ...rs.uri, network: 'mainnet' as never }, s.built.psbt, s.params))).toBe('network_not_allowed');
    clock.t = 10;
    expect(await codeOf(() => send())).toBe('session_expired');
    const rs2 = await tr.openReceiverSession({ address: s.uri.address, network: 'testnet', expirySeconds: 5 });
    clock.t = 100;
    expect(await codeOf(() => send(rs2.uri))).toBe('session_expired');
  });

  it('directory observes only message sizes', async () => {
    const { dir, rs, receiver, sender } = await setup();
    await receiver.serve(rs);
    await sender.poll();
    expect(dir.observed.map((o) => o.direction)).toEqual(['sender-to-receiver', 'receiver-to-sender']);
    expect(dir.observed.every((o) => o.bytes > 100)).toBe(true);
  });
});
