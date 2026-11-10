// Measures the heap a HeaderChain retains per active header.
// Run after `npm run build`:  node --expose-gc scripts/bench-headerchain-memory.mjs [count]
// Mines `count` regtest headers (cheap proof of work), connects them in 2016-header batches, drops the inputs, then
// compares the GC'd heap with the chain alive and after dropping it. Prints bytes per header; exits 1 above
// MAX_BYTES_PER_HEADER (default 250).
import { CHAIN_PARAMS, HeaderChain, parseHeader, reverseHex, targetFromBits } from '../dist/index.js';

const MAX_BYTES_PER_HEADER = Number(process.env['MAX_BYTES_PER_HEADER'] ?? '250');
const N = Number(process.argv[2] ?? '100000');
const GENESIS =
  '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4adae5494dffff7f2002000000';
if (typeof globalThis.gc !== 'function') throw new Error('run with node --expose-gc');
const u32 = (n) => [0, 8, 16, 24].map((s) => ((n >>> s) & 255).toString(16).padStart(2, '0')).join('');
const target = targetFromBits(0x207fffff);
const heap = () => {
  globalThis.gc();
  globalThis.gc();
  const m = process.memoryUsage();
  return m.heapUsed + m.arrayBuffers; // typed-array backing stores live outside the JS heap
};

function mineAll(n) {
  const out = [];
  let prev = parseHeader(GENESIS);
  for (let i = 0; i < n; i++) {
    const time = prev.time + 1201; // > 20 min: a min-difficulty regtest block without a walk back
    const merkle = i.toString(16).padStart(8, '0').repeat(8);
    for (let nonce = 0; ; nonce++) {
      const hex = `${u32(0x20000000)}${reverseHex(prev.hash)}${merkle}${u32(time)}${u32(0x207fffff)}${u32(nonce)}`;
      const h = parseHeader(hex);
      if (BigInt(`0x${h.hash}`) <= target) {
        out.push(hex);
        prev = h;
        break;
      }
    }
  }
  return out;
}

let headers = mineAll(N);
let chain = HeaderChain.create({
  params: CHAIN_PARAMS.regtest,
  checkpoint: { height: 0, hash: parseHeader(GENESIS).hash, headerHex: GENESIS },
  now: () => 2_000_000_000,
});
for (let i = 0; i < headers.length; i += 2016) chain.connect(headers.slice(i, i + 2016));
const tip = chain.tipHeight;
headers = undefined;
const alive = heap();
chain = undefined;
const gone = heap();
const perHeader = Math.round((alive - gone) / N);
console.log(JSON.stringify({ headers: tip, retainedMB: Math.round((alive - gone) / 1e5) / 10, bytesPerHeader: perHeader, limit: MAX_BYTES_PER_HEADER }));
if (tip !== N || perHeader > MAX_BYTES_PER_HEADER) process.exit(1);
