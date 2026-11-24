import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const upstreamPath = require.resolve('jsqr');
const upstream = readFileSync(upstreamPath, 'utf8');
const upstreamLicense = readFileSync(resolve(dirname(upstreamPath), '../LICENSE'), 'utf8');
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
 * GhostPay changes: static ESM wrapper, version-23 alignment center 74 to 78,
 * and bounded neighboring valid-dimension retries for an invalid locator estimate.
 * The factory body is otherwise unchanged.
 * Source provenance: packages/qr-exchange/src/vendor/README.md.

${upstreamLicense}
 */
/** @type {typeof import('jsqr').default} */
const jsQR = (function() {
`;
const oldTable = 'versionNumber: 23,\n        alignmentPatternCenters: [6, 30, 54, 74, 102]';
const newTable = 'versionNumber: 23,\n        alignmentPatternCenters: [6, 30, 54, 78, 102]';
const loop = '    for (var _i = 0, locations_1 = locations; _i < locations_1.length; _i++) {';
const retry = `    // GhostPay: a real QR side is 17 + 4 * version. Fractional raster edges can
    // produce an impossible side congruent to 3; try only its two valid neighbors.
    // Preserve original candidates first and all original extraction/RS validation.
    var originalLocationCount = locations.length;
    for (var locationIndex = 0; locationIndex < originalLocationCount; locationIndex++) {
        var originalLocation = locations[locationIndex];
        if (!Number.isSafeInteger(originalLocation.dimension) || originalLocation.dimension % 4 !== 3) {
            continue;
        }
        var adjacentDimensions = [originalLocation.dimension - 2, originalLocation.dimension + 2];
        for (var dimensionIndex = 0; dimensionIndex < adjacentDimensions.length; dimensionIndex++) {
            var adjacentDimension = adjacentDimensions[dimensionIndex];
            if (adjacentDimension >= 21 && adjacentDimension <= 177) {
                locations.push(Object.assign({}, originalLocation, { dimension: adjacentDimension }));
            }
        }
    }
`;

describe('vendored QR decoder provenance', () => {
  it('preserves the pinned upstream factory in static ESM with the notice and two reviewed corrections', () => {
    expect(createHash('sha256').update(upstream).digest('hex')).toBe(
      'bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859',
    );
    const metadata: unknown = JSON.parse(readFileSync(require.resolve('jsqr/package.json'), 'utf8'));
    expect(metadata).toMatchObject({ name: 'jsqr', version: '1.4.0', license: 'Apache-2.0' });
    expect(upstream.startsWith(upstreamPrefix)).toBe(true);
    expect(upstream.endsWith('\n});')).toBe(true);
    expect(upstream.split(oldTable)).toHaveLength(2);
    expect(upstream.split(loop)).toHaveLength(2);
    const body = upstream.slice(upstreamPrefix.length, -3);
    const expected = localPrefix + body.replace(oldTable, newTable).replace(loop, retry + loop) + '})();\nexport default jsQR;\n';
    expect(readFileSync(new URL('./vendor/jsqr-1.4.0.mjs', import.meta.url), 'utf8')).toBe(expected);
  });

  it('includes the unmodified upstream Apache license', () => {
    const license = readFileSync(resolve(dirname(upstreamPath), '..', 'LICENSE'));
    expect(createHash('sha256').update(license).digest('hex')).toBe(
      'c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08',
    );
    expect(readFileSync(new URL('../vendor/LICENSE', import.meta.url))).toEqual(license);
  });
});
