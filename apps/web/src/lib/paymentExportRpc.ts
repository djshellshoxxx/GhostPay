import type { ChainConfig } from '@ghostpay/chain-adapters';
import { networkAuthorizationError } from './networkAuthorization';
import type { ExportRpc } from './paymentKeyExport';
import type { Services } from './services';

/**
 * The scan establishes an endpoint and public payment evidence, not perpetual network permission. This stable wrapper
 * opens a fresh, address-bound code-check grant only when the secret-export path calls it after re-authentication.
 * It never reuses a scan's cancelled/expired client, selects another endpoint, or authorizes another RPC method.
 */
export function createPaymentExportRpc(
  chain: ChainConfig,
  endpoint: string,
  services: Pick<Services, 'network' | 'createRpc'>,
  assertCurrent: () => void,
): ExportRpc {
  const chainId = chain.chainId;
  return {
    chainId,
    async request(method, params, signal) {
      const address = params[0];
      if (method !== 'eth_getCode' || params.length !== 2 || typeof address !== 'string' ||
          !/^0x[0-9a-fA-F]{40}$/.test(address) || params[1] !== 'latest') throw networkAuthorizationError();
      // Copy the public request before awaiting anything so caller mutation cannot widen a grant.
      const checkedAddress = address.toLowerCase();
      const check = (): void => {
        if (signal?.aborted === true) throw networkAuthorizationError();
        assertCurrent();
      };
      check();
      const authorization = services.network?.authorize({
        action: 'payment-key-export', category: 'rpc', endpoint, network: { kind: 'evm', chainId },
        scope: checkedAddress, ...(signal === undefined ? {} : { signal }),
      });
      try {
        check();
        authorization?.assertCurrent();
        const client = await services.createRpc(chain, endpoint, authorization);
        check();
        authorization?.assertCurrent();
        if (client.chainId !== chainId) throw networkAuthorizationError();
        const result = await client.request('eth_getCode', [checkedAddress, 'latest']);
        check();
        authorization?.assertCurrent();
        return result;
      } finally {
        authorization?.dispose();
      }
    },
  };
}
