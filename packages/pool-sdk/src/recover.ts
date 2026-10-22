import { fail } from './errors.js';
import { commitment, deriveNoteSecrets, noteCommitment, nullifierHash, precommitment, type Note, type WithSeed } from './notes.js';
import type { SyncedPool, WithdrawEvt } from './sync.js';

/** Result of {@link recoverNotes}. */
export interface RecoveredNotes {
  /** Every note found (spent or not), zero-value change notes excluded. */
  readonly notes: Note[];
  /** First derivation index that is unused (use for the next deposit or change note). */
  readonly nextIndex: number;
}

/**
 * Rebuilds all of the user's notes from the seed and the chain after wiping local state (SP-SDK-1).
 *
 * Finds deposits by their `precommitment`, then follows each spent note's `Withdrawn.newCommitment` to
 * its change note (value = old value - withdrawn value) among the derived indices.
 *
 * @param withSeed Scoped seed accessor.
 * @param synced Synced pool mirror.
 * @param maxIndex Number of derivation indices to scan (default 200).
 * @security Returned notes hold spending secrets.
 */
export function recoverNotes(withSeed: WithSeed, synced: SyncedPool, maxIndex = 200): RecoveredNotes {
  if (!Number.isInteger(maxIndex) || maxIndex < 1) fail('INVALID_INPUT', 'maxIndex must be >= 1');
  const derived = [];
  const byPre = new Map<bigint, number>();
  for (let i = 0; i < maxIndex; i++) {
    const s = deriveNoteSecrets(withSeed, synced.chainId, synced.pool, i);
    derived.push(s);
    byPre.set(precommitment(s), i);
  }
  const spentBy = new Map<bigint, WithdrawEvt>();
  for (const w of synced.withdrawals) spentBy.set(w.spentNullifier, w);
  const ragequit = new Set(synced.ragequits.map((r) => r.commitment));

  const notes: Note[] = [];
  const used = new Set<number>();
  const queue: Note[] = [];
  for (const d of synced.deposits) {
    const idx = byPre.get(d.precommitment);
    const s = idx === undefined ? undefined : derived[idx];
    if (idx === undefined || s === undefined) continue;
    queue.push({ chainId: synced.chainId, pool: synced.pool, index: idx, value: d.value, label: d.label, nullifier: s.nullifier, secret: s.secret });
  }
  for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
    const c = noteCommitment(n);
    const leafIndex = synced.leafIndexOf(c);
    const w = spentBy.get(nullifierHash(n.nullifier));
    const spent = w !== undefined || ragequit.has(c);
    used.add(n.index);
    notes.push({ ...n, ...(leafIndex >= 0 ? { leafIndex } : {}), spent });
    if (w === undefined) continue;
    const rem = n.value - w.value;
    if (rem < 0n) continue;
    for (let j = 0; j < derived.length; j++) {
      const s = derived[j];
      /* c8 ignore next */
      if (s === undefined || used.has(j)) continue;
      if (commitment(rem, n.label, precommitment(s)) === w.newCommitment) {
        // A zero-value change note still consumed its index: never reuse it.
        if (rem === 0n) used.add(j);
        else queue.push({ chainId: synced.chainId, pool: synced.pool, index: j, value: rem, label: n.label, nullifier: s.nullifier, secret: s.secret });
        break;
      }
    }
  }
  const maxUsed = used.size === 0 ? -1 : Math.max(...used);
  return { notes, nextIndex: maxUsed + 1 };
}
