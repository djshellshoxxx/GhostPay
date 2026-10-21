// Generates test-vectors/tron.json from the built package (run `npm run build -w @ghostpay/tron-adapter` first).
// Keys here are throwaway test values derived from a seed string. NEVER real keys.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import {
  buildTrc20Transfer,
  buildTrxTransfer,
  deriveTronStealth,
  encodeTronMetaAddress,
  tronAddressFromEvm,
} from '../dist/index.js';

function seededRng(seed) {
  let counter = 0;
  const outputs = [];
  return {
    outputs,
    getRandomValues(array) {
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      let off = 0;
      while (off < view.length) {
        const block = createHash('sha256').update(`${seed}:${counter++}`).digest();
        const n = Math.min(block.length, view.length - off);
        view.set(block.subarray(0, n), off);
        off += n;
      }
      outputs.push(Uint8Array.from(view));
      return array;
    },
  };
}
const hex = (b) => Buffer.from(b).toString('hex');

const keys = generateKeySet(seededRng('ghostpay-tron-vector-keys'));
const meta = encodeTronMetaAddress(keys);
const rng = seededRng('ghostpay-tron-vector-eph');
const s = deriveTronStealth(meta, rng);
const ephemeralSecret = hex(rng.outputs[0]);

const usdtHex = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const usdt = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const payer = tronAddressFromEvm('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
const refBlock = { number: 0x12345n, blockId: '000000000001234500112233445566778899aabbccddeeff0011223344556677' };
const common = { owner: payer, refBlock, timestampMs: 1_700_000_000_000n, memo: s.memo };
const trc20 = buildTrc20Transfer({ ...common, contract: usdt, to: s.stealthAddress, amount: 12_345_678n, feeLimitSun: 100_000_000n });
const trx = buildTrxTransfer({ ...common, to: s.stealthAddress, amountSun: 5_000_000n });

const out = {
  note: 'Throwaway test vectors. Keys are NOT real. Cross-checked by scripts/crosscheck_vectors.py (independent Python).',
  addresses: [
    { name: 'USDT TRC-20 contract (mainnet; widely published)', hex: usdtHex, base58: usdt },
    { name: 'secp256k1 private key 1 (0x7E5F...5Bdf EVM address)', hex: '41' + '7e5f4552091a69125d5dfcb7b8c2659029395bdf', base58: payer },
  ],
  stealth: {
    spendSecret: hex(unsafeRevealSecret(keys.spendingSecret)),
    viewSecret: hex(unsafeRevealSecret(keys.viewingSecret)),
    spendPublicKey: hex(keys.spendingPublicKey),
    viewPublicKey: hex(keys.viewingPublicKey),
    meta,
    ephemeralSecret,
    ephemeralPublicKey: hex(s.ephemeralPublicKey),
    viewTag: s.viewTag,
    stealthAddress: s.stealthAddress,
    memoHex: hex(s.memo),
  },
  txs: [
    { kind: 'trc20', owner: payer, contract: usdt, to: s.stealthAddress, amount: '12345678', feeLimitSun: '100000000', timestampMs: '1700000000000', expirationMs: String(1_700_000_000_000 + 600_000), refBlockNumber: '74565', refBlockId: refBlock.blockId, memoHex: hex(s.memo), rawDataHex: trc20.rawDataHex, txID: trc20.txID },
    { kind: 'trx', owner: payer, to: s.stealthAddress, amount: '5000000', timestampMs: '1700000000000', expirationMs: String(1_700_000_000_000 + 600_000), refBlockNumber: '74565', refBlockId: refBlock.blockId, memoHex: hex(s.memo), rawDataHex: trx.rawDataHex, txID: trx.txID },
  ],
};
writeFileSync(new URL('../test-vectors/tron.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote test-vectors/tron.json');
