import { fetchBytes, sha256Hex } from './fetcher.js';
import type { Finding, Probe } from './types.js';
import { errTag, mk } from './util.js';

/**
 * Parses a `SHA256SUMS` text (`<64 hex>  <path>` or `<64 hex> *<path>`); malformed lines are ignored.
 *
 * @param text File content.
 * @returns Map path to lowercase hash.
 */
export function parseSha256Sums(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const g = /^([0-9a-fA-F]{64}) [ *](?:\.\/)?(.+)$/.exec(line);
    if (g?.[1] !== undefined && g[2] !== undefined) m.set(g[2], g[1].toLowerCase());
  }
  return m;
}

/**
 * W3 release integrity: SHA-256 of each configured file as served by each mirror against `SHA256SUMS`.
 *
 * @security A mirror that serves a different file (compromised host/CDN) is `page`. Unreachable or
 * oversized responses are `warn`. The check proves nothing if `SHA256SUMS` itself came from the mirror;
 * pass the copy from the signed release.
 */
export const w3Probe: Probe = {
  id: 'W3',
  async run(ctx) {
    const rel = ctx.release;
    if (rel === undefined) return [mk('W3', 'warn', 'monitor', 'no release configuration supplied')];
    const sums = parseSha256Sums(rel.sha256sums);
    const out: Finding[] = [];
    for (const mirror of rel.mirrors) {
      let bad = 0;
      for (const file of rel.files) {
        const want = sums.get(file);
        if (want === undefined) {
          bad++;
          out.push(mk('W3', 'warn', mirror, `${file} is not listed in SHA256SUMS`));
          continue;
        }
        try {
          const got = sha256Hex(await fetchBytes(rel, mirror, file));
          if (got !== want) {
            bad++;
            out.push(mk('W3', 'page', mirror, `${file} served sha256 ${got} differs from release ${want}`));
          }
        } catch (e) {
          bad++;
          out.push(mk('W3', 'warn', mirror, `${file} could not be fetched (${errTag(e)})`));
        }
      }
      if (bad === 0) out.push(mk('W3', 'info', mirror, 'served files match SHA256SUMS'));
    }
    return out;
  },
};
