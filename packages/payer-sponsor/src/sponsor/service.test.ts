/* eslint-disable @typescript-eslint/require-await -- fakes implement async ports without awaiting */
import { describe, expect, it } from 'vitest';
import { getAddress, keccak256, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { buildRelayIntent, NO_PERMIT, type BuildRelayIntentArgs } from '../relay/intent.js';
import { buildDelegatePayIntent } from '../eip7702/intent.js';
import { buildInitCode } from '../erc4337/account.js';
import { buildPayerCalls, buildUserOperation, type PackedUserOperation } from '../erc4337/userop.js';
import { DUMMY_PAYMASTER_SIGNATURE, decodePaymasterAndData, encodePaymasterAndData, paymasterSignedHash, withPaymasterSignature } from '../erc4337/paymaster.js';
import { encodeRouterPay } from '../routerTargets.js';
import { parseManifest } from '../manifest.js';
import { DEFAULT_GAS_UNITS, SponsorService } from './service.js';
import type { Eip7702SubmitRequest, ReceiptLog, RelaySubmitRequest, SponsorUserOpRequest } from './types.js';
import { CHAIN_ID, CTX, DEPLOY, FEE_TO, GROSS, PM_KEY, POLICY_ROUTER, ROUTER, SPONSOR, STEALTH, TOKEN, TRANSFER, addr, harness, nowSec, pad32, payArgs, type Harness } from './service.testutil.js';

const payer = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const owner = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const code = async (p: Promise<unknown>, c: string) => {
  await expect(p).rejects.toMatchObject({ code: c });
};

async function quoteFor(h: Harness, mode: 'permit-relay' | 'eip7702-sponsored' | 'erc4337-paymaster', gross = GROSS) {
  return h.svc.quote(CTX, { mode, chainId: CHAIN_ID, token: TOKEN, gross });
}

async function relayRequest(h: Harness, over: Partial<BuildRelayIntentArgs> = {}, tweak: (r: RelaySubmitRequest) => RelaySubmitRequest = (r) => r): Promise<RelaySubmitRequest> {
  const q = await quoteFor(h, 'permit-relay');
  const b = buildRelayIntent({
    chainId: CHAIN_ID,
    relay: DEPLOY.relay,
    payer: payer.address,
    router: ROUTER,
    pay: payArgs(),
    sponsorFee: q.sponsorFee,
    sponsorFeeTo: q.sponsorFeeTo,
    deadline: nowSec(h) + 600n,
    nonce: 1n,
    ...over,
  });
  const sig = await payer.signTypedData(b.typedData);
  return tweak({ quoteId: q.quoteId, chainId: CHAIN_ID, router: ROUTER, intent: b.intent, routerCalldata: b.routerCalldata, sig, permit: NO_PERMIT });
}

describe('SponsorService construction', () => {
  it('rejects bad configuration', () => {
    const h = harness();
    const base = { price: async () => 1n, safetyBps: 0, quoteTtlMs: 1, maxQuotes: 1, maxDeadlineSeconds: 1, limiter: h.limiter, breaker: h.breaker, loss: h.loss, log: () => undefined };
    expect(() => new SponsorService({ ...base, chains: [] })).toThrow();
    const cfg = { chain: h.chain, deployment: { ...DEPLOY }, routers: [ROUTER], tokens: [TOKEN], sponsorFeeTo: FEE_TO };
    expect(() => new SponsorService({ ...base, chains: [cfg, cfg] })).toThrow();
    expect(() => new SponsorService({ ...base, chains: [{ ...cfg, deployment: { ...DEPLOY, chainId: 84532 } }] })).toThrowError(expect.objectContaining({ code: 'MANIFEST_MISMATCH' }) as Error);
    const main = Object.assign(Object.create(h.chain) as typeof h.chain, { chainId: 1 });
    expect(() => new SponsorService({ ...base, chains: [{ ...cfg, chain: main, deployment: { ...DEPLOY, chainId: 1 } }] })).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
    for (const bad of [{ safetyBps: -1 }, { safetyBps: 10_001 }, { safetyBps: 1.5 }, { quoteTtlMs: 0 }, { maxQuotes: 0 }, { maxDeadlineSeconds: 0 }]) {
      expect(() => new SponsorService({ ...base, ...bad, chains: [cfg] })).toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }) as Error);
    }
    expect(new SponsorService({ ...base, chains: [cfg] }).health()).toEqual({ chains: [CHAIN_ID], breaker: 'ok' });
  });
});

describe('quote (SP-REQ-1)', () => {
  it('fee >= estimated gas cost * (1 + safetyBps) in token units, rounded up, random id', async () => {
    const h = harness();
    const q = await quoteFor(h, 'permit-relay');
    const costWei = DEFAULT_GAS_UNITS['permit-relay'] * h.chain.gas;
    const minFee = (costWei * 11n * 3_000n * 10n ** 6n) / 10n / 10n ** 18n; // x1.10
    expect(q.sponsorFee).toBeGreaterThanOrEqual(minFee);
    expect(q.sponsorFee.toString().replace(/0+$/, '').length).toBeLessThanOrEqual(2);
    expect(q.sponsorFeeTo).toBe(FEE_TO);
    expect(q.quoteId).toMatch(/^[0-9a-f]{32}$/);
    expect(q.expiresAt).toBe(h.clock.now + 60_000);
    const q2 = await quoteFor(h, 'permit-relay');
    h.clock.now += 1;
    expect(q2.quoteId).not.toBe((await quoteFor(h, 'permit-relay')).quoteId);
  });
  it('uses mode specific gas units', async () => {
    const h = harness({ gasUnits: { 'erc4337-paymaster': 1_000_000n } });
    const a = await quoteFor(h, 'permit-relay');
    const b = await quoteFor(h, 'erc4337-paymaster');
    expect(b.sponsorFee).toBeGreaterThan(a.sponsorFee);
  });
  it('rejects mainnet, unknown chain/token, zero gross, tiny amounts, no price, unconfigured modes, full table, rate limit', async () => {
    const h = harness({ maxQuotes: 5 });
    await code(h.svc.quote(CTX, { mode: 'permit-relay', chainId: 1, token: TOKEN, gross: GROSS }), 'MAINNET_FORBIDDEN');
    await code(h.svc.quote(CTX, { mode: 'permit-relay', chainId: 84532, token: TOKEN, gross: GROSS }), 'BAD_REQUEST');
    await code(h.svc.quote(CTX, { mode: 'permit-relay', chainId: CHAIN_ID, token: addr(0x999), gross: GROSS }), 'BAD_REQUEST');
    await code(h.svc.quote(CTX, { mode: 'permit-relay', chainId: CHAIN_ID, token: TOKEN, gross: 0n }), 'BAD_REQUEST');
    await code(h.svc.quote(CTX, { mode: 'permit-relay', chainId: CHAIN_ID, token: TOKEN, gross: 100n }), 'BAD_REQUEST');
    const noPrice = harness({ price: async () => 0n });
    await code(quoteFor(noPrice, 'permit-relay'), 'UNAVAILABLE');
    await code(quoteFor(harness({}, { relay: undefined }), 'permit-relay'), 'MODE_UNAVAILABLE');
    await code(quoteFor(harness({}, { delegate: undefined }), 'eip7702-sponsored'), 'MODE_UNAVAILABLE');
    await code(quoteFor(harness({}, { supports7702: false }), 'eip7702-sponsored'), 'MODE_UNAVAILABLE');
    await code(quoteFor(harness({}, { paymaster: undefined }), 'erc4337-paymaster'), 'MODE_UNAVAILABLE');
    for (let i = 0; i < 5; i++) {
      h.clock.now += 1;
      await quoteFor(h, 'permit-relay');
    }
    await code(quoteFor(h, 'permit-relay'), 'RATE_LIMITED'); // table full of live quotes
    h.clock.now += 61_000; // expired quotes are pruned
    await expect(quoteFor(h, 'permit-relay')).resolves.toBeDefined();
  });
  it('one client cannot fill the quote table', async () => {
    const h = harness({ maxQuotesPerBucket: 2 });
    await quoteFor(h, 'permit-relay');
    await quoteFor(h, 'permit-relay');
    await code(quoteFor(h, 'permit-relay'), 'RATE_LIMITED');
    await expect(h.svc.quote({ bucket: 'other' }, { mode: 'permit-relay', chainId: CHAIN_ID, token: TOKEN, gross: GROSS })).resolves.toBeDefined();
  });
  it('rate limits per client bucket', async () => {
    const { TokenBucketLimiter } = await import('@ghostpay/relayer-guard');
    const clock = { now: 1_000_000 };
    const limiter = new TokenBucketLimiter({ ratePerSecond: 0.001, burst: 1, maxKeys: 10 }, () => clock.now);
    const h = harness({ limiter, now: () => clock.now });
    await quoteFor(h, 'permit-relay');
    await code(quoteFor(h, 'permit-relay'), 'RATE_LIMITED');
    await expect(h.svc.quote({ bucket: 'other' }, { mode: 'permit-relay', chainId: CHAIN_ID, token: TOKEN, gross: GROSS })).resolves.toBeDefined();
  });
});

describe('PH-2 submitRelay', () => {
  it('simulates, sends to the relay, consumes the quote and logs only allowlisted fields', async () => {
    const h = harness();
    const r = await relayRequest(h);
    const res = await h.svc.submitRelay(CTX, r);
    expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(h.chain.sent).toHaveLength(1);
    expect(h.chain.sent[0]?.call.to).toBe(DEPLOY.relay);
    expect(h.chain.sent[0]?.gasLimit).toBe(300_000n); // 250_000 * 1.2
    await code(h.svc.submitRelay(CTX, r), 'QUOTE_UNKNOWN'); // single use
    const last = h.entries.at(-1);
    expect(h.entries.find((e) => e.outcome === 'ok')).toMatchObject({ mode: 'permit-relay', chainId: CHAIN_ID, outcome: 'ok', latencyBucket: '<100ms' });
    for (const line of h.logs) {
      expect(Object.keys(JSON.parse(line) as object).every((k) => ['mode', 'chainId', 'outcome', 'latencyBucket', 'txHash'].includes(k))).toBe(true);
      expect(line).not.toContain(payer.address.slice(2).toLowerCase());
      expect(line).not.toContain(STEALTH.slice(2).toLowerCase());
      expect(line).not.toContain('b1');
    }
    expect(last).toBeDefined();
  });
  it('works with the policy router when allowed', async () => {
    const h = harness();
    const q = await quoteFor(h, 'permit-relay');
    const b = buildRelayIntent({ chainId: CHAIN_ID, relay: DEPLOY.relay, payer: payer.address, router: POLICY_ROUTER, pay: payArgs(), sponsorFee: q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo, deadline: nowSec(h) + 600n, nonce: 1n });
    const sig = await payer.signTypedData(b.typedData);
    await expect(h.svc.submitRelay(CTX, { quoteId: q.quoteId, chainId: CHAIN_ID, router: POLICY_ROUTER, intent: b.intent, routerCalldata: b.routerCalldata, sig, permit: NO_PERMIT })).resolves.toBeDefined();
  });
  it('every request/quote mismatch is refused before any chain interaction (PH-GEN-6)', async () => {
    const h = harness();
    const cases: [string, Partial<BuildRelayIntentArgs>, (r: RelaySubmitRequest) => RelaySubmitRequest, string][] = [
      ['fee below quote', {}, (r) => ({ ...r, intent: { ...r.intent, sponsorFee: r.intent.sponsorFee - 1n } }), 'FEE_TOO_LOW'],
      ['fee recipient differs', {}, (r) => ({ ...r, intent: { ...r.intent, sponsorFeeTo: addr(0x777) } }), 'BAD_REQUEST'],
      ['token differs', {}, (r) => ({ ...r, intent: { ...r.intent, token: addr(0x778) } }), 'BAD_REQUEST'],
      ['gross differs', {}, (r) => ({ ...r, intent: { ...r.intent, gross: r.intent.gross + 1n } }), 'BAD_REQUEST'],
      ['router address differs from target', {}, (r) => ({ ...r, intent: { ...r.intent, router: addr(0x779) } }), 'PAYLOAD_MISMATCH'],
      ['router not allowed', {}, (r) => ({ ...r, router: { kind: 'ghostpay', address: addr(0x779) }, intent: { ...r.intent, router: addr(0x779) } }), 'BAD_REQUEST'],
      ['payload hash differs', {}, (r) => ({ ...r, intent: { ...r.intent, payloadHash: `0x${'00'.repeat(32)}` } }), 'PAYLOAD_MISMATCH'],
      ['calldata stealth differs', {}, (r) => ({ ...r, routerCalldata: encodeRouterPay(ROUTER, { ...payArgs(), stealth: addr(0x780) }), intent: { ...r.intent, payloadHash: keccak256(encodeRouterPay(ROUTER, { ...payArgs(), stealth: addr(0x780) })) } }), 'PAYLOAD_MISMATCH'],
      ['deadline in the past', { deadline: 1n }, (r) => r, 'BAD_REQUEST'],
      ['deadline too far', { deadline: 4_000_000_000n }, (r) => r, 'BAD_REQUEST'],
      ['short signature', {}, (r) => ({ ...r, sig: '0x1234' }), 'BAD_REQUEST'],
      ['payer is the sponsor', {}, (r) => ({ ...r, intent: { ...r.intent, payer: SPONSOR } }), 'BAD_REQUEST'],
    ];
    for (const [name, over, tweak, want] of cases) {
      const r = await relayRequest(h, over, tweak);
      await expect(h.svc.submitRelay(CTX, r), name).rejects.toMatchObject({ code: want });
      h.clock.now += 1;
    }
    expect(h.chain.simulated).toHaveLength(0);
    expect(h.chain.sent).toHaveLength(0);
  });
  it('refuses unknown, expired and wrong-mode quotes, mainnet, missing relay', async () => {
    const h = harness();
    const r = await relayRequest(h);
    await code(h.svc.submitRelay(CTX, { ...r, quoteId: 'nope' }), 'QUOTE_UNKNOWN');
    await code(h.svc.submitRelay(CTX, { ...r, chainId: 1 }), 'MAINNET_FORBIDDEN');
    await code(h.svc.submitRelay(CTX, { ...r, chainId: 84532 }), 'BAD_REQUEST');
    const other = await quoteFor(h, 'eip7702-sponsored');
    await code(h.svc.submitRelay(CTX, { ...r, quoteId: other.quoteId }), 'QUOTE_UNKNOWN');
    h.clock.now += 61_000;
    await code(h.svc.submitRelay(CTX, r), 'QUOTE_EXPIRED');
    await code(h.svc.submitRelay(CTX, r), 'QUOTE_UNKNOWN');
    const noRelay = harness({}, { relay: undefined });
    await code(noRelay.svc.submitRelay(CTX, r), 'MODE_UNAVAILABLE');
  });
  it('simulation revert is neutral for the breaker; RPC errors count as failures and open it (S3-06)', async () => {
    const h = harness();
    h.chain.simOk = false;
    for (let i = 0; i < 4; i++) {
      await code(h.svc.submitRelay(CTX, await relayRequest(h, { nonce: BigInt(i + 10) })), 'SIMULATION_FAILED');
    }
    expect(h.breaker.state).toBe('closed');
    h.chain.simOk = true;
    h.chain.simThrows = true;
    await code(h.svc.submitRelay(CTX, await relayRequest(h, { nonce: 20n })), 'UNAVAILABLE');
    await code(h.svc.submitRelay(CTX, await relayRequest(h, { nonce: 21n })), 'UNAVAILABLE');
    expect(h.breaker.state).toBe('open');
    await code(h.svc.submitRelay(CTX, await relayRequest(h, { nonce: 22n })), 'BREAKER_OPEN');
    h.clock.now += 11_000; // cooldown, half-open probe succeeds
    h.chain.simThrows = false;
    await expect(h.svc.submitRelay(CTX, await relayRequest(h, { nonce: 23n }))).resolves.toBeDefined();
    expect(h.breaker.state).toBe('closed');
  });
  it('send failure and receipt revert paths; revert charges the loss budget and does not open the breaker', async () => {
    const h = harness();
    h.chain.sendThrows = true;
    await code(h.svc.submitRelay(CTX, await relayRequest(h)), 'UNAVAILABLE');
    h.chain.sendThrows = false;
    h.chain.receipt = { success: false, gasUsed: 200_000n, effectiveGasPrice: 2_000_000_000n };
    await code(h.svc.submitRelay(CTX, await relayRequest(h, { nonce: 5n })), 'UNAVAILABLE');
    expect(h.entries.some((e) => e.outcome === 'reverted' && e.txHash !== undefined)).toBe(true);
    expect(h.breaker.state).toBe('closed');
    // 4e14 wei charged per revert against a 1e16 per-key budget
    let n = 6n;
    for (let i = 0; i < 30; i++) {
      try {
        await h.svc.submitRelay(CTX, await relayRequest(h, { nonce: n++ }));
      } catch (e) {
        if ((e as { code: string }).code === 'BUDGET_EXCEEDED') break;
      }
    }
    expect(h.loss.allows(CTX.bucket)).toBe(false);
    await code(h.svc.submitRelay(CTX, await relayRequest(h, { nonce: n })), 'BUDGET_EXCEEDED');
    expect(h.loss.allows('another-bucket')).toBe(true);
  });
});

describe('mined but unpaid transactions (stale authorization / failed inner execution)', () => {
  it('a succeeded transaction without the fee Transfer log is charged as a loss, not as success', async () => {
    const bad = (logs: ReceiptLog[]): ReceiptLog[] => logs;
    const variants = [
      bad([]),
      bad([{ address: addr(0x999), topics: [TRANSFER, pad32(addr(1)), pad32(FEE_TO)], data: `0x${'ff'.repeat(32)}` }]), // wrong emitter
      bad([{ address: TOKEN, topics: [TRANSFER, pad32(addr(1)), pad32(addr(2))], data: `0x${'ff'.repeat(32)}` }]), // wrong recipient
      bad([{ address: TOKEN, topics: [TRANSFER, pad32(addr(1))], data: `0x${'ff'.repeat(32)}` }]), // wrong topic count
      bad([{ address: TOKEN, topics: [pad32(addr(1)), pad32(addr(1)), pad32(FEE_TO)], data: `0x${'ff'.repeat(32)}` }]), // not a Transfer
      bad([{ address: TOKEN, topics: [TRANSFER, pad32(addr(1)), pad32(FEE_TO)], data: '0x01' }]), // malformed data
      bad([{ address: TOKEN, topics: [TRANSFER, pad32(addr(1)), pad32(FEE_TO)], data: `0x${'00'.repeat(32)}` }]), // value too small
    ];
    for (const logs of variants) {
      const h = harness();
      h.chain.logs = logs;
      const r = await relayRequest(h);
      await code(h.svc.submitRelay(CTX, r), 'UNAVAILABLE');
      expect(h.entries.at(-1)?.outcome).toBe('reverted');
      expect(h.loss.charge(CTX.bucket, 0n)).toBeGreaterThan(0n); // gas was charged
      expect(h.breaker.state).toBe('closed');
    }
  });
});

describe('PH-3 submitEip7702', () => {
  async function request(h: Harness, over: { authChain?: number; authAddr?: Address; signer?: typeof payer; payerAddr?: Address } = {}): Promise<Eip7702SubmitRequest> {
    const q = await quoteFor(h, 'eip7702-sponsored');
    const manifest = parseManifest({ deployments: [{ chainId: CHAIN_ID, delegate: DEPLOY.delegate }] });
    const b = buildDelegatePayIntent({ chainId: CHAIN_ID, manifest, delegate: DEPLOY.delegate, payer: payer.address, payerAccountNonce: 0, router: ROUTER, pay: payArgs(), sponsorFee: q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo, deadline: nowSec(h) + 600n, nonce: 1n });
    const sig = await payer.signTypedData(b.typedData);
    const signer = over.signer ?? payer;
    const auth = await signer.signAuthorization({ chainId: over.authChain ?? CHAIN_ID, address: over.authAddr ?? DEPLOY.delegate, nonce: 0 });
    return {
      quoteId: q.quoteId, chainId: CHAIN_ID, payer: over.payerAddr ?? payer.address, router: ROUTER, intent: b.intent, routerCalldata: b.routerCalldata, sig,
      authorization: { chainId: auth.chainId, address: auth.address, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity ?? 0 },
    };
  }
  it('sends a type-4 transaction to the payer with the authorization list', async () => {
    const h = harness();
    const r = await request(h);
    await expect(h.svc.submitEip7702(CTX, r)).resolves.toBeDefined();
    expect(h.chain.sent[0]?.call.to).toBe(payer.address);
    expect(h.chain.sent[0]?.call.authorizationList).toHaveLength(1);
  });
  it('refuses a wrong chain, wrong delegate, wrong signer, wrong payer, sponsor as payer, no 7702', async () => {
    const h = harness();
    await code(h.svc.submitEip7702(CTX, await request(h, { authChain: 0 })), 'BAD_REQUEST');
    await code(h.svc.submitEip7702(CTX, await request(h, { authAddr: addr(0x999) })), 'BAD_REQUEST');
    await code(h.svc.submitEip7702(CTX, await request(h, { signer: owner })), 'BAD_REQUEST');
    await code(h.svc.submitEip7702(CTX, await request(h, { payerAddr: owner.address })), 'BAD_REQUEST');
    const bad = await request(h);
    await code(h.svc.submitEip7702(CTX, { ...bad, authorization: { ...bad.authorization, r: `0x${'00'.repeat(32)}`, s: `0x${'00'.repeat(32)}` } }), 'BAD_REQUEST');
    await code(h.svc.submitEip7702(CTX, { ...bad, payer: SPONSOR, authorization: { ...bad.authorization } }), 'BAD_REQUEST');
    await code(h.svc.submitEip7702(CTX, { ...bad, chainId: 1 }), 'MAINNET_FORBIDDEN');
    await code(harness({}, { supports7702: false }).svc.submitEip7702(CTX, bad), 'NO_7702');
    await code(harness({}, { delegate: undefined }).svc.submitEip7702(CTX, bad), 'MODE_UNAVAILABLE');
    expect(h.chain.sent).toHaveLength(0);
  });
});

describe('PH-4 sponsorUserOp / submitUserOp', () => {
  const salt = 9n;
  async function stage(h: Harness, tweak: { fee?: bigint; calls?: Parameters<typeof buildPayerCalls>[0]; initCode?: Hex; nonce?: bigint; gas?: Partial<{ verificationGasLimit: bigint; callGasLimit: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; preVerificationGas: bigint }>; sender?: Address } = {}) {
    const q = await quoteFor(h, 'erc4337-paymaster');
    const routerCalldata = encodeRouterPay(ROUTER, payArgs());
    const sender = getAddress(tweak.sender ?? addr(0xabc));
    h.chain.factoryAnswer = `0x${'00'.repeat(12)}${sender.slice(2).toLowerCase()}`;
    const calls = buildPayerCalls(tweak.calls ?? { token: TOKEN, router: ROUTER.address, routerCalldata, gross: GROSS, sponsorFee: tweak.fee ?? q.sponsorFee, sponsorFeeTo: q.sponsorFeeTo });
    const built = buildUserOperation({
      chainId: CHAIN_ID, entryPoint: DEPLOY.entryPoint, sender, initCode: tweak.initCode ?? buildInitCode(DEPLOY.accountFactory, owner.address, salt), nonce: tweak.nonce ?? 0n, calls,
      gas: { verificationGasLimit: 1_500_000n, callGasLimit: 1_000_000n, preVerificationGas: 100_000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, ...tweak.gas },
    });
    const req: SponsorUserOpRequest = { quoteId: q.quoteId, chainId: CHAIN_ID, router: ROUTER, routerCalldata, owner: owner.address, saltNonce: salt, sponsorFee: tweak.fee ?? q.sponsorFee, userOp: built.userOp };
    return { q, req, sender };
  }
  async function signed(h: Harness, req: SponsorUserOpRequest): Promise<{ req: SponsorUserOpRequest; op: PackedUserOperation }> {
    const r = await h.svc.sponsorUserOp(CTX, req);
    const withPm = { ...req.userOp, paymasterAndData: r.paymasterAndData };
    const { getUserOpHashV07 } = await import('../erc4337/userop.js');
    const ownerSig = await owner.sign({ hash: getUserOpHashV07(withPm, DEPLOY.entryPoint, CHAIN_ID) });
    const op = { ...withPm, signature: ownerSig };
    return { req: { ...req, userOp: op }, op };
  }
  it('step 1 returns a paymaster signature by the configured signer; step 2 sends handleOps to the EntryPoint', async () => {
    const h = harness();
    const { req } = await stage(h);
    const s = await signed(h, req);
    const dec = decodePaymasterAndData(s.op.paymasterAndData);
    expect(dec.paymaster.toLowerCase()).toBe(DEPLOY.paymaster.toLowerCase());
    expect(dec.validUntil).toBe(BigInt(Math.floor((h.clock.now + 60_000) / 1000)));
    const res = await h.svc.submitUserOp(CTX, s.req);
    expect(res.txHash).toMatch(/^0x/);
    expect(h.chain.sent[0]?.call.to).toBe(DEPLOY.entryPoint);
  });
  it('one paymaster authorisation per quote', async () => {
    const h = harness();
    const { req } = await stage(h);
    await h.svc.sponsorUserOp(CTX, req);
    await code(h.svc.sponsorUserOp(CTX, req), 'QUOTE_UNKNOWN');
  });
  it('step 1 refuses every deviation from the expected batch and the fresh-account rule', async () => {
    const h = harness();
    const routerCalldata = encodeRouterPay(ROUTER, payArgs());
    const q0 = await quoteFor(h, 'erc4337-paymaster');
    const variants: [string, Parameters<typeof stage>[1], string][] = [
      ['fee above the batch fee', { fee: q0.sponsorFee - 1n }, 'FEE_TOO_LOW'],
      ['extra call data', { calls: { token: TOKEN, router: ROUTER.address, routerCalldata: `${routerCalldata}00`, gross: GROSS, sponsorFee: q0.sponsorFee, sponsorFeeTo: q0.sponsorFeeTo } }, 'PAYLOAD_MISMATCH'],
      ['non-zero nonce', { nonce: 1n }, 'BAD_REQUEST'],
      ['foreign initCode', { initCode: '0x1234' }, 'BAD_REQUEST'],
      ['sender is not the counterfactual account', { sender: addr(0xabc) }, 'BAD_REQUEST'],
      ['verification gas above cap', { gas: { verificationGasLimit: 3_000_000n } }, 'BAD_REQUEST'],
      ['call gas above cap', { gas: { callGasLimit: 2_000_000n } }, 'BAD_REQUEST'],
      ['cost above cap', { gas: { maxFeePerGas: 10n ** 12n } }, 'BAD_REQUEST'],
    ];
    for (const [name, v, want] of variants) {
      const { req } = await stage(h, v);
      if (name === 'sender is not the counterfactual account') h.chain.factoryAnswer = `0x${'00'.repeat(12)}${addr(0xdef).slice(2)}`;
      await expect(h.svc.sponsorUserOp(CTX, req), name).rejects.toMatchObject({ code: want });
      h.clock.now += 1;
    }
    // router not allowed, wrong factory answer length
    const { req } = await stage(h);
    await code(h.svc.sponsorUserOp(CTX, { ...req, router: { kind: 'ghostpay', address: addr(0x999) } }), 'BAD_REQUEST');
    h.chain.factoryAnswer = '0x1234';
    await code(h.svc.sponsorUserOp(CTX, req), 'BAD_REQUEST');
    await code(h.svc.sponsorUserOp(CTX, { ...req, chainId: 1 }), 'MAINNET_FORBIDDEN');
    await code(h.svc.sponsorUserOp(CTX, { ...req, userOp: { ...req.userOp, callData: '0xdeadbeef' } }), 'PAYLOAD_MISMATCH');
  });
  it('CONTRACTS-POOLS-01: fee fields are bounded by the live gas price and pvg by the op size', async () => {
    const h = harness();
    const variants: [string, Parameters<typeof stage>[1]][] = [
      ['maxFee above 2x live gas price', { gas: { maxFeePerGas: 2_000_000_001n } }],
      ['priority fee above the tip cap', { gas: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 2_000_000_001n } }],
      ['priority fee above maxFee', { gas: { maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_500_000_000n } }],
      ['preVerificationGas far above the calldata bound', { gas: { preVerificationGas: 5_000_000n } }],
    ];
    for (const [name, v] of variants) {
      const { req } = await stage(h, v);
      await expect(h.svc.sponsorUserOp(CTX, req), name).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    // the self-bundle PoC shape (90 gwei tip at a 45 gwei market) is refused even though its cost is under maxOpCostWei
    h.chain.gas = 45_000_000_000n;
    const poc = await stage(h, { gas: { verificationGasLimit: 500_000n, callGasLimit: 200_000n, preVerificationGas: 50_000n, maxFeePerGas: 90_000_000_000n, maxPriorityFeePerGas: 90_000_000_000n } });
    await code(h.svc.sponsorUserOp(CTX, poc.req), 'BAD_REQUEST');
    // a tuned configuration accepts what the defaults refuse
    const loose = harness({ maxFeeMultiplierBps: 30_000, maxPriorityFeeWei: 3_000_000_000n });
    const { req } = await stage(loose, { gas: { maxFeePerGas: 3_000_000_000n, maxPriorityFeePerGas: 3_000_000_000n } });
    await expect(loose.svc.sponsorUserOp(CTX, req)).resolves.toBeDefined();
  });
  it('CONTRACTS-POOLS-01: the paymaster signature is short-lived even for a long quote', async () => {
    const h = harness({ quoteTtlMs: 3_600_000 });
    const { req } = await stage(h);
    const r = await h.svc.sponsorUserOp(CTX, req);
    expect(r.validUntil).toBe(nowSec(h) + 120n);
    const h2 = harness({ quoteTtlMs: 3_600_000, paymasterValiditySeconds: 30 });
    const { req: r2 } = await stage(h2);
    expect((await h2.svc.sponsorUserOp(CTX, r2)).validUntil).toBe(nowSec(h2) + 30n);
    expect(() => harness({ paymasterValiditySeconds: 0 })).toThrow();
  });
  it('CONTRACTS-POOLS-03: the counterfactual sender must already hold gross + sponsor fee (step 1 and step 2)', async () => {
    const h = harness();
    const { q, req, sender } = await stage(h);
    h.chain.tokenBalance = GROSS + q.sponsorFee - 1n;
    await code(h.svc.sponsorUserOp(CTX, req), 'BAD_REQUEST');
    const bal = h.chain.calls.find((c) => c.to.toLowerCase() === TOKEN.toLowerCase());
    expect(bal?.data.toLowerCase()).toBe(`0x70a08231${'00'.repeat(12)}${sender.slice(2).toLowerCase()}`);
    h.chain.tokenBalance = GROSS + q.sponsorFee;
    const s = await signed(h, req);
    // balance drained between the steps: refused before handleOps is simulated or sent
    h.chain.tokenBalance = 0n;
    await code(h.svc.submitUserOp(CTX, s.req), 'BAD_REQUEST');
    expect(h.chain.simulated).toHaveLength(0);
    expect(h.chain.sent).toHaveLength(0);
    // malformed balanceOf answer
    h.chain.tokenBalance = GROSS + q.sponsorFee;
    const h2 = harness();
    const st = await stage(h2);
    const factoryCall = h2.chain.call;
    h2.chain.call = async (to, data) => (to.toLowerCase() === TOKEN.toLowerCase() ? '0x12' : factoryCall(to, data));
    await code(h2.svc.sponsorUserOp(CTX, st.req), 'BAD_REQUEST');
  });
  it('step 1 needs a configured signer and a deployed PH-4', async () => {
    const noSigner = harness({ paymasterSigner: undefined });
    const { req } = await stage(noSigner);
    await code(noSigner.svc.sponsorUserOp(CTX, req), 'MODE_UNAVAILABLE');
    const none = harness({}, { entryPoint: undefined });
    await code(none.svc.quote(CTX, { mode: 'erc4337-paymaster', chainId: CHAIN_ID, token: TOKEN, gross: GROSS }), 'MODE_UNAVAILABLE');
  });
  it('step 2 refuses foreign, expired and forged paymaster data and bad owner signatures', async () => {
    const h = harness();
    const { req } = await stage(h);
    const s = await signed(h, req);
    const dec = decodePaymasterAndData(s.op.paymasterAndData);
    const resign = async (op: PackedUserOperation) => {
      const { getUserOpHashV07 } = await import('../erc4337/userop.js');
      return { ...op, signature: await owner.sign({ hash: getUserOpHashV07(op, DEPLOY.entryPoint, CHAIN_ID) }) };
    };
    // not our paymaster address
    const foreign = { ...s.op, paymasterAndData: encodePaymasterAndData({ ...dec, paymaster: addr(0x999) }, dec.signature) };
    await code(h.svc.submitUserOp(CTX, { ...s.req, userOp: await resign(foreign) }), 'BAD_REQUEST');
    // signature by another key
    const evil = privateKeyToAccount(`0x${'99'.repeat(32)}`);
    const p = { ...dec };
    const base = withPaymasterSignature(s.op, p, DUMMY_PAYMASTER_SIGNATURE);
    const forged = withPaymasterSignature(s.op, p, await evil.signMessage({ message: { raw: paymasterSignedHash(base, p, CHAIN_ID) } }));
    await code(h.svc.submitUserOp(CTX, { ...s.req, userOp: await resign(forged) }), 'BAD_REQUEST');
    // garbage signature
    const garbage = withPaymasterSignature(s.op, p, `0x${'00'.repeat(65)}`);
    await code(h.svc.submitUserOp(CTX, { ...s.req, userOp: await resign(garbage) }), 'BAD_REQUEST');
    // wrong owner signature length
    await code(h.svc.submitUserOp(CTX, { ...s.req, userOp: { ...s.op, signature: '0x12' } }), 'BAD_REQUEST');
    // expired validUntil
    h.clock.now += 59_999;
    const expired = { ...s.op, paymasterAndData: encodePaymasterAndData({ ...dec, validUntil: BigInt(Math.floor(h.clock.now / 1000)) }, dec.signature) };
    await code(h.svc.submitUserOp(CTX, { ...s.req, userOp: await resign(expired) }), 'BAD_REQUEST');
    // signer address not configured
    const h2 = harness({ paymasterSignerAddress: undefined });
    const { req: r2 } = await stage(h2);
    const s2 = await signed(h2, r2);
    await code(h2.svc.submitUserOp(CTX, s2.req), 'MODE_UNAVAILABLE');
    expect(h.chain.sent).toHaveLength(0);
    expect(PM_KEY.address).toBeDefined();
  });
});
