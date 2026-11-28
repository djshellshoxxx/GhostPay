// Independent recovery check: encrypt with GhostPay's codec (candidate dist), then decrypt with ONLY node:crypto
// following docs/developer/byte-layouts.md, then derive a stealth key with elliptic+js-sha3 (no @noble, no GhostPay code).
import { createRequire } from 'node:module';
import { scryptSync, createDecipheriv } from 'node:crypto';
const require = createRequire('/home/user/wt/cand/package.json');
const { createKeystoreApi } = await import('/home/user/wt/cand/packages/ux-vault/dist/portable.js');
const { encodeMetaAddress, secretScalarFromBytes, parseCompressedPoint } = await import('/home/user/wt/cand/packages/core-crypto/dist/index.js');
const EC = require('elliptic').ec; const { keccak256 } = require('js-sha3'); const BN = require('bn.js');
const ec = new EC('secp256k1');
const vec = JSON.parse(require('fs').readFileSync('/home/user/wt/cand/test-vectors/scheme1.json','utf8')).vectors[0];
const hx = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/,''), 'hex'));
const spend = hx(vec.spendingPrivateKey), view = hx(vec.viewingPrivateKey);
const signing = hx('0x' + '44'.repeat(32));
const pub = (k) => Uint8Array.from(Buffer.from(ec.keyFromPrivate(Buffer.from(k)).getPublic(true, 'hex'), 'hex'));
const meta = { metaAddress: encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(pub(spend)), viewingPublicKey: parseCompressedPoint(pub(view)) }), signer: Buffer.from(pub(signing)).toString('hex') };
const api = createKeystoreApi();
const pass = api.generatePassphrase();
const t0 = Date.now();
const text = await api.encryptKeystore({ spendingKey: spend.slice(), viewingKey: view.slice(), signingKey: signing.slice() }, meta, pass);
const t1 = Date.now();
const f = JSON.parse(text);
// ---- independent decrypt (node:crypto only) ----
const { N, r, p, salt } = f.kdfParams;
const key = scryptSync(Buffer.from(pass.normalize('NFKC'), 'utf8'), Buffer.from(salt, 'hex'), 32, { N, r, p, maxmem: 512 * 1024 * 1024 });
const ct = Buffer.from(f.ciphertext, 'hex'); const tag = ct.subarray(ct.length - 16); const body = ct.subarray(0, ct.length - 16);
const d = createDecipheriv('aes-256-gcm', key, Buffer.from(f.iv, 'hex'));
d.setAAD(Buffer.from(`GhostPay.keystore.v1|${f.meta.metaAddress}|${f.meta.signer}|${N}|${r}|${p}`, 'utf8'));
d.setAuthTag(tag);
const plain = JSON.parse(Buffer.concat([d.update(body), d.final()]).toString('utf8'));
const t2 = Date.now();
// tamper check: flip one AAD byte must fail
let tamperRejected = false;
try { const d2 = createDecipheriv('aes-256-gcm', key, Buffer.from(f.iv, 'hex')); d2.setAAD(Buffer.from(`GhostPay.keystore.v1|${f.meta.metaAddress}|${f.meta.signer}|${N}|${r}|${p+1}`)); d2.setAuthTag(tag); d2.update(body); d2.final(); } catch { tamperRejected = true; }
// ---- independent stealth key derivation for vector announcement ----
const n = ec.curve.n; const pS = new BN(plain.spendingKey, 16), pV = new BN(plain.viewingKey, 16);
const R = ec.keyFromPublic(vec.ephemeralPublicKey.slice(2), 'hex').getPublic();
const sh = keccak256(Buffer.from(R.mul(pV).encode('hex', true), 'hex'));
const pst = pS.add(new BN(sh, 16).umod(n)).umod(n);
const addr = '0x' + keccak256(Buffer.from(ec.g.mul(pst).encode('hex', false).slice(2), 'hex')).slice(24);
const out = {
  kdf: { N, r, p }, iv_len: f.iv.length / 2, salt_len: salt.length / 2, encryptMs: t1 - t0, independentDecryptMs: t2 - t1,
  decryptOk: plain.spendingKey === vec.spendingPrivateKey.slice(2) && plain.viewingKey === vec.viewingPrivateKey.slice(2),
  tamperRejected, tagMatchesVector: '0x' + sh.slice(0, 2) === vec.viewTag,
  stealthKeyMatches: '0x' + pst.toString(16, 64) === vec.stealthPrivateKey, stealthAddrMatches: addr === vec.stealthAddress.toLowerCase(),
};
console.log(JSON.stringify(out, null, 1));
process.exit(out.decryptOk && out.tamperRejected && out.stealthKeyMatches && out.stealthAddrMatches ? 0 : 1);
