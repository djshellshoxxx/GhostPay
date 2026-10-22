import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { policyHash, type MultisigPolicy } from './policy.js';
import type { CancelProposal, ConfigProposal, PayoutProposal, RefundProposal } from './proposal.js';

/** Fake test-only secret keys: 32 bytes of the same value. NEVER use real keys. */
export function fakeKey(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

export function pub(key: Uint8Array): string {
  return bytesToHex(secp256k1.getPublicKey(key, true));
}

export const K1 = fakeKey(1);
export const K2 = fakeKey(2);
export const K3 = fakeKey(3);
export const K4 = fakeKey(4);
export const K5 = fakeKey(5);

/** T0 = 2026-01-01T00:00:00Z. */
export const T0 = 1_767_225_600;
export const HOUR = 3600;
export const DAY = 86_400;

export function policy2of3(overrides: Partial<MultisigPolicy> = {}): MultisigPolicy {
  return {
    accountId: 'acme-shop',
    chainId: '8453',
    version: 0,
    signers: [
      { publicKey: pub(K1), controller: 'alice' },
      { publicKey: pub(K2), controller: 'bob' },
      { publicKey: pub(K3), controller: 'carol-hsm' },
    ],
    threshold: 2,
    timelocks: { payout: HOUR, refund: 0, config: DAY },
    ...overrides,
  };
}

export function payout(policy: MultisigPolicy, overrides: Partial<PayoutProposal> = {}): PayoutProposal {
  return {
    kind: 'payout',
    accountId: policy.accountId,
    chainId: policy.chainId,
    policyHash: policyHash(policy),
    nonce: '0',
    createdAt: T0,
    expiresAt: T0 + 7 * DAY,
    asset: 'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    to: '0x1111111111111111111111111111111111111111',
    amount: '250000000',
    ...overrides,
  };
}

export function refund(policy: MultisigPolicy, overrides: Partial<RefundProposal> = {}): RefundProposal {
  return {
    kind: 'refund',
    accountId: policy.accountId,
    chainId: policy.chainId,
    policyHash: policyHash(policy),
    nonce: '0',
    createdAt: T0,
    expiresAt: T0 + 7 * DAY,
    asset: 'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    to: '0x2222222222222222222222222222222222222222',
    amount: '19990000',
    invoiceId: 'inv_test_0001',
    ...overrides,
  };
}

export function config(policy: MultisigPolicy, overrides: Partial<ConfigProposal> = {}): ConfigProposal {
  return {
    kind: 'config',
    accountId: policy.accountId,
    chainId: policy.chainId,
    policyHash: policyHash(policy),
    nonce: '0',
    createdAt: T0,
    expiresAt: T0 + 14 * DAY,
    newPolicy: {
      signers: [
        { publicKey: pub(K1), controller: 'alice' },
        { publicKey: pub(K2), controller: 'bob' },
        { publicKey: pub(K4), controller: 'dave' },
      ],
      threshold: 2,
      timelocks: { payout: HOUR, refund: 0, config: DAY },
    },
    ...overrides,
  };
}

export function cancel(
  policy: MultisigPolicy,
  targetDigest: string,
  overrides: Partial<CancelProposal> = {},
): CancelProposal {
  return {
    kind: 'cancel',
    accountId: policy.accountId,
    chainId: policy.chainId,
    policyHash: policyHash(policy),
    nonce: '1',
    createdAt: T0,
    expiresAt: T0 + DAY,
    targetDigest,
    ...overrides,
  };
}
