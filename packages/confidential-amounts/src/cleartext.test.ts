import { describe, expect, it } from 'vitest';
import { hexToBytes, type Address, type Hex } from 'viem';
import { CleartextBackend, CTM_INFO } from './backends/cleartext.js';
import { CleartextLedger, LEDGER_FEE_EPOCH, type LedgerReceipt } from './backends/ledger.js';
import { NOT_PROTECTED_KEYS } from './copy.js';
import { CtError } from './errors.js';
import { parseConfidentialMetadata } from './metadata.js';
import { classifyPayment } from './payment.js';
import { DEST, EPH, FEE_RECIPIENT, NOW, OTHER, PAYER, ROUTER, STEALTH, TOKEN, counterRandom, makeSigner, payParams } from './fixtures.testutil.js';

function setup(balance = 10_000_000n) {
  const ledger = new CleartextLedger(counterRandom());
  ledger.deployToken(TOKEN);
  ledger.deployRouter(ROUTER, FEE_RECIPIENT, [TOKEN]);
  ledger.wrap(TOKEN, PAYER, balance);
  const backend = new CleartextBackend(ledger);
  return { ledger, backend };
}

function approve(b: CleartextBackend, ledger: CleartextLedger, now = NOW, secs = 600) {
  const tx = b.buildSetOperator({ chainId: 31337, token: TOKEN, operator: ROUTER, until: now + secs, nowSec: now });
  return ledger.execute(tx, PAYER, now);
}

async function pay(b: CleartextBackend, ledger: CleartextLedger, over = {}, now = NOW): Promise<LedgerReceipt> {
  const tx = await b.buildPayCalldata(payParams(over));
  return ledger.execute(tx, PAYER, now);
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof CtError ? `${e.code}:${e.message}` : String(e);
  }
  return 'no-throw';
}

describe('CT-M end-to-end (T5): invoice -> pay -> scan -> decrypt -> sweep', () => {
  it('runs the full seller flow with the stealth key only', async () => {
    const { ledger, backend } = setup();
    approve(backend, ledger);
    const receipt = await pay(backend, ledger, { gross: 1_234_567n });

    // scan: find the announcement, parse metadata
    const ann = receipt.events.find((e) => e.name === 'Announcement');
    expect(ann).toBeDefined();
    const meta = parseConfidentialMetadata(hexToBytes(ann?.args['metadata'] as Hex));
    expect(meta?.token).toBe(TOKEN);
    expect(meta?.viewTag).toBe(0xab);
    expect(ann?.args['stealthAddress']).toBe(STEALTH);

    // pending-decrypt -> reveal with the stealth signer
    expect(classifyPayment(1_000_000n, undefined)).toBe('unconfirmed');
    const signer = makeSigner();
    const net = await backend.userDecrypt({ chainId: 31337, contract: TOKEN, handle: meta?.amountHandle as Hex, signer });
    const fee = 1_234_567n / 400n;
    expect(net).toBe(1_234_567n - fee);
    expect(signer.calls).toBe(1);
    expect(classifyPayment(1_000_000n, net)).toBe('confirmed');

    // sweep: confidential transfer of the whole balance to a fresh destination
    const bal = ledger.confidentialBalanceOf(TOKEN, STEALTH);
    const sweep = backend.buildConfidentialTransfer({ chainId: 31337, token: TOKEN, to: DEST, amountHandle: bal });
    ledger.execute(sweep, STEALTH, NOW + 10);
    expect(ledger.balanceOf(TOKEN, STEALTH)).toBe(0n);
    expect(ledger.balanceOf(TOKEN, DEST)).toBe(net);
    expect(ledger.balanceOf(TOKEN, ROUTER)).toBe(fee);
    expect(ledger.balanceOf(TOKEN, PAYER)).toBe(10_000_000n - 1_234_567n);
  });

  it('forwards the ETH buffer and emits no plaintext amount in any event', async () => {
    const { ledger, backend } = setup();
    approve(backend, ledger);
    const gross = 7_777_777n;
    const r = await pay(backend, ledger, { gross, bufferWei: 5n });
    expect(ledger.ethOf(STEALTH)).toBe(5n);
    const secrets = new Set([gross, gross - gross / 400n, gross / 400n]);
    for (const e of r.events) {
      for (const v of Object.values(e.args)) {
        if (typeof v === 'bigint') expect(secrets.has(v)).toBe(false);
      }
      expect(JSON.stringify(e.args, (_k, v) => (typeof v === 'bigint' ? v.toString() : (v as unknown))).includes(gross.toString())).toBe(false);
    }
  });

  it('silent zero transfer: insufficient payer balance gives a decrypted 0 (CT-PAY-6)', async () => {
    const { ledger, backend } = setup(100n);
    approve(backend, ledger);
    const r = await pay(backend, ledger, { gross: 5_000_000n });
    const handle = r.returned as Hex;
    const net = await backend.userDecrypt({ chainId: 31337, contract: TOKEN, handle, signer: makeSigner() });
    expect(net).toBe(0n);
    expect(classifyPayment(1n, net)).toBe('failed_insufficient_balance');
    expect(ledger.balanceOf(TOKEN, PAYER)).toBe(100n);
  });

  it('ACL: fee recipient and strangers cannot decrypt the per-payment handle; payer can', async () => {
    const { ledger, backend } = setup();
    approve(backend, ledger);
    const r = await pay(backend, ledger, { gross: 2_000_000n });
    const handle = r.returned as Hex;
    expect(ledger.isAllowed(handle, FEE_RECIPIENT)).toBe(false);
    for (const who of [FEE_RECIPIENT, OTHER]) {
      const s = makeSigner(`0x${'0b'.repeat(32)}`);
      await expect(
        backend.userDecrypt({ chainId: 31337, contract: TOKEN, handle, signer: { ...s, address: who, withKey: s.withKey } }),
      ).rejects.toMatchObject({ code: 'ACL_DENIED' });
    }
    const payer = { address: PAYER, withKey: makeSigner().withKey };
    expect(await backend.userDecrypt({ chainId: 31337, contract: TOKEN, handle, signer: payer })).toBe(2_000_000n - 5000n);
  });

  it('zero handle decrypts to 0 without ACL', async () => {
    const { backend } = setup();
    expect(await backend.userDecrypt({ chainId: 31337, contract: TOKEN, handle: `0x${'00'.repeat(32)}`, signer: makeSigner() })).toBe(0n);
  });

  it('fee epoch: aggregates and flushes once per epoch; the recipient sees only the sum', async () => {
    const { ledger, backend } = setup();
    approve(backend, ledger);
    await pay(backend, ledger, { gross: 4_000_000n });
    approve(backend, ledger, NOW + 10);
    await pay(backend, ledger, { gross: 2_000_000n }, NOW + 10);
    const flush = {
      to: ROUTER,
      value: 0n,
      data: (await import('viem')).encodeFunctionData({ abi: (await import('./abi.js')).ROUTER_ABI, functionName: 'flushFees', args: [TOKEN] }),
    } as const;
    expect(code(() => ledger.execute(flush, OTHER, NOW + 20))).toContain('FlushTooEarly');
    const r = ledger.execute(flush, OTHER, NOW + LEDGER_FEE_EPOCH + 1);
    expect(ledger.balanceOf(TOKEN, FEE_RECIPIENT)).toBe(10_000n + 5_000n);
    expect(ledger.balanceOf(TOKEN, ROUTER)).toBe(0n);
    expect(r.events.at(-1)?.name).toBe('FeesFlushed');
    expect(code(() => ledger.execute(flush, OTHER, NOW + LEDGER_FEE_EPOCH + 2))).toContain('FlushTooEarly');
    // a payment after an idle period restarts the epoch: it cannot be flushed on its own
    const later = NOW + 20 * LEDGER_FEE_EPOCH;
    approve(backend, ledger, later);
    await pay(backend, ledger, { gross: 2_000_000n, deadline: BigInt(later + 3600) }, later);
    expect(code(() => ledger.execute(flush, OTHER, later + 1))).toContain('FlushTooEarly');
    ledger.execute(flush, OTHER, later + LEDGER_FEE_EPOCH);
    expect(ledger.balanceOf(TOKEN, FEE_RECIPIENT)).toBe(15_000n + 5_000n);
    // unknown token and unpaid token
    const bad = { ...flush, data: (await import('viem')).encodeFunctionData({ abi: (await import('./abi.js')).ROUTER_ABI, functionName: 'flushFees', args: [OTHER] }) };
    expect(code(() => ledger.execute(bad, OTHER, NOW))).toContain('TokenNotAllowed');
  });

  it('router reverts follow the contract: expiry, stealth, key, buffer, token, operator, input binding', async () => {
    const { ledger, backend } = setup();
    // operator not set
    expect(await pay(backend, ledger).then(() => 'ok', (e: unknown) => (e as Error).message)).toContain('NotOperator');
    approve(backend, ledger);

    const run = async (over: Record<string, unknown>, value?: bigint, now = NOW, from: Address = PAYER) => {
      const tx = await backend.buildPayCalldata(payParams(over));
      return code(() => ledger.execute({ ...tx, value: value ?? tx.value }, from, now));
    };
    expect(await run({}, undefined, NOW + 7200)).toContain('Expired');
    // operator expired (deadline long)
    expect(await run({ deadline: BigInt(NOW + 100_000) }, undefined, NOW + 601)).toContain('NotOperator');
    expect(await run({}, 5n)).toContain('BufferTooLarge');
    // stealth == fee recipient (builder allows it; router refuses)
    expect(await run({ stealth: FEE_RECIPIENT })).toContain('InvalidStealth');
    // input made for another payer
    ledger.execute(backend.buildSetOperator({ chainId: 31337, token: TOKEN, operator: ROUTER, until: NOW + 600, nowSec: NOW }), OTHER, NOW);
    expect(await run({}, undefined, NOW, OTHER)).toContain('invalid input proof');
    // unknown token
    ledger.deployToken(OTHER);
    expect(await run({ token: OTHER })).toContain('TokenNotAllowed');
  });

  it('refuses bad ephemeral keys and zero stealth at the router when calldata is hand-crafted', async () => {
    const { ledger, backend } = setup();
    approve(backend, ledger);
    const { encodeFunctionData } = await import('viem');
    const { ROUTER_ABI } = await import('./abi.js');
    const enc = await backend.encryptAmount({ chainId: 31337, contract: ROUTER, user: PAYER, amount: 5n });
    const mk = (stealth: Address, eph: Hex) => ({
      to: ROUTER,
      value: 0n,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: 'payConfidential',
        args: [TOKEN, stealth, enc.handle, enc.inputProof, BigInt(NOW + 100), 0n, eph, '0x00'],
      }),
    });
    expect(code(() => ledger.execute(mk(STEALTH, '0x02'), PAYER, NOW))).toContain('InvalidEphemeralKey');
    expect(code(() => ledger.execute(mk('0x0000000000000000000000000000000000000000', EPH), PAYER, NOW))).toContain('InvalidStealth');
    expect(code(() => ledger.execute(mk(ROUTER, EPH), PAYER, NOW))).toContain('InvalidStealth');
    // proof mismatch (valid handle, wrong proof)
    const forged = { ...mk(STEALTH, EPH), data: mk(STEALTH, EPH).data.replace(enc.inputProof.slice(2), '11'.repeat(32)) as Hex };
    expect(code(() => ledger.execute(forged, PAYER, NOW))).toContain('invalid input proof');
  });
});

describe('CT-M token operations', () => {
  it('confidentialTransfer requires ACL on the handle', () => {
    const { ledger, backend } = setup();
    const mine = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const tx = backend.buildConfidentialTransfer({ chainId: 31337, token: TOKEN, to: DEST, amountHandle: mine });
    expect(code(() => ledger.execute(tx, OTHER, NOW))).toContain('ERC7984UnauthorizedUseOfEncryptedAmount');
    ledger.execute(tx, PAYER, NOW);
    expect(ledger.balanceOf(TOKEN, DEST)).toBe(10_000_000n);
  });

  it('unwrap -> publicDecrypt -> finalizeUnwrap pays the plaintext amount once', async () => {
    const { ledger, backend } = setup(5_000n);
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const unwrap = backend.buildUnwrap({ chainId: 31337, token: TOKEN, from: PAYER, to: DEST, amountHandle: bal });
    const r = ledger.execute(unwrap, PAYER, NOW);
    expect(ledger.balanceOf(TOKEN, PAYER)).toBe(0n);
    const id = r.returned as Hex;
    expect(r.events.some((e) => e.name === 'UnwrapRequested')).toBe(true);
    const fin = await backend.finalizeUnwrap({ chainId: 31337, token: TOKEN, requestId: id });
    ledger.execute(fin, OTHER, NOW + 1);
    expect(ledger.underlyingOf(TOKEN, DEST)).toBe(5_000n);
    expect(code(() => ledger.execute(fin, OTHER, NOW + 2))).toContain('InvalidUnwrapRequest');
  });

  it('unwrap by an operator, and refusal without rights or ACL', () => {
    const { ledger, backend } = setup(5_000n);
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const unwrap = backend.buildUnwrap({ chainId: 31337, token: TOKEN, from: PAYER, to: DEST, amountHandle: bal });
    // OTHER is not allowed on the handle
    expect(code(() => ledger.execute(unwrap, OTHER, NOW))).toContain('ERC7984UnauthorizedUseOfEncryptedAmount');
    // allowed handle but not operator: use a handle OTHER is allowed on (its own balance)
    ledger.wrap(TOKEN, OTHER, 10n);
    const own = ledger.confidentialBalanceOf(TOKEN, OTHER);
    const stealing = backend.buildUnwrap({ chainId: 31337, token: TOKEN, from: PAYER, to: OTHER, amountHandle: own });
    expect(code(() => ledger.execute(stealing, OTHER, NOW))).toContain('ERC7984UnauthorizedSpender');
    // grant operator rights, then it works
    ledger.execute(backend.buildSetOperator({ chainId: 31337, token: TOKEN, operator: OTHER, until: NOW + 100, nowSec: NOW }), PAYER, NOW);
    ledger.execute(stealing, OTHER, NOW + 1);
    expect(ledger.balanceOf(TOKEN, PAYER)).toBe(4_990n);
  });

  it('finalizeUnwrap needs a publicly decryptable handle and a matching proof', async () => {
    const { ledger, backend } = setup(5_000n);
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    await expect(backend.finalizeUnwrap({ chainId: 31337, token: TOKEN, requestId: bal })).rejects.toMatchObject({ code: 'ACL_DENIED' });
    await expect(backend.finalizeUnwrap({ chainId: 31337, token: TOKEN, requestId: `0x${'77'.repeat(32)}` })).rejects.toMatchObject({ code: 'LEDGER_REVERT' });
    const r = ledger.execute(backend.buildUnwrap({ chainId: 31337, token: TOKEN, from: PAYER, to: DEST, amountHandle: bal }), PAYER, NOW);
    const id = r.returned as Hex;
    const good = await backend.finalizeUnwrap({ chainId: 31337, token: TOKEN, requestId: id });
    const forged = { ...good, data: good.data.slice(0, -4) + '0000' } as typeof good;
    expect(code(() => ledger.execute(forged, OTHER, NOW))).toMatch(/invalid decryption proof|InvalidUnwrapRequest|ADDRESS/);
  });
});

describe('CT-M guards', () => {
  it('describes itself honestly', () => {
    expect(CTM_INFO.trust).toBe('none');
    expect(CTM_INFO.maturity).toBe('test-double');
    expect(CTM_INFO.whatItHides).toEqual([]);
    expect(CTM_INFO.whatItDoesNotHide).toContain('CT_M_NO_PRIVACY');
    for (const k of NOT_PROTECTED_KEYS) expect(CTM_INFO.whatItDoesNotHide).toContain(k);
  });

  it('refuses every chain except 31337 on every entry point', async () => {
    const { backend } = setup();
    const H: Hex = `0x${'ab'.repeat(32)}`;
    for (const chainId of [1, 8453, 84532, 11155111]) {
      await expect(backend.encryptAmount({ chainId, contract: ROUTER, user: PAYER, amount: 1n })).rejects.toBeInstanceOf(CtError);
      await expect(backend.buildPayCalldata(payParams({ chainId }))).rejects.toBeInstanceOf(CtError);
      expect(() => backend.buildSetOperator({ chainId, token: TOKEN, operator: ROUTER, until: NOW + 1, nowSec: NOW })).toThrow(CtError);
      await expect(backend.userDecrypt({ chainId, contract: TOKEN, handle: H, signer: makeSigner() })).rejects.toBeInstanceOf(CtError);
      expect(() => backend.buildConfidentialTransfer({ chainId, token: TOKEN, to: DEST, amountHandle: H })).toThrow(CtError);
      expect(() => backend.buildUnwrap({ chainId, token: TOKEN, from: PAYER, to: DEST, amountHandle: H })).toThrow(CtError);
      await expect(backend.finalizeUnwrap({ chainId, token: TOKEN, requestId: H })).rejects.toBeInstanceOf(CtError);
    }
  });

  it('validates amounts, handles and the ledger input range', async () => {
    const { backend, ledger } = setup();
    await expect(backend.encryptAmount({ chainId: 31337, contract: ROUTER, user: PAYER, amount: 1n << 64n })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(backend.userDecrypt({ chainId: 31337, contract: TOKEN, handle: '0x12', signer: makeSigner() })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(() => ledger.wrap(TOKEN, PAYER, -1n)).toThrow(/out of range/);
    expect(() => ledger.registerInput(PAYER, ROUTER, 1n << 64n)).toThrow(/out of range/);
    expect(() => ledger.peek(`0x${'12'.repeat(32)}`)).toThrow(/unknown handle/);
    expect(() => ledger.balanceOf(OTHER, PAYER)).toThrow(/unknown token/);
    expect(() => ledger.execute({ to: OTHER, value: 0n, data: '0x' }, PAYER, NOW)).toThrow(/unknown contract/);
    expect(ledger.confidentialBalanceOf(TOKEN, OTHER)).toBe(`0x${'00'.repeat(32)}`);
    expect(ledger.ethOf(OTHER)).toBe(0n);
    expect(ledger.underlyingOf(TOKEN, OTHER)).toBe(0n);
  });

  it('uses fresh random handles by default and detects a colliding source', () => {
    const l = new CleartextLedger();
    l.deployToken(TOKEN);
    l.wrap(TOKEN, PAYER, 1n);
    const dup = new CleartextLedger(() => new Uint8Array(32).fill(7));
    dup.deployToken(TOKEN);
    dup.wrap(TOKEN, PAYER, 1n);
    expect(() => dup.wrap(TOKEN, PAYER, 1n)).toThrow(/collision/);
  });
});
