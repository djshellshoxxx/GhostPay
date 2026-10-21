import { isAddress } from 'viem';
import { assertTestnetChain, MetadataHardeningError, randomInt, requireInput, type RandomSource } from './guard.js';

/** ERC-5564 canonical announcer (CONTRACTS_SPEC header). */
export const CANONICAL_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
/** GhostPay experimental policy scheme id: a pure fingerprint (MH-ANN-2). */
export const GHOSTPAY_FINGERPRINT_SCHEME_ID = 0x47500002n;
/** Router metadata length: `tag | 0xa9059cbb | token | net`. */
export const ROUTER_METADATA_LENGTH = 57;

/** MH-TAG-1/2 view-tag handling. `full` is the default and keeps ERC-5564 interop. */
export type TagMode =
  | { readonly kind: 'full' }
  | { readonly kind: 'ignore' }
  | { readonly kind: 'mask'; readonly bits: number };

/**
 * Parses `'full' | 'ignore' | 'mask:k'` (k in 1..7).
 *
 * @throws {MetadataHardeningError} `INVALID_INPUT` for anything else.
 */
export function parseTagMode(s: string): TagMode {
  if (s === 'full') return { kind: 'full' };
  if (s === 'ignore') return { kind: 'ignore' };
  const m = /^mask:([1-7])$/.exec(s);
  if (m?.[1] === undefined) throw new MetadataHardeningError('INVALID_INPUT', 'unknown tag mode');
  return { kind: 'mask', bits: Number(m[1]) };
}

/** UI copy for a tag mode. Normative "does NOT" text for MH-TAG-2 (spec). */
export function describeTagMode(mode: TagMode): string {
  if (mode.kind === 'full') return 'Full view tag (default). Keeps compatibility with other ERC-5564 wallets.';
  return (
    'Reduced view tag: removes some bits of a shared-secret hash from public data (benefit is marginal). ' +
    'Other wallets may not detect this payment, and scanning is slower. It hides nothing else.'
  );
}

function highMask(bits: number): number {
  return (0xff << (8 - bits)) & 0xff;
}

function checkByte(b: number): void {
  requireInput(Number.isInteger(b) && b >= 0 && b <= 255, 'view tag must be a byte');
}

/**
 * Sender side: the byte to write at `metadata[0]` for a given mode.
 *
 * @remarks `full`: the real tag. `ignore`: constant 0x00. `mask:k`: top k bits of the real tag,
 * low 8-k bits random (CSPRNG).
 *
 * @param trueTag Real view tag `keccak256(S)[0]`.
 * @security Reduced modes break detection by wallets that reject on tag mismatch (funds look lost
 * there). Both sides must use the same mode.
 */
export function encodeViewTagByte(trueTag: number, mode: TagMode, rng?: RandomSource): number {
  checkByte(trueTag);
  if (mode.kind === 'full') return trueTag;
  if (mode.kind === 'ignore') return 0;
  const hm = highMask(mode.bits);
  const low = randomInt(1 << (8 - mode.bits), rng);
  return (trueTag & hm) | low;
}

/**
 * Scanner side: does the announced tag byte allow this payment through the early filter?
 *
 * @remarks `ignore` always passes (caller must then do the full address compare). `mask` compares
 * the kept high bits only, so there are no false negatives for payments written in the same mode.
 */
export function viewTagAccepts(announced: number, trueTag: number, mode: TagMode): boolean {
  checkByte(announced);
  checkByte(trueTag);
  if (mode.kind === 'full') return announced === trueTag;
  if (mode.kind === 'ignore') return true;
  const hm = highMask(mode.bits);
  return (announced & hm) === (trueTag & hm);
}

/**
 * MH-ANN-3: one-byte metadata (view tag only).
 *
 * @security Never valid for router payments (router forces 57 bytes). The amount is then only
 * readable from the token `Transfer` log or a balance read: show it as unverified.
 */
export function buildMinimalMetadata(viewTag: number): Uint8Array {
  checkByte(viewTag);
  return new Uint8Array([viewTag]);
}

/** Result of {@link classifyMetadata}. */
export interface MetadataClass {
  readonly accepted: boolean;
  /** `'router-57'`: payload amount present; `'unverified'`: amount must be read from transfer. */
  readonly amountStatus: 'router-metadata' | 'unverified' | 'none';
  readonly reason?: 'ROUTER_NEEDS_57' | 'EMPTY';
}

/**
 * MH-ANN-3 R2/R3: scanner acceptance rule by metadata length and caller.
 *
 * @param lengthBytes Metadata length.
 * @param viaRouter True when the announcement `caller` is the router.
 */
export function classifyMetadata(lengthBytes: number, viaRouter: boolean): MetadataClass {
  if (!Number.isInteger(lengthBytes) || lengthBytes < 1) {
    return { accepted: false, amountStatus: 'none', reason: 'EMPTY' };
  }
  if (viaRouter) {
    return lengthBytes === ROUTER_METADATA_LENGTH
      ? { accepted: true, amountStatus: 'router-metadata' }
      : { accepted: false, amountStatus: 'none', reason: 'ROUTER_NEEDS_57' };
  }
  return { accepted: true, amountStatus: 'unverified' };
}

/** Scheme acceptance policy for the scanner (MH-ANN-1 R3, MH-ANN-2 R2). */
export interface SchemePolicy {
  readonly accepted: readonly bigint[];
}

/**
 * Builds the accepted scheme list: always `[1n]`; an extra id only with the explicit unsafe flag.
 *
 * @security MH-ANN-2 hides nothing: a custom id makes payments easier to find and breaks interop.
 */
export function resolveSchemePolicy(opts: { unsafeFingerprintScheme?: boolean; extraSchemeId?: bigint } = {}): SchemePolicy {
  const { extraSchemeId } = opts;
  if (extraSchemeId === undefined) return { accepted: [1n] };
  if (opts.unsafeFingerprintScheme !== true) {
    throw new MetadataHardeningError('POLICY_REJECTED', 'custom scheme id needs unsafeFingerprintScheme (makes payments easier to find)');
  }
  requireInput(extraSchemeId > 1n && extraSchemeId < 1n << 64n, 'scheme id out of range');
  return { accepted: [1n, extraSchemeId] };
}

/** True when `schemeId` is accepted by `policy`. */
export function isAcceptedScheme(schemeId: bigint, policy: SchemePolicy): boolean {
  return policy.accepted.includes(schemeId);
}

/** Result of {@link validateAnnouncerConfig}. */
export interface AnnouncerCheck {
  readonly announcer: string;
  readonly canonical: boolean;
}

/**
 * MH-ANN-1 R1 (testnet form): announcer must be an explicit valid address on a testnet chain;
 * reports whether it is the canonical ERC-5564 address.
 */
export function validateAnnouncerConfig(chainId: number, announcer: string): AnnouncerCheck {
  assertTestnetChain(chainId);
  if (!isAddress(announcer, { strict: true })) {
    throw new MetadataHardeningError('INVALID_INPUT', 'announcer is not a valid address');
  }
  return { announcer, canonical: announcer.toLowerCase() === CANONICAL_ANNOUNCER.toLowerCase() };
}
