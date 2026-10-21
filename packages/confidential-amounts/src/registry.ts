import { CtError } from './errors.js';
import type { ConfidentialBackend, CtBackendId, CtBackendInfo } from './types.js';
import type { CleartextLedger } from './backends/ledger.js';
import type { ZamaSdkPort } from './backends/zama.js';
import { CT1_INFO } from './backends/zama.js';
import { CTM_INFO } from './backends/cleartext.js';

/** Dependencies a backend may need. */
export interface BackendDeps {
  /** CT-1: SDK port. Required for `ct1-zama`. */
  readonly zamaPort?: ZamaSdkPort;
  /** CT-M: simulated chain. Required for `ctm-cleartext`. */
  readonly ledger?: CleartextLedger;
}

/** Static info of every backend that is built (CT-2/CT-3 are spike-gated and absent). */
export const BACKEND_INFOS: Readonly<Record<'ct1-zama' | 'ctm-cleartext', CtBackendInfo>> = {
  'ct1-zama': CT1_INFO,
  'ctm-cleartext': CTM_INFO,
};

/**
 * Loads a backend. Backends are imported lazily so the core entry never pulls in `@zama-fhe/*`
 * (CT-SUP-1). Never auto-selects: the caller must name the backend (CT-PAY-1).
 * @throws {CtError} `BACKEND_UNAVAILABLE` for `ct2-fhenix` / `ct3-inco` (spike-gated, not built) or missing dependencies.
 */
export async function getBackend(id: CtBackendId, deps: BackendDeps = {}): Promise<ConfidentialBackend> {
  switch (id) {
    case 'ct1-zama': {
      if (!deps.zamaPort) throw new CtError('BACKEND_UNAVAILABLE', 'ct1-zama needs a ZamaSdkPort');
      const { ZamaBackend } = await import('./backends/zama.js');
      return new ZamaBackend(deps.zamaPort);
    }
    case 'ctm-cleartext': {
      if (!deps.ledger) throw new CtError('BACKEND_UNAVAILABLE', 'ctm-cleartext needs a CleartextLedger');
      const { CleartextBackend } = await import('./backends/cleartext.js');
      return new CleartextBackend(deps.ledger);
    }
    case 'ct2-fhenix':
    case 'ct3-inco':
      throw new CtError('BACKEND_UNAVAILABLE', 'backend is spike-gated and not built');
    default:
      throw new CtError('BACKEND_UNAVAILABLE', 'unknown backend');
  }
}
