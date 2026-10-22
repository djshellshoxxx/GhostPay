// Generates scheme1.json from fixed TEST-ONLY private keys using the ScopeLift SDK
// (@scopelift/stealth-address-sdk 1.0.0-beta.5, MIT). Run from the repo root:
//   node test-vectors/generate.mjs
// The SDK ships extensionless ESM that plain Node cannot load, so it is loaded
// through Vite's SSR module loader (vite is a transitive dependency of vitest).
// Expected values come ONLY from the SDK (plus plain hex concatenation for the
// metadata layout) - never from @ghostpay/core-crypto.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readVersion = (name) => JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const h32 = (n) => '0x' + n.toString(16).padStart(64, '0');
const toBytes = (hex) => Uint8Array.from(hex.slice(2).match(/../g).map((b) => parseInt(b, 16)));

// TEST-ONLY keys. Never use these anywhere real: they are public in this repository.
const CASES = [
  { id: 'scheme1-001', spend: h32(0x1111111111111111111111111111111111111111111111111111111111111111n), view: h32(0x2222222222222222222222222222222222222222222222222222222222222222n), eph: h32(0x3333333333333333333333333333333333333333333333333333333333333333n), note: 'ordinary mid-range scalars' },
  { id: 'scheme1-002', spend: h32(1n), view: h32(2n), eph: h32(3n), note: 'smallest scalars (leading-zero serialisation)' },
  { id: 'scheme1-003', spend: h32(N - 1n), view: h32(N - 2n), eph: h32(N - 3n), note: 'largest scalars (n-1, n-2, n-3)' },
  { id: 'scheme1-004', spend: h32(0x00000000000000000000000000000000ffffffffffffffffffffffffffffffffn), view: h32(0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn), eph: h32(0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n), note: 'half-width and n/2 boundary scalars' },
  { id: 'scheme1-005', spend: h32(0xdeadbeefn), view: h32(0xcafebaben), eph: h32(0xfeedfacen), note: 'short scalars with many leading zero bytes' },
  { id: 'scheme1-006', spend: h32(0xa5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5n), view: h32(0x5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5an), eph: h32(0x0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0fn), note: 'alternating bit patterns' },
];

const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const AMOUNTS = [1n, 1_000_000n, 2n ** 256n - 1n];

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  ssr: { noExternal: ['@scopelift/stealth-address-sdk'] },
});
try {
  const sdk = await server.ssrLoadModule('@scopelift/stealth-address-sdk');
  const { secp256k1 } = await server.ssrLoadModule('@noble/curves/secp256k1.js');
  const { generateStealthAddress, checkStealthAddress, computeStealthKey, VALID_SCHEME_ID } = sdk;
  const pub = (priv) => '0x' + Buffer.from(secp256k1.getPublicKey(toBytes(priv), true)).toString('hex');

  const vectors = CASES.map((c, i) => {
    const spendingPublicKey = pub(c.spend);
    const viewingPublicKey = pub(c.view);
    const stealthMetaAddressURI = 'st:eth:' + spendingPublicKey + viewingPublicKey.slice(2);
    const out = generateStealthAddress({
      stealthMetaAddressURI,
      schemeId: VALID_SCHEME_ID.SCHEME_ID_1,
      ephemeralPrivateKey: toBytes(c.eph),
    });
    const matches = checkStealthAddress({
      ephemeralPublicKey: out.ephemeralPublicKey,
      schemeId: VALID_SCHEME_ID.SCHEME_ID_1,
      spendingPublicKey,
      userStealthAddress: out.stealthAddress,
      viewingPrivateKey: c.view,
      viewTag: out.viewTag,
    });
    if (!matches) throw new Error(`SDK self-check failed for ${c.id}`);
    const stealthPrivateKey = computeStealthKey({
      ephemeralPublicKey: out.ephemeralPublicKey,
      schemeId: VALID_SCHEME_ID.SCHEME_ID_1,
      spendingPrivateKey: c.spend,
      viewingPrivateKey: c.view,
    });
    const amount = AMOUNTS[i % AMOUNTS.length];
    const amountHex = amount.toString(16).padStart(64, '0');
    const tag = out.viewTag.slice(2);
    return {
      id: c.id,
      note: c.note,
      spendingPrivateKey: c.spend,
      viewingPrivateKey: c.view,
      ephemeralPrivateKey: c.eph,
      spendingPublicKey,
      viewingPublicKey,
      metaAddress: stealthMetaAddressURI,
      ephemeralPublicKey: out.ephemeralPublicKey,
      viewTag: out.viewTag,
      stealthAddress: out.stealthAddress,
      stealthPrivateKey,
      metadata: {
        netAmount: amount.toString(),
        token: TOKEN,
        // 57-byte layouts per docs/CONTRACTS_SPEC.md (plain concatenation, not SDK output)
        erc20: '0x' + tag + 'a9059cbb' + TOKEN.slice(2).toLowerCase() + amountHex,
        native: '0x' + tag + 'eeeeeeee' + NATIVE.slice(2).toLowerCase() + amountHex,
      },
    };
  });

  const doc = {
    description: 'ERC-5564 scheme-1 vectors (ADR-0001). Keys are TEST-ONLY and public.',
    generatedAt: new Date().toISOString().slice(0, 10),
    generator: 'test-vectors/generate.mjs',
    provenance: {
      sdk: '@scopelift/stealth-address-sdk',
      sdkVersion: readVersion('@scopelift/stealth-address-sdk'),
      sdkLicense: 'MIT',
      nobleSecp256k1Version: readVersion('@noble/secp256k1'),
      nobleCurvesVersion: readVersion('@noble/curves'),
      viemVersion: readVersion('viem'),
      node: process.version,
    },
    nativeToken: NATIVE,
    vectors,
  };
  writeFileSync(resolve(here, 'scheme1.json'), JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${vectors.length} vectors`);
} finally {
  await server.close();
}
