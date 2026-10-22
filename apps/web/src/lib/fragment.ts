import { FRAGMENT_PREFIX } from '@ghostpay/invoice-schema';

/** Minimal slice of `Location`/`History` so tests can inject fakes. */
export interface LocationLike {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}
export interface HistoryLike {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/** Returns the invoice fragment if (and only if) the hash looks like one. The value is never logged. */
export function readInvoiceFragment(loc: LocationLike): string | undefined {
  return loc.hash.startsWith(FRAGMENT_PREFIX) ? loc.hash : undefined;
}

/** Replaces the current history entry with the same URL minus the fragment. */
export function clearFragment(loc: LocationLike, hist: HistoryLike): void {
  hist.replaceState(null, '', `${loc.pathname}${loc.search}`);
}

/** Normalizes pasted text (full link or bare fragment) into a `#gpi=v1.` fragment. */
export function extractFragment(input: string): string | undefined {
  const trimmed = input.trim();
  const idx = trimmed.indexOf(FRAGMENT_PREFIX);
  if (idx === -1) return undefined;
  const frag = trimmed.slice(idx);
  return /\s/.test(frag) ? undefined : frag;
}
