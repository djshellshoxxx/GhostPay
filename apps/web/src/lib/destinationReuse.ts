import { bytesToHex, isAddress, keccak256, toBytes } from 'viem/utils';

const STORAGE_KEY = 'ghostpay.destination-review.v1';
const LIMIT = 128;
const ENTRY = /^[0-9a-f]{64}(?:\.[0-9a-f]{64})?$/;

type Candidate =
  | { readonly kind: 'invoice'; readonly payer: string; readonly invoiceDigest: string }
  | { readonly kind: 'sweep'; readonly metaAddress: string };
export type DestinationNotice = 'same-invoice' | 'different-invoice' | 'repeat-sweep' | 'unavailable';

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
    const account = candidate.kind === 'invoice' ? candidate.payer.toLowerCase() : candidate.metaAddress;
    const digest = (parts: readonly (number | string)[]): string => keccak256(toBytes(JSON.stringify(parts))).slice(2);
    const tag = digest([history.salt, candidate.kind, account, chainId, address.toLowerCase()]);
    let entry = tag;
    let notice: DestinationNotice | undefined;
    if (candidate.kind === 'invoice') {
      entry = tag + '.' + digest([tag, candidate.invoiceDigest]);
      if (history.entries.some((e) => e.startsWith(tag + '.') && e !== entry)) notice = 'different-invoice';
      else if (history.entries.includes(entry)) notice = 'same-invoice';
    } else if (history.entries.includes(tag)) notice = 'repeat-sweep';
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
