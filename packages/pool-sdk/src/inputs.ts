import { fail } from './errors.js';
import { MAX_TREE_DEPTH, MAX_VALUE, assertField, assertValue } from './field.js';
import { buildAspTree } from './asp.js';
import { commitment, noteCommitment, nullifierHash, precommitment, type Note, type NoteSecrets } from './notes.js';
import type { PoolTree } from './tree.js';

/** Witness input for `Withdraw(32)` (names per `packages/pool-circuits/INTERFACE.md` section 2). All decimal strings. */
export interface WithdrawCircuitInputs {
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

/** Witness input for the ragequit (commitment) circuit. */
export interface RagequitCircuitInputs {
  readonly value: string;
  readonly label: string;
  readonly nullifier: string;
  readonly secret: string;
}

/** Arguments of {@link buildWithdrawInputs}. */
export interface BuildWithdrawArgs {
  readonly note: Note;
  readonly tree: PoolTree;
  /** Association set labels; omit for `aspEnabled = 0`. */
  readonly asp?: { readonly labels: readonly bigint[] };
  readonly withdrawnValue: bigint;
  readonly newNote: NoteSecrets;
  readonly context: bigint;
}

/**
 * Builds the `Withdraw(32)` witness input and checks the statement locally so a bad request fails
 * before an expensive proof (the circuit would reject it anyway).
 *
 * @throws PoolSdkError `INVALID_INPUT` for any violated precondition, `NOTE_NOT_FOUND` if the note's
 *   commitment is not in `tree`.
 * @security The returned object contains the note's nullifier and secret. Pass it to the local prover only.
 */
export function buildWithdrawInputs(a: BuildWithdrawArgs): WithdrawCircuitInputs {
  const { note } = a;
  assertValue(a.withdrawnValue, 'withdrawnValue');
  if (a.withdrawnValue > note.value) fail('INVALID_INPUT', 'withdrawnValue exceeds note value');
  assertField(a.context, 'context');
  assertField(a.newNote.nullifier, 'newNullifier');
  assertField(a.newNote.secret, 'newSecret');
  if (a.newNote.nullifier === note.nullifier) fail('INVALID_INPUT', 'change note must use a new nullifier');
  const c = noteCommitment(note);
  const leafIndex = a.tree.indexOf(c);
  if (leafIndex < 0) return fail('NOTE_NOT_FOUND', 'note commitment is not in the synced tree');
  const sp = a.tree.proof(leafIndex);
  if (sp.depth > MAX_TREE_DEPTH) fail('INVALID_INPUT', 'tree too deep');
  let aspInputs: Pick<WithdrawCircuitInputs, 'aspEnabled' | 'ASPRoot' | 'ASPTreeDepth' | 'ASPSiblings' | 'ASPIndex'>;
  if (a.asp === undefined) {
    aspInputs = { aspEnabled: '0', ASPRoot: '0', ASPTreeDepth: '0', ASPSiblings: new Array<string>(MAX_TREE_DEPTH).fill('0'), ASPIndex: '0' };
  } else {
    const at = buildAspTree(a.asp.labels);
    const li = at.indexOf(note.label);
    if (li < 0) return fail('INVALID_INPUT', 'note label is not in the association set');
    const ap = at.proof(li);
    aspInputs = { aspEnabled: '1', ASPRoot: ap.root.toString(), ASPTreeDepth: String(ap.depth), ASPSiblings: ap.siblings.map(String), ASPIndex: String(li) };
  }
  return {
    withdrawnValue: a.withdrawnValue.toString(),
    stateRoot: sp.root.toString(),
    stateTreeDepth: String(sp.depth),
    ...aspInputs,
    context: a.context.toString(),
    label: note.label.toString(),
    existingValue: note.value.toString(),
    existingNullifier: note.nullifier.toString(),
    existingSecret: note.secret.toString(),
    newNullifier: a.newNote.nullifier.toString(),
    newSecret: a.newNote.secret.toString(),
    stateSiblings: sp.siblings.map(String),
    stateIndex: String(leafIndex),
    ASPSiblings: aspInputs.ASPSiblings,
    ASPIndex: aspInputs.ASPIndex,
  };
}

/**
 * Public signals the prover must output for `inputs`, in circuit order (INTERFACE.md section 2).
 * The caller compares them with the proof's `publicSignals` before submitting (SP-CIR-5 on the client).
 */
export function expectedWithdrawSignals(i: WithdrawCircuitInputs): bigint[] {
  const rem = BigInt(i.existingValue) - BigInt(i.withdrawnValue);
  if (rem < 0n || rem > MAX_VALUE) fail('INVALID_INPUT', 'remainder out of range');
  const pre = precommitment({ nullifier: BigInt(i.newNullifier), secret: BigInt(i.newSecret) });
  return [
    commitment(rem, BigInt(i.label), pre),
    nullifierHash(BigInt(i.existingNullifier)),
    BigInt(i.withdrawnValue),
    BigInt(i.stateRoot),
    BigInt(i.stateTreeDepth),
    BigInt(i.aspEnabled),
    BigInt(i.ASPRoot),
    BigInt(i.ASPTreeDepth),
    BigInt(i.context),
  ];
}

/** Ragequit witness input and expected public signals `[commitment, nullifierHash, value, label]`. */
export function buildRagequitInputs(note: Note): { inputs: RagequitCircuitInputs; expectedSignals: bigint[] } {
  assertValue(note.value, 'value');
  return {
    inputs: { value: note.value.toString(), label: note.label.toString(), nullifier: note.nullifier.toString(), secret: note.secret.toString() },
    expectedSignals: [noteCommitment(note), nullifierHash(note.nullifier), note.value, note.label],
  };
}
