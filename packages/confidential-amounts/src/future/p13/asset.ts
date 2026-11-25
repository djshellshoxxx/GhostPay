/**
 * P13 asset representation: COMMON `AssetRefV1` and the spec's `ConfidentialAssetV1`, decoded strictly and bound to a
 * pinned backend manifest digest. Only explicitly approved assets are usable; there is no discovery.
 */
import { canonicalize } from '@ghostpay/invoice-schema';
import { sha256, stringToBytes } from 'viem';
import { CT1_MANIFEST, BACKEND_CHAINS, MAINNET_CHAIN_IDS } from '../../manifest.js';
import { NOT_PROTECTED_KEYS } from '../../copy.js';
import { check, fail } from './errors.js';
import { isKnownCopyKey } from './copy.js';
import { dataArray, exactRecord, intIn, matchString } from './strict.js';
import { MAX_DECIMALS, formatDecimalUnits, parseDecimalUnits, wrapperUnits, type DecimalUnits } from './units.js';

/** COMMON `Digest`: algorithm-tagged lowercase hex of canonical bytes. */
export type Digest = string;
const DIGEST_RE = /^(?:sha256|keccak256):[0-9a-f]{64}$/;
const NETWORK_RE = /^eip155:([1-9][0-9]{0,15})$/;
const TOKEN_RE = /^0x[0-9a-f]{40}$/;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

/** Backends P13 can describe. CT-2/CT-3 are not built; `commitment-zk` has no selected protocol. */
export type P13ProtocolId = 'ct1-zama' | 'ctm-cleartext';
/** Confidentiality mechanism; `none` marks the cleartext fixture (P13-A02). */
export type Confidentiality = 'fhe' | 'commitment-zk' | 'none';

/** COMMON `AssetRefV1`. `decimals` is display metadata, never arithmetic input. */
export interface AssetRefV1 {
  readonly schema: 'ghostpay.asset-ref/v1';
  readonly network: string;
  readonly asset: string;
  readonly decimals: number;
}

/** Spec `ConfidentialAssetV1`, extended with the wrapped `underlying` and its exact `rate` (DEVIATIONS P13-2). */
export interface ConfidentialAssetV1 {
  readonly schema: 'ghostpay.confidential-asset/v1';
  readonly asset: AssetRefV1;
  readonly underlying: AssetRefV1;
  readonly rate: DecimalUnits;
  readonly protocolId: P13ProtocolId;
  readonly manifestDigest: Digest;
  readonly confidentiality: Confidentiality;
  readonly trustStatementIds: readonly string[];
}

/** Largest approved-asset list (research starts with one network and one asset). */
export const MAX_APPROVED_ASSETS = 8;
const MAX_TRUST_IDS = 32;

/** sha256 digest of the canonical JSON of `value`. */
export function digestOf(value: unknown): Digest {
  return `sha256:${sha256(stringToBytes(canonicalize(value))).slice(2)}`;
}

/** Validates a COMMON `Digest`. */
export function assertDigest(value: unknown): Digest {
  return matchString(value, DIGEST_RE, 'P13_INVALID_ASSET');
}

const CTM_DESCRIPTOR = Object.freeze({ backend: 'ctm-cleartext', version: 1, chains: [31337], privacy: 'none' });

/** Manifest each protocol's assets are bound to. CT-M has no chain manifest; its fixed descriptor stands in. */
function manifestFor(protocolId: P13ProtocolId): unknown {
  return protocolId === 'ct1-zama' ? CT1_MANIFEST : CTM_DESCRIPTOR;
}

/**
 * Pinned manifest digests (P13-A05). A changed manifest, address or provenance line changes the digest and every
 * asset bound to the old one is refused. Update only together with a reviewed manifest change.
 */
export const PINNED_MANIFEST_DIGESTS: Readonly<Record<P13ProtocolId, Digest>> = Object.freeze({
  'ct1-zama': 'sha256:be131b2fcdfd0b0ad3edd5dea760ba9ca9326f7ae18e21b13f25af0eebd32c9e',
  'ctm-cleartext': 'sha256:26a91931dfc4c30e5057e9a8f827ecad471e6b5abc02046384e75a6f1c4efef3',
});

/**
 * Recomputes the protocol manifest digest and compares it with the pin.
 * @throws {P13Error} `P13_MANIFEST_MISMATCH` when the shipped manifest no longer matches the pin.
 */
export function pinnedManifestDigest(protocolId: P13ProtocolId, manifest: unknown = manifestFor(protocolId)): Digest {
  const actual = digestOf(manifest);
  check(actual === PINNED_MANIFEST_DIGESTS[protocolId], 'P13_MANIFEST_MISMATCH', 'manifest does not match its pin');
  return actual;
}

/** Trust statements every asset of a protocol must carry (shown before first use). */
export const REQUIRED_TRUST_IDS: Readonly<Record<P13ProtocolId, readonly string[]>> = Object.freeze({
  'ct1-zama': ['CT_TRUST_ZAMA', 'CT_TESTNET_ONLY', 'P13_NOT_REVIEWED', ...NOT_PROTECTED_KEYS],
  'ctm-cleartext': ['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY'],
});

const CONFIDENTIALITY_OF: Readonly<Record<P13ProtocolId, Confidentiality>> = { 'ct1-zama': 'fhe', 'ctm-cleartext': 'none' };

/** `eip155:<chainId>` for a chain id. */
export function networkId(chainId: number): string {
  check(Number.isSafeInteger(chainId) && chainId > 0, 'P13_INVALID_ASSET', 'invalid chain id');
  return `eip155:${chainId}`;
}

/**
 * Parses `eip155:<chainId>` and applies the testnet allow-list of `protocolId`.
 * @throws {P13Error} `P13_INVALID_ASSET` for malformed text, `P13_NETWORK_REFUSED` for mainnets and unlisted chains.
 */
export function parseNetwork(network: unknown, protocolId: P13ProtocolId): number {
  const m = NETWORK_RE.exec(matchString(network, NETWORK_RE, 'P13_INVALID_ASSET'));
  const chainId = Number(m?.[1]);
  check(Number.isSafeInteger(chainId), 'P13_INVALID_ASSET', 'invalid chain id');
  if (MAINNET_CHAIN_IDS.includes(chainId)) fail('P13_NETWORK_REFUSED', 'mainnets are refused');
  check(BACKEND_CHAINS[protocolId].includes(chainId), 'P13_NETWORK_REFUSED', 'chain not allowed for this protocol');
  return chainId;
}

/** Decodes an untrusted COMMON `AssetRefV1` of a token (native assets cannot be confidential under CT-1). */
export function decodeAssetRef(value: unknown): AssetRefV1 {
  const r = exactRecord(value, ['schema', 'network', 'asset', 'decimals'], [], 'P13_INVALID_ASSET');
  check(r['schema'] === 'ghostpay.asset-ref/v1', 'P13_INVALID_ASSET', 'unknown asset schema');
  const network = matchString(r['network'], NETWORK_RE, 'P13_INVALID_ASSET');
  const asset = matchString(r['asset'], TOKEN_RE, 'P13_INVALID_ASSET');
  check(asset !== ZERO_ADDRESS, 'P13_INVALID_ASSET', 'zero address');
  const decimals = intIn(r['decimals'], 0, MAX_DECIMALS, 'P13_INVALID_ASSET');
  return { schema: 'ghostpay.asset-ref/v1', network, asset, decimals };
}

/**
 * Decodes an untrusted `ConfidentialAssetV1` and checks its internal consistency: same allowed testnet for both
 * tokens, wrapper decimals/rate as OpenZeppelin computes them, matching confidentiality, pinned manifest, and every
 * required trust statement (P13-A04).
 */
export function decodeConfidentialAsset(value: unknown): ConfidentialAssetV1 {
  const r = exactRecord(
    value,
    ['schema', 'asset', 'underlying', 'rate', 'protocolId', 'manifestDigest', 'confidentiality', 'trustStatementIds'],
    [],
    'P13_INVALID_ASSET',
  );
  check(r['schema'] === 'ghostpay.confidential-asset/v1', 'P13_INVALID_ASSET', 'unknown schema');
  const protocolId = r['protocolId'];
  if (protocolId !== 'ct1-zama' && protocolId !== 'ctm-cleartext') fail('P13_UNSUPPORTED', 'protocol not available');
  const asset = decodeAssetRef(r['asset']);
  const underlying = decodeAssetRef(r['underlying']);
  check(asset.network === underlying.network, 'P13_INVALID_ASSET', 'asset and underlying on different networks');
  parseNetwork(asset.network, protocolId);
  check(asset.asset !== underlying.asset, 'P13_INVALID_ASSET', 'asset must differ from underlying');
  const expected = wrapperUnits(underlying.decimals);
  const rate = parseDecimalUnits(r['rate']);
  check(asset.decimals === expected.decimals && rate === expected.rate, 'P13_INVALID_ASSET', 'wrapper units mismatch');
  check(r['confidentiality'] === CONFIDENTIALITY_OF[protocolId], 'P13_INVALID_ASSET', 'confidentiality mismatch');
  const manifestDigest = assertDigest(r['manifestDigest']);
  check(manifestDigest === pinnedManifestDigest(protocolId), 'P13_MANIFEST_MISMATCH', 'asset bound to another manifest');
  const ids = dataArray(r['trustStatementIds'], MAX_TRUST_IDS, 'P13_INVALID_ASSET').map((id) =>
    matchString(id, /^[A-Z0-9_]{1,64}$/, 'P13_INVALID_ASSET'),
  );
  check(new Set(ids).size === ids.length, 'P13_INVALID_ASSET', 'duplicate trust statement');
  check(ids.every(isKnownCopyKey), 'P13_INVALID_ASSET', 'unknown trust statement');
  check(REQUIRED_TRUST_IDS[protocolId].every((k) => ids.includes(k)), 'P13_INVALID_ASSET', 'missing trust statement');
  return {
    schema: 'ghostpay.confidential-asset/v1',
    asset,
    underlying,
    rate: formatDecimalUnits(rate),
    protocolId,
    manifestDigest,
    confidentiality: CONFIDENTIALITY_OF[protocolId],
    trustStatementIds: ids,
  };
}

/** Chain id of a decoded asset. */
export function chainIdOf(asset: ConfidentialAssetV1): number {
  return parseNetwork(asset.asset.network, asset.protocolId);
}

/** Canonical digest of a decoded asset (binds plans and records to it). */
export function assetDigest(asset: ConfidentialAssetV1): Digest {
  return digestOf(asset);
}

/**
 * Requires `asset` to equal (canonically) one entry of the composition root's approved list.
 * @throws {P13Error} `P13_ASSET_NOT_APPROVED`; `P13_RECORD_LIMIT` for an oversized list.
 */
export function assertApprovedAsset(asset: ConfidentialAssetV1, approved: readonly ConfidentialAssetV1[]): void {
  check(approved.length <= MAX_APPROVED_ASSETS, 'P13_RECORD_LIMIT', 'approved list too long');
  const d = assetDigest(asset);
  check(approved.some((a) => assetDigest(a) === d), 'P13_ASSET_NOT_APPROVED', 'asset is not approved');
}
