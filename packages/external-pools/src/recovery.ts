import type { SecretBox } from '@ghostpay/secret-box';
import { assertChainAllowed } from './guard.js';
import type { ExitRouteId, ExternalPoolAdapter, PoolNote, ScanContext } from './types.js';
import type { Vault } from './vault.js';

/** Result of {@link recoverNotes}. */
export interface RecoveryReport {
  readonly recovered: readonly PoolNote[];
  readonly errors: readonly { readonly routeId: ExitRouteId; readonly message: string }[];
}

/**
 * EP-VAULT-2 / EP-VAULT-4: rebuilds notes from chain data only (no GhostPay server) and stores them in the vault.
 *
 * Each adapter is scanned independently. When a scan throws, the scope `<route>:<chainId>` is marked
 * `incomplete` (blocking deposits) and the error is reported; a successful scan marks it `complete`.
 *
 * @param adapters Adapters to scan.
 * @param seed Root seed (same one used at entry).
 * @param scan Scan context (chain reader, S1 addresses, block range).
 * @param vault Destination vault.
 * @returns Notes found and per-route errors.
 * @security Existing notes keep their stored (possibly later) state: recovery never moves a note backwards.
 */
export async function recoverNotes(
  adapters: readonly ExternalPoolAdapter[],
  seed: SecretBox,
  scan: ScanContext,
  vault: Vault,
): Promise<RecoveryReport> {
  assertChainAllowed(scan.chainId);
  const recovered: PoolNote[] = [];
  const errors: { routeId: ExitRouteId; message: string }[] = [];
  for (const a of adapters) {
    const scope = `${a.id}:${String(scan.chainId)}`;
    try {
      const found: PoolNote[] = [];
      for await (const n of a.recover(seed, scan)) found.push(n);
      for (const n of found) {
        const existing = await vault.getNote(n.noteId);
        if (existing === undefined) await vault.putNote(n);
        recovered.push(existing ?? n);
      }
      await vault.setScope(scope, 'complete');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'scan failed';
      errors.push({ routeId: a.id, message });
      await vault.setScope(scope, 'incomplete', message);
    }
  }
  return { recovered, errors };
}
