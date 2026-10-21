import { createHash } from 'node:crypto';
import { MonitorError } from './errors.js';
import type { FetchLike, ReleaseConfig } from './types.js';

const DEFAULT_MAX = 8 * 1024 * 1024;

/** @internal Default fetch: no redirects, 10 s timeout. */
export const defaultFetch: FetchLike = async (url) => {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  return { ok: r.ok, status: r.status, arrayBuffer: () => r.arrayBuffer() };
};

/** @internal Fetches `base/path` and returns the bytes; throws MonitorError FETCH_FAILED. */
export async function fetchBytes(rel: ReleaseConfig, base: string, path: string): Promise<Uint8Array> {
  const f = rel.fetch ?? defaultFetch;
  const max = rel.maxBytes ?? DEFAULT_MAX;
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
