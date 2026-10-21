import { describe, expect, it } from 'vitest';
import { keccak256, toFunctionSelector } from 'viem';
import {
  SELECTOR_PLAIN,
  SELECTOR_POLICY,
  buildErc20Metadata,
  decodeAndCheckPayload,
  decodeRouterPay,
  encodeRouterPay,
  parseAddress,
  routerFee,
  type PayArgs,
  type RouterTarget,
} from './routerTargets.js';
import { A } from './vectors.testutil.js';

const mismatch = (f: () => unknown) => expect(f).toThrowError(expect.objectContaining({ code: 'PAYLOAD_MISMATCH' }) as Error);

const plain: RouterTarget = { kind: 'ghostpay', address: A.router };
const policy: RouterTarget = { kind: 'policy', address: A.router, policy: { owner: A.owner, policyHash: `0x${'cd'.repeat(32)}` } };
const args = (gross = 1_000_000_000n): PayArgs => ({
  token: A.token,
  stealth: A.stealth,
  gross,
  minNet: gross - routerFee(gross),
  deadline: 1_700_086_400n,
  ephemeralPubKey: `0x02${'12'.repeat(32)}`,
  metadata: buildErc20Metadata(0xab, A.token, gross - routerFee(gross)),
});

describe('router selectors', () => {
  it('match the Solidity signatures', () => {
    expect(SELECTOR_PLAIN).toBe(toFunctionSelector('payERC20(address,address,uint256,uint256,uint256,bytes,bytes)'));
    expect(SELECTOR_POLICY).toBe(toFunctionSelector('payERC20(address,address,(address,bytes32),uint256,uint256,uint256,bytes,bytes)'));
    expect(SELECTOR_PLAIN).not.toBe(SELECTOR_POLICY);
  });
});

describe('fee and metadata', () => {
  it('routerFee floors 25 bps and is 0 below 400', () => {
    expect(routerFee(1_000_000_000n)).toBe(2_500_000n);
    expect(routerFee(399n)).toBe(0n);
    expect(routerFee(400n)).toBe(1n);
    expect(() => routerFee(-1n)).toThrow();
  });
  it('buildErc20Metadata is 57 bytes viewTag||0xa9059cbb||token||net', () => {
    const m = buildErc20Metadata(0xab, A.token, 5n);
    expect((m.length - 2) / 2).toBe(57);
    expect(m.startsWith('0xaba9059cbb')).toBe(true);
    expect(() => buildErc20Metadata(256, A.token, 5n)).toThrow();
    expect(() => buildErc20Metadata(1, A.token, -1n)).toThrow();
  });
});

describe('encode / decode / review', () => {
  it('round-trips both routers', () => {
    const p = decodeRouterPay(encodeRouterPay(plain, args()));
    expect(p).toMatchObject({ kind: 'ghostpay', token: A.token, stealth: A.stealth, gross: 1_000_000_000n });
    const q = decodeRouterPay(encodeRouterPay(policy, args()));
    expect(q).toMatchObject({ kind: 'policy', gross: 1_000_000_000n });
  });
  it('refuses zero gross', () => {
    expect(() => encodeRouterPay(plain, args(0n))).toThrow();
  });
  it('decode rejects short, foreign-selector and truncated calldata', () => {
    mismatch(() => decodeRouterPay('0x'));
    mismatch(() => decodeRouterPay('0xdeadbeef'));
    mismatch(() => decodeRouterPay(SELECTOR_PLAIN));
    mismatch(() => decodeRouterPay(`${SELECTOR_POLICY}00`));
    mismatch(() => decodeRouterPay('nothex' as `0x${string}`));
  });
  it('review passes for matching fields and fails on every difference', () => {
    const fields = { token: A.token, stealth: A.stealth, gross: 1_000_000_000n };
    const data = encodeRouterPay(plain, args());
    expect(() => decodeAndCheckPayload(plain, data, fields)).not.toThrow();
    mismatch(() => decodeAndCheckPayload(plain, data, { ...fields, token: A.router }));
    mismatch(() => decodeAndCheckPayload(plain, data, { ...fields, stealth: A.router }));
    mismatch(() => decodeAndCheckPayload(plain, data, { ...fields, gross: 1n }));
    mismatch(() => decodeAndCheckPayload(policy, data, fields)); // kind differs
    const pdata = encodeRouterPay(policy, args());
    expect(() => decodeAndCheckPayload(policy, pdata, fields)).not.toThrow();
    mismatch(() => decodeAndCheckPayload({ ...policy, policy: { ...policy.policy, owner: A.payer } }, pdata, fields));
    mismatch(() => decodeAndCheckPayload({ ...policy, policy: { ...policy.policy, policyHash: `0x${'00'.repeat(32)}` } }, pdata, fields));
    mismatch(() => decodeAndCheckPayload(plain, pdata, fields));
  });
  it('payload hash of the calldata is stable', () => {
    expect(keccak256(encodeRouterPay(plain, args()))).toBe(keccak256(encodeRouterPay(plain, args())));
  });
  it('parseAddress checksums and rejects junk', () => {
    expect(parseAddress(A.router.toLowerCase())).toBe(A.router);
    expect(() => parseAddress(5)).toThrowError(expect.objectContaining({ code: 'BAD_REQUEST' }) as Error);
    expect(() => parseAddress('0x12')).toThrowError(expect.objectContaining({ code: 'BAD_REQUEST' }) as Error);
  });
});
