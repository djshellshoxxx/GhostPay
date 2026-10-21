// Mutation test: can calldata/tx be changed so that assertPreviewMatchesCalldata still passes while meaning differs?
import { buildPaymentTx, assertPreviewMatchesCalldata, decodePaymentCalldata, validateManifest, findChain, CHAINS } from '@ghostpay/chain-adapters';
import { generateKeySet, encodeMetaAddress, deriveStealthPayment } from '@ghostpay/core-crypto';

const A = (n) => '0x' + n.toString(16).padStart(40, '0');
const h32 = (n) => '0x' + n.toString(16).padStart(64, '0');
const manifest = validateManifest({ chainId: 84532, announcer: '0x55649E01B5Df198D18D95b5cc5051630cfD45564', router: '0x5FbDB2315678afecb367f032d93F642f64180aa3', sweepRelayer: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  feeRecipient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', feeBps: 25, deployTx: { router: h32(1), sweepRelayer: h32(2) }, solcVersion: '0.8.28+commit.7893614a', commit: '0'.repeat(39) + '1',
  bytecodeHashes: { router: h32(3), sweepRelayer: h32(4) }, date: '2026-01-01T00:00:00Z' }, 84532);
const seller = generateKeySet();
const mk = (token, extra = {}) => { const payment = deriveStealthPayment(encodeMetaAddress(seller));
  return buildPaymentTx({ chain: findChain(84532), deployment: manifest, invoice: { chainId: 84532, token }, payment, grossAmount: 1_000_000n, deadline: 2_000_000_000n, ...extra }); };
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const cases = { payERC20: mk(USDC), payNative: mk('native', { grossAmount: 10n ** 18n }), payERC20WithBuffer: mk(USDC, { buffer: { bufferWei: 10n ** 15n } }) };
let passes = 0, rejected = 0, equivalent = 0, bad = [];
const tryTx = (name, preview, tx) => { try { assertPreviewMatchesCalldata(preview, tx, 84532); passes++; return true; } catch { rejected++; return false; } };
for (const [m, { tx, preview }] of Object.entries(cases)) {
  assertPreviewMatchesCalldata(preview, tx, 84532); // baseline
  const named = {
    'to -> other contract': { ...tx, to: A(0xdead) }, 'value +1': { ...tx, value: tx.value + 1n }, 'value 0': { ...tx, value: 0n },
    'trailing byte': { ...tx, data: tx.data + '00' }, 'trailing 32 zero bytes': { ...tx, data: tx.data + '00'.repeat(32) },
    'uppercased hex': { ...tx, data: tx.data.toUpperCase().replace('0X', '0x') }, 'wrong selector': { ...tx, data: '0xdeadbeef' + tx.data.slice(10) },
    'empty data': { ...tx, data: '0x' }, 'to checksummed vs lower (benign)': { ...tx, to: tx.to.toLowerCase() },
  };
  for (const [n, t] of Object.entries(named)) { const ok = tryTx(n, preview, t); console.log(`${m.padEnd(20)} ${n.padEnd(36)} ${ok ? 'ACCEPTED' : 'rejected'}`); }
  // random byte flips: any accepted flip must decode to the identical preview
  const base = tx.data.slice(2); let accepted = 0;
  for (let i = 0; i < 3000; i++) {
    const pos = Math.floor(Math.random() * base.length); const nib = ((parseInt(base[pos], 16) ^ (1 + Math.floor(Math.random() * 15))) & 15).toString(16);
    const d = '0x' + base.slice(0, pos) + nib + base.slice(pos + 1);
    if (tryTx('flip', preview, { ...tx, data: d })) { accepted++; const dec = decodePaymentCalldata({ ...tx, data: d }, 84532); if (JSON.stringify(dec, (_, x) => typeof x === 'bigint' ? x.toString() : x) !== JSON.stringify(preview, (_, x) => typeof x === 'bigint' ? x.toString() : x)) bad.push(d); }
  }
  console.log(`${m.padEnd(20)} 3000 random nibble flips: accepted=${accepted} (accepted-but-semantically-different=${bad.length})`);
}
console.log('NOT covered by the check (by design): fee RECIPIENT (router immutable), stealth address ownership (payer cannot verify), tx gas/EIP-1559 fields, chain actually used by wallet (needs independent RPC).');
