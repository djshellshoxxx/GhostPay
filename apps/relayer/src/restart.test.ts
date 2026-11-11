import { afterEach, describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PERMIT_TYPES, eip712DomainSeparator } from '@ghostpay/chain-adapters';
import { SimulationRevert } from './errors.js';
import { CHAIN_ID, FakeChain, NOW_MS, OWNER, OWNER_KEY, SWEEP_CONTRACT, USDC, call, errCode, prepare, startHarness, testConfig, type Harness, type HarnessOptions } from './harness.testutil.js';
import { MemoryStateBackend, StateError, StateJournal, decodeState, encodeState, type ChainState, type SendRecord } from './stateStore.js';
import type { AlertEvent } from './alerts.js';

// Restart safety (directive phases 4/5): the daily budget and every transaction that may still spend gas survive a
// process restart through the state journal, and a restart never hands out a nonce a signed transaction may hold.

const harnesses: Harness[] = [];
afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.stop()));
});

const GWEI = 1_000_000_000n;
const estimate = 150_000n * GWEI; // FakeChain gas limit x gas price: the worst case reserved per sweep
const used = 100_000n * GWEI; // FakeChain receipt gasUsed x gas price
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
const DAY = Math.floor(NOW_MS / 86_400_000);

async function start(o: HarnessOptions & { backend: MemoryStateBackend }): Promise<Harness> {
  const chain = testConfig().chains[0];
  if (chain === undefined) throw new Error('chain');
  const h = await startHarness({
    ...o,
    config: {
      chains: [{ ...chain, dailyBudgetWei: 4n * estimate }],
      lossBudget: { windowSeconds: 3600, perKeyWei: 4n * estimate, globalWei: 10n ** 18n, maxKeys: 100 },
      ...o.config,
    },
    journal: new StateJournal(o.backend, () => NOW_MS),
  });
  harnesses.push(h);
  return h;
}

/** A copy of what a crashed process left on disk at this moment. */
function crashCopy(b: MemoryStateBackend): MemoryStateBackend {
  const c = new MemoryStateBackend();
  c.text = b.text;
  return c;
}

function stored(b: MemoryStateBackend): ChainState {
  if (b.text === null) throw new Error('nothing stored');
  const c = decodeState(b.text).get(CHAIN_ID);
  if (c === undefined) throw new Error('no chain state');
  return c;
}

function backendWith(sends: readonly Omit<SendRecord, 'createdAtMs'>[], spentWei: bigint): MemoryStateBackend {
  const b = new MemoryStateBackend();
  b.text = encodeState(new Map([[CHAIN_ID, { budget: { day: DAY, spentWei }, sends: sends.map((s) => ({ ...s, createdAtMs: 1 })) }]]));
  return b;
}

const metric = (h: Harness, line: string): string | undefined => h.relayer.metrics.render().split('\n').find((l) => l.startsWith(line));
const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;

describe('state journal: daily budget survives restarts', () => {
  it('a settled sweep leaves its gas spent in the journal and a new process starts from it', async () => {
    const backend = new MemoryStateBackend();
    const a = await start({ backend });
    expect((await call(a, 'POST', '/v1/sweep', (await prepare(a, { nonce: 1n })).body)).status).toBe(200);
    await settle();
    expect(stored(backend)).toEqual({ budget: { day: DAY, spentWei: used }, sends: [] });
    await a.stop();
    harnesses.splice(harnesses.indexOf(a), 1);

    const b = await start({ backend });
    expect(metric(b, 'relayer_daily_budget_used_wei{chain_id="11155111"}')).toBe(`relayer_daily_budget_used_wei{chain_id="11155111"} ${String(used)}`);
    expect(metric(b, 'relayer_daily_budget_remaining_wei')).toBe(`relayer_daily_budget_remaining_wei{chain_id="11155111"} ${String(4n * estimate - used)}`);
  });

  it('the journal is written before anything is signed, and the hash before the broadcast', async () => {
    const backend = new MemoryStateBackend();
    const fake = new FakeChain();
    let atSign: ChainState | undefined;
    const send = fake.sendSweep.bind(fake);
    fake.sendSweep = async (c, opts) => {
      atSign = stored(backend);
      return send(c, { ...opts, onSigned: (h) => {
        opts.onSigned?.(h);
        expect(stored(backend).sends[0]).toMatchObject({ status: 'signed', txHash: h, nonce: 7 });
      } });
    };
    const a = await start({ backend, fake });
    expect((await call(a, 'POST', '/v1/sweep', (await prepare(a, { nonce: 1n })).body)).status).toBe(200);
    expect(atSign).toEqual({ budget: { day: DAY, spentWei: estimate }, sends: [expect.objectContaining({ status: 'reserved', nonce: 7, reservedWei: estimate, gasPriceWei: GWEI })] });
    await settle();
    expect(stored(backend).sends).toEqual([]);
  });
});

describe('state journal: crash recovery', () => {
  it('crash before signing: the restart releases the reservation (nothing can have been broadcast)', async () => {
    const backend = new MemoryStateBackend();
    const fake = new FakeChain();
    let open: () => void = () => undefined;
    fake.sendGate = new Promise((r) => { open = r; });
    const a = await start({ backend, fake });
    const pending = call(a, 'POST', '/v1/sweep', (await prepare(a, { nonce: 1n })).body);
    await settle();
    expect(stored(backend).sends[0]?.status).toBe('reserved');

    const disk = crashCopy(backend);
    const b = await start({ backend: disk });
    expect(stored(disk)).toEqual({ budget: { day: DAY, spentWei: 0n }, sends: [] });
    expect(b.logs.join('\n')).toContain('state_restored');
    expect(metric(b, 'relayer_state_restored_total')).toBe('relayer_state_restored_total{chain_id="11155111"} 1');
    open();
    await pending;
  });

  it('crash after signing, node holds the nonce: lane blocked, then the receipt settles it and the next nonce is used', async () => {
    const backend = new MemoryStateBackend();
    const fa = new FakeChain();
    fa.sendUnknown = { accepted: true, withHash: true };
    const a = await start({ backend, fake: fa });
    expect(errCode(await call(a, 'POST', '/v1/sweep', (await prepare(a, { nonce: 1n })).body))).toBe('send_failed');
    expect(stored(backend).sends).toEqual([expect.objectContaining({ status: 'signed', nonce: 7, txHash: fa.signed[0] })]);

    const disk = crashCopy(backend);
    const fb = new FakeChain();
    const b = await start({ backend: disk, fake: fb });
    expect((await call(b, 'GET', '/healthz')).json).toMatchObject({ chains: [{ sends: 'unsettled' }] });
    expect(metric(b, 'relayer_unsettled_transactions{chain_id="11155111",state="unknown"}')).toContain(' 1');
    const blocked = await call(b, 'POST', '/v1/sweep', (await prepare(b, { nonce: 2n })).body);
    expect(errCode(blocked)).toBe('send_unsettled');
    expect(fb.sent).toHaveLength(0);

    fb.pendingNonce = 8;
    fb.lookup = { status: 'success', gasUsed: 100_000n };
    expect((await call(b, 'POST', '/v1/sweep', (await prepare(b, { nonce: 3n })).body)).status).toBe(200);
    await settle();
    expect(fb.sent.map((x) => x.opts.nonce)).toEqual([8]);
    expect(stored(disk)).toEqual({ budget: { day: DAY, spentWei: 2n * used }, sends: [] });
  });

  it('crash after signing, never broadcast: released only after the grace, then the nonce is reused', async () => {
    const disk = backendWith([{ id: 'a'.repeat(16), nonce: 7, txHash: hash(99), reservedWei: estimate, reservedDay: DAY, gasPriceWei: GWEI, status: 'signed' }], estimate);
    const fb = new FakeChain();
    const b = await start({ backend: disk, fake: fb });
    expect(errCode(await call(b, 'POST', '/v1/sweep', (await prepare(b, { nonce: 2n })).body))).toBe('send_unsettled');
    b.clock.ms += 30_000;
    expect((await call(b, 'POST', '/v1/sweep', (await prepare(b, { nonce: 3n })).body)).status).toBe(200);
    await settle();
    expect(fb.sent.map((x) => x.opts.nonce)).toEqual([7]);
    expect(stored(disk)).toEqual({ budget: { day: DAY, spentWei: used }, sends: [] });
  });

  it('crash while waiting for a receipt: the restart looks it up and settles it (success and mined revert)', async () => {
    const backend = new MemoryStateBackend();
    const fa = new FakeChain();
    let end: () => void = () => undefined;
    fa.receiptGate = new Promise((r) => { end = r; }); // the receipt wait has not ended when the process "crashes"
    const a = await start({ backend, fake: fa });
    expect((await call(a, 'POST', '/v1/sweep', (await prepare(a, { nonce: 1n })).body)).status).toBe(200);
    expect(stored(backend).sends).toEqual([expect.objectContaining({ status: 'pending', nonce: 7 })]);

    const disk = crashCopy(backend);
    const fb = new FakeChain();
    fb.pendingNonce = 8;
    fb.lookup = { status: 'reverted', gasUsed: 100_000n };
    const b = await start({ backend: disk, fake: fb });
    expect(metric(b, 'relayer_unsettled_transactions{chain_id="11155111",state="pending"}')).toContain(' 1');
    fb.lookup = { status: 'reverted', gasUsed: 100_000n };
    const r = await call(b, 'POST', '/v1/sweep', (await prepare(b, { nonce: 3n })).body);
    expect(r.status).toBe(200);
    await settle();
    expect(metric(b, 'relayer_mined_reverts_total')).toBe('relayer_mined_reverts_total{chain_id="11155111"} 1');
    expect(stored(disk)).toEqual({ budget: { day: DAY, spentWei: 2n * used }, sends: [] });
    end();
  });

  it('restores at most one unknown send; a second hashless one is dropped, extra pending ones beyond the cap too', async () => {
    const sends: Omit<SendRecord, 'createdAtMs'>[] = [
      { id: '0'.repeat(16), nonce: 1, txHash: hash(1), reservedWei: 1n, reservedDay: DAY, gasPriceWei: GWEI, status: 'signed' },
      { id: '1'.repeat(16), nonce: 2, reservedWei: 1n, reservedDay: DAY, gasPriceWei: GWEI, status: 'signed' },
    ];
    for (let i = 0; i < 9; i += 1) {
      sends.push({ id: `2${i.toString(16).padStart(15, '0')}`, nonce: 10 + i, txHash: hash(10 + i), reservedWei: 1n, reservedDay: DAY, gasPriceWei: GWEI, status: 'pending' });
    }
    const disk = backendWith(sends, 11n);
    const b = await start({ backend: disk });
    const ids = stored(disk).sends.map((s) => s.id);
    expect(ids).toHaveLength(9); // unknown + 8 pending lookups
    expect(ids).toContain('0'.repeat(16));
    expect(ids).not.toContain('1'.repeat(16));
    expect(ids).not.toContain(`2${'0'.padStart(15, '0')}`); // oldest pending dropped (its reservation stays spent)
    expect(stored(disk).budget.spentWei).toBe(11n);
    expect(metric(b, 'relayer_unsettled_transactions{chain_id="11155111",state="pending"}')).toContain(' 8');
  });

  it('a restored receipt never found within a day is dropped from the journal', async () => {
    const disk = backendWith([{ id: 'b'.repeat(16), nonce: 6, txHash: hash(5), reservedWei: estimate, reservedDay: DAY, gasPriceWei: GWEI, status: 'pending' }], estimate);
    const b = await start({ backend: disk });
    b.clock.ms += 86_400_000;
    expect((await call(b, 'POST', '/v1/sweep', (await prepare(b, { nonce: 4n })).body)).status).toBe(200);
    await settle();
    expect(stored(disk).sends).toEqual([]);
  });
});

/** Fails the n-th write (1-based) from now. */
class FlakyBackend extends MemoryStateBackend {
  public failAt = new Set<number>();
  private count = 0;
  public override write(text: string): void {
    this.count += 1;
    if (this.failAt.has(this.count)) throw new StateError('state file cannot be written');
    super.write(text);
  }
}

describe('state journal: write failures fail closed before the broadcast', () => {
  it('an unwritable journal refuses the sweep before anything is signed (state_unavailable), budget released', async () => {
    const backend = new FlakyBackend();
    backend.failAt.add(1);
    const alerts: AlertEvent[] = [];
    const h = await start({ backend, alerts: { send: (e) => alerts.push(e) } });
    const r = await call(h, 'POST', '/v1/sweep', (await prepare(h, { nonce: 1n })).body);
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('state_unavailable');
    expect(h.fake.sent).toHaveLength(0);
    expect(h.fake.signed).toHaveLength(0);
    expect(alerts).toContainEqual({ kind: 'state_write_failed', chainId: CHAIN_ID });
    expect(metric(h, 'relayer_state_write_failures_total')).toContain(' 1');
    expect(metric(h, 'relayer_daily_budget_used_wei')).toContain(' 0');
    expect((await call(h, 'POST', '/v1/sweep', (await prepare(h, { nonce: 2n })).body)).status).toBe(200);
  });

  it('failing to journal the signed hash aborts the broadcast (state_unavailable)', async () => {
    const backend = new FlakyBackend();
    backend.failAt.add(2);
    const h = await start({ backend });
    const r = await call(h, 'POST', '/v1/sweep', (await prepare(h, { nonce: 1n })).body);
    expect(errCode(r)).toBe('state_unavailable');
    expect(h.fake.sent).toHaveLength(0);
    expect(stored(backend)).toEqual({ budget: { day: DAY, spentWei: 0n }, sends: [] });
  });

  it('a failed write after the broadcast is counted and the sweep still answers (the next write is a full snapshot)', async () => {
    const backend = new FlakyBackend();
    backend.failAt.add(3);
    const h = await start({ backend });
    expect((await call(h, 'POST', '/v1/sweep', (await prepare(h, { nonce: 1n })).body)).status).toBe(200);
    await settle();
    expect(h.logs.join('\n')).toContain('state_write_failed');
    expect(stored(backend)).toEqual({ budget: { day: DAY, spentWei: used }, sends: [] });
    expect(metric(h, 'relayer_hot_balance_wei')).toBe(`relayer_hot_balance_wei{chain_id="11155111"} ${String(10n ** 18n)}`);
  });
});

describe('spec 04: a failed permit is classified from the token state (failure path only)', () => {
  const domain = { name: 'USD Coin', version: '2', chainId: CHAIN_ID, verifyingContract: USDC } as const;
  const separator = eip712DomainSeparator(domain);
  async function permitFor(nonce: bigint, value: bigint, deadline: bigint): Promise<{ v: number; r: Hex; s: Hex }> {
    const sig = await privateKeyToAccount(OWNER_KEY).signTypedData({
      domain, types: PERMIT_TYPES, primaryType: 'Permit', message: { owner: OWNER, spender: SWEEP_CONTRACT, value, nonce, deadline },
    });
    return { r: `0x${sig.slice(2, 66)}`, s: `0x${sig.slice(66, 130)}`, v: Number.parseInt(sig.slice(130, 132), 16) };
  }
  async function attempt(h: Harness, signNonce: bigint | undefined, nonce: number): Promise<string> {
    const p = await prepare(h, { permit: true, nonce: BigInt(nonce) });
    const permit = p.body['permit'] as { value: string; deadline: string };
    if (signNonce !== undefined) Object.assign(permit, await permitFor(signNonce, BigInt(permit.value), BigInt(permit.deadline)));
    return errCode(await call(h, 'POST', '/v1/sweep', p.body));
  }

  it('maps a spent nonce, a bad signature, a non-ERC-2612 token and a good permit to their own classes', async () => {
    const h = await start({ backend: new MemoryStateBackend() });
    h.fake.allowance = 0n;
    h.fake.simulateError = new SimulationRevert('SafeERC20FailedOperation');
    expect(await attempt(h, undefined, 1)).toBe('permit_unsupported_token'); // DOMAIN_SEPARATOR reverted
    h.fake.permitState = { nonce: 5n, domainSeparator: separator };
    expect(await attempt(h, 4n, 2)).toBe('permit_nonce_consumed');
    expect(await attempt(h, undefined, 3)).toBe('permit_signature_invalid');
    // A strike limit of 3 per owner (spec 04) applies to these classes too.
    expect(await attempt(h, 5n, 4)).toBe('owner_failure_limit');
    expect(metric(h, 'relayer_permit_failures_total{chain_id="11155111",class="permit_nonce_consumed"}')).toContain(' 1');
    expect(h.fake.sent).toHaveLength(0);
  });

  it('a good permit with a failing transfer stays permit_failed, as does a diagnosis read failure', async () => {
    const h = await start({ backend: new MemoryStateBackend() });
    h.fake.allowance = 0n;
    h.fake.simulateError = new SimulationRevert();
    h.fake.permitState = { nonce: 5n, domainSeparator: separator };
    expect(await attempt(h, 5n, 1)).toBe('permit_failed');
    h.fake.readPermitState = () => Promise.reject(new Error('rpc_failure'));
    expect(await attempt(h, 5n, 2)).toBe('permit_failed');
    expect(metric(h, 'relayer_permit_diagnosis_failures_total')).toContain(' 1');
  });

  it('a non-permit revert class is reported as is even with a permit', async () => {
    const h = await start({ backend: new MemoryStateBackend() });
    h.fake.allowance = 0n;
    h.fake.simulateError = new SimulationRevert('InvalidSignature');
    expect(await attempt(h, undefined, 1)).toBe('invalid_signature');
  });
});
