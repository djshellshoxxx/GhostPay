import {
  checkAnnouncement,
  deriveStealthPayment,
  encodeMetaAddress,
  generateKeySet,
} from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { encodeAbiParameters, getAddress, getContractAddress, keccak256 } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import {
  buildLimitsTree,
  checkScheme2Announcement,
  computePolicyHash,
  deriveScheme2Payment,
  encodeScheme2MetaAddress,
  getLimitProof,
  limitLeafHash,
  predictAccountAddress,
  verifyLimitProof,
  MAX_UINT256,
  UNLIMITED,
  type Address,
  type Hex,
  type TokenLimit,
} from './index.js';
import { scriptedRng, vectors } from './fixtures.testutil.js';

const dep = { factory: vectors.deployment.factory, implementation: vectors.deployment.implementation };
const arbAddress = fc.uint8Array({ minLength: 20, maxLength: 20 }).map((b) => getAddress(`0x${bytesToHex(b)}`));
const arbLimit: fc.Arbitrary<TokenLimit> = fc.record({
  token: arbAddress,
  limit: fc.oneof(fc.bigInt({ min: 1n, max: MAX_UINT256 - 1n }), fc.constant(UNLIMITED)),
  windowSeconds: fc.bigInt({ min: 1n, max: 2n ** 64n - 1n }),
});
const arbLimits = fc.uniqueArray(arbLimit, { minLength: 1, maxLength: 17, selector: (l) => l.token.toLowerCase() });

describe('limits tree properties', () => {
  it('every leaf proves against the root; order does not matter; foreign leaves fail', () => {
    fc.assert(
      fc.property(arbLimits, arbLimit, (limits, foreign) => {
        const t = buildLimitsTree(limits);
        expect(buildLimitsTree([...limits].reverse()).root).toBe(t.root);
        for (const l of limits) {
          const p = getLimitProof(t, l.token);
          expect(p.leaf).toBe(limitLeafHash(l));
          expect(verifyLimitProof(t.root, p.leaf, p.proof)).toBe(true);
          // A proof for one leaf never proves a different leaf.
          const altered = limitLeafHash({ ...l, limit: l.limit === 1n ? 2n : l.limit - 1n });
          expect(verifyLimitProof(t.root, altered, p.proof)).toBe(false);
        }
        if (!limits.some((l) => l.token.toLowerCase() === foreign.token.toLowerCase())) {
          expect(() => getLimitProof(t, foreign.token)).toThrow(/no leaf/);
          expect(() => buildLimitsTree([...limits, foreign])).not.toThrow();
          expect(() => buildLimitsTree([...limits, { ...foreign, token: limits[0]?.token as Address }])).toThrow(/more than once/);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('leaf hash is the OpenZeppelin double-hashed abi.encode', () => {
    fc.assert(
      fc.property(arbLimit, (l) => {
        const enc = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
          [l.token, l.limit, l.windowSeconds],
        );
        expect(limitLeafHash(l)).toBe(keccak256(keccak256(enc)));
      }),
      { numRuns: 100 },
    );
  });
});

describe('derivation properties', () => {
  it('owner equals core-crypto scheme-1 output; scanner agrees with core-crypto checkAnnouncement', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        arbAddress,
        fc.bigInt({ min: 3600n, max: 2592000n }),
        (seed, eph, destination, delaySeconds) => {
          const keys = generateKeySet(scriptedRng([seed, eph.map((b) => b ^ 0x5a)]));
          const policyHash = computePolicyHash({ destination, delaySeconds, limitsRoot: `0x${'11'.repeat(32)}` });
          const meta = encodeScheme2MetaAddress({ ...keys, policyHash });
          const pay = deriveScheme2Payment(meta, dep, scriptedRng([eph]));
          const s1 = deriveStealthPayment(encodeMetaAddress(keys), scriptedRng([eph]));
          expect(pay.ownerAddress).toBe(s1.stealthAddress);
          const salt = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [pay.ownerAddress, policyHash]));
          const viaViem = getContractAddress({
            opcode: 'CREATE2',
            from: dep.factory,
            salt,
            bytecodeHash: vectors.deployment.cloneInitCodeHash,
          });
          expect(pay.accountAddress).toBe(viaViem);
          const R = `0x${bytesToHex(pay.ephemeralPublicKey)}`;
          const md = `0x${bytesToHex(pay.viewTag)}00`;
          const s1check = checkAnnouncement({ stealthAddress: pay.ownerAddress, ephemeralPublicKey: R, metadata: md }, keys.viewingSecret, keys.spendingPublicKey);
          expect(s1check.matches).toBe(true);
          const check = checkScheme2Announcement(
            { stealthAddress: pay.accountAddress.toLowerCase(), ephemeralPublicKey: R, metadata: md },
            keys.viewingSecret,
            keys.spendingPublicKey,
            [policyHash],
            dep,
          );
          expect(check.matches).toBe(true);
          // The owner address itself is not a scheme-2 match (only A_acct is announced).
          expect(
            checkScheme2Announcement({ stealthAddress: pay.ownerAddress, ephemeralPublicKey: R, metadata: md }, keys.viewingSecret, keys.spendingPublicKey, [policyHash], dep)
              .matches,
          ).toBe(false);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('account address depends on factory, implementation, owner and policy', () => {
    const owner = vectors.accounts[0]?.ownerAddress as Address;
    const ph = vectors.accounts[0]?.policyHash as Hex;
    const base = predictAccountAddress(dep, owner, ph);
    const other = '0x00000000000000000000000000000000000000aa' as Address;
    expect(predictAccountAddress({ ...dep, factory: other }, owner, ph)).not.toBe(base);
    expect(predictAccountAddress({ ...dep, implementation: other }, owner, ph)).not.toBe(base);
    expect(predictAccountAddress(dep, other, ph)).not.toBe(base);
    expect(predictAccountAddress(dep, owner, `0x${'22'.repeat(32)}`)).not.toBe(base);
  });
});
