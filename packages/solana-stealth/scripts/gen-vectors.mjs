// Generates test-vectors/solana-stealth.json from the BUILT package (run `npm run build -w @ghostpay/solana-stealth` first).
// Every value is deterministic. Cross-checked independently by scripts/crosscheck_vectors.py.
// No real keys: all secrets derive from public labels below.
import { writeFileSync } from 'node:fs';
import { sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToNumberLE, numberToBytesLE } from '@noble/curves/utils.js';
import { base58 } from '@scure/base';
import * as S from '../dist/index.js';

const OUT = new URL('../../../test-vectors/solana-stealth.json', import.meta.url);
const L = S.L;
const label = (s) => sha512(utf8ToBytes('ghostpay-solana-stealth-vector:' + s));
const scalarFor = (s) => S.secretScalarFromBytes(numberToBytesLE(bytesToNumberLE(label(s)) % L, 32));
const hex = (b) => bytesToHex(b);
const reveal = (x) => hex(S.unsafeRevealSecret(x));
const ZERO32 = new Uint8Array(32);

const cases = [];
for (let i = 0; i < 6; i++) {
  const seed = label('seed-' + i).subarray(0, 32 + (i % 2) * 32);
  const keys = S.deriveStealthKeysFromSeed(seed);
  const r = scalarFor('ephemeral-' + i);
  const pay = S.deriveStealthPaymentWithEphemeral(keys.spendPublicKey, keys.viewPublicKey, r);
  const m = S.checkAnnouncement(keys.viewSecret, keys.spendPublicKey, pay.ephemeralPublicKey, pay.viewTag);
  const p = S.deriveSpendKey(keys.spendSecret, m.tweak, pay.stealthPublicKey);
  const message = utf8ToBytes('GhostPay vector message ' + i);
  const sig = S.signWithScalar(p, message, ZERO32);
  cases.push({
    seed: hex(seed),
    spendSecret: reveal(keys.spendSecret),
    viewSecret: reveal(keys.viewSecret),
    spendPublicKey: hex(keys.spendPublicKey),
    viewPublicKey: hex(keys.viewPublicKey),
    metaAddressDevnet: S.encodeMetaAddress('devnet', keys.spendPublicKey, keys.viewPublicKey),
    metaAddressMainnet: S.encodeMetaAddress('mainnet', keys.spendPublicKey, keys.viewPublicKey),
    ephemeralSecret: reveal(r),
    ephemeralPublicKey: hex(pay.ephemeralPublicKey),
    tweak: reveal(m.tweak),
    viewTag: pay.viewTag,
    stealthPublicKey: hex(pay.stealthPublicKey),
    stealthAddress: pay.stealthAddress,
    spendKey: reveal(p),
    memo: S.encodeAnnouncementMemo(pay.ephemeralPublicKey, pay.viewTag),
    signMessage: hex(message),
    signAux: hex(ZERO32),
    signature: hex(sig),
  });
}

// Invalid points: the 8 small-order points (canonical encodings), a mixed-order point, non-canonical y.
const small = [];
const torsion = [];
{
  // Small-order points: multiples of T, a point of order 8 (libsodium blocklist entry; order checked by crosscheck_vectors.py).
  const T = ed25519.Point.fromBytes(
    Uint8Array.from(Buffer.from('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a', 'hex')),
  );
  let acc = ed25519.Point.ZERO;
  for (let k = 0; k < 8; k++) {
    torsion.push(acc);
    acc = acc.add(T);
  }
  for (const t of torsion) small.push(hex(t.toBytes()));
}
const mixed = hex(ed25519.Point.BASE.multiply(7n).add(torsion[1]).toBytes());
const p = 2n ** 255n - 19n;
const nonCanonical = [
  hex(numberToBytesLE(p + 1n, 32)), // y = p+1 (== 1 mod p) non-canonical
  hex(numberToBytesLE(2n ** 255n - 1n, 32)), // y >= p
];
const notOnCurve = hex(numberToBytesLE(2n, 32)); // y=2 has no valid x

// Payment transactions (deterministic; no RNG): fixed public labels as addresses.
const addr = (s) => base58.encode(ed25519.Point.BASE.multiply(bytesToNumberLE(label('addr-' + s)) % L).toBytes());
const lifetime = { blockhash: base58.encode(label('blockhash').subarray(0, 32)), lastValidBlockHeight: 1000n };
const c0 = cases[0];
const payment = {
  stealthPublicKey: Uint8Array.from(Buffer.from(c0.stealthPublicKey, 'hex')),
  stealthAddress: c0.stealthAddress,
  ephemeralPublicKey: Uint8Array.from(Buffer.from(c0.ephemeralPublicKey, 'hex')),
  viewTag: c0.viewTag,
};
const spk = payment.stealthPublicKey; // keys unused when `payment` is passed; must still be valid points
const txs = [];
const payer = addr('payer');
const sponsor = addr('sponsor');
const mint = addr('mint');
const solTx = await S.buildStealthPaymentTx({
  payer, spendPublicKey: spk, viewPublicKey: spk, asset: { kind: 'native' }, amount: 5_000_000n,
  lifetime, rentExemptMinimum: 890_880n, payment,
});
txs.push({ name: 'sol-payment', payer, feePayer: payer, mint: null, amount: '5000000', decimals: null, tokenProgram: null,
  stealthAddress: c0.stealthAddress, creditedAccount: solTx.creditedAccount, memo: solTx.memo,
  blockhash: lifetime.blockhash, messageBytes: hex(solTx.tx.messageBytes) });
const splTx = await S.buildStealthPaymentTx({
  payer, feePayer: sponsor, spendPublicKey: spk, viewPublicKey: spk,
  asset: { kind: 'spl', mint, decimals: 6, tokenProgram: S.TOKEN_PROGRAM }, amount: 1_250_000n, lifetime, payment,
});
txs.push({ name: 'spl-payment-sponsored', payer, feePayer: sponsor, mint, amount: '1250000', decimals: 6,
  tokenProgram: S.TOKEN_PROGRAM, stealthAddress: c0.stealthAddress, creditedAccount: splTx.creditedAccount,
  memo: splTx.memo, blockhash: lifetime.blockhash, messageBytes: hex(splTx.tx.messageBytes) });
const sweep = await S.buildStealthSweepTx({
  stealthAddress: c0.stealthAddress, feePayer: sponsor, destination: addr('destination'),
  asset: { kind: 'spl', mint, decimals: 6, tokenProgram: S.TOKEN_PROGRAM }, amount: 1_250_000n, lifetime,
  closeTokenAccount: true,
});
const spendKey = S.secretScalarFromBytes(Uint8Array.from(Buffer.from(c0.spendKey, 'hex')));
const signedSweep = S.signWithStealthKey(sweep, spendKey, ZERO32);
txs.push({ name: 'spl-sweep-sponsored-close', payer: c0.stealthAddress, feePayer: sponsor, mint,
  destination: addr('destination'), amount: '1250000', decimals: 6, tokenProgram: S.TOKEN_PROGRAM,
  blockhash: lifetime.blockhash, messageBytes: hex(sweep.messageBytes),
  stealthSignature: hex(signedSweep.transaction.signatures[c0.stealthAddress]) });

const doc = {
  description:
    'GhostPay Solana dual-key ed25519 stealth (ADR-0017) test vectors. Generated by packages/solana-stealth/scripts/gen-vectors.mjs; independently recomputed by scripts/crosscheck_vectors.py (pure-Python RFC 8032 arithmetic + OpenSSL Ed25519 verify). Throwaway values derived from public labels: never fund these addresses.',
  version: 1,
  domainPrefix: S.DOMAIN,
  programs: {
    system: S.SYSTEM_PROGRAM, token: S.TOKEN_PROGRAM, associatedToken: S.ASSOCIATED_TOKEN_PROGRAM, memo: S.MEMO_PROGRAM,
  },
  cases,
  invalidPoints: { smallOrder: small, mixedOrder: [mixed], nonCanonical, notOnCurve: [notOnCurve] },
  transactions: txs,
};
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log('wrote', OUT.pathname, cases.length, 'cases', txs.length, 'txs');
