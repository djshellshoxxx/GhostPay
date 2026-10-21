import {
  CURVE_ORDER,
  GhostPayCryptoError,
  deriveStealthPayment,
  deriveStealthSecret,
  parseCompressedPoint,
  secretScalarFromBytes,
  zeroize,
  type CompressedPoint,
  type RandomSource,
  type SecretScalar,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getAddress, isAddress } from 'viem/utils';
import { fail } from './errors.js';
import { decodeScheme2MetaAddress, ownerMetaAddress } from './meta.js';
import { predictAccountAddress, type PolicyDeployment } from './policy.js';
import { SCHEME_ID, bytes32, nonZeroAddr, type Address, type Hex } from './types.js';

/** Sender-side result. All fields are public data. */
export interface Scheme2Payment {
  /** Always {@link SCHEME_ID} (`0x47500002`); announce with it. */
  readonly schemeId: bigint;
  /** Scheme-1-derived owner EOA `A_owner` (never receives funds). */
  readonly ownerAddress: Address;
  /** Counterfactual account `A_acct`: pay here and announce it as `stealthAddress`. */
  readonly accountAddress: Address;
  /** 33-byte compressed ephemeral public key R. */
  readonly ephemeralPublicKey: CompressedPoint;
  /** One-byte view tag (scheme-1 derivation). */
  readonly viewTag: Uint8Array;
  /** Bytes that must begin the announcement metadata (the view tag). */
  readonly metadataPrefix: Uint8Array;
  /** Policy hash from the meta-address. */
  readonly policyHash: Hex;
}

/** Announcement fields (hex form) as emitted by the ERC-5564 announcer. */
export interface Scheme2Announcement {
  /** If present it must equal {@link SCHEME_ID}. */
  readonly schemeId?: bigint;
  /** Announced `A_acct`. */
  readonly stealthAddress: string;
  /** 33-byte compressed R, 0x-hex. */
  readonly ephemeralPublicKey: string;
  /** Metadata, 0x-hex; `metadata[0]` is the view tag. */
  readonly metadata: string;
}

/** Scanner result. */
export type Scheme2Check =
  | { readonly matches: false }
  | {
      readonly matches: true;
      readonly ownerAddress: Address;
      readonly accountAddress: Address;
      readonly policyHash: Hex;
    };

/** Owner key material recovered for a matched announcement. */
export interface Scheme2OwnerKey {
  /** Redacting secret of `A_owner`; signs every account action. */
  readonly ownerSecret: SecretScalar;
  readonly ownerAddress: Address;
  readonly accountAddress: Address;
  readonly policyHash: Hex;
}

const Point = secp256k1.Point;
const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

/**
 * Derives a scheme-2 payment target from a recipient meta-address.
 *
 * @remarks Owner: scheme-1 maths of `@ghostpay/core-crypto` (`deriveStealthPayment`) on the
 * meta-address keys (ADR-0001 hashing, fresh ephemeral scalar). Account:
 * {@link predictAccountAddress}`(deployment, A_owner, policyHash)`. The announcement must use
 * `schemeId = 0x47500002`, `stealthAddress = accountAddress`, the returned R and the view tag as
 * metadata byte 0 (CONTRACTS_SPEC section 4).
 *
 * @param metaAddress `st:eth:gp2:0x...` scheme-2 meta-address.
 * @param deployment Factory and implementation of the payment chain (from the pinned manifest).
 * @param rng Production callers omit this (Web Crypto).
 * @returns Owner, account, R, view tag, metadata prefix, policy hash.
 * @throws {PolicySchemeError} `INVALID_META_ADDRESS`, `INVALID_ADDRESS`. {@link GhostPayCryptoError} on key or RNG errors.
 * @security A payer cannot check the policy behind `policyHash`; the meta-address must come from an
 * authenticated channel. The ephemeral scalar is handled and zeroized by core-crypto.
 * @testVector policy-scheme.accounts
 */
export function deriveScheme2Payment(
  metaAddress: string,
  deployment: PolicyDeployment,
  rng?: RandomSource,
): Scheme2Payment {
  const meta = decodeScheme2MetaAddress(metaAddress);
  const s1 = deriveStealthPayment(ownerMetaAddress(meta), rng);
  const accountAddress = predictAccountAddress(deployment, s1.stealthAddress, meta.policyHash);
  return Object.freeze({
    schemeId: SCHEME_ID,
    ownerAddress: s1.stealthAddress,
    accountAddress,
    ephemeralPublicKey: s1.ephemeralPublicKey,
    viewTag: s1.viewTag,
    metadataPrefix: s1.metadataPrefix,
    policyHash: meta.policyHash,
  });
}

/** @internal Parsed announcement or null for malformed on-chain data. */
function parse(a: Scheme2Announcement): { account: Address; ephemeral: CompressedPoint; tag: number } | null {
  if (a.schemeId !== undefined && a.schemeId !== SCHEME_ID) return null;
  if (typeof a.stealthAddress !== 'string' || !isAddress(a.stealthAddress, { strict: false })) return null;
  if (typeof a.ephemeralPublicKey !== 'string' || !HEX_RE.test(a.ephemeralPublicKey)) return null;
  if (typeof a.metadata !== 'string' || !HEX_RE.test(a.metadata) || a.metadata.length < 4) return null;
  let ephemeral: CompressedPoint;
  try {
    ephemeral = parseCompressedPoint(hexToBytes(a.ephemeralPublicKey.slice(2)));
  } catch (e) {
    if (e instanceof GhostPayCryptoError) return null;
    throw e;
  }
  return { account: getAddress(a.stealthAddress), ephemeral, tag: parseInt(a.metadata.slice(2, 4), 16) };
}

/**
 * @internal ADR-0001 scheme-1 owner derivation from the viewing side (same maths as
 * core-crypto `checkAnnouncement`; differential-tested against it): S = v*R (compressed),
 * s_h = keccak256(S), tag = s_h[0], A_owner = address(P_spend + (s_h mod n)*G).
 */
function ownerFromAnnouncement(viewing: Uint8Array, spend: CompressedPoint, ephemeral: CompressedPoint): { tag: number; owner: Address | null } {
  const shared = secp256k1.getSharedSecret(viewing, ephemeral, true);
  const digest = keccak_256(shared);
  const tag = digest[0] as number;
  const h = bytesToNumberBE(digest) % CURVE_ORDER;
  zeroize(shared, digest);
  if (h === 0n) return { tag, owner: null };
  const q = Point.fromBytes(spend).add(Point.BASE.multiply(h));
  if (q.is0()) return { tag, owner: null };
  const hash = keccak_256(q.toBytes(false).subarray(1));
  return { tag, owner: getAddress(`0x${bytesToHex(hash.subarray(12))}`) };
}

/**
 * Checks whether a scheme-2 announcement pays the holder of the viewing key under one of the
 * recipient's policies.
 *
 * @remarks Derives `A_owner` with scheme-1 maths (view-tag early reject first), predicts
 * `A_acct` for each candidate policy hash and compares with the announced address
 * (case-insensitive). Malformed on-chain data (scheme id other than `0x47500002`, bad address,
 * bad point, empty metadata) returns `{ matches: false }` and never throws. Invalid *key*
 * arguments, policy hashes or deployment addresses throw.
 *
 * @param announcement Announcement fields.
 * @param viewingSecret Recipient viewing scalar.
 * @param spendingPublicKey Recipient spending public key.
 * @param policyHashes Policy hashes of the recipient's published scheme-2 meta-addresses.
 * @param deployment Factory and implementation of the chain the log came from.
 * @returns Match with owner, account and policy hash, or `{ matches: false }`.
 * @throws {GhostPayCryptoError} `INVALID_SCALAR`, `INVALID_POINT`. {@link PolicySchemeError} `INVALID_HEX`, `INVALID_ADDRESS`.
 * @security Never logs the viewing secret (a validated copy is zeroized). The view tag leaks one
 * byte of the shared-secret hash by design. A match only proves the address derivation; the
 * payment amount in metadata is an unauthenticated payer claim.
 * @testVector policy-scheme.accounts
 */
export function checkScheme2Announcement(
  announcement: Scheme2Announcement,
  viewingSecret: SecretScalar,
  spendingPublicKey: CompressedPoint,
  policyHashes: readonly Hex[],
  deployment: PolicyDeployment,
): Scheme2Check {
  const spend = parseCompressedPoint(spendingPublicKey);
  // Validate every argument BEFORE the secret copy exists, so no error path can leak it.
  const hashes = policyHashes.map((p, i) => bytes32(p, `policyHashes[${String(i)}]`));
  const dep = { factory: nonZeroAddr(deployment.factory, 'factory'), implementation: nonZeroAddr(deployment.implementation, 'implementation') };
  const viewing = secretScalarFromBytes(viewingSecret);
  try {
    const parsed = parse(announcement);
    if (parsed === null) return { matches: false };
    const { tag, owner } = ownerFromAnnouncement(viewing, spend, parsed.ephemeral);
    if (tag !== parsed.tag || owner === null) return { matches: false };
    for (const policyHash of hashes) {
      const accountAddress = predictAccountAddress(dep, owner, policyHash);
      if (accountAddress === parsed.account) {
        return Object.freeze({ matches: true, ownerAddress: owner, accountAddress, policyHash });
      }
    }
    return { matches: false };
  } finally {
    zeroize(viewing);
  }
}

/**
 * Recovers the owner key of a matched scheme-2 announcement.
 *
 * @remarks Runs {@link checkScheme2Announcement}, then core-crypto `deriveStealthSecret` with the
 * derived `A_owner` as the stealth address, which re-derives the key and checks that it maps to
 * `A_owner` before returning.
 *
 * @param announcement Announcement fields.
 * @param keys Recipient viewing and spending secrets.
 * @param spendingPublicKey Recipient spending public key.
 * @param policyHashes Candidate policy hashes.
 * @param deployment Factory and implementation of the chain.
 * @returns Redacting owner secret plus owner, account and policy hash.
 * @throws {PolicySchemeError} `NOT_MATCHED` and input errors. {@link GhostPayCryptoError} on key errors.
 * @security The output is a spendable signing key for the account: never log, serialize or send it;
 * zeroize after use (best effort). It cannot move funds anywhere but the policy destination.
 * @testVector policy-scheme.accounts
 */
export function deriveScheme2OwnerKey(
  announcement: Scheme2Announcement,
  keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>,
  spendingPublicKey: CompressedPoint,
  policyHashes: readonly Hex[],
  deployment: PolicyDeployment,
): Scheme2OwnerKey {
  const check = checkScheme2Announcement(announcement, keys.viewingSecret, spendingPublicKey, policyHashes, deployment);
  if (!check.matches) return fail('NOT_MATCHED');
  const ownerSecret = deriveStealthSecret(
    { stealthAddress: check.ownerAddress, ephemeralPublicKey: announcement.ephemeralPublicKey, metadata: announcement.metadata },
    keys,
  );
  return Object.freeze({
    ownerSecret,
    ownerAddress: check.ownerAddress,
    accountAddress: check.accountAddress,
    policyHash: check.policyHash,
  });
}

