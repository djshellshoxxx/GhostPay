import type { ScanMatch } from './scanClient';

/** Payment identity of a match: its one-time address and ephemeral key (a replay copies both). */
export function paymentKeyOf(m: Pick<ScanMatch, 'stealthAddress' | 'announcement'>): string {
  return `${m.stealthAddress.toLowerCase()}|${m.announcement.ephemeralPublicKey.toLowerCase()}`;
}

/**
 * Where a match reported by `runScan`'s `onMatch` goes in the displayed list; the same rule as runScan's own result.
 *
 * @remarks F1: the GhostPay router is stateless, so anyone can announce through it with a copied one-time address and
 * ephemeral key plus a dust transfer, and that front-run lands before the genuine payment. Every router record is
 * therefore its own entry (identity: the announcement id); each was verified on its own. The first router record of a
 * payment replaces an earlier non-router (public replay) entry in place; later router records are appended; a
 * non-router record is skipped once the payment has any entry. The same announcement again updates its entry.
 *
 * @returns The index to overwrite, `'append'`, or `'skip'`.
 */
export function placeScanMatch(list: readonly ScanMatch[], m: ScanMatch): number | 'append' | 'skip' {
  const key = paymentKeyOf(m);
  const same = list.findIndex((x) => x.announcement.id === m.announcement.id && paymentKeyOf(x) === key);
  if (same >= 0) return same;
  const first = list.findIndex((x) => paymentKeyOf(x) === key);
  if (first < 0) return 'append';
  if (!m.viaRouter) return 'skip';
  return list.some((x) => x.viaRouter && paymentKeyOf(x) === key) ? 'append' : first;
}

/**
 * One-time addresses that two or more router records name (lower-case). Expected only for a front-run or replay
 * (F1): the seller is told that each record was checked on its own and only received amounts count.
 */
export function sharedRouterAddresses(list: readonly ScanMatch[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const m of list) {
    if (!m.viaRouter) continue;
    const address = m.stealthAddress.toLowerCase();
    if (seen.has(address)) shared.add(address);
    seen.add(address);
  }
  return shared;
}
