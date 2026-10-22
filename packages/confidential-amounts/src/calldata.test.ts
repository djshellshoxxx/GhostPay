import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeFunctionData, toFunctionSelector, type AbiFunction, type Hex } from 'viem';
import { ROUTER_ABI, TOKEN_ABI } from './abi.js';
import {
  assertAmount,
  assertEphemeralKey,
  assertOperatorWindow,
  encodeConfidentialTransfer,
  encodeFinalizeUnwrap,
  encodePayConfidential,
  encodeSetOperator,
  encodeUnwrap,
  validatePayParams,
} from './calldata.js';
import { CtError } from './errors.js';
import { DEST, NOW, PAYER, ROUTER, TOKEN, EPH, payParams } from './fixtures.testutil.js';

const H: Hex = `0x${'cd'.repeat(32)}`;
const here = dirname(fileURLToPath(import.meta.url));
const abiDir = join(here, '..', '..', 'confidential-contracts', 'abi');
const haveArtifacts = existsSync(join(abiDir, 'GhostPayConfidentialRouter.json'));

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.unreachable();
  } catch (e) {
    expect(e).toBeInstanceOf(CtError);
    expect((e as CtError).code).toBe(code);
  }
}

describe('ABI matches the compiled contracts', () => {
  it.skipIf(!haveArtifacts)('every function in the TS ABIs exists with the same selector in the Hardhat artifacts', () => {
    const load = (n: string) => (JSON.parse(readFileSync(join(abiDir, `${n}.json`), 'utf8')) as { abi: AbiFunction[] }).abi;
    const selectors = (abi: readonly { type: string }[]) =>
      new Set((abi as AbiFunction[]).filter((x) => x.type === 'function').map((x) => toFunctionSelector(x)));
    const router = selectors(load('GhostPayConfidentialRouter'));
    const token = selectors(load('GhostPayTestConfidentialToken'));
    for (const f of ROUTER_ABI.filter((x) => x.type === 'function')) expect(router.has(toFunctionSelector(f)), f.name).toBe(true);
    for (const f of TOKEN_ABI.filter((x) => x.type === 'function')) expect(token.has(toFunctionSelector(f)), f.name).toBe(true);
  });
});

describe('operator window (CT-PAY-2)', () => {
  it('accepts (now, now+900]', () => {
    expect(() => assertOperatorWindow(NOW + 1, NOW)).not.toThrow();
    expect(() => assertOperatorWindow(NOW + 900, NOW)).not.toThrow();
  });
  it('refuses past, equal and too-long windows', () => {
    expectCode(() => assertOperatorWindow(NOW, NOW), 'OPERATOR_WINDOW');
    expectCode(() => assertOperatorWindow(NOW - 5, NOW), 'OPERATOR_WINDOW');
    expectCode(() => assertOperatorWindow(NOW + 901, NOW), 'OPERATOR_WINDOW');
  });
  it('refuses non-integers and uint48 overflow', () => {
    expectCode(() => assertOperatorWindow(1.5, 1), 'INVALID_INPUT');
    expectCode(() => assertOperatorWindow(2 ** 49, 2 ** 49 - 10), 'INVALID_INPUT');
  });
  it('encodeSetOperator encodes the token call', () => {
    const tx = encodeSetOperator({ token: TOKEN, operator: ROUTER, until: NOW + 600, nowSec: NOW });
    expect(tx.to).toBe(TOKEN);
    expect(tx.value).toBe(0n);
    const d = decodeFunctionData({ abi: TOKEN_ABI, data: tx.data });
    expect(d.functionName).toBe('setOperator');
    expect(d.args).toEqual([ROUTER, NOW + 600]);
    expectCode(() => encodeSetOperator({ token: TOKEN, operator: ROUTER, until: NOW + 7200, nowSec: NOW }), 'OPERATOR_WINDOW');
  });
});

describe('payConfidential calldata', () => {
  it('encodes all arguments and forwards the buffer as value', () => {
    const p = payParams({ bufferWei: 123n, viewTag: 7 });
    const tx = encodePayConfidential(p, { handle: H, inputProof: '0x1234' });
    expect(tx.to).toBe(ROUTER);
    expect(tx.value).toBe(123n);
    const d = decodeFunctionData({ abi: ROUTER_ABI, data: tx.data });
    expect(d.functionName).toBe('payConfidential');
    expect(d.args).toEqual([TOKEN, p.stealth, H, '0x1234', p.deadline, 123n, EPH, '0x07']);
  });

  it('validates every parameter', () => {
    expectCode(() => validatePayParams(payParams({ gross: 0n })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ gross: 1n << 64n })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ viewTag: 256 })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ ephemeralPubKey: `0x04${'11'.repeat(32)}` })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ deadline: 0n })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ bufferWei: -1n })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ stealth: ROUTER })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ stealth: TOKEN })), 'INVALID_INPUT');
    expectCode(() => validatePayParams(payParams({ router: '0x12' })), 'INVALID_INPUT');
    expectCode(() => encodePayConfidential(payParams(), { handle: '0x12', inputProof: '0x' }), 'INVALID_INPUT');
  });

  it('assertAmount / assertEphemeralKey', () => {
    expect(() => assertAmount(0n, 'a', true)).not.toThrow();
    expectCode(() => assertAmount(0n, 'a', false), 'INVALID_INPUT');
    expectCode(() => assertAmount(-1n, 'a', true), 'INVALID_INPUT');
    expectCode(() => assertAmount(5 as unknown as bigint, 'a', true), 'INVALID_INPUT');
    expect(() => assertEphemeralKey(`0x03${'00'.repeat(32)}`)).not.toThrow();
    expectCode(() => assertEphemeralKey('0x02'), 'INVALID_INPUT');
  });
});

describe('transfer, unwrap and finalize calldata', () => {
  it('confidentialTransfer', () => {
    const tx = encodeConfidentialTransfer({ token: TOKEN, to: DEST, amountHandle: H });
    expect(decodeFunctionData({ abi: TOKEN_ABI, data: tx.data }).args).toEqual([DEST, H]);
    expectCode(() => encodeConfidentialTransfer({ token: TOKEN, to: DEST, amountHandle: '0x1' }), 'INVALID_INPUT');
  });
  it('unwrap', () => {
    const tx = encodeUnwrap({ token: TOKEN, from: PAYER, to: DEST, amountHandle: H });
    expect(decodeFunctionData({ abi: TOKEN_ABI, data: tx.data }).args).toEqual([PAYER, DEST, H]);
    expectCode(() => encodeUnwrap({ token: TOKEN, from: PAYER, to: DEST, amountHandle: '0x1' }), 'INVALID_INPUT');
  });
  it('finalizeUnwrap', () => {
    const tx = encodeFinalizeUnwrap({ token: TOKEN, requestId: H, cleartext: 42n, decryptionProof: '0xaabb' });
    expect(decodeFunctionData({ abi: TOKEN_ABI, data: tx.data }).args).toEqual([H, 42n, '0xaabb']);
    expectCode(() => encodeFinalizeUnwrap({ token: TOKEN, requestId: H, cleartext: -1n, decryptionProof: '0x' }), 'INVALID_INPUT');
    expectCode(() => encodeFinalizeUnwrap({ token: TOKEN, requestId: '0x1', cleartext: 1n, decryptionProof: '0x' }), 'INVALID_INPUT');
  });
});
