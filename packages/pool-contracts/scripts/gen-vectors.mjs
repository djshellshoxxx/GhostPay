#!/usr/bin/env node
// Generates test/fixtures/poseidon-vectors.json: reference Poseidon (circomlibjs, the JS twin of the
// circomlib circuits) and LeanIMT (@zk-kit/lean-imt) values that the Solidity tests must reproduce.
//
// The generator deps are NOT dependencies of this package (circomlibjs is GPL-3.0). Install them in a
// throw-away directory and pass it as the first argument:
//   mkdir /tmp/vec && cd /tmp/vec && npm init -y && \
//     npm install --ignore-scripts circomlibjs@0.1.7 @zk-kit/lean-imt@2.2.5
//   node scripts/gen-vectors.mjs /tmp/vec > test/fixtures/poseidon-vectors.json
// Deterministic: inputs come from a fixed SHA-256 counter stream, so re-running reproduces the file.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const depsDir = process.argv[2];
if (!depsDir) {
  console.error('usage: node scripts/gen-vectors.mjs <dir-with-node_modules>');
  process.exit(2);
}
const require = createRequire(join(resolve(depsDir), 'package.json'));
const { buildPoseidonReference } = require('circomlibjs');
const { LeanIMT } = require('@zk-kit/lean-imt');

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const poseidon = await buildPoseidonReference();
const H = (xs) => poseidon.F.toObject(poseidon(xs));

let ctr = 0;
function rnd() {
  // Field element from SHA-256("ghostpay/pool-contracts/vectors" || ctr), reduced mod P.
  const h = createHash('sha256').update(`ghostpay/pool-contracts/vectors/${ctr++}`).digest('hex');
  return BigInt('0x' + h) % P;
}

const edge = [0n, 1n, 2n, P - 1n];
const t3 = [];
const t4 = [];
for (const a of edge) for (const b of edge) t3.push({ in: [a, b], out: H([a, b]) });
for (let i = 0; i < 48; i++) {
  const a = rnd(), b = rnd();
  t3.push({ in: [a, b], out: H([a, b]) });
}
t4.push({ in: [1n, 2n, 3n], out: H([1n, 2n, 3n]) });
t4.push({ in: [0n, 0n, 0n], out: H([0n, 0n, 0n]) });
t4.push({ in: [P - 1n, P - 1n, P - 1n], out: H([P - 1n, P - 1n, P - 1n]) });
for (let i = 0; i < 48; i++) {
  // value < 2^128 like real commitments, label and precommitment full field.
  const v = rnd() % (1n << 128n), l = rnd(), pre = rnd();
  t4.push({ in: [v, l, pre], out: H([v, l, pre]) });
}

// LeanIMT roots after each insert, leaves = Poseidon(i+1, 0) style distinct non-zero field elements.
const tree = new LeanIMT((a, b) => H([a, b]));
const leaves = [];
const roots = [];
const depths = [];
for (let i = 0; i < 70; i++) {
  const leaf = rnd() || 1n;
  tree.insert(leaf);
  leaves.push(leaf);
  roots.push(tree.root);
  depths.push(tree.depth);
}

const s = (x) => x.toString();
const out = {
  generator: 'packages/pool-contracts/scripts/gen-vectors.mjs (circomlibjs@0.1.7 buildPoseidonReference, @zk-kit/lean-imt@2.2.5)',
  t3: { a: t3.map((v) => s(v.in[0])), b: t3.map((v) => s(v.in[1])), out: t3.map((v) => s(v.out)) },
  t4: {
    a: t4.map((v) => s(v.in[0])),
    b: t4.map((v) => s(v.in[1])),
    c: t4.map((v) => s(v.in[2])),
    out: t4.map((v) => s(v.out)),
  },
  imt: { leaves: leaves.map(s), roots: roots.map(s), depths },
};
process.stdout.write(JSON.stringify(out, null, 1).replace(/\n\s+("\d+"|\d+)(,?)/g, ' $1$2').replace(/\n\s+\]/g, ' ]') + '\n');
