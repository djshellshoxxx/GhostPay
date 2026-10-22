import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { PirError, requireArg } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import { MAX_PAGES } from './xor.js';

/**
 * Public description of a page database (JSON-safe: block numbers are decimal strings).
 * `leafHashes[i] = sha256(page_i)`; `root` is an RFC 6962-style Merkle root over them.
 */
export interface Manifest {
  readonly version: 1;
  readonly chainId: number;
  readonly pageBytes: number;
  readonly nPages: number;
  /** 0x-hex 32 bytes. */
  readonly root: string;
  /** 0x-hex 32 bytes each. */
  readonly leafHashes: readonly string[];
  /** 0x-hex hash of block `toBlock`, or null when the publisher did not supply one. */
  readonly headHash: string | null;
  readonly fromBlock: string;
  readonly toBlock: string;
  /** Per page: `[firstBlock, lastBlock]` of its records (decimal strings) or null for an empty page. */
  readonly pageRanges: readonly (readonly [string, string] | null)[];
}

const HEX32 = /^0x[0-9a-f]{64}$/;
const DEC = /^(?:0|[1-9][0-9]{0,19})$/;

/** SHA-256 of a page: the Merkle leaf value and the value `verifyPage` compares against. */
export function leafHash(page: Uint8Array): Uint8Array {
  return sha256(page);
}

function mth(leaves: readonly Uint8Array[], lo: number, hi: number): Uint8Array {
  const n = hi - lo;
  if (n === 1) return sha256(concatBytes(Uint8Array.of(0), leaves[lo] as Uint8Array));
  let k = 1;
  while (k * 2 < n) k *= 2;
  return sha256(concatBytes(Uint8Array.of(1), mth(leaves, lo, lo + k), mth(leaves, lo + k, hi)));
}

/** Merkle root (RFC 6962 hashing with 0x00 leaf / 0x01 node domain separation) over 32-byte leaf hashes. */
export function merkleRoot(leaves: readonly Uint8Array[]): Uint8Array {
  requireArg(leaves.length >= 1 && leaves.length <= MAX_PAGES, 'leaf count out of range');
  for (const l of leaves) requireArg(l.length === 32, 'leaf must be 32 bytes');
  return mth(leaves, 0, leaves.length);
}

/** @internal Builds a manifest from finished pages. */
export function buildManifest(
  pages: readonly Uint8Array[],
  shard: { chainId: number; fromBlock: bigint; toBlock: bigint; headHash?: string },
  ranges: readonly ([bigint, bigint] | null)[],
): Manifest {
  const leaves = pages.map(leafHash);
  if (shard.headHash !== undefined) requireArg(HEX32.test(shard.headHash), 'headHash must be lowercase 0x-hex 32 bytes');
  return {
    version: 1,
    chainId: shard.chainId,
    pageBytes: pages[0]?.length ?? 0,
    nPages: pages.length,
    root: `0x${bytesToHex(merkleRoot(leaves))}`,
    leafHashes: leaves.map((l) => `0x${bytesToHex(l)}`),
    headHash: shard.headHash ?? null,
    fromBlock: shard.fromBlock.toString(),
    toBlock: shard.toBlock.toString(),
    pageRanges: ranges.map((r) => (r === null ? null : ([r[0].toString(), r[1].toString()] as const))),
  };
}

/**
 * Checks a page against the manifest leaf hashes (spec NP-P-6: `sha256(page) == leafHashes[i]`).
 *
 * @security Uses the whole leaf list fetched once per epoch, NOT a per-page Merkle path: requesting a
 * path for page `i` would reveal `i`. Constant-time comparison is not needed (public data).
 */
export function verifyPage(page: Uint8Array, index: number, leafHashes: readonly Uint8Array[]): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= leafHashes.length) return false;
  const want = leafHashes[index] as Uint8Array;
  const got = leafHash(page);
  if (want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= (got[i] ?? 0) ^ (want[i] ?? 0);
  return diff === 0;
}

/** Decoded leaf hashes of a manifest. */
export function manifestLeaves(m: Manifest): Uint8Array[] {
  return m.leafHashes.map((h) => hexToBytes(h.slice(2)));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Strictly parses and validates an untrusted manifest (e.g. a server's JSON): shape, testnet chain,
 * bounds, root recomputed from the leaves, per-page range sanity.
 *
 * @security Never trusts the server's `root`: it is recomputed. Errors are fixed text.
 * @throws PirError `MANIFEST_MISMATCH` (malformed / inconsistent) or `TESTNET_ONLY`.
 */
export function parseManifest(raw: unknown): Manifest {
  const bad = (): never => {
    throw new PirError('MANIFEST_MISMATCH', 'malformed manifest');
  };
  if (!isObj(raw) || raw['version'] !== 1) return bad();
  const { chainId, pageBytes, nPages, root, leafHashes, headHash, fromBlock, toBlock, pageRanges } = raw;
  if (typeof chainId !== 'number') return bad();
  assertTestnetChainId(chainId);
  if (!Number.isInteger(pageBytes) || (pageBytes as number) < 256 || (pageBytes as number) > (1 << 20)) return bad();
  if (!Number.isInteger(nPages) || (nPages as number) < 1 || (nPages as number) > MAX_PAGES) return bad();
  if (typeof root !== 'string' || !HEX32.test(root)) return bad();
  if (!Array.isArray(leafHashes) || leafHashes.length !== nPages) return bad();
  if (!leafHashes.every((h) => typeof h === 'string' && HEX32.test(h))) return bad();
  if (headHash !== null && !(typeof headHash === 'string' && HEX32.test(headHash))) return bad();
  if (typeof fromBlock !== 'string' || !DEC.test(fromBlock) || typeof toBlock !== 'string' || !DEC.test(toBlock)) return bad();
  const from = BigInt(fromBlock);
  const to = BigInt(toBlock);
  if (from > to || to >= 1n << 64n) return bad();
  if (!Array.isArray(pageRanges) || pageRanges.length !== nPages) return bad();
  const ranges: (readonly [string, string] | null)[] = [];
  for (const r of pageRanges as unknown[]) {
    if (r === null) {
      ranges.push(null);
      continue;
    }
    if (!Array.isArray(r) || r.length !== 2) return bad();
    const [a, b] = r as unknown[];
    if (typeof a !== 'string' || typeof b !== 'string' || !DEC.test(a) || !DEC.test(b)) return bad();
    if (BigInt(a) < from || BigInt(b) > to || BigInt(a) > BigInt(b)) return bad();
    ranges.push([a, b]);
  }
  const leaves = (leafHashes as string[]).map((h) => hexToBytes(h.slice(2)));
  if (`0x${bytesToHex(merkleRoot(leaves))}` !== root) return bad();
  return {
    version: 1,
    chainId,
    pageBytes: pageBytes as number,
    nPages: nPages,
    root,
    leafHashes: leafHashes as string[],
    headHash: headHash,
    fromBlock,
    toBlock,
    pageRanges: ranges,
  };
}

/** Deep equality of two parsed manifests (every field, including leaf hashes and page ranges). */
export function manifestsEqual(a: Manifest, b: Manifest): boolean {
  if (
    a.chainId !== b.chainId || a.pageBytes !== b.pageBytes || a.nPages !== b.nPages || a.root !== b.root ||
    a.headHash !== b.headHash || a.fromBlock !== b.fromBlock || a.toBlock !== b.toBlock
  ) {
    return false;
  }
  for (let i = 0; i < a.nPages; i++) {
    if (a.leafHashes[i] !== b.leafHashes[i]) return false;
    const x = a.pageRanges[i] ?? null;
    const y = b.pageRanges[i] ?? null;
    if ((x === null) !== (y === null)) return false;
    if (x !== null && y !== null && (x[0] !== y[0] || x[1] !== y[1])) return false;
  }
  return true;
}
