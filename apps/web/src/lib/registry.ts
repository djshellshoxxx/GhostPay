import {
  ERC6538_REGISTRY_ADDRESS,
  ERC6538_SCHEME_SECP256K1,
  erc6538RegistryAbi,
  type RegistryCall,
} from '@ghostpay/chain-adapters';
import { encodeFunctionData } from 'viem/utils';

/** Builds the explicit overwrite-to-empty transaction; history remains public and permanent. */
export function buildClearRegistryCall(): RegistryCall {
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'registerKeys', args: [ERC6538_SCHEME_SECP256K1, '0x'] });
  return {
    to: ERC6538_REGISTRY_ADDRESS,
    data,
    value: 0n,
    preview: {
      contract: ERC6538_REGISTRY_ADDRESS,
      function: 'registerKeys(uint256,bytes) — clear current entry',
      schemeId: ERC6538_SCHEME_SECP256K1,
    },
  };
}
