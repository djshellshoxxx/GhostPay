#!/usr/bin/env node
// Generates test/fixtures/proofs/pool-e2e.json: REAL Groth16 proofs (packages/pool-circuits artifacts,
// INSECURE DEV CEREMONY keys) bound to the exact deterministic deployment of test/RealProof.t.sol
// (pool address, chain 31337, token address, deposit order). The Solidity test re-derives every value
// on-chain and fails if anything (addresses, labels, commitments, roots, context) diverges.
//
// Needs: root node_modules (viem, poseidon-lite, snarkjs) and packages/pool-circuits/build/
// {withdraw32_js/withdraw32.wasm, withdraw32_final.zkey, commitment_js/commitment.wasm, commitment_final.zkey}.
// Usage: node scripts/gen-proof-fixtures.mjs <poolAddress> <tokenAddress> > test/fixtures/proofs/pool-e2e.json
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAbiParameters, encodePacked, keccak256 } from 'viem';
import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite';
import * as snarkjs from 'snarkjs';

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const HERE = dirname(fileURLToPath(import.meta.url));
const CIRCUITS = join(HERE, '..', '..', 'pool-circuits', 'build');
const [pool, token] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(pool ?? '') || !/^0x[0-9a-fA-F]{40}$/.test(token ?? '')) {
  console.error('usage: gen-proof-fixtures.mjs <pool> <token>');
  process.exit(2);
}
const CHAIN_ID = 31337n;
// Fixed actors (must match RealProof.t.sol).
const RECIPIENT = '0x000000000000000000000000000000000000dEaD';
const RELAYER = '0x0000000000000000000000000000000000001234';
const FEE_TO = '0x0000000000000000000000000000000000005678';
const PUBLISHER = '0x0000000000000000000000000000000000009abc';
const DEADLINE = 2000000000n;

const scope = BigInt(keccak256(encodeAbiParameters(
  [{ type: 'address' }, { type: 'uint256' }, { type: 'address' }], [pool, CHAIN_ID, token]))) % P;
const labelOf = (n) => BigInt(keccak256(encodePacked(['uint256', 'uint256'], [scope, n]))) % P;

// Notes: A (alice, spent by the withdrawal), B (bob, ragequit).
const A = { value: 1000000n, nullifier: 111n, secret: 222n, label: labelOf(1n) };
const B = { value: 500000n, nullifier: 333n, secret: 444n, label: labelOf(2n) };
for (const n of [A, B]) {
  n.pre = poseidon2([n.nullifier, n.secret]);
  n.commitment = poseidon3([n.value, n.label, n.pre]);
  n.nullifierHash = poseidon1([n.nullifier]);
}
// LeanIMT with two leaves: root = H(A, B), depth 1; ASP tree over labels likewise.
const stateRoot = poseidon2([A.commitment, B.commitment]);
const aspRoot = poseidon2([A.label, B.label]);
const pad = (xs) => [...xs, ...Array(32 - xs.length).fill(0n)];

const withdrawal = {
  recipient: RECIPIENT, relayer: RELAYER, relayerFee: 3000n, feeTo: FEE_TO,
  deadline: DEADLINE, aspPublisher: PUBLISHER, announce: '0x',
};
const W = [
  { name: 'recipient', type: 'address' }, { name: 'relayer', type: 'address' },
  { name: 'relayerFee', type: 'uint256' }, { name: 'feeTo', type: 'address' },
  { name: 'deadline', type: 'uint256' }, { name: 'aspPublisher', type: 'address' },
  { name: 'announce', type: 'bytes' },
];
const context = BigInt(keccak256(encodeAbiParameters(
  [{ type: 'tuple', components: W }, { type: 'uint256' }], [withdrawal, scope]))) % P;

const withdrawnValue = 600000n;
const change = { nullifier: 555n, secret: 666n };
const withdrawInput = {
  withdrawnValue, stateRoot, stateTreeDepth: 1n, aspEnabled: 1n, ASPRoot: aspRoot, ASPTreeDepth: 1n,
  context, label: A.label, existingValue: A.value, existingNullifier: A.nullifier,
  existingSecret: A.secret, newNullifier: change.nullifier, newSecret: change.secret,
  stateSiblings: pad([B.commitment]), stateIndex: 0n, ASPSiblings: pad([B.label]), ASPIndex: 0n,
};
const ragequitInput = { value: B.value, label: B.label, nullifier: B.nullifier, secret: B.secret };

function artifacts(name) {
  const wasm = join(CIRCUITS, `${name}_js`, `${name}.wasm`);
  const zkey = join(CIRCUITS, `${name}_final.zkey`);
  if (!existsSync(wasm) || !existsSync(zkey)) throw new Error(`missing ${wasm} or ${zkey}`);
  return [wasm, zkey];
}
const s = (x) => x.toString();
function calldata(proof, publicSignals) {
  return {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
    pC: [proof.pi_c[0], proof.pi_c[1]],
    pubSignals: publicSignals,
  };
}
const stringify = (o) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? s(v) : v)));

const w = await snarkjs.groth16.fullProve(stringify(withdrawInput), ...artifacts('withdraw32'));
const r = await snarkjs.groth16.fullProve(stringify(ragequitInput), ...artifacts('commitment'));
const expectedChange = poseidon3([A.value - withdrawnValue, A.label, poseidon2([change.nullifier, change.secret])]);
if (w.publicSignals[0] !== s(expectedChange)) throw new Error('change commitment mismatch');
if (w.publicSignals[8] !== s(context)) throw new Error('context mismatch');

const out = {
  warning: 'INSECURE DEV CEREMONY proofs (packages/pool-circuits); toxic waste is public. Test only.',
  generator: 'packages/pool-contracts/scripts/gen-proof-fixtures.mjs',
  chainId: s(CHAIN_ID), pool, token, scope: s(scope),
  noteA: stringify(A), noteB: stringify(B), stateRoot: s(stateRoot), aspRoot: s(aspRoot),
  withdrawal: stringify(withdrawal), context: s(context), withdrawnValue: s(withdrawnValue),
  changeCommitment: s(expectedChange),
  withdraw: calldata(w.proof, w.publicSignals),
  ragequit: calldata(r.proof, r.publicSignals),
};
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
process.exit(0);
