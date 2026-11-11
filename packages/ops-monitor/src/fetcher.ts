import { createHash } from 'node:crypto';
import { MonitorError } from './errors.js';
import type { FetchLike, FetchResponseLike, ReleaseConfig } from './types.js';

const DEFAULT_MAX = 8 * 1024 * 1024;

/**
 * @internal Default fetch: no redirects, 10 s timeout and a hard limit enforced
 * while reading. Checking size *after* Response.arrayBuffer() would allocate an
 * arbitrary response before the configured release-artifact cap could apply.
 */
export async function defaultFetch(url: string, maxBytes = DEFAULT_MAX): Promise<FetchResponseLike> {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  return {
    ok: r.ok,
    status: r.status,
    async arrayBuffer(): Promise<ArrayBuffer> {
      const declared = r.headers.get('content-length');
      if (declared !== null && /^[0-9]+$/.test(declared) && Number(declared) > maxBytes)
        throw new MonitorError('FETCH_FAILED', 'too large');
      if (r.body === null) return new ArrayBuffer(0);
      const reader = r.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new MonitorError('FETCH_FAILED', 'too large');
          chunks.push(value);
        }
      } catch (error) {
        try { await reader.cancel(); } catch { /* Preserve the original read error. */ }
        throw error;
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes.buffer;
    },
  };
}

/** @internal Fetches `base/path` and returns the bytes; throws MonitorError FETCH_FAILED. */
export async function fetchBytes(rel: ReleaseConfig, base: string, path: string): Promise<Uint8Array> {
  const max = rel.maxBytes ?? DEFAULT_MAX;
  // An injected fetch is operator-controlled; the built-in network client must
  // apply this cap before allocating the complete untrusted response.
  const f: FetchLike = rel.fetch ?? ((target) => defaultFetch(target, max));
  const url = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  let buf: ArrayBuffer;
  try {
    const res = await f(url);
    if (!res.ok) throw new MonitorError('FETCH_FAILED', 'http status');
    buf = await res.arrayBuffer();
  } catch (e) {
    if (e instanceof MonitorError) throw e;
    throw new MonitorError('FETCH_FAILED', 'transport');
  }
  if (buf.byteLength > max) throw new MonitorError('FETCH_FAILED', 'too large');
  return new Uint8Array(buf);
}

/** @internal Lowercase hex SHA-256. */
export function sha256Hex(b: Uint8Array | string): string {
  return createHash('sha256').update(b).digest('hex');
}
