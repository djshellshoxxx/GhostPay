import {
  type AddressBook,
  type Contact,
  addressKey,
  normalizeAddress,
  normalizeLabel,
  normalizeNetwork,
} from './contacts.js';

const HOMOGLYPHS: Readonly<Record<string, string>> = {
  // Cyrillic
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  і: 'l',
  ј: 'j',
  ѕ: 's',
  һ: 'h',
  к: 'k',
  м: 'm',
  т: 't',
  в: 'b',
  н: 'h',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  // Greek
  ο: 'o',
  α: 'a',
  ν: 'v',
  ρ: 'p',
  ι: 'l',
  τ: 't',
  υ: 'u',
  κ: 'k',
  β: 'b',
  ε: 'e',
  η: 'n',
  χ: 'x',
  // ASCII look-alikes
  '0': 'o',
  '1': 'l',
  i: 'l',
  '|': 'l',
  '5': 's',
  $: 's',
};

/**
 * Confusable "skeleton" of a label: NFKD without marks, lowercase, homoglyphs folded to Latin,
 * separators removed, `rn`->`m`, `vv`->`w`. Two labels with the same skeleton are visually risky.
 * @security Heuristic; not a full UTS #39 implementation. Treat as a warning, never as proof of safety.
 */
export function labelSkeleton(label: string): string {
  let s = label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  let out = '';
  for (const ch of s) out += HOMOGLYPHS[ch] ?? ch;
  s = out.replace(/[\s._\-'`]/g, '');
  return s.replace(/rn/g, 'm').replace(/vv/g, 'w');
}

/** True when the label mixes Latin with Cyrillic or Greek letters. */
export function hasMixedScripts(label: string): boolean {
  const latin = /\p{Script=Latin}/u.test(label);
  const other = /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(label);
  return latin && other;
}

/** Kinds of findings, ordered by severity. */
export type FindingKind =
  'exact-address' | 'lookalike-address' | 'confusable-label' | 'duplicate-label' | 'mixed-script-label';

/** One warning about a candidate (or pair of existing) contacts. */
export interface Finding {
  readonly kind: FindingKind;
  readonly severity: 'block' | 'high' | 'medium' | 'low';
  /** Existing contact involved (absent for self-findings like mixed scripts). */
  readonly contactId?: string;
  readonly detail: string;
}

const SEVERITY_ORDER = { block: 0, high: 1, medium: 2, low: 3 } as const;

/** Address body without a leading EVM `0x`, lowercased when the family is case-insensitive. */
function body(network: string, address: string): string {
  const k = addressKey(network, address).slice(network.length + 1);
  return k.startsWith('0x') ? k.slice(2) : k;
}

/** Prefix/suffix length compared by {@link isLookalikeAddress}. */
export const LOOKALIKE_EDGE = 4;
/** Max Hamming distance counted as a near-copy of an equal-length address. */
export const NEAR_DISTANCE = 3;

/**
 * Address-poisoning heuristic: same network, different address, and either the same first/last
 * {@link LOOKALIKE_EDGE} characters, or equal length with Hamming distance <= {@link NEAR_DISTANCE}.
 * Returns the reason or undefined.
 */
export function isLookalikeAddress(network: string, a: string, b: string): 'edges' | 'near' | undefined {
  if (addressKey(network, a) === addressKey(network, b)) return undefined;
  const x = body(network, a);
  const y = body(network, b);
  if (x.length < 2 * LOOKALIKE_EDGE + 4 || y.length < 2 * LOOKALIKE_EDGE + 4) return undefined;
  if (
    x.slice(0, LOOKALIKE_EDGE) === y.slice(0, LOOKALIKE_EDGE) &&
    x.slice(-LOOKALIKE_EDGE) === y.slice(-LOOKALIKE_EDGE)
  ) {
    return 'edges';
  }
  if (x.length === y.length) {
    let d = 0;
    for (let i = 0; i < x.length && d <= NEAR_DISTANCE; i++) if (x[i] !== y[i]) d++;
    if (d <= NEAR_DISTANCE) return 'near';
  }
  return undefined;
}

function sortFindings(f: Finding[]): Finding[] {
  return f.sort((p, q) => SEVERITY_ORDER[p.severity] - SEVERITY_ORDER[q.severity]);
}

/**
 * Analyse a not-yet-saved contact against the book (O(n)).
 * @security The UI must show `block`/`high` findings before the user confirms. Exact duplicates are
 * `block`; look-alike addresses (classic address-poisoning) are `high`.
 */
export function analyzeCandidate(
  book: AddressBook,
  cand: { label: string; address: string; network: string },
  ignoreId?: string,
): Finding[] {
  const label = normalizeLabel(cand.label);
  const address = normalizeAddress(cand.address);
  const network = normalizeNetwork(cand.network);
  const key = addressKey(network, address);
  const skel = labelSkeleton(label);
  const findings: Finding[] = [];
  if (hasMixedScripts(label)) {
    findings.push({
      kind: 'mixed-script-label',
      severity: 'medium',
      detail: 'label mixes Latin with Cyrillic/Greek letters',
    });
  }
  for (const c of book.contacts) {
    if (c.id === ignoreId) continue;
    if (c.network === network) {
      if (addressKey(c.network, c.address) === key) {
        findings.push({
          kind: 'exact-address',
          severity: 'block',
          contactId: c.id,
          detail: 'address already saved',
        });
      } else {
        const why = isLookalikeAddress(network, c.address, address);
        if (why) {
          findings.push({
            kind: 'lookalike-address',
            severity: 'high',
            contactId: c.id,
            detail:
              why === 'edges'
                ? 'same first and last characters as a saved address'
                : 'differs from a saved address by only a few characters',
          });
        }
      }
    }
    if (c.label.toLowerCase() === label.toLowerCase()) {
      findings.push({
        kind: 'duplicate-label',
        severity: 'low',
        contactId: c.id,
        detail: 'label already used',
      });
    } else if (labelSkeleton(c.label) === skel) {
      findings.push({
        kind: 'confusable-label',
        severity: 'medium',
        contactId: c.id,
        detail: 'label looks like an existing label',
      });
    }
  }
  return sortFindings(findings);
}

/** A group of existing contacts that collide. */
export interface DuplicateGroup {
  readonly kind: 'exact-address' | 'lookalike-address' | 'confusable-label' | 'duplicate-label';
  readonly contactIds: readonly string[];
}

/**
 * Scan a whole book for colliding contacts. Uses hash buckets (no quadratic pass), so it reports
 * exact addresses, same-edges look-alikes, and same-skeleton labels; the Hamming "near" check is only
 * done for single candidates in {@link analyzeCandidate}.
 */
export function findDuplicateGroups(book: AddressBook): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const bucket = (kind: DuplicateGroup['kind'], keyOf: (c: Contact) => string | undefined): void => {
    const m = new Map<string, string[]>();
    for (const c of book.contacts) {
      const k = keyOf(c);
      if (k === undefined) continue;
      const arr = m.get(k);
      if (arr) arr.push(c.id);
      else m.set(k, [c.id]);
    }
    for (const ids of m.values()) if (ids.length > 1) groups.push({ kind, contactIds: ids });
  };
  bucket('exact-address', (c) => addressKey(c.network, c.address));
  bucket('lookalike-address', (c) => {
    const b = body(c.network, c.address);
    return b.length < 2 * LOOKALIKE_EDGE + 4
      ? undefined
      : `${c.network}:${b.slice(0, LOOKALIKE_EDGE)}:${b.slice(-LOOKALIKE_EDGE)}`;
  });
  bucket('duplicate-label', (c) => c.label.toLowerCase());
  bucket('confusable-label', (c) => labelSkeleton(c.label));
  // Drop lookalike groups that are really exact duplicates only, and confusable groups identical to label groups.
  const exactSets = groups
    .filter((g) => g.kind === 'exact-address' || g.kind === 'duplicate-label')
    .map((g) => g.contactIds.join(','));
  return groups.filter((g) => {
    if (g.kind !== 'lookalike-address' && g.kind !== 'confusable-label') return true;
    return !exactSets.includes(g.contactIds.join(','));
  });
}
