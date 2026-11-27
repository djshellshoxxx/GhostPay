import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Hex, ScanAnnouncement } from './types.js';

const MAX_METADATA_BYTES = 4096;
const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

function hexField(v: unknown, bytes: number | undefined): Hex | undefined {
  if (typeof v !== 'string' || !HEX_BYTES.test(v)) return undefined;
  const len = (v.length - 2) / 2;
  if (bytes !== undefined ? len !== bytes : len < 1 || len > MAX_METADATA_BYTES) return undefined;
  return v.toLowerCase() as Hex;
}

function bigField(v: unknown): bigint | undefined {
  if (typeof v === 'bigint') return v >= 0n && v <= U64_MAX ? v : undefined;
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : undefined;
  if (typeof v === 'string' && /^(?:0|[1-9][0-9]{0,19})$/.test(v)) {
    const b = BigInt(v);
    return b <= U64_MAX ? b : undefined;
  }
  return undefined;
}

/**
 * Strict structural validation of one untrusted announcement record (NP-S-1). Normalises hex to lowercase,
 * recomputes `id`. Returns `undefined` for anything malformed: callers drop it and count it.
 *
 * @security Never throws on hostile input and never echoes it. The on-chain content checks of
 * chain-adapters' `validateAnnouncementLog` (curve point, address derivation) are the app's second layer.
 */
export function parseAnnouncement(raw: unknown, schemeId = 1n): ScanAnnouncement | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  // Injected scan-source adapters can return getter-backed or revoked Proxy records.
  // A failed read invalidates this record; it must not interrupt the entire scan.
  try {
    const r = raw as Record<string, unknown>;
    const scheme = bigField(r['schemeId']);
    const blockNumber = bigField(r['blockNumber']);
    const logIndex = r['logIndex'];
    const stealthAddress = hexField(r['stealthAddress'], 20);
    const caller = hexField(r['caller'], 20);
    const ephemeralPublicKey = hexField(r['ephemeralPublicKey'], 33);
    const metadata = hexField(r['metadata'], undefined);
    const blockHash = hexField(r['blockHash'], 32);
    if (scheme === undefined || scheme !== schemeId || blockNumber === undefined) return undefined;
    if (typeof logIndex !== 'number' || !Number.isInteger(logIndex) || logIndex < 0 || logIndex > 0xffff_ffff) return undefined;
    if (!stealthAddress || !caller || !ephemeralPublicKey || !metadata || !blockHash) return undefined;
    // Optional: lets the app fetch the receipt that binds a router payment to this exact log. A malformed value is dropped,
    // never trusted, and does not reject the record (the hash is not part of the announcement's identity).
    const transactionHash = hexField(r['transactionHash'], 32);
    return {
      ...(transactionHash === undefined ? {} : { transactionHash }),
      schemeId: scheme,
      stealthAddress,
      caller,
      ephemeralPublicKey,
      metadata,
      blockNumber,
      blockHash,
      logIndex,
      id: `${blockHash}:${String(logIndex)}`,
    };
  } catch {
    return undefined;
  }
}

/** A scheme id as the announcer can emit it (any uint256): wider than the 64 bits a usable record may hold. */
function schemeClaim(v: unknown): bigint | undefined {
  const b = typeof v === 'bigint' ? v
    : (typeof v === 'number' && Number.isInteger(v)) || (typeof v === 'string' && /^(?:0|[1-9][0-9]{0,77})$/.test(v)) ? BigInt(v)
      : undefined;
  return b !== undefined && b >= 0n && b <= U256_MAX ? b : undefined;
}

/** The block and scheme an untrusted record claims, each only as far as it can be read. Never throws. */
export function claimedPlace(raw: unknown): { readonly blockNumber: bigint | undefined; readonly schemeId: bigint | undefined } {
  try {
    const r = raw as Record<string, unknown>;
    return { blockNumber: bigField(r['blockNumber']), schemeId: schemeClaim(r['schemeId']) };
  } catch {
    return { blockNumber: undefined, schemeId: undefined };
  }
}

/**
 * Where a record sits when its only fault is the length of its ephemeral key or metadata: any caller of the announcer
 * can post such bytes. `undefined` for every other record, including one whose bytes are not well-formed hex. Never
 * throws.
 */
export function postedBytesPlace(raw: unknown, schemeId: bigint): { readonly blockNumber: bigint; readonly blockHash: Hex } | undefined {
  try {
    const r = raw as Record<string, unknown>;
    const key = r['ephemeralPublicKey'];
    const metadata = r['metadata'];
    if (typeof key !== 'string' || typeof metadata !== 'string' || !HEX_BYTES.test(key) || !HEX_BYTES.test(metadata)) return undefined;
    // With acceptable bytes in their place, every other field must pass.
    const rest = parseAnnouncement({ ...r, ephemeralPublicKey: `0x${'00'.repeat(33)}`, metadata: '0x00' }, schemeId);
    return rest === undefined ? undefined : { blockNumber: rest.blockNumber, blockHash: rest.blockHash };
  } catch {
    return undefined;
  }
}

/** Sorts by `(blockNumber, logIndex)` and removes duplicate ids and records outside `[from, to]`. Returns the dropped count. */
export function normalizeSet(
  anns: readonly ScanAnnouncement[],
  from: bigint,
  to: bigint,
): { announcements: ScanAnnouncement[]; dropped: number } {
  const seen = new Set<string>();
  const out: ScanAnnouncement[] = [];
  let dropped = 0;
  for (const a of anns) {
    if (a.blockNumber < from || a.blockNumber > to || seen.has(a.id)) {
      dropped++;
      continue;
    }
    seen.add(a.id);
    out.push(a);
  }
  out.sort((x, y) => (x.blockNumber < y.blockNumber ? -1 : x.blockNumber > y.blockNumber ? 1 : x.logIndex - y.logIndex));
  return { announcements: out, dropped };
}

/** Canonical hash of an announcement set (used by the quorum source). Length-prefixed fields, sorted order. */
export function setHash(anns: readonly ScanAnnouncement[]): string {
  const sorted = [...anns].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const parts = sorted.map((a) =>
    sha256(
      utf8ToBytes(
        [a.schemeId.toString(), a.stealthAddress, a.caller, a.ephemeralPublicKey, a.metadata, a.blockNumber.toString(), a.blockHash, String(a.logIndex)].join('|'),
      ),
    ),
  );
  return bytesToHex(sha256(concatBytes(...parts)));
}
