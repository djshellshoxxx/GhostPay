import { ScanSourceError } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import type { FetchRequest, FetchResult, LightClient, PublicLogSource } from './types.js';

/** Options for {@link createLightSource}. */
export interface LightSourceOptions {
  readonly chainId: number;
  readonly lc: LightClient;
  readonly inner: PublicLogSource;
}

/**
 * Light-client scan source (`scanMode = light-client`): runs the `inner` source and checks, against the light
 * client's verified header chain, the block hash of the returned head and of every announcement's block.
 * Any mismatch, or a block the light client cannot vouch for, is a hard error.
 *
 * @security "Verifies answers, does not hide queries": the inner source still sees everything it would see
 * without the light client (NP-L-1). Integrity is `proof` only if the light client itself proves log inclusion
 * (`lc.verifiesLogs`); otherwise it is `unverified`: block identity is checked, log completeness is not
 * (a server can still omit logs inside a real block). Helios WASM/browser support is UNVERIFIED.
 */
export function createLightSource(o: LightSourceOptions): PublicLogSource {
  assertTestnetChainId(o.chainId);
  return {
    kind: 'light',
    integrity: o.lc.verifiesLogs ? 'proof' : 'unverified',
    async fetch(req: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
      assertTestnetChainId(req.chainId);
      if (req.chainId !== o.chainId) throw new ScanSourceError('INVALID_ARGUMENT', 'chain id mismatch');
      const res = await o.inner.fetch(req, signal);
      const blocks = new Map<bigint, string>([[res.head.number, res.head.hash]]);
      for (const a of res.announcements) {
        const prev = blocks.get(a.blockNumber);
        if (prev !== undefined && prev !== a.blockHash) throw new ScanSourceError('HEAD_MISMATCH', 'inconsistent block hashes in result');
        blocks.set(a.blockNumber, a.blockHash);
      }
      for (const [n, h] of blocks) {
        const v = await o.lc.blockHash(n);
        if (v === undefined || v.toLowerCase() !== h.toLowerCase()) {
          throw new ScanSourceError('HEAD_MISMATCH', 'light client could not confirm a block hash');
        }
      }
      return res;
    },
  };
}
