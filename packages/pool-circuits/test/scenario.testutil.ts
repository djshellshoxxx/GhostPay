import { randomBytes } from 'node:crypto';
import {
  LeanImt,
  MAX_TREE_DEPTH,
  SNARK_SCALAR_FIELD,
  buildWithdrawInputs,
  commitment,
  hashNode,
  nullifierHash,
  precommitment,
} from '../src/index.js';
import type { CircuitNote, CircuitPath, WithdrawInputs } from '../src/index.js';

/** Uniform-ish random field element (crypto RNG, 64 bytes reduced). */
export function rf(): bigint {
  return BigInt('0x' + randomBytes(64).toString('hex')) % SNARK_SCALAR_FIELD;
}

export function randomNote(value = 1_000_000n): CircuitNote {
  return { value, label: rf(), nullifier: rf(), secret: rf() };
}

export function leafOf(n: CircuitNote): bigint {
  return commitment(n.value, n.label, precommitment(n.nullifier, n.secret));
}

/** Synthetic full path of `depth` levels, all siblings present, random index < 2^depth. */
export function syntheticPath(leaf: bigint, depth: number): CircuitPath {
  const siblings: bigint[] = [];
  let index = 0;
  let node = leaf;
  for (let l = 0; l < depth; l++) {
    const sib = rf();
    const bit = randomBytes(1)[0]! & 1;
    index += bit * 2 ** l;
    node = bit === 1 ? hashNode(sib, node) : hashNode(node, sib);
    siblings.push(sib);
  }
  while (siblings.length < MAX_TREE_DEPTH) siblings.push(0n);
  return { root: node, depth, index, siblings };
}

export interface Scenario {
  note: CircuitNote;
  newNullifier: bigint;
  newSecret: bigint;
  withdrawnValue: bigint;
  context: bigint;
  input: WithdrawInputs;
  expect: { newCommitmentHash: bigint; existingNullifierHash: bigint };
}

/** Real LeanIMT with `others` random leaves around the note, optional ASP set. */
export function scenario(
  opts: {
    stateSize?: number;
    position?: number;
    asp?: boolean;
    aspSize?: number;
    withdrawnValue?: bigint;
    value?: bigint;
    stateDepth?: number; // synthetic path instead of a real tree
  } = {},
): Scenario {
  const note = randomNote(opts.value ?? 1_000_000n);
  const leaf = leafOf(note);
  let statePath: CircuitPath;
  if (opts.stateDepth !== undefined) {
    statePath = syntheticPath(leaf, opts.stateDepth);
  } else {
    const size = opts.stateSize ?? 5;
    const pos = opts.position ?? Math.floor(size / 2);
    const t = new LeanImt();
    for (let i = 0; i < size; i++) t.insert(i === pos ? leaf : rf());
    statePath = t.path(pos);
  }
  let aspPath: CircuitPath | undefined;
  if (opts.asp === true) {
    const t = new LeanImt();
    const size = opts.aspSize ?? 3;
    for (let i = 0; i < size; i++) t.insert(i === size - 1 ? note.label : rf());
    aspPath = t.path(size - 1);
  }
  const withdrawnValue = opts.withdrawnValue ?? 400_000n;
  const newNullifier = rf();
  const newSecret = rf();
  const context = rf();
  const input = buildWithdrawInputs({
    chainId: 31337,
    note,
    statePath,
    aspPath,
    withdrawnValue,
    newNullifier,
    newSecret,
    context,
  });
  return {
    note,
    newNullifier,
    newSecret,
    withdrawnValue,
    context,
    input,
    expect: {
      newCommitmentHash: commitment(
        note.value - withdrawnValue,
        note.label,
        precommitment(newNullifier, newSecret),
      ),
      existingNullifierHash: nullifierHash(note.nullifier),
    },
  };
}
