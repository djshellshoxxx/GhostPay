// @ts-check
// Reuse record: packages/net-transport/src/onion.ts (same repository) implements the same v3 onion checksum.
// The kit keeps its own copy because importing that workspace would add a build step and @noble/hashes to a
// zero-dependency tool (Node's crypto provides sha3-256). This test keeps the two implementations in agreement
// whenever net-transport has been built; it skips (with the reason) otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isValidOnionV3Label } from '../../src/config/host-config.mjs';

const dist = fileURLToPath(new URL('../../../../packages/net-transport/dist/onion.js', import.meta.url));
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
/** @param {Buffer} buf */
function b32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

test('kit onion validation agrees with @ghostpay/net-transport', { skip: existsSync(dist) ? false : 'packages/net-transport/dist not built (npm run build -w @ghostpay/net-transport)' }, async () => {
  const { isValidV3OnionHost } = /** @type {{ isValidV3OnionHost: (h: string) => boolean }} */ (await import(pathToFileURL(dist).href));
  /** @type {string[]} */
  const labels = ['2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid', 'a'.repeat(56), 'abc'];
  for (let i = 0; i < 200; i++) {
    const pub = randomBytes(32);
    const ver = Buffer.from([i % 7 === 0 ? 2 : 3]);
    const sum = createHash('sha3-256').update('.onion checksum').update(pub).update(ver).digest().subarray(0, 2);
    if (i % 5 === 0) sum[0] = (sum[0] ?? 0) ^ 1;
    labels.push(b32(Buffer.concat([pub, sum, ver])));
  }
  for (const l of labels) assert.equal(isValidOnionV3Label(l), isValidV3OnionHost(`${l}.onion`), l);
});
