import { fetchAnnouncements, type ChainConfig, type RpcClient, type ScanCursor, type ScannedAnnouncement } from '@ghostpay/chain-adapters';
import type { CompressedPoint, SecretScalar } from '@ghostpay/core-crypto';
import { SCHEME_ID, checkScheme2Announcement, type Address, type Hex } from '@ghostpay/policy-scheme';
import type { PolicyChainDeployment } from './chain';

/**
 * Scheme-2 scanner, separate from the scheme-1 scanner (`lib/scannerCore.ts`): it fetches only
 * announcements with scheme id `0x47500002` from the deployment's announcer and matches each one by
 * deriving the owner with the viewing key and re-predicting the account for every known policy hash.
 *
 * Fetching needs no secret; matching runs synchronously so the caller can hold the viewing key only
 * for that step (`withSessionSecrets`).
 */
export interface Scheme2Fetch {
  readonly announcements: readonly ScannedAnnouncement[];
  readonly cursor: ScanCursor;
  readonly truncated: boolean;
  readonly skipped: number;
  readonly reorg?: { readonly rolledBackTo: bigint };
}

export async function fetchScheme2Announcements(p: {
  readonly chain: ChainConfig;
  readonly client: RpcClient;
  readonly deployment: PolicyChainDeployment;
  readonly cursor: ScanCursor;
  readonly maxRequests?: number;
}): Promise<Scheme2Fetch> {
  const r = await fetchAnnouncements({
    chain: p.chain,
    client: p.client,
    announcer: p.deployment.announcer,
    cursor: p.cursor,
    schemeId: SCHEME_ID,
    ...(p.maxRequests === undefined ? {} : { maxRequests: p.maxRequests }),
  });
  return { announcements: r.announcements, cursor: r.cursor, truncated: r.truncated, skipped: r.skipped, ...(r.reorg === undefined ? {} : { reorg: r.reorg }) };
}

/** A scheme-2 payment to these keys. `metadata` holds the payer's (unauthenticated) amount claim. */
export interface Scheme2Match {
  readonly id: string;
  readonly accountAddress: Address;
  readonly ownerAddress: Address;
  readonly policyHash: Hex;
  readonly ephemeralPublicKey: string;
  readonly metadata: string;
  readonly blockNumber: bigint;
  readonly caller: Address;
  readonly transactionHash?: Hex;
}

export function matchScheme2(
  announcements: readonly ScannedAnnouncement[],
  viewingSecret: SecretScalar,
  spendingPublicKey: CompressedPoint,
  policyHashes: readonly Hex[],
  deployment: PolicyChainDeployment,
): Scheme2Match[] {
  if (policyHashes.length === 0) return [];
  const out: Scheme2Match[] = [];
  const seen = new Set<string>();
  for (const a of announcements) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const c = checkScheme2Announcement(
      { schemeId: a.schemeId, stealthAddress: a.stealthAddress, ephemeralPublicKey: a.ephemeralPublicKey, metadata: a.metadata },
      viewingSecret,
      spendingPublicKey,
      policyHashes,
      deployment,
    );
    if (!c.matches) continue;
    out.push(Object.freeze({
      id: a.id,
      accountAddress: c.accountAddress,
      ownerAddress: c.ownerAddress,
      policyHash: c.policyHash,
      ephemeralPublicKey: a.ephemeralPublicKey,
      metadata: a.metadata,
      blockNumber: a.blockNumber,
      caller: a.caller,
      ...(a.transactionHash === undefined ? {} : { transactionHash: a.transactionHash }),
    }));
  }
  return out;
}

/** Merges new matches into a list (dedupe by account), dropping ones at or after a reorg point. */
export function mergeMatches(prev: readonly Scheme2Match[], next: readonly Scheme2Match[], reorg?: { readonly rolledBackTo: bigint }): Scheme2Match[] {
  const kept = reorg === undefined ? prev : prev.filter((m) => m.blockNumber < reorg.rolledBackTo);
  const byAccount = new Map(kept.map((m) => [m.accountAddress, m]));
  for (const m of next) if (!byAccount.has(m.accountAddress)) byAccount.set(m.accountAddress, m);
  return [...byAccount.values()];
}
