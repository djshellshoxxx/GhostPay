import { ScanSourceError } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import { createIndexerSource, type IndexerSourceOptions } from './indexer.js';
import { createLightSource, type LightSourceOptions } from './light.js';
import { createPir2Source, type Pir2SourceOptions } from './pir2.js';
import { createRangeSource, type RangeSourceOptions } from './range.js';
import type { PublicLogSource } from './types.js';

/** Discriminated configuration for {@link createScanSource}. The mode is always explicit; the UI default is `range`. */
export type ScanSourceConfig =
  | ({ readonly mode: 'range' } & RangeSourceOptions)
  | ({ readonly mode: 'indexer-tor' } & IndexerSourceOptions)
  | ({ readonly mode: 'pir2' } & Pir2SourceOptions)
  | ({ readonly mode: 'light-client' } & LightSourceOptions);

/**
 * Builds the source for the selected scan mode. Never auto-selects or falls back to another mode (NP-T-2/5):
 * an unknown mode or a failing source is an error, not a switch.
 *
 * @throws ScanSourceError `TESTNET_ONLY`, `INVALID_ARGUMENT` (unknown mode).
 */
export function createScanSource(cfg: ScanSourceConfig): PublicLogSource {
  assertTestnetChainId(cfg.chainId);
  switch (cfg.mode) {
    case 'range':
      return createRangeSource(cfg);
    case 'indexer-tor':
      return createIndexerSource(cfg);
    case 'pir2':
      return createPir2Source(cfg);
    case 'light-client':
      return createLightSource(cfg);
    default:
      throw new ScanSourceError('INVALID_ARGUMENT', 'unknown scan mode');
  }
}
