import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * SHA-256 of the entry script this page was loaded with, fetched from the same origin. It lets a user compare the
 * running release with the hashes the maintainers publish (it cannot detect a host that serves different bytes
 * to this fetch than to the page load; see the About page).
 *
 * `baseUrl` is the document's base URL (`document.baseURI`), not just its origin: the build references the entry as
 * `./assets/...`, which must resolve inside a sub-path such as a GitHub project site's `/GhostPay/`.
 */
export async function computeReleaseHash(
  scriptUrl: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  baseUrl: string,
): Promise<{ readonly file: string; readonly sha256: string }> {
  const base = new URL(baseUrl);
  const u = new URL(scriptUrl, base);
  if (u.origin !== base.origin) throw new Error('cross-origin script');
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
