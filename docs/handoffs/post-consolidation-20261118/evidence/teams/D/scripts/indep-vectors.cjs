// Independent EIP-5564 scheme-1 check using elliptic + js-sha3 (no @noble), against candidate test-vectors/scheme1.json
const path = require('path');
const R = (m) => require(path.join('/home/user/wt/cand/node_modules', m));
const EC = R('elliptic').ec; const { keccak256 } = R('js-sha3');
const ec = new EC('secp256k1'); const BN = R('bn.js');
const file = JSON.parse(require('fs').readFileSync('/home/user/wt/cand/test-vectors/scheme1.json','utf8'));
const n = ec.curve.n;
function addr(pubPoint){ const unc = pubPoint.encode('hex', false).slice(2); const h = keccak256(Buffer.from(unc,'hex')); return '0x'+h.slice(24); }
let ok=0, bad=0;
for (const v of file.vectors) {
  const p_spend = new BN(v.spendingPrivateKey.slice(2),16), p_view = new BN(v.viewingPrivateKey.slice(2),16), r = new BN(v.ephemeralPrivateKey.slice(2),16);
  const P_spend = ec.g.mul(p_spend), P_view = ec.g.mul(p_view), R_ = ec.g.mul(r);
  const S = P_view.mul(r); const Sc = S.encode('hex', true);
  const sh = keccak256(Buffer.from(Sc,'hex')); const tag = '0x'+sh.slice(0,2);
  const h = new BN(sh,16).umod(n);
  const Q = P_spend.add(ec.g.mul(h)); const a = addr(Q);
  const pst = p_spend.add(h).umod(n);
  // recipient side: S' = p_view * R
  const S2 = R_.mul(p_view).encode('hex', true);
  const checks = {
    spendPub: '0x'+P_spend.encode('hex',true) === v.spendingPublicKey,
    viewPub: '0x'+P_view.encode('hex',true) === v.viewingPublicKey,
    eph: '0x'+R_.encode('hex',true) === v.ephemeralPublicKey,
    tag: tag === v.viewTag,
    addr: a === v.stealthAddress.toLowerCase(),
    priv: '0x'+pst.toString(16,64) === v.stealthPrivateKey,
    ecdhSym: S2 === Sc,
    privToAddr: addr(ec.g.mul(pst)) === v.stealthAddress.toLowerCase(),
  };
  const all = Object.values(checks).every(Boolean);
  all ? ok++ : bad++;
  console.log(v.id, all ? 'OK' : 'MISMATCH', all ? '' : JSON.stringify(checks));
}
console.log(`vectors=${file.vectors.length} ok=${ok} bad=${bad}`);
process.exit(bad?1:0);
