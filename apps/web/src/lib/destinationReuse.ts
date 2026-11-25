import { bytesToHex, isAddress, keccak256, toBytes } from 'viem/utils';

const STORAGE_KEY = 'ghostpay.destination-review.v1';
const LIMIT = 128;
/** Every record is `<scoped destination>.<invoice or seller profile>`, both salted keccak-256. */
const ENTRY = /^[0-9a-f]{64}\.[0-9a-f]{64}$/;

type Candidate =
  | { readonly kind: 'invoice'; readonly payer: string; readonly invoiceDigest: string }
  | { readonly kind: 'sweep'; readonly metaAddress: string };
export type DestinationNotice = 'same-invoice' | 'different-invoice' | 'repeat-sweep' | 'other-profile-sweep' | 'unavailable';

interface History {
  salt: string;
  entries: string[];
}

function read(storage: Storage): History | undefined {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return undefined;
  if (raw.length > 18_000) throw new Error('Invalid destination history');
  const data = JSON.parse(raw) as Partial<History> | null;
  if (typeof data?.salt !== 'string' || !/^[0-9a-f]{32}$/.test(data.salt) ||
      !Array.isArray(data.entries) || data.entries.length > LIMIT ||
      !data.entries.every((entry) => typeof entry === 'string' && ENTRY.test(entry))) throw new Error('Invalid destination history');
  return { salt: data.salt, entries: data.entries };
}

/**
 * Compare the actual payment preview, or a manually entered sweep destination. The caller remembers only
 * deliberate payment previews and accepted sweep submissions. Synchronous tab storage keeps compare/update
 * together. Neither a hit nor a miss is evidence of an on-chain transfer.
 */
export function checkDestinationReuse(
  candidate: Candidate, chainId: number, destination: string, remember: boolean,
): DestinationNotice | undefined {
  try {
    const address = destination.trim();
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || address.length !== 42 || !isAddress(address)) return undefined;
    if (candidate.kind === 'invoice' && (!isAddress(candidate.payer) || !/^[0-9a-f]{64}$/.test(candidate.invoiceDigest))) return undefined;
    const storage = window.sessionStorage;
    const previous = read(storage);
    if (previous === undefined && !remember) return undefined;
    const history = previous ?? { salt: bytesToHex(crypto.getRandomValues(new Uint8Array(16))).slice(2), entries: [] };
    const digest = (parts: readonly (number | string)[]): string => keccak256(toBytes(JSON.stringify(parts))).slice(2);
    // Invoice: the destination is scoped to the payer account, the suffix to the signed invoice.
    // Sweep: the destination is scoped to the network only and the suffix to the seller profile, so a destination
    // used by another seller profile in this tab is recognised too (that sweep links the two profiles on-chain).
    const tag = candidate.kind === 'invoice'
      ? digest([history.salt, 'invoice', candidate.payer.toLowerCase(), chainId, address.toLowerCase()])
      : digest([history.salt, 'sweep-destination', chainId, address.toLowerCase()]);
    const entry = tag + '.' + digest([tag, candidate.kind === 'invoice' ? candidate.invoiceDigest : candidate.metaAddress]);
    const elsewhere = history.entries.some((e) => e.startsWith(tag + '.') && e !== entry);
    const again = history.entries.includes(entry);
    let notice: DestinationNotice | undefined;
    if (candidate.kind === 'invoice') notice = elsewhere ? 'different-invoice' : again ? 'same-invoice' : undefined;
    else notice = elsewhere ? 'other-profile-sweep' : again ? 'repeat-sweep' : undefined;
    if (remember) {
      const entries = [...history.entries.filter((e) => e !== entry), entry].slice(-LIMIT);
      try { storage.setItem(STORAGE_KEY, JSON.stringify({ salt: history.salt, entries })); }
      catch { return notice ?? 'unavailable'; }
    }
    return notice;
  } catch {
    // Optional advisory history can never veto a transaction, even when storage is denied or full.
    return 'unavailable';
  }
}

/**
 * True when a sweep destination is another one-time address that received a payment for these keys (from the
 * current scan's matches). Sweeping into it links both payments on-chain, and that payment's payer knows the address.
 * Local comparison only; malformed input is never a match.
 */
export function isOwnOneTimeAddress(destination: string, ownAddresses: readonly string[]): boolean {
  const address = typeof destination === 'string' ? destination.trim() : '';
  if (address.length !== 42 || !isAddress(address)) return false;
  const wanted = address.toLowerCase();
  return ownAddresses.some((own) => typeof own === 'string' && own.toLowerCase() === wanted);
}
