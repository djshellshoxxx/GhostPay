import { fail } from './errors.js';
import { findEntry, type PoolManifest } from './manifest.js';
import type { ExitRouteId, ExternalPoolAdapter } from './types.js';

/**
 * Instance-scoped adapter registry (no module-level global, so tests and apps never share state).
 *
 * Adapters are only retrievable for a chain when the pinned manifest has an entry for that
 * route and chain (spec 6.2). `mock-pool` is exempt: it has no manifest entry.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<ExitRouteId, ExternalPoolAdapter>();

  /** @param manifest Pinned manifest consulted by {@link get}. */
  public constructor(private readonly manifest: PoolManifest) {}

  /**
   * @param adapter Adapter to add.
   * @throws ExternalPoolError INVALID_INPUT on duplicate id.
   */
  public register(adapter: ExternalPoolAdapter): void {
    if (this.adapters.has(adapter.id)) fail('INVALID_INPUT', `adapter ${adapter.id} already registered`);
    this.adapters.set(adapter.id, adapter);
  }

  /** @returns Registered route ids. */
  public ids(): readonly ExitRouteId[] {
    return [...this.adapters.keys()];
  }

  /**
   * @param id Route id.
   * @param chainId Chain the caller wants to use.
   * @returns The adapter.
   * @throws ExternalPoolError ROUTE_UNKNOWN when not registered; ROUTE_NOT_AVAILABLE when the manifest
   *   has no entry for the chain.
   */
  public get(id: ExitRouteId, chainId: number): ExternalPoolAdapter {
    const a = this.adapters.get(id);
    if (a === undefined) return fail('ROUTE_UNKNOWN', `route ${id} is not registered`);
    if (id !== 'mock-pool' && findEntry(this.manifest, id, chainId) === undefined) {
      return fail('ROUTE_NOT_AVAILABLE', `route ${id} has no manifest entry on chain ${String(chainId)}`);
    }
    return a;
  }
}
