import { FRAGMENT_PREFIX } from '@ghostpay/invoice-schema';

/** Minimal slice of `Location`/`History` so tests can inject fakes. */
export interface LocationLike {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}
export interface HistoryLike {
  readonly state?: unknown;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/** Returns the invoice fragment if (and only if) the hash looks like one. The value is never logged. */
export function readInvoiceFragment(loc: LocationLike): string | undefined {
  return loc.hash.startsWith(FRAGMENT_PREFIX) ? loc.hash : undefined;
}

/** Replaces the current history entry with the same URL minus the fragment. */
export function clearFragment(loc: LocationLike, hist: HistoryLike): void {
  // A pathname beginning "//" is still local, but used as a relative URL it names another host.
  // Prefix a removable dot segment so replaceState keeps this origin and actually clears the secret.
  const pathname = loc.pathname.startsWith('//') ? `/.${loc.pathname}` : loc.pathname;
  // Preserve the same-entry router state; only strip the sensitive fragment from its URL.
  hist.replaceState(hist.state ?? null, '', `${pathname}${loc.search}`);
}

/** Normalizes pasted text (full link or bare fragment) into a `#gpi=v1.` fragment. */
export function extractFragment(input: string): string | undefined {
  const trimmed = input.trim();
  // URL() silently discards tabs/newlines; reject them before it can change the invoice hash.
  if (/\s/.test(trimmed)) return undefined;
  let fragment: string;
  if (trimmed.startsWith(FRAGMENT_PREFIX)) {
    fragment = trimmed;
  } else {
    // Treat pasted links as URLs, not arbitrary text containing an invoice marker.
    // Preserve the HTTP(S) links supported by the SDK and local deployments.
    // This only extracts text; the QR importer has its own stricter URL policy.
    if (!/^https?:\/\//i.test(trimmed)) return undefined;
    let url: URL;
    try { url = new URL(trimmed); } catch { return undefined; }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) return undefined;
    fragment = url.hash;
  }
  return /^#gpi=v1\.[A-Za-z0-9_-]+$/.test(fragment) ? fragment : undefined;
}
