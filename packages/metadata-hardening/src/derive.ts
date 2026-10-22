import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js';
import {
  encodeMetaAddress,
  generateKeySet,
  zeroize,
  type CompressedPoint,
  type RandomSource,
  type SecretScalar,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { assertTestnetChain, MetadataHardeningError, requireInput } from './guard.js';

const enc = new TextEncoder();
const MAX_RANGE = 10_000;
const U32_MAX = 0xffff_ffff;

/**
 * Which key the invoice `signer` comes from.
 *
 * - `per-invoice`: new signer per invoice (and per chain when a chain is given). Defeats signer
 *   linking, but buyers' pinned-signer trust (`pinnedSigners`) no longer works.
 * - `per-chain`: one signer per chain (needs `chainId`).
 * - `long-lived`: one signer for the whole seed. Pinning works; every invoice stays linkable by it.
 */
export type SignerMode = 'per-invoice' | 'per-chain' | 'long-lived';

/** Options for {@link deriveInvoiceKeys}. */
export interface DeriveOptions {
  /** MH-ID-2: when set, keys are domain-separated per chain (testnet chains only). */
  readonly chainId?: number;
  /** Default `per-invoice`. */
  readonly signerMode?: SignerMode;
}

/** Signing key pair for invoice `signer`. */
export interface SignerKey {
  readonly publicKey: CompressedPoint;
  /** Redacting secret; throws if serialised or logged. */
  readonly secret: SecretScalar;
}

/** Result of {@link deriveInvoiceKeys}. */
export interface InvoiceKeys {
  readonly index: number;
  readonly chainId: number | undefined;
  /** `st:eth:0x...` meta-address for this invoice. */
  readonly metaAddress: string;
  readonly keys: StealthKeySet;
  readonly signer: SignerKey;
  readonly signerMode: SignerMode;
  /** Honest UI strings: what still links invoices (PO-COR-4, spec MH-ID-1 R5). */
  readonly linkability: readonly string[];
}

function checkSeed(seed: Uint8Array): void {
  requireInput(seed instanceof Uint8Array && seed.length >= 32, 'seed must be at least 32 bytes');
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function infoFor(role: string, chainId: number | undefined, index: number | undefined): Uint8Array {
  const chainPart = chainId === undefined ? new Uint8Array([0]) : concatBytes(new Uint8Array([1]), u32(chainId));
  const indexPart = index === undefined ? new Uint8Array([0]) : concatBytes(new Uint8Array([1]), u32(index));
  const label = chainId === undefined ? 'ghostpay/mh/id/v1' : 'ghostpay/mh/chain/v1';
  return concatBytes(enc.encode(label), new Uint8Array([0]), enc.encode(role), new Uint8Array([0]), chainPart, indexPart);
}

/**
 * Deterministic byte stream: block j = HKDF-SHA256(seed, info || u32be(j)). Fed to core-crypto's
 * own rejection sampler through its `RandomSource` hook, so no curve code is duplicated here.
 */
function streamRng(seed: Uint8Array, info: Uint8Array): RandomSource {
  let counter = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let off = 0; off < view.length; off += 32) {
        const block = hkdf(sha256, seed, undefined, concatBytes(info, u32(counter++)), 32);
        view.set(block.subarray(0, Math.min(32, view.length - off)), off);
        block.fill(0);
      }
      return array;
    },
  };
}

function deriveKeySet(seed: Uint8Array, role: string, chainId: number | undefined, index: number | undefined): StealthKeySet {
  return generateKeySet(streamRng(seed, infoFor(role, chainId, index)));
}

function deriveSigner(seed: Uint8Array, mode: SignerMode, chainId: number | undefined, index: number): SignerKey {
  let ks: StealthKeySet;
  if (mode === 'per-invoice') ks = deriveKeySet(seed, 'signer', chainId, index);
  else if (mode === 'per-chain') ks = deriveKeySet(seed, 'signer', chainId, undefined);
  else ks = deriveKeySet(seed, 'signer', undefined, undefined);
  zeroize(ks.viewingSecret);
  return { publicKey: ks.spendingPublicKey, secret: ks.spendingSecret };
}

/**
 * MH-ID-1 / MH-ID-2: derives the key set, meta-address and signer for invoice number `index`.
 *
 * @remarks Deterministic from `seed`: stealth keys come from HKDF-SHA256 blocks (domain
 * `ghostpay/mh/id/v1`, or `ghostpay/mh/chain/v1` plus big-endian chain id when `chainId` is
 * given), reduced into [1, n-1] by core-crypto's rejection sampler. Spending and viewing keys use
 * the same stream, so they differ; the signer uses its own role label. Output meta-addresses pass
 * `decodeMetaAddress`.
 *
 * Does NOT hide: same payer wallet, router use, sweeps to one destination, a channel that carries
 * two invoices, timing. With `signerMode: 'long-lived'` or `'per-chain'` invoices stay linkable
 * through the shared signer (see `linkability`).
 *
 * @param seed At least 32 bytes of seed entropy held by the seller's encrypted keystore.
 * @param index Invoice index, integer in [0, 2^32-1].
 * @param options Chain scoping and signer mode.
 * @throws {MetadataHardeningError} `INVALID_INPUT`, `UNSUPPORTED_CHAIN`.
 * @security Never persist or log `keys`/`signer.secret`; they are redacting wrappers. The seed is a
 * root secret: store only encrypted. Legacy random keys cannot be derived retroactively.
 */
export function deriveInvoiceKeys(seed: Uint8Array, index: number, options: DeriveOptions = {}): InvoiceKeys {
  checkSeed(seed);
  requireInput(Number.isInteger(index) && index >= 0 && index <= U32_MAX, 'index out of range');
  const { chainId } = options;
  if (chainId !== undefined) assertTestnetChain(chainId);
  const signerMode = options.signerMode ?? 'per-invoice';
  if (signerMode === 'per-chain' && chainId === undefined) {
    throw new MetadataHardeningError('INVALID_INPUT', 'per-chain signer needs a chain id');
  }
  const keys = deriveKeySet(seed, 'stealth', chainId, index);
  const signer = deriveSigner(seed, signerMode, chainId, index);
  const linkability: string[] = [];
  if (signerMode === 'long-lived') {
    linkability.push('All invoices from this seller still share one signer key, so they stay linkable through it.');
  } else if (signerMode === 'per-chain') {
    linkability.push('Invoices on the same chain still share one signer key, so they stay linkable through it.');
  } else {
    linkability.push('Buyers cannot pin this seller by signer: each invoice has a new signer key.');
  }
  linkability.push(
    'Payments still use the same router and payer wallet; sweeps to one destination re-link them; an out-of-band channel carrying two invoices links them.',
  );
  return {
    index,
    chainId,
    metaAddress: encodeMetaAddress(keys),
    keys,
    signer,
    signerMode,
    linkability,
  };
}

/** MH-ID-2 convenience: per-chain keys for invoice index 0 combined with per-chain signer. */
export function deriveChainKeys(seed: Uint8Array, chainId: number): InvoiceKeys {
  return deriveInvoiceKeys(seed, 0, { chainId, signerMode: 'per-chain' });
}

/**
 * Recovery/scan helper: derives keys for `from .. from+count-1` (at most 10 000).
 *
 * @security A scanner holds one ECDH per announcement per active key: cost grows linearly in
 * `count` (research 4.8).
 */
export function deriveInvoiceKeyRange(
  seed: Uint8Array,
  from: number,
  count: number,
  options: DeriveOptions = {},
): InvoiceKeys[] {
  requireInput(Number.isInteger(count) && count >= 0 && count <= MAX_RANGE, 'count out of range');
  requireInput(Number.isInteger(from) && from >= 0 && from + count - 1 <= U32_MAX, 'range out of bounds');
  const out: InvoiceKeys[] = [];
  for (let i = 0; i < count; i++) out.push(deriveInvoiceKeys(seed, from + i, options));
  return out;
}

/** Hex form of a public key, for tests and display. */
export function publicKeyHex(k: CompressedPoint): string {
  return bytesToHex(k);
}
