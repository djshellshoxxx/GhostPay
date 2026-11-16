import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import fc from 'fast-check';
import { decodeFunctionData, getAddress, keccak256, toBytes } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { erc6538RegistryAbi } from './abi/erc6538Registry.js';
import { ERC6538_REGISTRY, metaAddressToRegistryBytes } from './registry.js';
import {
  MAX_REGISTRY_SIGNATURE_BYTES,
  buildIncrementNonceTx,
  buildRegisterKeysOnBehalfTx,
  buildRegistryNonceCall,
} from './registryDelegation.js';
import type { Hex } from './types.js';

const registrant = getAddress('0x52908400098527886e0f7030069857d2e4169ee7');
const metaAddress = encodeMetaAddress(generateKeySet());

describe('ERC-6538 delegation builders', () => {
  it('invalidates the sending registrant nonce with the canonical no-argument call and zero value', () => {
    const tx = buildIncrementNonceTx();
    expect(tx).toEqual({ to: ERC6538_REGISTRY, value: 0n, data: keccak256(toBytes('incrementNonce()')).slice(0, 10) });
    expect(decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data }).functionName).toBe('incrementNonce');
  });

  it('reads the requested registrant nonce without sending a transaction', () => {
    const call = buildRegistryNonceCall(registrant.toLowerCase());
    expect(call.to).toBe(ERC6538_REGISTRY);
    expect(call.value).toBe(0n);
    expect(decodeFunctionData({ abi: erc6538RegistryAbi, data: call.data })).toEqual({ functionName: 'nonceOf', args: [registrant] });
  });

  it.each(['0x', '0xabcd', `0x${'12'.repeat(65)}`, `0x${'AB'.repeat(MAX_REGISTRY_SIGNATURE_BYTES)}`] as Hex[])(
    'preserves bounded opaque ERC-1271/EOA signature bytes', (signature) => {
      const tx = buildRegisterKeysOnBehalfTx(registrant.toLowerCase(), metaAddress, signature);
      expect(tx.to).toBe(ERC6538_REGISTRY);
      expect(tx.value).toBe(0n);
      expect(tx.data.slice(0, 10)).toBe(keccak256(toBytes('registerKeysOnBehalf(address,uint256,bytes,bytes)')).slice(0, 10));
      expect(decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data })).toEqual({
        functionName: 'registerKeysOnBehalf', args: [registrant, 1n, signature.toLowerCase(), metaAddressToRegistryBytes(metaAddress)],
      });
    },
  );

  it.each(['not-an-address', '0x1234', '0x52908400098527886e0F7030069857D2E4169EE7'])(
    'rejects malformed or incorrectly checksummed registrants (%s)', (invalid) => {
      expect(() => buildRegistryNonceCall(invalid)).toThrow(/registrant/);
      expect(() => buildRegisterKeysOnBehalfTx(invalid, metaAddress, '0x12')).toThrow(/registrant/);
    },
  );

  it.each(['0x1', '0xzz', '0X12', '', `0x${'00'.repeat(8193)}`])('rejects malformed or oversized signature bytes', (signature) => {
    expect(() => buildRegisterKeysOnBehalfTx(registrant, metaAddress, signature as Hex)).toThrow(/signature/);
  });

  it.each([null, undefined, 65, {}])('rejects non-string signature input at the JavaScript boundary', (signature) => {
    const invalid: unknown = signature;
    expect(() => buildRegisterKeysOnBehalfTx(registrant, metaAddress, invalid as Hex)).toThrow(/signature/);
  });

  it('rejects a malformed or non-scheme-1 meta-address instead of encoding arbitrary registry data', () => {
    for (const invalid of ['st:eth:0x12', 'st:eth:0x' + '00'.repeat(66), 'st:gp2:0x' + '11'.repeat(66)]) {
      expect(() => buildRegisterKeysOnBehalfTx(registrant, invalid, '0x12')).toThrow(/meta-address/);
    }
  });

  it('round-trips bounded opaque signature bytes without changing registrant, scheme or meta-address', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
      const signature: Hex = `0x${Buffer.from(bytes).toString('hex')}`;
      const tx = buildRegisterKeysOnBehalfTx(registrant, metaAddress, signature);
      const decoded = decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data });
      expect(decoded.args).toEqual([registrant, 1n, signature, metaAddressToRegistryBytes(metaAddress)]);
    }), { seed: 20261116, numRuns: 200 });
  });
});
