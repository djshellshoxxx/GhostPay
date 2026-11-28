// Team E: rough cost of the keystore KDF and per-announcement ECDH with and without JIT (run with/without --jitless).
// Usage: node [--jitless] jitless_bench.mjs <wtRoot>
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const wt = process.argv[2];
const nm = (p) => pathToFileURL(join(wt, 'node_modules', p)).href;
const { scrypt } = await import(nm('@noble/hashes/scrypt.js'));
const { secp256k1 } = await import(nm('@noble/curves/secp256k1.js'));
const t0 = performance.now();
scrypt(new TextEncoder().encode('correct horse battery staple'), new Uint8Array(16), { N: 1 << 17, r: 8, p: 1, dkLen: 32, maxmem: 2 ** 29 });
const t1 = performance.now();
const priv = secp256k1.utils.randomSecretKey ? secp256k1.utils.randomSecretKey() : secp256k1.utils.randomPrivateKey();
const pubs = [];
for (let i = 0; i < 20; i++) {
  const k = secp256k1.utils.randomSecretKey ? secp256k1.utils.randomSecretKey() : secp256k1.utils.randomPrivateKey();
  pubs.push(secp256k1.getPublicKey(k, true));
}
const t2 = performance.now();
for (const p of pubs) secp256k1.getSharedSecret(priv, p, true);
const t3 = performance.now();
console.log(JSON.stringify({ jitless: process.execArgv.includes('--jitless'), scryptN17ms: Math.round(t1 - t0), ecdhPerOpMs: +((t3 - t2) / pubs.length).toFixed(2) }));
