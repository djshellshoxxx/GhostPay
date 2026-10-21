import { parseCompressedPoint, secretScalarFromBytes, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  CANCEL_DESTINATION_TYPEHASH,
  CANCEL_WITHDRAW_TYPEHASH,
  PROPOSE_DESTINATION_TYPEHASH,
  SCHEME_ID,
  TYPE_STRINGS,
  WITHDRAW_TYPEHASH,
  accountSalt,
  buildCancelDestinationTypedData,
  buildCancelWithdrawTypedData,
  buildLimitsTree,
  buildProposeDestinationTypedData,
  buildWithdrawTypedData,
  checkScheme2Announcement,
  cloneInitCodeHash,
  computePolicyHash,
  decodeScheme2MetaAddress,
  deriveScheme2OwnerKey,
  deriveScheme2Payment,
  encodeScheme2MetaAddress,
  getLimitProof,
  noLimitsProof,
  ownerMetaAddress,
  policyDomain,
  policyDomainSeparator,
  predictAccountAddress,
  signPolicyTypedData,
  verifyLimitProof,
  type PolicySchemeErrorCode,
} from './index.js';
import { hexBytes, scriptedRng, toLimits, vectors, type VectorAccount } from './fixtures.testutil.js';

const dep = { factory: vectors.deployment.factory, implementation: vectors.deployment.implementation };
const treeOf = (a: VectorAccount) => vectors.limitTrees.find((t) => t.id === a.policy.tree);

describe('policy-scheme vectors: constants', () => {
  it('scheme id and typehashes', () => {
    expect(vectors.schemeId).toBe(`0x${SCHEME_ID.toString(16)}`);
    expect(TYPE_STRINGS).toEqual(vectors.typeStrings);
    expect(WITHDRAW_TYPEHASH).toBe(vectors.typehashes.Withdraw);
    expect(CANCEL_WITHDRAW_TYPEHASH).toBe(vectors.typehashes.CancelWithdraw);
    expect(PROPOSE_DESTINATION_TYPEHASH).toBe(vectors.typehashes.ProposeDestination);
    expect(CANCEL_DESTINATION_TYPEHASH).toBe(vectors.typehashes.CancelDestination);
    expect(cloneInitCodeHash(dep.implementation)).toBe(vectors.deployment.cloneInitCodeHash);
  });
});

describe('policy-scheme vectors: limit trees', () => {
  for (const t of vectors.limitTrees) {
    it(`${t.id}: root, layout and proofs`, () => {
      const limits = toLimits(t);
      const built = buildLimitsTree([...limits].reverse());
      expect(built.root).toBe(t.root);
      expect(built.tree).toEqual(t.tree);
      expect(built.leaves.map((l) => l.leaf)).toEqual(t.leaves.map((l) => l.leaf));
      for (const l of t.leaves) {
        const p = getLimitProof(built, l.token);
        expect(p.leaf).toBe(l.leaf);
        expect(p.proof).toEqual(l.proof);
        expect(p.limit).toBe(BigInt(l.limit));
        expect(p.windowSeconds).toBe(BigInt(l.windowSeconds));
        expect(verifyLimitProof(t.root, l.leaf, l.proof)).toBe(true);
      }
    });
  }
  for (const bad of vectors.invalidTrees) {
    it(`refuses: ${bad.note}`, () => {
      let code: PolicySchemeErrorCode | undefined;
      try {
        buildLimitsTree(toLimits(bad));
      } catch (e) {
        code = (e as { code: PolicySchemeErrorCode }).code;
      }
      expect(code).toBe(bad.error);
    });
  }
});

describe('policy-scheme vectors: accounts', () => {
  for (const a of vectors.accounts) {
    it(`${a.id}: policy hash, meta-address, sender derivation`, () => {
      const policy = { destination: a.policy.destination, delaySeconds: BigInt(a.policy.delaySeconds), limitsRoot: a.policy.limitsRoot };
      expect(computePolicyHash(policy)).toBe(a.policyHash);
      const t = treeOf(a);
      if (t !== undefined) expect(buildLimitsTree(toLimits(t)).root).toBe(a.policy.limitsRoot);
      expect(accountSalt(a.ownerAddress, a.policyHash)).toBe(a.salt);
      expect(predictAccountAddress(dep, a.ownerAddress, a.policyHash)).toBe(a.accountAddress);

      const meta = {
        spendingPublicKey: parseCompressedPoint(hexBytes(a.spendingPublicKey)),
        viewingPublicKey: parseCompressedPoint(hexBytes(a.viewingPublicKey)),
        policyHash: a.policyHash,
      };
      expect(encodeScheme2MetaAddress(meta)).toBe(a.metaAddress);
      const decoded = decodeScheme2MetaAddress(a.metaAddress.toUpperCase().replace('ST:ETH:GP2:0X', 'st:eth:gp2:0x'));
      expect(decoded.policyHash).toBe(a.policyHash);
      expect(ownerMetaAddress(decoded)).toBe(a.scheme1MetaAddress);

      const pay = deriveScheme2Payment(a.metaAddress, dep, scriptedRng([hexBytes(a.ephemeralPrivateKey)]));
      expect(pay.schemeId).toBe(SCHEME_ID);
      expect(pay.ownerAddress).toBe(a.ownerAddress);
      expect(pay.accountAddress).toBe(a.accountAddress);
      expect(`0x${bytesToHex(pay.ephemeralPublicKey)}`).toBe(a.ephemeralPublicKey);
      expect(`0x${bytesToHex(pay.viewTag)}`).toBe(a.viewTag);
      expect(pay.metadataPrefix).toEqual(pay.viewTag);
      expect(pay.policyHash).toBe(a.policyHash);
    });

    it(`${a.id}: scanner and owner key`, () => {
      const viewingSecret = secretScalarFromBytes(hexBytes(a.viewingPrivateKey));
      const spendingSecret = secretScalarFromBytes(hexBytes(a.spendingPrivateKey));
      const spend = parseCompressedPoint(hexBytes(a.spendingPublicKey));
      const ann = { schemeId: SCHEME_ID, stealthAddress: a.accountAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: `${a.viewTag}eeeeeeee` };
      const other = `0x${'ab'.repeat(32)}` as const;
      const check = checkScheme2Announcement(ann, viewingSecret, spend, [other, a.policyHash], dep);
      expect(check).toEqual({ matches: true, ownerAddress: a.ownerAddress, accountAddress: a.accountAddress, policyHash: a.policyHash });
      expect(checkScheme2Announcement(ann, viewingSecret, spend, [other], dep)).toEqual({ matches: false });
      const key = deriveScheme2OwnerKey(ann, { viewingSecret, spendingSecret }, spend, [a.policyHash], dep);
      expect(`0x${bytesToHex(unsafeRevealSecret(key.ownerSecret))}`).toBe(a.ownerPrivateKey);
      expect(key.accountAddress).toBe(a.accountAddress);
    });
  }
});

describe('policy-scheme vectors: EIP-712 orders', () => {
  for (const o of vectors.orders) {
    const a = vectors.accounts.find((x) => x.id === o.account) as VectorAccount;
    it(`${o.account}: withdraw, cancel, propose, cancel destination`, async () => {
      expect(policyDomainSeparator(policyDomain(o.chainId, o.accountAddress))).toBe(o.domainSeparator);
      const owner = secretScalarFromBytes(hexBytes(a.ownerPrivateKey));
      const t = treeOf(a);
      const wm = o.withdraw.message;
      const proof = t === undefined ? noLimitsProof() : getLimitProof(buildLimitsTree(toLimits(t)), wm.token);
      expect(proof.proof).toEqual(o.withdraw.limitProof.proof);
      const w = buildWithdrawTypedData({
        chainId: o.chainId,
        account: o.accountAddress,
        token: wm.token,
        amount: BigInt(wm.amount),
        deadline: BigInt(wm.deadline),
        nonce: BigInt(wm.nonce),
        limit: t === undefined ? null : { limitsRoot: a.policy.limitsRoot, proof },
      });
      expect(w.message.limitLeafHash).toBe(wm.limitLeafHash);
      expect(w.structHash).toBe(o.withdraw.structHash);
      expect(w.digest).toBe(o.withdraw.digest);
      expect((await signPolicyTypedData(w, owner, a.ownerAddress)).signature).toBe(o.withdraw.signature);

      const cw = buildCancelWithdrawTypedData(o.chainId, o.accountAddress, w.structHash);
      expect(cw.structHash).toBe(o.cancelWithdraw.structHash);
      expect(cw.digest).toBe(o.cancelWithdraw.digest);
      expect((await signPolicyTypedData(cw, owner)).signature).toBe(o.cancelWithdraw.signature);

      const pm = o.proposeDestination.message;
      const pd = buildProposeDestinationTypedData({
        chainId: o.chainId,
        account: o.accountAddress,
        newDestination: pm.newDestination,
        deadline: BigInt(pm.deadline),
        nonce: BigInt(pm.nonce),
      });
      expect(pd.structHash).toBe(o.proposeDestination.structHash);
      expect(pd.digest).toBe(o.proposeDestination.digest);
      expect((await signPolicyTypedData(pd, owner)).signature).toBe(o.proposeDestination.signature);

      const cd = buildCancelDestinationTypedData(o.chainId, o.accountAddress, pd.structHash);
      expect(cd.structHash).toBe(o.cancelDestination.structHash);
      expect(cd.digest).toBe(o.cancelDestination.digest);
      expect((await signPolicyTypedData(cd, owner)).signature).toBe(o.cancelDestination.signature);
    });
  }
});
