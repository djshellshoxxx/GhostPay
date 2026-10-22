// Killer tests for surviving Stryker mutants in packages/policy-scheme. Drop into packages/policy-scheme/src/.
import { parseCompressedPoint, secretScalarFromBytes } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import {
  PolicySchemeError,
  ZERO_HASH,
  buildLimitsTree,
  buildPolicyPaymentTx,
  buildWithdrawTypedData,
  checkScheme2Announcement,
  decodeScheme2MetaAddress,
  deriveScheme2Payment,
  getLimitProof,
  validatePolicy,
  type Address,
  type PolicyPaymentInput,
} from './index.js';
import { hexBytes, scriptedRng, vectors, type VectorAccount } from './fixtures.testutil.js';

const dep = { factory: vectors.deployment.factory, implementation: vectors.deployment.implementation };
const A = vectors.accounts[0] as VectorAccount;
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DEST: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const ROUTER: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const FEE: Address = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

const code = (f: () => unknown): string => {
  try { f(); } catch (e) { if (e instanceof PolicySchemeError) return e.code; return `other:${(e as Error).name}`; }
  return 'no error';
};

describe('killers: policy-scheme limit/delay boundaries', () => {
  const tree = buildLimitsTree([{ token: USDC, limit: 1000n, windowSeconds: 86400n }]);
  const order = (amount: bigint, nonce = 1n) => () =>
    buildWithdrawTypedData({ chainId: 31337, account: A.accountAddress, token: USDC, amount, deadline: 2n ** 40n, nonce, limit: { limitsRoot: tree.root, proof: getLimitProof(tree, USDC) } });
  it('amount == limit is signable, limit + 1 is not (eip712.ts:230)', () => {
    expect(code(order(1000n))).toBe('no error');
    expect(code(order(1001n))).toBe('INVALID_LIMIT');
    expect(code(order(0n))).toBe('INVALID_INPUT');
  });
  it('nonce 0 and deadline 0 are legal uints (types.ts:54)', () => {
    expect(code(order(1n, 0n))).toBe('no error');
  });
  it('delay window is inclusive [1 h, 30 d] (policy.ts:78)', () => {
    const p = (d: bigint) => () => validatePolicy({ destination: DEST, delaySeconds: d, limitsRoot: ZERO_HASH });
    expect(code(p(3600n))).toBe('no error');
    expect(code(p(3599n))).toBe('INVALID_DELAY');
    expect(code(p(30n * 86400n))).toBe('no error');
    expect(code(p(30n * 86400n + 1n))).toBe('INVALID_DELAY');
    expect(code(() => validatePolicy({ destination: DEST, delaySeconds: 3600 as never, limitsRoot: ZERO_HASH }))).toBe('INVALID_DELAY');
  });
});

describe('killers: policy-scheme input typing (arrays/objects that stringify to valid hex must not slip through)', () => {
  it('bytes32 rejects array-wrapped hex with a typed error, not a TypeError (types.ts:42)', () => {
    expect(code(() => validatePolicy({ destination: DEST, delaySeconds: 3600n, limitsRoot: [ZERO_HASH] as never }))).toBe('INVALID_HEX');
  });
  it('hexBytes rejects array-wrapped permit signature (types.ts:48)', () => {
    const payment = deriveScheme2Payment(A.metaAddress, dep, scriptedRng([hexBytes(A.ephemeralPrivateKey)]));
    const input: PolicyPaymentInput = { router: ROUTER, feeRecipient: FEE, deployment: dep, payment, token: USDC, gross: 1_000_000n, deadline: 100n, permitSignature: [`0x${'11'.repeat(32)}${'22'.repeat(32)}1b`] as never };
    expect(code(() => buildPolicyPaymentTx(input))).toBe('INVALID_HEX');
  });
  it('decodeScheme2MetaAddress rejects a non-string that coerces to a valid string (meta.ts:59)', () => {
    expect(code(() => decodeScheme2MetaAddress([A.metaAddress] as never))).toBe('INVALID_META_ADDRESS');
  });
  it('PolicySchemeError without a field has no ": undefined" suffix (errors.ts:49)', () => {
    expect(new PolicySchemeError('INVALID_PROOF').message).not.toContain('undefined');
    expect(new PolicySchemeError('INVALID_PROOF', 'f').message).toMatch(/: f$/);
  });
});

describe('killers: policy-scheme router', () => {
  const payment = deriveScheme2Payment(A.metaAddress, dep, scriptedRng([hexBytes(A.ephemeralPrivateKey)]));
  const base: PolicyPaymentInput = { router: ROUTER, feeRecipient: FEE, deployment: dep, payment, token: USDC, gross: 1_000_000n, deadline: 100n };
  it('rejects fee recipient == stealth account and router == stealth account (router.ts:93)', () => {
    expect(code(() => buildPolicyPaymentTx({ ...base, feeRecipient: payment.accountAddress }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, router: payment.accountAddress }))).toBe('INVALID_INPUT');
  });
  it('minNet must be a bigint in [1, net] (router.ts:98)', () => {
    expect(code(() => buildPolicyPaymentTx({ ...base, minNet: 5 as never }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, minNet: 0n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, minNet: 997_501n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, minNet: 997_500n }))).toBe('no error');
  });
  it('deadline must be strictly after now, and only checked when now is given (router.ts:100)', () => {
    expect(code(() => buildPolicyPaymentTx({ ...base, deadline: 100n, now: 100n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, deadline: 100n, now: 101n }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, deadline: 101n, now: 100n }))).toBe('no error');
    expect(code(() => buildPolicyPaymentTx({ ...base, deadline: 0n }))).toBe('no error');
  });
  it('permit and buffer are mutually exclusive, permit is exactly 65 bytes (router.ts:106,116)', () => {
    const sig65 = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;
    expect(code(() => buildPolicyPaymentTx({ ...base, permitSignature: sig65 as never, buffer: { bufferWei: 1n } }))).toBe('INVALID_INPUT');
    expect(code(() => buildPolicyPaymentTx({ ...base, permitSignature: sig65 as never }))).toBe('no error');
    expect(code(() => buildPolicyPaymentTx({ ...base, permitSignature: sig65.slice(0, -2) as never }))).toBe('INVALID_HEX');
    expect(code(() => buildPolicyPaymentTx({ ...base, permitSignature: `${sig65}00` as never }))).toBe('INVALID_HEX');
  });
});

describe('killers: policy-scheme scanner', () => {
  const view = secretScalarFromBytes(hexBytes(A.viewingPrivateKey));
  const spend = parseCompressedPoint(hexBytes(A.spendingPublicKey));
  const good = { stealthAddress: A.accountAddress, ephemeralPublicKey: A.ephemeralPublicKey, metadata: A.viewTag };
  const miscase = (a: string): string => {
    // flip the case of the first letter so the EIP-55 checksum no longer matches
    const i = a.slice(2).search(/[a-fA-F]/) + 2;
    const c = a[i]!;
    return a.slice(0, i) + (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()) + a.slice(i + 1);
  };
  it('accepts announced addresses with any hex casing, including a wrong EIP-55 checksum (derive.ts:116)', () => {
    const odd = miscase(A.accountAddress);
    expect(odd).not.toBe(A.accountAddress);
    expect(checkScheme2Announcement({ ...good, stealthAddress: odd }, view, spend, [A.policyHash], dep).matches).toBe(true);
    expect(checkScheme2Announcement({ ...good, stealthAddress: A.accountAddress.toLowerCase() }, view, spend, [A.policyHash], dep).matches).toBe(true);
  });
  it('metadata of the wrong type or non-hex content is "no match", never an exception (derive.ts:118)', () => {
    for (const metadata of [123, null, undefined, {}, ['0xab'], '0xzzzz', '0x1', '0x']) {
      expect(checkScheme2Announcement({ ...good, metadata } as never, view, spend, [A.policyHash], dep)).toEqual({ matches: false });
    }
  });
});
