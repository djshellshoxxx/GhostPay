import type { AddressBook, Contact } from './contacts.js';

/** Search/filter options. */
export interface SearchOptions {
  /** Whitespace-separated terms; every term must match label, note, address or a tag (case-insensitive). */
  query?: string;
  /** Contact must carry ALL of these tags. */
  tags?: readonly string[];
  network?: string;
  sort?: 'label' | 'recent' | 'created';
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Filter and sort contacts (pure, no regex built from user input, so no ReDoS).
 * Sort is by code point (locale independent) with id as tiebreaker for determinism.
 */
export function searchContacts(book: AddressBook, opts: SearchOptions = {}): Contact[] {
  const terms = (opts.query ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 0);
  const wantTags = (opts.tags ?? []).map((t) => t.trim().toLowerCase());
  const out = book.contacts.filter((c) => {
    if (opts.network !== undefined && c.network !== opts.network.trim().toLowerCase()) return false;
    if (!wantTags.every((t) => c.tags.includes(t))) return false;
    if (terms.length === 0) return true;
    const hay = [c.label.toLowerCase(), c.note.toLowerCase(), c.address.toLowerCase(), ...c.tags];
    return terms.every((t) => hay.some((h) => h.includes(t)));
  });
  const sort = opts.sort ?? 'label';
  return out.sort((a, b) => {
    const primary =
      sort === 'recent'
        ? b.updatedAt - a.updatedAt
        : sort === 'created'
          ? b.createdAt - a.createdAt
          : cmp(a.label.toLowerCase(), b.label.toLowerCase());
    return primary !== 0 ? primary : cmp(a.id, b.id);
  });
}

/** All distinct tags with usage counts, sorted by count desc then name. */
export function listTags(book: AddressBook): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of book.contacts) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || cmp(a.tag, b.tag));
}
