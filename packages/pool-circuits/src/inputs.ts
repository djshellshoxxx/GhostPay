import { MAX_TREE_DEPTH, assertField, assertTestnetChain, assertValue } from './constants.js';
import { fail } from './errors.js';
import { commitment, precommitment } from './hash.js';
import type { CircuitPath } from './leanImt.js';

/** Witness JSON for `Withdraw(32)` (keys and order as INTERFACE.md section 2). Decimal strings. */
export interface WithdrawInputs {
  readonly withdrawnValue: string;
  readonly stateRoot: string;
  readonly stateTreeDepth: string;
  readonly aspEnabled: string;
  readonly ASPRoot: string;
  readonly ASPTreeDepth: string;
  readonly context: string;
  readonly label: string;
  readonly existingValue: string;
  readonly existingNullifier: string;
  readonly existingSecret: string;
  readonly newNullifier: string;
  readonly newSecret: string;
  readonly stateSiblings: readonly string[];
  readonly stateIndex: string;
  readonly ASPSiblings: readonly string[];
  readonly ASPIndex: string;
}

/** Witness JSON for the ragequit (`CommitmentHasher`) circuit. */
export interface RagequitInputs {
  readonly value: string;
  readonly label: string;
  readonly nullifier: string;
  readonly secret: string;
}

/** A note as the circuit sees it. */
export interface CircuitNote {
  readonly value: bigint;
  readonly label: bigint;
  readonly nullifier: bigint;
  readonly secret: bigint;
}

/** Arguments for {@link buildWithdrawInputs}. */
export interface WithdrawArgs {
  readonly chainId: number;
  readonly note: CircuitNote;
  readonly statePath: CircuitPath;
  /** ASP path for `note.label`, or `undefined` for `aspEnabled = 0`. */
  readonly aspPath?: CircuitPath | undefined;
  readonly withdrawnValue: bigint;
  readonly newNullifier: bigint;
  readonly newSecret: bigint;
  /** `keccak256(abi.encode(withdrawal, SCOPE)) % P`, computed by the caller. */
  readonly context: bigint;
}

const ZEROS: readonly string[] = Object.freeze(new Array<string>(MAX_TREE_DEPTH).fill('0'));

function checkPath(p: CircuitPath, name: string): void {
  if (p.siblings.length !== MAX_TREE_DEPTH)
    fail('BAD_INDEX', `${name} must have ${String(MAX_TREE_DEPTH)} siblings`);
  if (!Number.isInteger(p.depth) || p.depth < 0 || p.depth > MAX_TREE_DEPTH)
    fail('BAD_INDEX', `${name} depth out of range`);
  if (!Number.isInteger(p.index) || p.index < 0 || p.index >= 2 ** MAX_TREE_DEPTH)
    fail('BAD_INDEX', `${name} index out of range`);
  assertField(p.root, `${name}.root`);
  p.siblings.forEach((s, i) => {
    assertField(s, `${name}.siblings`);
    if (i >= p.depth && s !== 0n) fail('BAD_INDEX', `${name} has a sibling above its depth`);
    if (s === 0n && Math.floor(p.index / 2 ** i) % 2 === 1)
      fail('BAD_INDEX', `${name} index bit set where sibling is empty`);
  });
}

/**
 * Builds the `Withdraw(32)` witness JSON and pre-checks every constraint that would otherwise fail
 * opaquely inside witness generation.
 *
 * @security Output contains the note's nullifier and secret: pass it only to a local prover, never to a
 *           relayer, RPC or log. Refuses non-testnet chain ids.
 * @throws PoolCircuitError `WRONG_CHAIN`, `NOT_FIELD`, `OUT_OF_RANGE`, `SAME_NULLIFIER`, `BAD_INDEX`.
 */
export function buildWithdrawInputs(a: WithdrawArgs): WithdrawInputs {
  assertTestnetChain(a.chainId);
  const n = a.note;
  assertValue(n.value, 'existingValue');
  assertValue(a.withdrawnValue, 'withdrawnValue');
  if (a.withdrawnValue > n.value) fail('OUT_OF_RANGE', 'withdrawnValue exceeds note value');
  assertField(n.label, 'label');
  assertField(a.newNullifier, 'newNullifier');
  assertField(a.newSecret, 'newSecret');
  assertField(a.context, 'context');
  if (a.newNullifier === n.nullifier) fail('SAME_NULLIFIER', 'change note must use a fresh nullifier');
  // validates nullifier / secret are field elements (the leaf itself is checked by the circuit)
  commitment(n.value, n.label, precommitment(n.nullifier, n.secret));
  checkPath(a.statePath, 'statePath');
  let asp: Pick<WithdrawInputs, 'aspEnabled' | 'ASPRoot' | 'ASPTreeDepth' | 'ASPSiblings' | 'ASPIndex'>;
  if (a.aspPath === undefined) {
    asp = { aspEnabled: '0', ASPRoot: '0', ASPTreeDepth: '0', ASPSiblings: ZEROS, ASPIndex: '0' };
  } else {
    checkPath(a.aspPath, 'aspPath');
    if (a.aspPath.root === 0n) fail('ASP_LABEL_MISSING', 'ASP root must be non-zero when enabled');
    asp = {
      aspEnabled: '1',
      ASPRoot: a.aspPath.root.toString(),
      ASPTreeDepth: String(a.aspPath.depth),
      ASPSiblings: a.aspPath.siblings.map(String),
      ASPIndex: String(a.aspPath.index),
    };
  }
  return {
    withdrawnValue: a.withdrawnValue.toString(),
    stateRoot: a.statePath.root.toString(),
    stateTreeDepth: String(a.statePath.depth),
    aspEnabled: asp.aspEnabled,
    ASPRoot: asp.ASPRoot,
    ASPTreeDepth: asp.ASPTreeDepth,
    context: a.context.toString(),
    label: n.label.toString(),
    existingValue: n.value.toString(),
    existingNullifier: n.nullifier.toString(),
    existingSecret: n.secret.toString(),
    newNullifier: a.newNullifier.toString(),
    newSecret: a.newSecret.toString(),
    stateSiblings: a.statePath.siblings.map(String),
    stateIndex: String(a.statePath.index),
    ASPSiblings: asp.ASPSiblings,
    ASPIndex: asp.ASPIndex,
  };
}

/**
 * Builds the ragequit witness JSON.
 *
 * @security Output contains the nullifier and secret: local prover only. Refuses non-testnet chain ids.
 * @throws PoolCircuitError `WRONG_CHAIN`, `NOT_FIELD`, `OUT_OF_RANGE`.
 */
export function buildRagequitInputs(chainId: number, note: CircuitNote): RagequitInputs {
  assertTestnetChain(chainId);
  assertValue(note.value, 'value');
  assertField(note.label, 'label');
  precommitment(note.nullifier, note.secret);
  return {
    value: note.value.toString(),
    label: note.label.toString(),
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
  };
}
