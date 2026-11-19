import { bytesToHex } from '@noble/hashes/utils.js';

const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
const HASH_TIMEOUT_MS = 15_000;

/** Cleanup is best-effort: a custom stream must not keep a failed request pending. */
function cancelBody(body: ReadableStream<Uint8Array> | null | undefined): void {
  try { void body?.cancel().catch(() => undefined); } catch { /* Already locked or closed. */ }
}

/**
 * SHA-256 of the entry script this page was loaded with, fetched from the same origin. It lets a user compare the
 * running release with the hashes the maintainers publish (it cannot detect a host that serves different bytes
 * to this fetch than to the page load; see the About page).
 *
 * `baseUrl` is the document's base URL (`document.baseURI`), not just its origin: the build references the entry as
 * `./assets/...`, which must resolve inside a sub-path such as a GitHub project site's `/GhostPay/`.
 * The automatic read never follows redirects, sends credentials or retries. Its 8 MiB body and 15 s deadline are
 * bounded even for an injected fetch/stream that ignores AbortSignal. The host remains trusted to serve the app.
 */
export async function computeReleaseHash(
  scriptUrl: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  baseUrl: string,
): Promise<{ readonly file: string; readonly sha256: string }> {
  let base: URL;
  let u: URL;
  try {
    base = new URL(baseUrl);
    u = new URL(scriptUrl, base);
  } catch {
    throw new Error('script URL rejected');
  }
  if (u.origin !== base.origin) throw new Error('cross-origin script');
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username !== '' || u.password !== '' || u.hash !== '') {
    throw new Error('script URL rejected');
  }
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  let bodyComplete = false;
  let rejectDeadline: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = () => { reject(new Error('fetch failed')); };
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectDeadline?.();
  }, HASH_TIMEOUT_MS);
  try {
    const pending = fetchFn(u.href, {
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', mode: 'same-origin', signal: controller.signal,
    }).then((res) => {
      // A custom fetch may resolve after our deadline; dispose of its body without starting a read.
      if (controller.signal.aborted) cancelBody(res.body);
      return res;
    });
    response = await Promise.race([pending, deadline]);
    if (!response.ok || response.redirected || (response.url !== '' && new URL(response.url).origin !== base.origin)) {
      throw new Error('fetch failed');
    }
    if (Number(response.headers.get('content-length')) > MAX_SCRIPT_BYTES || response.body === null) {
      throw new Error('fetch failed');
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) {
        bodyComplete = true;
        break;
      }
      total += value.byteLength;
      if (total > MAX_SCRIPT_BYTES) throw new Error('fetch failed');
      chunks.push(value);
    }
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const digest = new Uint8Array(await Promise.race([crypto.subtle.digest('SHA-256', buf), deadline]));
    return { file: u.pathname.split('/').pop() ?? u.pathname, sha256: bytesToHex(digest) };
  } catch {
    // URLs, response bodies and custom transport errors may contain sensitive identifiers.
    throw new Error('fetch failed');
  } finally {
    clearTimeout(timer);
    if (!bodyComplete) {
      controller.abort();
      if (reader === undefined) cancelBody(response?.body);
      else {
        try { void reader.cancel().catch(() => undefined); } catch { /* Best-effort cleanup. */ }
      }
    }
    try { reader?.releaseLock(); } catch { /* Cleanup must not expose custom stream errors. */ }
  }
}

/** URL of the first module script on the page (the app entry), or undefined. */
export function entryScriptUrl(doc: Pick<Document, 'querySelectorAll'>): string | undefined {
  const el = Array.from(doc.querySelectorAll('script[type="module"][src]')).find((e) => e.getAttribute('src') !== null);
  return el?.getAttribute('src') ?? undefined;
}
