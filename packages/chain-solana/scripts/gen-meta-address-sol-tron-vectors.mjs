// Generates test-vectors/meta-address-sol-tron-v1.json (TB-08) from the WEB implementations, which define the
// canonical formats: @ghostpay/solana-stealth (ADR-0017 section 3 meta-address, section 5 memo) and
// @ghostpay/tron-adapter (ADR-0019 section 2). It never imports @ghostpay/chain-solana or @ghostpay/chain-tron,
// the CLI-side packages under test, so expected values are not derived from the code they check.
//
// Build the web packages first (from the repo root):
//   npm run build -w @ghostpay/core-crypto -w @ghostpay/solana-stealth -w @ghostpay/tron-adapter
//   node packages/chain-solana/scripts/gen-meta-address-sol-tron-vectors.mjs
//
// Every value is deterministic and derived from public labels. NO REAL KEYS: never fund these addresses.
// Regenerating changes only `generatedAt`/`node`; a diff anywhere else means a web format changed.
import { writeFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToNumberLE, numberToBytesLE } from '@noble/curves/utils.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { base58, createBase58check } from '@scure/base';
import * as cc from '../../core-crypto/dist/index.js';
import * as sol from '../../solana-stealth/dist/index.js';
import * as trx from '../../tron-adapter/dist/index.js';

const OUT = new URL('../../../test-vectors/meta-address-sol-tron-v1.json', import.meta.url);
const hex = (b) => bytesToHex(b);
const label = (s) => sha512(utf8ToBytes('ghostpay-meta-address-interop-v1:' + s));
const solScalar = (s) => sol.secretScalarFromBytes(numberToBytesLE(bytesToNumberLE(label(s)) % sol.L, 32));
const reveal = (x) => hex(sol.unsafeRevealSecret(x));

function rejects(fn) {
  try {
    return fn() === null;
  } catch {
    return true;
  }
}
function check(cond, what) {
  if (!cond) throw new Error(`generator self-check failed: ${what}`);
}

// ---------------------------------------------------------------- Solana (ADR-0017)
const CLUSTERS = ['mainnet', 'devnet', 'testnet', 'localnet'];
const CLUSTER_BYTE = { mainnet: 0, devnet: 1, testnet: 2, localnet: 3 };
const tag = utf8ToBytes('GhostPay/solana-stealth/v1/checksum');
const dstChecksum = concatBytes(Uint8Array.of(tag.length), tag);
/** Raw st:sol: builder for malformed vectors; checked equal to the web encoder on valid input below. */
function solRaw(version, clusterByte, S, V, { flipChecksum = false, extra = new Uint8Array(0) } = {}) {
  const payload = concatBytes(Uint8Array.of(version, clusterByte), S, V, extra);
  const sum = sha256(concatBytes(dstChecksum, payload)).slice(0, 4);
  if (flipChecksum) sum[3] ^= 0x01;
  return 'st:sol:' + base58.encode(concatBytes(payload, sum));
}
const legacyB58c = createBase58check(sha256);
/** Retired chain-solana form: gpsol: + base58check(sha256d)(0x01 || S || V). */
const legacyGpsol = (S, V) => 'gpsol:' + legacyB58c.encode(concatBytes(Uint8Array.of(1), S, V));

const solKeys = [0, 1, 2].map((i) => sol.deriveStealthKeysFromSeed(label('sol-seed-' + i).subarray(0, 32)));
// Scalars 1 and 2: S = B and V = 2B, readable edge case.
const one = sol.secretScalarFromBytes(numberToBytesLE(1n, 32));
const two = sol.secretScalarFromBytes(numberToBytesLE(2n, 32));
solKeys.push({
  spendSecret: one,
  viewSecret: two,
  spendPublicKey: sol.publicFromSecret(one),
  viewPublicKey: sol.publicFromSecret(two),
});

const solMetaAddresses = [];
solKeys.forEach((k, i) => {
  for (const cluster of i === 0 ? CLUSTERS : ['devnet', 'testnet']) {
    const metaAddress = sol.encodeMetaAddress(cluster, k.spendPublicKey, k.viewPublicKey);
    check(metaAddress === solRaw(1, CLUSTER_BYTE[cluster], k.spendPublicKey, k.viewPublicKey), 'solRaw == web encoder');
    const d = sol.decodeMetaAddress(metaAddress, cluster);
    check(d.cluster === cluster && hex(d.spendPublicKey) === hex(k.spendPublicKey), 'web round trip');
    solMetaAddresses.push({
      name: `${i === 3 ? 'scalars-1-2' : 'seed-' + i}-${cluster}`,
      cluster,
      spendPublicKey: hex(k.spendPublicKey),
      viewPublicKey: hex(k.viewPublicKey),
      metaAddress,
    });
  }
});

const A = solKeys[0];
const S0 = A.spendPublicKey;
const V0 = A.viewPublicKey;
const good = sol.encodeMetaAddress('devnet', S0, V0);
const P = (h) => hexToBytes(h);
const torsion1 = P('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a');
const mixed = ed25519.Point.fromBytes(V0).add(ed25519.Point.fromBytes(torsion1, true)).toBytes();
const tronMetaForCrossFamily = trx.encodeTronMetaAddress(cc.generateKeySet(seededRng('cross-family')));

const solInvalid = [
  {
    name: 'legacy gpsol: (retired chain-solana form) of the seed-0 keys',
    legacy: true,
    input: legacyGpsol(S0, V0),
  },
  {
    name: 'legacy gpsol: vector 1 from the retired packages/chain-solana/test-vectors/self-generated-v1.json',
    legacy: true,
    input: 'gpsol:iVPRKEPsBrg9QjbrbTCwPpfqABVe6AgZGSnE3hPZFWJJY9G8coNm6o2by4A2777LoAyj3Rxh6f1VBUWUgUHxs3uinozTS',
  },
  { name: 'uppercase prefix', input: 'ST:SOL:' + good.slice(7) },
  { name: 'missing prefix', input: good.slice(7) },
  { name: 'leading space', input: ' ' + good },
  { name: 'trailing newline', input: good + '\n' },
  { name: 'empty body', input: 'st:sol:' },
  { name: 'truncated (last character dropped)', input: good.slice(0, -1) },
  { name: 'extra base58 character', input: good + '2' },
  { name: 'bad checksum (last checksum byte flipped)', input: solRaw(1, 1, S0, V0, { flipChecksum: true }) },
  { name: 'invalid base58 character', input: good.slice(0, -1) + '0' },
  { name: 'longer than 128 characters', input: 'st:sol:' + '2'.repeat(122) },
  { name: 'unsupported version 0x02 (valid checksum)', input: solRaw(2, 1, S0, V0) },
  { name: 'unsupported version 0x00 (valid checksum)', input: solRaw(0, 1, S0, V0) },
  { name: 'unknown cluster byte 0x04 (valid checksum)', input: solRaw(1, 4, S0, V0) },
  { name: 'payload one byte too long (valid checksum)', input: solRaw(1, 1, S0, V0, { extra: Uint8Array.of(0) }) },
  { name: 'payload one byte too short (valid checksum)', input: solRaw(1, 1, S0, V0.subarray(0, 31)) },
  { name: 'small-order spend key (valid checksum)', input: solRaw(1, 1, torsion1, V0) },
  { name: 'identity view key (valid checksum)', input: solRaw(1, 1, S0, P('01' + '00'.repeat(31))) },
  { name: 'mixed-order view key V + T (valid checksum)', input: solRaw(1, 1, S0, mixed) },
  {
    name: 'non-canonical spend key y = p + 1 (valid checksum)',
    input: solRaw(1, 1, P('ee' + 'ff'.repeat(30) + '7f'), V0),
  },
  { name: 'view key not on the curve (valid checksum)', input: solRaw(1, 1, S0, P('02' + '00'.repeat(31))) },
  { name: 'TRON meta-address given to the Solana decoder', input: tronMetaForCrossFamily },
];
for (const v of solInvalid) check(rejects(() => sol.decodeMetaAddress(v.input)), `web rejects: ${v.name}`);

const solNetworkMismatch = [
  { name: 'devnet meta-address, testnet expected', input: good, expectedCluster: 'testnet' },
  { name: 'mainnet meta-address, devnet expected', input: sol.encodeMetaAddress('mainnet', S0, V0), expectedCluster: 'devnet' },
];
for (const v of solNetworkMismatch) {
  check(rejects(() => sol.decodeMetaAddress(v.input, v.expectedCluster)), `web rejects: ${v.name}`);
}

// Accepted by the web decoder, rejected by chain-solana: S == V hands the spend key's public half to every view-key
// holder and can only come from a broken generator (both packages draw independent scalars).
const solStricterInCli = [
  {
    name: 'spend key equals view key (S == V)',
    input: solRaw(1, 1, S0, S0),
    reason: 'chain-solana keeps its KEY_REUSE rejection; a payer cannot be harmed by refusing it (fails closed)',
  },
];
for (const v of solStricterInCli) check(!rejects(() => sol.decodeMetaAddress(v.input)), `web accepts: ${v.name}`);

const solPayments = [0, 1, 3].map((i) => {
  const k = solKeys[i];
  const r = solScalar('sol-ephemeral-' + i);
  const pay = sol.deriveStealthPaymentWithEphemeral(k.spendPublicKey, k.viewPublicKey, r);
  const memo = sol.encodeAnnouncementMemo(pay.ephemeralPublicKey, pay.viewTag);
  const parsed = sol.parseAnnouncementMemo(memo);
  check(hex(parsed.ephemeralPublicKey) === hex(pay.ephemeralPublicKey), 'web memo round trip');
  const m = sol.checkAnnouncement(k.viewSecret, k.spendPublicKey, pay.ephemeralPublicKey, pay.viewTag, pay.stealthPublicKey);
  const x = sol.deriveSpendKey(k.spendSecret, m.tweak, pay.stealthPublicKey);
  return {
    name: i === 3 ? 'scalars-1-2' : 'seed-' + i,
    metaAddress: sol.encodeMetaAddress('devnet', k.spendPublicKey, k.viewPublicKey),
    spendSecret: reveal(k.spendSecret),
    viewSecret: reveal(k.viewSecret),
    ephemeralSecret: reveal(r),
    ephemeralPublicKey: hex(pay.ephemeralPublicKey),
    viewTag: pay.viewTag,
    tweak: reveal(m.tweak),
    stealthPublicKey: hex(pay.stealthPublicKey),
    stealthAddress: pay.stealthAddress,
    spendKey: reveal(x),
    memo,
  };
});

const R0 = P(solPayments[0].ephemeralPublicKey);
const solInvalidMemos = [
  {
    name: 'legacy base64url memo (retired chain-solana form, vector 1 of self-generated-v1.json)',
    legacy: true,
    input: 'gpst1:AYEKd6bmXL1BYPhrlLZhw7F_hlJlffn-kilJlc0bBeLSZA',
  },
  {
    name: 'legacy base64url memo with 2 metadata bytes (retired chain-solana form)',
    legacy: true,
    input: 'gpst1:' + Buffer.from(concatBytes(Uint8Array.of(1), R0, Uint8Array.of(17, 1, 2))).toString('base64url'),
  },
  { name: 'uppercase prefix', input: 'GPST1:' + solPayments[0].memo.slice(6) },
  { name: 'empty body', input: 'gpst1:' },
  { name: 'body of 32 bytes (view tag missing)', input: 'gpst1:' + base58.encode(R0) },
  { name: 'body of 34 bytes', input: 'gpst1:' + base58.encode(concatBytes(R0, Uint8Array.of(1, 2))) },
  { name: 'small-order ephemeral key', input: 'gpst1:' + base58.encode(concatBytes(torsion1, Uint8Array.of(7))) },
  { name: 'invalid base58 character', input: solPayments[0].memo.slice(0, -1) + '0' },
];
for (const v of solInvalidMemos) check(rejects(() => sol.parseAnnouncementMemo(v.input)), `web rejects memo: ${v.name}`);

// ---------------------------------------------------------------- TRON (ADR-0019)
function seededRng(seed) {
  let counter = 0;
  return {
    getRandomValues(array) {
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      let off = 0;
      while (off < view.length) {
        const block = sha256(utf8ToBytes(`ghostpay-meta-address-interop-v1:${seed}:${counter++}`));
        const n = Math.min(block.length, view.length - off);
        view.set(block.subarray(0, n), off);
        off += n;
      }
      return array;
    },
  };
}
/** RNG that returns the same 32 bytes on every call (core-crypto takes the first draw in [1, n-1]). */
const fixedRng = (bytes) => ({
  getRandomValues(array) {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  },
});

const tronKeys = [0, 1, 2].map((i) => cc.generateKeySet(seededRng('tron-keys-' + i)));
const tronMetaAddresses = tronKeys.map((k, i) => {
  const metaAddress = trx.encodeTronMetaAddress(k);
  const d = trx.decodeTronMetaAddress(metaAddress);
  check(hex(d.spendingPublicKey) === hex(k.spendingPublicKey), 'web tron round trip');
  return {
    name: 'seed-' + i,
    spendingPublicKey: hex(k.spendingPublicKey),
    viewingPublicKey: hex(k.viewingPublicKey),
    metaAddress,
  };
});
const T0 = tronMetaAddresses[0];
const body0 = T0.metaAddress.slice('st:trx:0x'.length);
const tronNonCanonicalAccepted = [
  {
    name: 'uppercase hex digits are accepted and canonicalised to lowercase',
    input: 'st:trx:0x' + body0.toUpperCase(),
    canonical: T0.metaAddress,
  },
];
for (const v of tronNonCanonicalAccepted) {
  check(trx.encodeTronMetaAddress(trx.decodeTronMetaAddress(v.input)) === v.canonical, `web canonicalises: ${v.name}`);
}
const offCurveX = 'ff'.repeat(32); // x >= field prime: never a valid compressed key
const tronInvalid = [
  {
    name: 'legacy st:eth:0x form (what chain-tron accepted before; it is the EVM meta-address)',
    legacy: true,
    input: 'st:eth:0x' + body0,
  },
  { name: 'uppercase prefix', input: 'ST:TRX:0x' + body0 },
  { name: 'uppercase 0X', input: 'st:trx:0X' + body0 },
  { name: 'missing 0x', input: 'st:trx:' + body0 },
  { name: 'leading space', input: ' ' + T0.metaAddress },
  { name: 'trailing newline', input: T0.metaAddress + '\n' },
  { name: 'single key (66 hex digits)', input: 'st:trx:0x' + body0.slice(0, 66) },
  { name: '131 hex digits', input: T0.metaAddress.slice(0, -1) },
  { name: '133 hex digits', input: T0.metaAddress + '0' },
  { name: 'non-hex character', input: T0.metaAddress.slice(0, -1) + 'g' },
  { name: 'uncompressed-key prefix byte 0x04', input: 'st:trx:0x04' + body0.slice(2) },
  { name: 'spend key x not on the curve', input: 'st:trx:0x02' + offCurveX + body0.slice(66) },
  { name: 'spend key equals view key', input: 'st:trx:0x' + body0.slice(0, 66) + body0.slice(0, 66) },
  { name: 'Solana meta-address given to the TRON decoder', input: good },
];
for (const v of tronInvalid) check(rejects(() => trx.decodeTronMetaAddress(v.input)), `web rejects: ${v.name}`);

const tronPayments = [0, 1].map((i) => {
  const k = tronKeys[i];
  const meta = tronMetaAddresses[i].metaAddress;
  let ephemeral;
  for (let j = 0; ; j++) {
    ephemeral = sha256(utf8ToBytes(`ghostpay-meta-address-interop-v1:tron-ephemeral-${i}-${j}`));
    if (rejects(() => cc.secretScalarFromBytes(ephemeral)) === false) break;
  }
  const s = trx.deriveTronStealth(meta, fixedRng(ephemeral));
  check(trx.checkTronAnnouncement({ stealthAddress: s.stealthAddress, memo: s.memo }, k.viewingSecret, k.spendingPublicKey), 'web tron scan');
  return {
    name: 'seed-' + i,
    metaAddress: meta,
    ephemeralSecret: hex(ephemeral),
    ephemeralPublicKey: hex(s.ephemeralPublicKey),
    viewTag: s.viewTag,
    stealthAddress: s.stealthAddress,
    memoHex: hex(s.memo),
  };
});

const out = {
  description:
    'TB-08 shared meta-address vectors: the CLI-side packages (@ghostpay/chain-solana, @ghostpay/chain-tron) must ' +
    'emit and parse exactly the formats the web packages (@ghostpay/solana-stealth, @ghostpay/tron-adapter) ship. ' +
    'Generated from the web packages only. Test-only public keys and secrets: NEVER fund these addresses.',
  version: 1,
  generator: 'packages/chain-solana/scripts/gen-meta-address-sol-tron-vectors.mjs',
  generatedAt: new Date().toISOString().slice(0, 10),
  node: process.version,
  consumers: [
    'packages/chain-solana/src/interop.test.ts (chain-solana and solana-stealth source)',
    'packages/chain-tron/src/interop.test.ts (chain-tron and tron-adapter source)',
  ],
  solana: {
    spec: 'docs/adr/ADR-0017-solana-stealth.md section 3 (Meta-address, Cryptographic scheme) and section 5 (Memo)',
    format: "st:sol: + base58(0x01 || cluster || S || V || SHA-256(u8(len(tag)) || tag || payload)[0..4]), tag = 'GhostPay/solana-stealth/v1/checksum'; cluster bytes mainnet 0, devnet 1, testnet 2, localnet 3",
    memoFormat: 'gpst1: + base58(R || viewTag), exactly 33 bytes',
    metaAddresses: solMetaAddresses,
    invalidMetaAddresses: solInvalid,
    networkMismatch: solNetworkMismatch,
    stricterInCli: solStricterInCli,
    payments: solPayments,
    invalidMemos: solInvalidMemos,
  },
  tron: {
    spec: 'docs/adr/ADR-0019-tron.md section 2 (Meta-address st:trx:0x, memo GPT1 || R || viewTag)',
    format: 'st:trx:0x + lowercase hex(compressed spend key 33 || compressed view key 33); hex case accepted on input',
    metaAddresses: tronMetaAddresses,
    nonCanonicalAccepted: tronNonCanonicalAccepted,
    invalidMetaAddresses: tronInvalid,
    payments: tronPayments,
  },
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${OUT.pathname}`);
