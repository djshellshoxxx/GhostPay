import { type AddressBook, type Contact, MAX_CONTACTS, addressKey } from './contacts.js';
import { type Finding, analyzeCandidate } from './confusables.js';
import { fail } from './errors.js';

/** How to resolve a same-id contact whose fields differ. */
export type ConflictPolicy = 'newer' | 'local' | 'incoming';

/** Import options. */
export interface ImportOptions {
  /** `merge` combines; `replace` discards the current book for the incoming one. */
  mode: 'merge' | 'replace';
  /** Default `newer` (greater updatedAt wins; ties keep local). Ignored for `replace`. */
  onConflict?: ConflictPolicy;
}

/** A conflict that was detected during a merge. */
export interface MergeConflict {
  readonly kind: 'field-differs' | 'address-changed' | 'duplicate-address';
  readonly localId: string;
  readonly incomingId: string;
  readonly resolution: 'kept-local' | 'took-incoming' | 'merged-tags';
}

/** Outcome of an import. */
export interface MergeReport {
  readonly mode: 'merge' | 'replace';
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly unchanged: readonly string[];
  readonly removed: readonly string[];
  readonly conflicts: readonly MergeConflict[];
  /** Look-alike / confusable warnings for contacts that were added (review before use). */
  readonly warnings: readonly (Finding & { newContactId: string })[];
}

function same(a: Contact, b: Contact): boolean {
  return (
    a.label === b.label &&
    a.address === b.address &&
    a.network === b.network &&
    a.note === b.note &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i])
  );
}

function unionTags(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/**
 * Merge or replace an address book with an already-validated incoming book (pure).
 *
 * Rules (merge):
 * 1. Same id, same canonical address: identical -> unchanged. Different fields -> resolved by
 *    `onConflict` (`newer` by updatedAt, ties keep local); tags are always unioned.
 * 2. Same id, DIFFERENT address ("address-changed"): never auto-applied by `newer`; only the explicit
 *    `incoming` policy applies it. This blocks silent payee-address swaps via a crafted backup.
 * 3. Different id, same network+address: treated as the same payee; local kept, tags unioned,
 *    incoming id discarded, reported as `duplicate-address`.
 * 4. Otherwise added; look-alike/confusable findings versus the merged book are reported as warnings.
 * Fails with LIMIT (nothing applied) if the result would exceed {@link MAX_CONTACTS}.
 * @security Backups are untrusted input; the report must be shown to the user, and warnings reviewed.
 */
export function mergeBooks(
  local: AddressBook,
  incoming: AddressBook,
  opts: ImportOptions,
): { book: AddressBook; report: MergeReport } {
  if (opts.mode === 'replace') {
    const incomingIds = new Set(incoming.contacts.map((c) => c.id));
    const localIds = new Set(local.contacts.map((c) => c.id));
    return {
      book: incoming,
      report: {
        mode: 'replace',
        added: incoming.contacts.filter((c) => !localIds.has(c.id)).map((c) => c.id),
        updated: incoming.contacts.filter((c) => localIds.has(c.id)).map((c) => c.id),
        unchanged: [],
        removed: local.contacts.filter((c) => !incomingIds.has(c.id)).map((c) => c.id),
        conflicts: [],
        warnings: [],
      },
    };
  }
  const policy = opts.onConflict ?? 'newer';
  let work: Contact[] = [...local.contacts];
  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const conflicts: MergeConflict[] = [];
  const warnings: (Finding & { newContactId: string })[] = [];

  for (const inc of incoming.contacts) {
    const byId = work.findIndex((c) => c.id === inc.id);
    const cur = byId >= 0 ? work[byId] : undefined;
    if (cur) {
      if (same(cur, inc)) {
        unchanged.push(cur.id);
        continue;
      }
      const addrChanged = addressKey(cur.network, cur.address) !== addressKey(inc.network, inc.address);
      const takeIncoming =
        policy === 'incoming' || (policy === 'newer' && !addrChanged && inc.updatedAt > cur.updatedAt);
      // Address change under the same id must not collide with another contact.
      const collides =
        takeIncoming &&
        addrChanged &&
        work.some(
          (c) => c.id !== cur.id && addressKey(c.network, c.address) === addressKey(inc.network, inc.address),
        );
      if (takeIncoming && !collides) {
        const tags = unionTags(inc.tags, cur.tags);
        work[byId] = { ...inc, tags: tags.slice(0, 16), createdAt: Math.min(cur.createdAt, inc.createdAt) };
        updated.push(cur.id);
        conflicts.push({
          kind: addrChanged ? 'address-changed' : 'field-differs',
          localId: cur.id,
          incomingId: inc.id,
          resolution: 'took-incoming',
        });
      } else {
        const tags = unionTags(cur.tags, inc.tags).slice(0, 16);
        if (tags.length !== cur.tags.length) {
          work[byId] = { ...cur, tags };
          updated.push(cur.id);
        }
        conflicts.push({
          kind: addrChanged ? 'address-changed' : 'field-differs',
          localId: cur.id,
          incomingId: inc.id,
          resolution: 'kept-local',
        });
      }
      continue;
    }
    const key = addressKey(inc.network, inc.address);
    const dupIdx = work.findIndex((c) => addressKey(c.network, c.address) === key);
    const dup = dupIdx >= 0 ? work[dupIdx] : undefined;
    if (dup) {
      const tags = unionTags(dup.tags, inc.tags).slice(0, 16);
      if (tags.length !== dup.tags.length) {
        work[dupIdx] = { ...dup, tags };
        updated.push(dup.id);
      }
      conflicts.push({
        kind: 'duplicate-address',
        localId: dup.id,
        incomingId: inc.id,
        resolution: 'merged-tags',
      });
      continue;
    }
    if (work.length >= MAX_CONTACTS) return fail('LIMIT', 'import would exceed address book capacity');
    for (const f of analyzeCandidate({ contacts: work }, inc)) warnings.push({ ...f, newContactId: inc.id });
    work = [...work, inc];
    added.push(inc.id);
  }
  return {
    book: { contacts: work },
    report: {
      mode: 'merge',
      added,
      updated: [...new Set(updated)],
      unchanged,
      removed: [],
      conflicts,
      warnings,
    },
  };
}
