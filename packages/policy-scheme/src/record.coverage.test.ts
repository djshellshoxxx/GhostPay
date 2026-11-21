import { describe, expect, it } from 'vitest';
import {
  PolicySchemeError, ZERO_ADDRESS, ZERO_HASH, buildPolicyRecord, limitLeafHash,
  policyCoversToken, type Address, type PolicySchemeErrorCode,
} from './index.js';
import { toLimits, vectors } from './fixtures.testutil.js';

function codeOf(fn: () => unknown): PolicySchemeErrorCode | 'no error' {
  try { fn(); return 'no error'; } catch (e) {
    if (e instanceof PolicySchemeError) return e.code;
    throw e;
  }
}

const acct = (id: string) => {
  const a = vectors.accounts.find((x) => x.id === id);
  if (a === undefined) throw new Error(id);
  const tree = vectors.limitTrees.find((t) => t.id === a.policy.tree);
  return {
    metaAddress: a.metaAddress,
    policy: { destination: a.policy.destination, delaySeconds: BigInt(a.policy.delaySeconds), limitsRoot: a.policy.limitsRoot },
    limits: tree === undefined ? [] : toLimits(tree),
  };
};

describe('policy token coverage (SEC-11)', () => {
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address;
  it('a policy without limits (limitsRoot zero) can withdraw any token and the native coin', () => {
    const rec = buildPolicyRecord(acct('acct-002'));
    expect(rec.policy.limitsRoot).toBe(ZERO_HASH);
    expect(policyCoversToken(rec, 'native')).toBe(true);
    expect(policyCoversToken(rec, ZERO_ADDRESS)).toBe(true);
    expect(policyCoversToken(rec, DAI)).toBe(true);
  });
  it('a policy with limits covers exactly its leaves; any other asset can never be withdrawn', () => {
    const twoLeaves = buildPolicyRecord(acct('acct-001')); // tree-2: native and USDC
    expect(policyCoversToken(twoLeaves, 'native')).toBe(true);
    expect(policyCoversToken(twoLeaves, ZERO_ADDRESS)).toBe(true);
    expect(policyCoversToken(twoLeaves, USDC)).toBe(true);
    expect(policyCoversToken(twoLeaves, USDC.toLowerCase() as Address)).toBe(true);
    expect(policyCoversToken(twoLeaves, DAI)).toBe(false);
    const nativeOnly = buildPolicyRecord(acct('acct-004')); // tree-1: native only (unlimited)
    expect(policyCoversToken(nativeOnly, 'native')).toBe(true);
    expect(policyCoversToken(nativeOnly, USDC)).toBe(false);
  });
  it('fails closed on a record whose tree is missing or does not match its limits root', () => {
    const rec = buildPolicyRecord(acct('acct-001'));
    expect(policyCoversToken({ ...rec, tree: null }, USDC)).toBe(false);
    expect(policyCoversToken({ ...rec, policy: { ...rec.policy, limitsRoot: `0x${'11'.repeat(32)}` } }, USDC)).toBe(false);
  });
  it('fails closed on a hand-built tree whose leaf for the token is not provably in the limits root', () => {
    const rec = buildPolicyRecord(acct('acct-001')); // tree-2: native and USDC
    const tree = rec.tree;
    if (tree === null) throw new Error('fixture has no tree');
    const usdcLeaf = tree.leaves.find((l) => l.token.toLowerCase() === USDC.toLowerCase());
    if (usdcLeaf === undefined) throw new Error('fixture has no USDC leaf');
    // An extra DAI entry reusing USDC's leaf hash: the stored root still matches, but the contract recomputes the leaf
    // from (token, limit, windowSeconds) and reverts with InvalidLimitProof.
    const reusedHash = { ...tree, leaves: [...tree.leaves, { ...usdcLeaf, token: DAI }] };
    expect(policyCoversToken({ ...rec, tree: reusedHash }, DAI)).toBe(false);
    // An extra DAI entry with its own correct leaf hash that is not in the tree.
    const daiLimit = { token: DAI, limit: usdcLeaf.limit, windowSeconds: usdcLeaf.windowSeconds };
    const notInTree = { ...tree, leaves: [...tree.leaves, { ...daiLimit, leaf: limitLeafHash(daiLimit) }] };
    expect(policyCoversToken({ ...rec, tree: notInTree }, DAI)).toBe(false);
    // The genuine leaves still verify.
    expect(policyCoversToken(rec, USDC)).toBe(true);
    expect(policyCoversToken(rec, 'native')).toBe(true);
  });
  it('refuses a malformed token', () => {
    const rec = buildPolicyRecord(acct('acct-002'));
    expect(codeOf(() => policyCoversToken(rec, '0xnope'))).toBe('INVALID_ADDRESS');
  });
});

it('fails closed on malformed or duplicate leaves while retaining the committed root', () => {
  const record = buildPolicyRecord(acct('acct-001'));
  const tree = record.tree;
  if (tree === null) throw new Error('fixture has no tree');
  const first = tree.leaves[0];
  if (first === undefined) throw new Error('fixture has no leaves');
  expect(policyCoversToken({ ...record, tree: { ...tree, leaves: [...tree.leaves, first] } }, first.token)).toBe(false);
  const invalid = { ...tree, leaves: tree.leaves.map((leaf) => ({ ...leaf, limit: 0n })) };
  expect(policyCoversToken({ ...record, tree: invalid }, first.token)).toBe(false);
});
