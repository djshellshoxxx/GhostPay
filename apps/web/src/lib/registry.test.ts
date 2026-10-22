import { ERC6538_REGISTRY_ADDRESS, ERC6538_SCHEME_SECP256K1, erc6538RegistryAbi } from '@ghostpay/chain-adapters';
import { decodeFunctionData, encodeFunctionData } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { buildClearRegistryCall } from './registry';

describe('buildClearRegistryCall', () => {
  it('builds exactly registerKeys(1, empty bytes) to the canonical registry with zero value', () => {
    const call = buildClearRegistryCall();
    const decoded = decodeFunctionData({ abi: erc6538RegistryAbi, data: call.data });
    expect(decoded.functionName).toBe('registerKeys');
    expect(decoded.args).toEqual([ERC6538_SCHEME_SECP256K1, '0x']);
    expect(call.to).toBe(ERC6538_REGISTRY_ADDRESS);
    expect(call.value).toBe(0n);
    expect(call.preview).toMatchObject({ function: 'registerKeys(uint256,bytes) — clear current entry', schemeId: 1n });
    expect(buildClearRegistryCall().data).toBe(encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'registerKeys', args: [1n, '0x'] }));
  });
});
