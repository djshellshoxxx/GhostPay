import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * SHA-256 of the entry script this page was loaded with, fetched from the same origin. It lets a user compare the
 * running release with the hashes the maintainers publish (it cannot detect a host that serves different bytes
 * to this fetch than to the page load; see the About page).
 */
export async function computeReleaseHash(
  scriptUrl: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  origin: string,
): Promise<{ readonly file: string; readonly sha256: string }> {
  const u = new URL(scriptUrl, origin);
  if (u.origin !== origin) throw new Error('cross-origin script');
  const res = await fetchFn(u.href, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('fetch failed');
  const buf = await res.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return { file: u.pathname.split('/').pop() ?? u.pathname, sha256: bytesToHex(digest) };
}

/** URL of the first module script on the page (the app entry), or undefined. */
export function entryScriptUrl(doc: Pick<Document, 'querySelectorAll'>): string | undefined {
  const el = Array.from(doc.querySelectorAll('script[type="module"][src]')).find((e) => e.getAttribute('src') !== null);
  return el?.getAttribute('src') ?? undefined;
}
