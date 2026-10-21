import { fail } from './errors.js';
import { assertChainAllowed } from './guard.js';
import type { AdapterRegistry } from './registry.js';
import type { EntryQuote, ExitRouteId, ExitRouteInfo, PreparedTx, RouteRequest } from './types.js';
import type { Vault } from './vault.js';

/** One ordered step of a plan. */
export interface PlanStep {
  readonly kind: 'sweep-direct' | 'approve' | 'deposit' | 'shield' | 'wait' | 'exit' | 'emergency-exit';
  readonly description: string;
  readonly tx?: PreparedTx;
}

/** Result of {@link planRoute}. Nothing in it has been signed or sent. */
export interface RoutePlan {
  readonly routeId: ExitRouteId | 'none';
  readonly steps: readonly PlanStep[];
  readonly info: ExitRouteInfo | null;
  /** Limits (N1-N6) and warnings the UI must show before entry. */
  readonly warnings: readonly string[];
  /** False until the user acknowledged the limits (EP-UX-1). */
  readonly entryEnabled: boolean;
  readonly quote?: EntryQuote;
}

export interface PlanOptions {
  /** User ticked the acknowledgement for this route's limits. Default false. */
  readonly acknowledged?: boolean;
  /** When given, deposits into a scope whose scan is incomplete are refused (EP-VAULT-4). */
  readonly vault?: Vault;
}

/**
 * Builds an ordered, unsigned plan for sweeping through a pool route.
 *
 * `routeId` has no default: `undefined` throws (EP-GEN-7). `'none'` returns today's direct sweep (EP-0 control,
 * EP-INT-1) and touches no adapter. For pool routes the chain is checked first (EP-GEN-1), the route must be
 * registered with a manifest entry, its `health()` must say `active` (EP-GEN-5), every prepared transaction must
 * come from S1 (EP-PP-1 generalised) and the chain id must match.
 *
 * @param registry Adapter registry.
 * @param req Route request.
 * @param routeId Explicit route.
 * @param opts Options.
 * @returns A plan whose `entryEnabled` is true only when `acknowledged` is true.
 * @throws ExternalPoolError ROUTE_REQUIRED, CHAIN_NOT_ALLOWED, ROUTE_NOT_AVAILABLE, POOL_NOT_ACTIVE, NOT_SUPPORTED, DEPOSITOR_MISMATCH, SCOPE_INCOMPLETE.
 * @security Never selects or switches a route on its own (spec G2, EP-GEN-7).
 */
export async function planRoute(
  registry: AdapterRegistry,
  req: RouteRequest,
  routeId: ExitRouteId | 'none' | undefined,
  opts: PlanOptions = {},
): Promise<RoutePlan> {
  if (routeId === undefined) return fail('ROUTE_REQUIRED', 'an explicit route is required');
  if (routeId === 'none') {
    return {
      routeId: 'none',
      steps: [{ kind: 'sweep-direct', description: 'Direct sweep to your destination (no pool).' }],
      info: null,
      warnings: [],
      entryEnabled: true,
    };
  }
  assertChainAllowed(req.chainId);
  const adapter = registry.get(routeId, req.chainId);
  const info = adapter.info();
  if (!info.available) return fail('ROUTE_NOT_AVAILABLE', info.unavailableReason ?? 'route is not available');
  const h = await adapter.health(req.chainId);
  if (h.lifecycle !== 'active') {
    return fail('POOL_NOT_ACTIVE', `pool is ${h.lifecycle}${h.reason === undefined ? '' : `: ${h.reason}`}`);
  }
  if (opts.vault !== undefined) opts.vault.assertDepositAllowed(`${routeId}:${String(req.chainId)}`);
  const sup = await adapter.supports({ chainId: req.chainId, asset: req.asset });
  if (!sup.supported) return fail('NOT_SUPPORTED', sup.reason ?? 'asset not supported');
  if (sup.minAmount !== undefined && req.amount < sup.minAmount) return fail('NOT_SUPPORTED', 'amount is below the pool minimum');
  const quote = await adapter.quoteEntry(req);
  const txs = await adapter.prepareEntry(req, quote);
  for (const tx of txs) {
    if (tx.from.toLowerCase() !== req.stealth.address.toLowerCase()) return fail('DEPOSITOR_MISMATCH', 'prepared transaction is not sent from the one-time address');
    if (tx.chainId !== req.chainId) return fail('CHAIN_NOT_ALLOWED', 'prepared transaction targets a different chain');
  }
  const steps: PlanStep[] = txs.map((tx) => ({
    kind: tx.kind === 'approve' ? 'approve' : tx.kind === 'shield' ? 'shield' : 'deposit',
    description: tx.description,
    tx,
  }));
  steps.push({ kind: 'wait', description: 'Wait. More time and more deposits in the pool make matching harder (advice only).' });
  steps.push({ kind: 'exit', description: 'Exit to a fresh destination address.' });
  steps.push({ kind: 'emergency-exit', description: 'Emergency exit that needs no relayer, broadcaster or list provider.' });
  return {
    routeId,
    steps,
    info,
    warnings: [...info.whatItDoesNotHide, ...(info.auditStatus === 'unknown' || info.auditStatus === 'none-found' ? ['No audit report was found for this pool.'] : [])],
    entryEnabled: opts.acknowledged === true,
    quote,
  };
}
