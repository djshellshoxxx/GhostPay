import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const upstreamPath = require.resolve('jsqr');
const upstream = readFileSync(upstreamPath, 'utf8');
const upstreamLicense = readFileSync(resolve(dirname(upstreamPath), '../LICENSE'), 'utf8');
const vendored = readFileSync(new URL('./vendor/jsqr-1.4.0.mjs', import.meta.url), 'utf8');
const browserNotice = readFileSync(new URL('../../../apps/web/public/licenses/jsqr-1.4.0.txt', import.meta.url), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const upstreamPrefix = `(function webpackUniversalModuleDefinition(root, factory) {
\tif(typeof exports === 'object' && typeof module === 'object')
\t\tmodule.exports = factory();
\telse if(typeof define === 'function' && define.amd)
\t\tdefine([], factory);
\telse if(typeof exports === 'object')
\t\texports["jsQR"] = factory();
\telse
\t\troot["jsQR"] = factory();
})(typeof self !== 'undefined' ? self : this, function() {
`;
const localPrefix = `/*!
 * jsQR 1.4.0 — Cosmo Wolfe and contributors — Apache-2.0.
 * GhostPay changes: static ESM wrapper and version-23 alignment center 74 to 78.
 * The factory body is otherwise unchanged.
 * Source provenance: packages/qr-exchange/src/vendor/README.md.

${upstreamLicense}
 */
/** @type {typeof import('jsqr').default} */
const jsQR = (function() {
`;

describe('pinned jsQR vendor provenance', () => {
  it('contains exactly the pinned factory body with the one approved alignment correction', () => {
    expect(sha256(upstream)).toBe('bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859');
    expect(upstream.startsWith(upstreamPrefix)).toBe(true);
    expect(upstream.endsWith('\n});')).toBe(true);
    const originalCenters = 'versionNumber: 23,\n        alignmentPatternCenters: [6, 30, 54, 74, 102],';
    const correctedCenters = 'versionNumber: 23,\n        alignmentPatternCenters: [6, 30, 54, 78, 102],';
    const body = upstream.slice(upstreamPrefix.length, -3);
    expect(body.split(originalCenters)).toHaveLength(2);
    expect(vendored).toBe(localPrefix + body.replace(originalCenters, correctedCenters) + '})();\nexport default jsQR;\n');
    expect(sha256(vendored)).toBe('0b7c699a00742b28091ab75aa56f86ff05a7b036af73fe8359b33aa920f3e992');
  });

  it('ships the complete license and exact provenance as a static browser notice', () => {
    expect(browserNotice).toBe(
      'jsQR 1.4.0 — Cosmo Wolfe and contributors — Apache-2.0.\n'
      + 'Upstream: https://github.com/cozmo/jsQR\n'
      + 'GhostPay changes: static ESM wrapper and version-23 alignment center 74 to 78.\n'
      + 'The factory body is otherwise unchanged. The complete upstream license follows.\n\n'
      + upstreamLicense
      + 'Source and maintenance: packages/qr-exchange/src/vendor/README.md\n'
      + `Original distribution SHA-256: ${sha256(upstream)}\n`
      + `Local source SHA-256: ${sha256(vendored)}\n`,
    );
  });

  it('preserves the complete upstream Apache license', () => {
    expect(vendored).toContain('\n\n' + upstreamLicense + '\n */');
    expect(sha256(upstreamLicense)).toBe('c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08');
  });
});
