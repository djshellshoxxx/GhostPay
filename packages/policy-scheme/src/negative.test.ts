import { GhostPayCryptoError, parseCompressedPoint, secretScalarFromBytes } from '@ghostpay/core-crypto';
import { decodeFunctionData, hashTypedData, recoverAddress } from 'viem/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PolicySchemeError,
  ZERO_ADDRESS,
  ZERO_HASH,
  buildCancelDestinationTypedData,
  buildCancelWithdrawTypedData,
  buildLimitsTree,
  buildProposeDestinationTypedData,
  buildWithdrawTypedData,
  checkScheme2Announcement,
  computePolicyHash,
  decodeScheme2MetaAddress,
  deriveScheme2OwnerKey,
  deriveScheme2Payment,
  encodeCancelDestination,
  encodeCancelWithdraw,
  encodeDeployAccount,
  encodeExecuteDestinationChange,
  encodeExecuteWithdraw,
  encodeProposeDestination,
  encodeRequestWithdraw,
  encodeScheme2MetaAddress,
  getLimitProof,
  limitLeafHash,
  noLimitsProof,
  policyAccountAbi,
  policyAccountFactoryAbi,
  predictAccountAddress,
  signPolicyTypedData,
  validatePolicy,
  verifyLimitProof,
  type Address,
  type Hex,
  type WithdrawTypedData,
} from './index.js';
import { hexBytes, vectors, type VectorAccount } from './fixtures.testutil.js';

const dep = { factory: vectors.deployment.factory, implementation: vectors.deployment.implementation };
const A = vectors.accounts[0] as VectorAccount;
const B = vectors.accounts[1] as VectorAccount;
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DEST: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const H1: Hex = `0x${'11'.repeat(32)}`;

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    if (e instanceof PolicySchemeError) return e.code;
    if (e instanceof GhostPayCryptoError) return `crypto:${e.code}`;
    throw e;
  }
  return 'no error';
}
async function acode(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
  } catch (e) {
    if (e instanceof PolicySchemeError) return e.code;
    throw e;
  }
  return 'no error';
}

describe('input validation', () => {
  it('addresses, hex and integers', () => {
    expect(code(() => computePolicyHash({ destination: 'nope' as Address, delaySeconds: 1n, limitsRoot: ZERO_HASH }))).toBe('INVALID_ADDRESS');
    expect(code(() => computePolicyHash({ destination: DEST.toLowerCase().replace('90f', '90F') as Address, delaySeconds: 1n, limitsRoot: ZERO_HASH }))).toBe('INVALID_ADDRESS');
    expect(code(() => computePolicyHash({ destination: DEST, delaySeconds: -1n, limitsRoot: ZERO_HASH }))).toBe('INVALID_INPUT');
    expect(code(() => computePolicyHash({ destination: DEST, delaySeconds: 1 as unknown as bigint, limitsRoot: ZERO_HASH }))).toBe('INVALID_INPUT');
    expect(code(() => computePolicyHash({ destination: DEST, delaySeconds: 1n, limitsRoot: '0x12' }))).toBe('INVALID_HEX');
    expect(code(() => predictAccountAddress({ ...dep, factory: ZERO_ADDRESS }, A.ownerAddress, A.policyHash))).toBe('INVALID_ADDRESS');
    expect(code(() => predictAccountAddress(dep, ZERO_ADDRESS, A.policyHash))).toBe('INVALID_ADDRESS');
    expect(code(() => policyChain(0))).toBe('INVALID_INPUT');
    expect(code(() => policyChain(1.5))).toBe('INVALID_INPUT');
    expect(new PolicySchemeError('INVALID_INPUT').message).toBe('invalid input');
  });

  it('validatePolicy mirrors the factory', () => {
    const p = { destination: DEST, delaySeconds: 3600n, limitsRoot: H1.toUpperCase().replace('0X', '0x') as Hex };
    expect(validatePolicy(p)).toEqual({ ...p, limitsRoot: H1 });
    expect(code(() => validatePolicy({ ...p, delaySeconds: 3599n }))).toBe('INVALID_DELAY');
    expect(code(() => validatePolicy({ ...p, delaySeconds: 2592001n }))).toBe('INVALID_DELAY');
    expect(code(() => validatePolicy({ ...p, delaySeconds: 3600 as unknown as bigint }))).toBe('INVALID_DELAY');
    expect(code(() => validatePolicy({ ...p, destination: ZERO_ADDRESS }))).toBe('INVALID_ADDRESS');
  });

  it('limits', () => {
    expect(code(() => limitLeafHash({ token: USDC, limit: 2n ** 256n, windowSeconds: 1n }))).toBe('INVALID_LIMIT');
    expect(code(() => limitLeafHash({ token: USDC, limit: 1n, windowSeconds: -1n }))).toBe('INVALID_LIMIT');
    expect(code(() => limitLeafHash({ token: USDC, limit: 1, windowSeconds: 1n } as never))).toBe('INVALID_LIMIT');
    expect(code(() => limitLeafHash({ token: USDC, limit: 1n, windowSeconds: 1 } as never))).toBe('INVALID_LIMIT');
    expect(code(() => buildLimitsTree(null as never))).toBe('EMPTY_TREE');
    expect(code(() => buildLimitsTree([{ token: 'x' as Address, limit: 1n, windowSeconds: 1n }]))).toBe('INVALID_ADDRESS');
    const t = buildLimitsTree([{ token: USDC, limit: 5n, windowSeconds: 9n }]);
    expect(t.root).toBe(t.leaves[0]?.leaf);
    expect(getLimitProof(t, USDC).proof).toEqual([]);
    expect(code(() => getLimitProof(t, ZERO_ADDRESS))).toBe('UNKNOWN_TOKEN');
    expect(code(() => getLimitProof(t, 'bad' as Address))).toBe('INVALID_ADDRESS');
    expect(code(() => verifyLimitProof(t.root, t.root, ['0x00']))).toBe('INVALID_HEX');
    expect(verifyLimitProof(t.root, H1, [])).toBe(false);
    expect(() => {
      (t.leaves as unknown as unknown[]).push(1);
    }).toThrow();
    // Tampered tree: proof self-check refuses it.
    const tampered = { ...t, root: H1 };
    expect(code(() => getLimitProof(tampered, USDC))).toBe('INVALID_PROOF');
    expect(noLimitsProof()).toEqual({ limit: 0n, windowSeconds: 0n, proof: [], leaf: ZERO_HASH });
  });
});

function policyChain(chainId: number): unknown {
  return buildCancelWithdrawTypedData(chainId, A.accountAddress, H1);
}

describe('meta-address', () => {
  const spend = parseCompressedPoint(hexBytes(A.spendingPublicKey));
  const view = parseCompressedPoint(hexBytes(A.viewingPublicKey));
  it('rejects malformed input', () => {
    expect(code(() => decodeScheme2MetaAddress(A.scheme1MetaAddress))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeScheme2MetaAddress(`${A.metaAddress}00`))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeScheme2MetaAddress(42 as unknown as string))).toBe('INVALID_META_ADDRESS');
    expect(code(() => decodeScheme2MetaAddress(A.metaAddress.replace(':0x02', ':0x05').replace(':0x03', ':0x05')))).toBe('crypto:INVALID_POINT');
    expect(code(() => encodeScheme2MetaAddress({ spendingPublicKey: spend, viewingPublicKey: spend, policyHash: H1 }))).toBe('INVALID_META_ADDRESS');
    expect(code(() => encodeScheme2MetaAddress({ spendingPublicKey: spend, viewingPublicKey: view, policyHash: ZERO_HASH }))).toBe('INVALID_META_ADDRESS');
    expect(code(() => encodeScheme2MetaAddress({ spendingPublicKey: spend, viewingPublicKey: view, policyHash: '0x1' }))).toBe('INVALID_HEX');
    expect(code(() => deriveScheme2Payment(A.metaAddress, { ...dep, implementation: 'x' as Address }))).toBe('INVALID_ADDRESS');
  });
  it('derives with the default RNG', () => {
    const p1 = deriveScheme2Payment(A.metaAddress, dep);
    const p2 = deriveScheme2Payment(A.metaAddress, dep);
    expect(p1.accountAddress).not.toBe(p2.accountAddress);
  });
});

describe('scanner never throws on hostile announcements', () => {
  const view = secretScalarFromBytes(hexBytes(A.viewingPrivateKey));
  const spendSecret = secretScalarFromBytes(hexBytes(A.spendingPrivateKey));
  const spend = parseCompressedPoint(hexBytes(A.spendingPublicKey));
  const good = { stealthAddress: A.accountAddress, ephemeralPublicKey: A.ephemeralPublicKey, metadata: A.viewTag };
  const flipTag = `0x${((parseInt(A.viewTag.slice(2), 16) + 1) % 256).toString(16).padStart(2, '0')}`;
  const cases: [string, object][] = [
    ['scheme 1', { ...good, schemeId: 1n }],
    ['bad address', { ...good, stealthAddress: '0x1234' }],
    ['non-string address', { ...good, stealthAddress: 7 }],
    ['bad R hex', { ...good, ephemeralPublicKey: '0xzz' }],
    ['non-string R', { ...good, ephemeralPublicKey: null }],
    ['R off curve', { ...good, ephemeralPublicKey: `0x05${'00'.repeat(32)}` }],
    ['empty metadata', { ...good, metadata: '0x' }],
    ['odd metadata', { ...good, metadata: '0x1' }],
    ['non-string metadata', { ...good, metadata: 1 }],
    ['wrong view tag', { ...good, metadata: flipTag }],
    ['other account', { ...good, stealthAddress: B.accountAddress }],
  ];
  for (const [name, ann] of cases) {
    it(name, () => {
      expect(checkScheme2Announcement(ann as never, view, spend, [A.policyHash], dep)).toEqual({ matches: false });
    });
  }
  it('matches the good one; key errors still throw', () => {
    expect(checkScheme2Announcement(good, view, spend, [A.policyHash], dep).matches).toBe(true);
    expect(code(() => checkScheme2Announcement(good, view, spend, ['0x00'], dep))).toBe('INVALID_HEX');
    expect(code(() => checkScheme2Announcement(good, view, spend, [A.policyHash], { ...dep, factory: ZERO_ADDRESS }))).toBe('INVALID_ADDRESS');
    expect(code(() => checkScheme2Announcement(good, new Uint8Array(32) as never, spend, [A.policyHash], dep))).toBe('crypto:INVALID_SCALAR');
    expect(code(() => checkScheme2Announcement(good, view, new Uint8Array(33) as never, [A.policyHash], dep))).toBe('crypto:INVALID_POINT');
    expect(code(() => deriveScheme2OwnerKey({ ...good, stealthAddress: B.accountAddress }, { viewingSecret: view, spendingSecret: spendSecret }, spend, [A.policyHash], dep))).toBe('NOT_MATCHED');
  });
});

describe('EIP-712 builders', () => {
  const tree = buildLimitsTree([
    { token: ZERO_ADDRESS, limit: 100n, windowSeconds: 60n },
    { token: USDC, limit: 10n, windowSeconds: 60n },
  ]);
  const native = getLimitProof(tree, ZERO_ADDRESS);
  const base = { chainId: 1, account: A.accountAddress, token: ZERO_ADDRESS, amount: 5n, deadline: 10n, nonce: 1n, limit: { limitsRoot: tree.root, proof: native } };
  it('refuses orders the contract would revert', () => {
    expect(code(() => buildWithdrawTypedData({ ...base, token: A.accountAddress }))).toBe('INVALID_INPUT');
    expect(code(() => buildWithdrawTypedData({ ...base, amount: 0n }))).toBe('INVALID_INPUT');
    expect(code(() => buildWithdrawTypedData({ ...base, amount: 2n ** 256n }))).toBe('INVALID_INPUT');
    expect(code(() => buildWithdrawTypedData({ ...base, amount: 101n }))).toBe('INVALID_LIMIT');
    expect(code(() => buildWithdrawTypedData({ ...base, limit: { limitsRoot: ZERO_HASH, proof: native } }))).toBe('INVALID_INPUT');
    expect(code(() => buildWithdrawTypedData({ ...base, limit: { limitsRoot: H1, proof: native } }))).toBe('INVALID_PROOF');
    expect(code(() => buildWithdrawTypedData({ ...base, chainId: 0 }))).toBe('INVALID_INPUT');
    expect(code(() => buildWithdrawTypedData({ ...base, account: ZERO_ADDRESS }))).toBe('INVALID_ADDRESS');
    const p = { chainId: 1, account: A.accountAddress, newDestination: DEST, deadline: 1n, nonce: 1n };
    expect(code(() => buildProposeDestinationTypedData({ ...p, newDestination: A.accountAddress }))).toBe('INVALID_INPUT');
    expect(code(() => buildProposeDestinationTypedData({ ...p, newDestination: ZERO_ADDRESS }))).toBe('INVALID_ADDRESS');
    expect(code(() => buildCancelDestinationTypedData(1, A.accountAddress, '0x'))).toBe('INVALID_HEX');
  });

  it('cancel types are distinct', () => {
    expect(buildCancelWithdrawTypedData(1, A.accountAddress, H1).digest).not.toBe(buildCancelDestinationTypedData(1, A.accountAddress, H1).digest);
    expect(buildCancelWithdrawTypedData(1, A.accountAddress, H1).digest).not.toBe(buildCancelWithdrawTypedData(2, A.accountAddress, H1).digest);
  });

  it('signer checks', async () => {
    const owner = secretScalarFromBytes(hexBytes(A.ownerPrivateKey));
    const td = buildWithdrawTypedData(base);
    expect(await acode(() => signPolicyTypedData(td, owner, B.ownerAddress))).toBe('SIGNING_FAILED');
    const tampered = { ...td, digest: H1 } as WithdrawTypedData;
    expect(await acode(() => signPolicyTypedData(tampered, owner))).toBe('SIGNING_FAILED');
    const sig = await signPolicyTypedData(td, owner, A.ownerAddress);
    expect(sig.signature).toHaveLength(132);
    expect([27, 28]).toContain(sig.v);
    expect(BigInt(sig.s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n).toBe(true);
  });
});

describe('calldata', () => {
  const policy = { destination: DEST, delaySeconds: 3600n, limitsRoot: ZERO_HASH };
  it('deploy', () => {
    const tx = encodeDeployAccount(dep, A.ownerAddress, policy);
    expect(tx.to).toBe(dep.factory);
    expect(tx.policyHash).toBe(computePolicyHash(policy));
    const d = decodeFunctionData({ abi: policyAccountFactoryAbi, data: tx.data });
    expect(d.functionName).toBe('deploy');
    expect(d.args).toEqual([A.ownerAddress, DEST, 3600n, ZERO_HASH]);
    expect(code(() => encodeDeployAccount(dep, DEST, policy))).toBe('INVALID_POLICY');
    expect(code(() => encodeDeployAccount(dep, A.ownerAddress, { ...policy, delaySeconds: 60n }))).toBe('INVALID_DELAY');
    expect(code(() => encodeDeployAccount(dep, ZERO_ADDRESS, policy))).toBe('INVALID_ADDRESS');
  });

  it('account calls round-trip and reject mismatched proofs and bad signatures', async () => {
    const owner = secretScalarFromBytes(hexBytes(A.ownerPrivateKey));
    const tree = buildLimitsTree([
      { token: ZERO_ADDRESS, limit: 100n, windowSeconds: 60n },
      { token: USDC, limit: 1000n, windowSeconds: 60n },
    ]);
    const lp = getLimitProof(tree, ZERO_ADDRESS);
    const td = buildWithdrawTypedData({ chainId: 1, account: A.accountAddress, token: ZERO_ADDRESS, amount: 5n, deadline: 10n, nonce: 1n, limit: { limitsRoot: tree.root, proof: lp } });
    const sig = await signPolicyTypedData(td, owner);
    const tx = encodeRequestWithdraw(td, lp, sig);
    expect(tx.to).toBe(A.accountAddress);
    const d = decodeFunctionData({ abi: policyAccountAbi, data: tx.data });
    expect(d.functionName).toBe('requestWithdraw');
    expect(d.args?.[2]).toBe(sig.signature);
    expect(code(() => encodeRequestWithdraw(td, getLimitProof(tree, USDC), sig))).toBe('INVALID_PROOF');
    expect(code(() => encodeRequestWithdraw(td, lp, '0x1234'))).toBe('INVALID_HEX');
    expect(code(() => encodeRequestWithdraw(td, { ...lp, proof: ['0x'] }, sig))).toBe('INVALID_HEX');
    const nl = buildWithdrawTypedData({ chainId: 1, account: A.accountAddress, token: USDC, amount: 5n, deadline: 10n, nonce: 2n, limit: null });
    expect(nl.message.limitLeafHash).toBe(ZERO_HASH);
    expect(encodeRequestWithdraw(nl, noLimitsProof(), sig.signature).to).toBe(A.accountAddress);

    const names = [
      encodeExecuteWithdraw(A.accountAddress, td.structHash),
      encodeCancelWithdraw(A.accountAddress, td.structHash, sig),
      encodeProposeDestination(buildProposeDestinationTypedData({ chainId: 1, account: A.accountAddress, newDestination: DEST, deadline: 1n, nonce: 3n }), sig),
      encodeExecuteDestinationChange(A.accountAddress),
      encodeCancelDestination(A.accountAddress, td.structHash, sig.signature),
    ].map((c) => decodeFunctionData({ abi: policyAccountAbi, data: c.data }).functionName);
    expect(names).toEqual(['executeWithdraw', 'cancel', 'proposeDestination', 'executeDestinationChange', 'cancelDestination']);
    expect(code(() => encodeExecuteWithdraw(ZERO_ADDRESS, td.structHash))).toBe('INVALID_ADDRESS');
  });
});

// Repro from the PR #218 dropped-fix triage (T-b85e0b59-4): check of b85e0b59 lost in merge 84c2c185.
describe('signPolicyTypedData signs only policy-account structs', () => {
  const owner = (): ReturnType<typeof secretScalarFromBytes> => secretScalarFromBytes(hexBytes(A.ownerPrivateKey));
  const td = buildWithdrawTypedData({ chainId: 1, account: A.accountAddress, token: USDC, amount: 5n, deadline: 10n, nonce: 1n, limit: null });
  // Each variant carries its own correct digest, so only the shape check can refuse it.
  const consistent = (v: Record<string, unknown>): never => {
    const digest = hashTypedData(v as never);
    return { ...v, structHash: digest, digest } as never;
  };
  const withdrawTypes = td.types.Withdraw;

  it('refuses a self-consistent foreign struct under a foreign domain', async () => {
    const foreign = {
      domain: { name: 'Evil', version: '1', chainId: 1, verifyingContract: A.accountAddress },
      types: { Transfer: [{ name: 'amt', type: 'uint256' }] },
      primaryType: 'Transfer',
      message: { amt: 1n },
    };
    expect(await acode(() => signPolicyTypedData(consistent(foreign), owner(), A.ownerAddress))).toBe('SIGNING_FAILED');
  });

  it('refuses foreign domains, types and primary types even with a matching digest', async () => {
    const variants: Record<string, unknown>[] = [
      { ...td, domain: { ...td.domain, name: 'Evil' } },
      { ...td, domain: { ...td.domain, version: '2' } },
      { ...td, domain: { ...td.domain, salt: H1 } },
      { ...td, domain: { ...td.domain, verifyingContract: ZERO_ADDRESS } },
      { ...td, types: { Withdraw: [{ name: 'x', type: 'uint256' }] }, message: { x: 1n } },
      { ...td, types: { Withdraw: withdrawTypes.slice(0, 4) } },
      { ...td, types: { Withdraw: withdrawTypes.map((f) => (f.name === 'amount' ? { ...f, type: 'uint128' } : f)) } },
      { ...td, types: { Withdraw: withdrawTypes, Extra: [{ name: 'y', type: 'uint256' }] } },
      { ...td, primaryType: 'Transfer', types: { Transfer: withdrawTypes } },
      { ...td, primaryType: 'hasOwnProperty', types: { hasOwnProperty: withdrawTypes } },
    ];
    const got: string[] = [];
    for (const v of variants) got.push(await acode(() => signPolicyTypedData(consistent(v), owner(), A.ownerAddress)));
    expect(got).toEqual(variants.map(() => 'SIGNING_FAILED'));
    // Malformed shapes are refused before any hashing (no TypeError escapes).
    const malformed: Record<string, unknown>[] = [
      { ...td, domain: { ...td.domain, chainId: 0 } },
      { ...td, domain: null },
      { ...td, types: null },
      { ...td, types: { Withdraw: [null, ...withdrawTypes.slice(1)] } },
      { ...td, primaryType: 1 },
    ];
    const bad: string[] = [];
    for (const v of malformed) bad.push(await acode(() => signPolicyTypedData(v as never, owner(), A.ownerAddress)));
    expect(bad).toEqual(malformed.map(() => 'SIGNING_FAILED'));
  });

  // A self-consistent ERC-2612 Permit: what an attacker wants the owner key to sign.
  const permit = {
    domain: { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: USDC },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: { owner: A.ownerAddress, spender: DEST, value: 2n ** 256n - 1n, nonce: 0n, deadline: 2n ** 256n - 1n },
  } as const;
  const permitDigest = hashTypedData(permit as never);
  /** Getter returning `first` on the first read and `then` on every later read. */
  const swapping = (first: unknown, then: unknown): PropertyDescriptor => {
    let reads = 0;
    return { enumerable: true, get: () => (reads++ === 0 ? first : then) };
  };

  it('reads the typed data once: getters that turn policy data into a Permit are refused', async () => {
    const shapeSwap = Object.defineProperties({}, {
      domain: swapping(td.domain, permit.domain),
      types: swapping(td.types, permit.types),
      primaryType: swapping(td.primaryType, permit.primaryType),
      message: { enumerable: true, value: permit.message },
      structHash: { enumerable: true, value: permitDigest },
      digest: { enumerable: true, value: permitDigest },
    });
    expect(await acode(() => signPolicyTypedData(shapeSwap as never, owner(), A.ownerAddress))).toBe('SIGNING_FAILED');
    // The digest itself swaps: the policy digest when compared, the Permit digest on later reads. Only the
    // policy digest may be signed.
    const digestSwap = Object.defineProperties({ ...td }, { digest: swapping(td.digest, permitDigest) });
    const sig = await signPolicyTypedData(digestSwap, owner(), A.ownerAddress);
    expect(await recoverAddress({ hash: td.digest, signature: sig.signature })).toBe(A.ownerAddress);
    expect(sig.signature).toBe((await signPolicyTypedData(td, owner(), A.ownerAddress)).signature);
  });

  it('refuses a salt on the domain that is inherited or not enumerable', async () => {
    const own = { name: td.domain.name, version: td.domain.version, chainId: td.domain.chainId, verifyingContract: td.domain.verifyingContract };
    const inherited = Object.assign(Object.create({ salt: H1 }) as object, own);
    const hidden = Object.defineProperty({ ...own }, 'salt', { value: H1, enumerable: false });
    const got: string[] = [];
    for (const domain of [inherited, hidden]) {
      // viem reads the salt into the separator; the variant carries that salted digest, as an attacker's would.
      const digest = hashTypedData({ domain, types: td.types, primaryType: td.primaryType, message: td.message } as never);
      expect(digest).not.toBe(td.digest);
      got.push(await acode(() => signPolicyTypedData({ ...td, domain, structHash: digest, digest }, owner(), A.ownerAddress)));
    }
    expect(got).toEqual(['SIGNING_FAILED', 'SIGNING_FAILED']);
  });

  it('signs only the digest it recomputes from the policy fields', async () => {
    const sig = await signPolicyTypedData({ ...td, structHash: H1 }, owner(), A.ownerAddress);
    expect(sig.signature).toBe((await signPolicyTypedData(td, owner(), A.ownerAddress)).signature);
    const refused: unknown[] = [
      { ...td, digest: undefined },
      { ...td, message: { ...td.message, amount: 6n } },
      { ...td, message: { ...td.message, amount: 5 } },
      { ...td, message: null },
      Object.defineProperty({ ...td }, 'message', { enumerable: true, get: () => { throw new TypeError('boom'); } }),
      null,
    ];
    const got: string[] = [];
    for (const v of refused) got.push(await acode(() => signPolicyTypedData(v as never, owner(), A.ownerAddress)).catch((e: unknown) => (e instanceof Error ? e.name : 'thrown')));
    expect(got).toEqual(refused.map(() => 'SIGNING_FAILED'));
  });

  it('still signs every builder output', async () => {
    const tds = [
      td,
      buildCancelWithdrawTypedData(1, A.accountAddress, H1),
      buildProposeDestinationTypedData({ chainId: 1, account: A.accountAddress, newDestination: DEST, deadline: 1n, nonce: 3n }),
      buildCancelDestinationTypedData(1, A.accountAddress, H1),
    ];
    for (const t of tds) expect(await acode(() => signPolicyTypedData(t, owner(), A.ownerAddress))).toBe('no error');
  });
});

// Repro from the PR #218 dropped-fix triage (T-b85e0b59-5): check of b85e0b59 lost in merge 84c2c185.
describe('buildWithdrawTypedData binds the proof leaf to (token, limit, window)', () => {
  const tree = buildLimitsTree([
    { token: ZERO_ADDRESS, limit: 100n, windowSeconds: 60n },
    { token: USDC, limit: 10n, windowSeconds: 60n },
  ]);
  const lp = getLimitProof(tree, USDC);
  const wbase = { chainId: 1, account: A.accountAddress, token: USDC, amount: 5n, deadline: 10n, nonce: 1n, limit: { limitsRoot: tree.root, proof: lp } };

  it('accepts the genuine proof', () => {
    expect(buildWithdrawTypedData(wbase).message.limitLeafHash).toBe(lp.leaf);
    expect(code(() => buildWithdrawTypedData({ ...wbase, limit: { limitsRoot: tree.root, proof: { ...lp, leaf: lp.leaf.toUpperCase().replace('0X', '0x') as Hex } } }))).toBe('no error');
  });

  it('rejects an inflated limit or window on a genuine leaf', () => {
    expect(code(() => buildWithdrawTypedData({ ...wbase, amount: 10n ** 20n, limit: { limitsRoot: tree.root, proof: { ...lp, limit: 10n ** 30n } } }))).toBe('INVALID_PROOF');
    expect(code(() => buildWithdrawTypedData({ ...wbase, limit: { limitsRoot: tree.root, proof: { ...lp, windowSeconds: 1n } } }))).toBe('INVALID_PROOF');
    expect(code(() => buildWithdrawTypedData({ ...wbase, limit: { limitsRoot: tree.root, proof: { ...lp, windowSeconds: 0n } } }))).toBe('INVALID_PROOF');
  });

  it("rejects another token's leaf", () => {
    expect(code(() => buildWithdrawTypedData({ ...wbase, token: ZERO_ADDRESS }))).toBe('INVALID_PROOF');
  });

  it('rejects the root (an inner node) as a leaf', () => {
    expect(code(() => buildWithdrawTypedData({ ...wbase, limit: { limitsRoot: tree.root, proof: { leaf: tree.root, proof: [], limit: 10n ** 30n, windowSeconds: 1n } } }))).toBe('INVALID_PROOF');
  });
});

// Repro from the PR #218 dropped-fix triage (T-b85e0b59-6): check of b85e0b59 lost in merge 84c2c185.
describe('getLimitProof recomputes the stored leaf of a restored tree', () => {
  const tree = buildLimitsTree([
    { token: ZERO_ADDRESS, limit: 100n, windowSeconds: 60n },
    { token: USDC, limit: 10n, windowSeconds: 60n },
  ]);
  const edit = (patch: Record<string, unknown>): never =>
    ({ ...tree, leaves: tree.leaves.map((l) => (l.token === USDC ? { ...l, ...patch } : l)) }) as never;

  it('accepts an untouched tree', () => {
    expect(getLimitProof(tree, USDC).limit).toBe(10n);
  });

  it('refuses a leaf whose limit, window or token was edited', () => {
    expect(code(() => getLimitProof(edit({ limit: 10n ** 30n }), USDC))).toBe('INVALID_PROOF');
    expect(code(() => getLimitProof(edit({ windowSeconds: 1n }), USDC))).toBe('INVALID_PROOF');
    expect(code(() => getLimitProof(edit({ limit: 0n }), USDC))).toBe('INVALID_PROOF');
    const other: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    expect(code(() => getLimitProof(edit({ token: other }), other))).toBe('INVALID_PROOF');
  });
});

// Repro from the PR #218 dropped-fix triage (T-b85e0b59-7): check of b85e0b59 lost in merge 84c2c185.
describe('checkScheme2Announcement leaves no live viewing-secret copy', () => {
  afterEach(() => vi.restoreAllMocks());

  it('validates policy hashes and deployment before it copies the viewing secret', () => {
    const view = secretScalarFromBytes(hexBytes(A.viewingPrivateKey));
    const spend = parseCompressedPoint(hexBytes(A.spendingPublicKey));
    const ann = { stealthAddress: A.accountAddress, ephemeralPublicKey: A.ephemeralPublicKey, metadata: A.viewTag };
    // Records every 32-byte SecretBytes core-crypto fills (secretScalarFromBytes copies through `set`).
    const copies: Uint8Array[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const realSet = Uint8Array.prototype.set;
    vi.spyOn(Uint8Array.prototype, 'set').mockImplementation(function (this: Uint8Array, ...a: Parameters<typeof realSet>) {
      if (this.length === 32 && this.constructor.name === 'SecretBytes') copies.push(this);
      return realSet.apply(this, a);
    });
    const live = (): number => copies.filter((c) => c.some((b) => b !== 0)).length;
    expect(code(() => checkScheme2Announcement(ann, view, spend, ['0xzz'], dep))).toBe('INVALID_HEX');
    expect(code(() => checkScheme2Announcement(ann, view, spend, [A.policyHash], { ...dep, factory: ZERO_ADDRESS }))).toBe('INVALID_ADDRESS');
    expect(code(() => checkScheme2Announcement(ann, view, spend, [A.policyHash], { ...dep, implementation: ZERO_ADDRESS }))).toBe('INVALID_ADDRESS');
    expect(live()).toBe(0);
    // The spy does see the copy of a valid call, and `finally` wipes it.
    expect(checkScheme2Announcement(ann, view, spend, [A.policyHash], dep).matches).toBe(true);
    expect(copies.length).toBeGreaterThan(0);
    expect(live()).toBe(0);
  });
});
