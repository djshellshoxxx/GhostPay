import { encodeAbiParameters, keccak256, toBytes } from 'viem/utils';
import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import {
  assertRegistryDeployed,
  buildLookupCall,
  buildRegisterKeysCall,
  ERC6538_REGISTRY_ADDRESS,
  lookupMetaAddress,
  metaAddressToRegistryBytes,
  registryBytesToMetaAddress,
} from './registry.js';
import type { Hex } from './types.js';

function meta(): string {
  const k = generateKeySet();
  return encodeMetaAddress(k);
}

const client = (handler: (m: string, p: readonly unknown[]) => unknown): { request: (m: string, p: readonly unknown[]) => Promise<unknown> } => ({
  request: (m, p) => Promise.resolve(handler(m, p)),
});

describe('ERC-6538 registry helpers', () => {
  it('uses the address from the EIP text', () => {
    expect(ERC6538_REGISTRY_ADDRESS).toBe('0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538');
  });

  it('round-trips meta-address and registry bytes', () => {
    const m = meta();
    const b = metaAddressToRegistryBytes(m);
    expect(b.length).toBe(2 + 132);
    expect(registryBytesToMetaAddress(b)).toBe(m);
  });

  it('rejects invalid meta-addresses and entries', () => {
    expect(() => metaAddressToRegistryBytes('st:eth:0x1234')).toThrow(/INVALID_INPUT/);
    expect(() => metaAddressToRegistryBytes('')).toThrow(/INVALID_INPUT/);
    expect(() => registryBytesToMetaAddress('0x1234')).toThrow(/INVALID_INPUT/);
    expect(() => registryBytesToMetaAddress(`0x${'02'.repeat(66)}`)).toThrow(/INVALID_INPUT/);
  });

  it('builds registerKeys(1, bytes) with selector and zero value', () => {
    const m = meta();
    const c = buildRegisterKeysCall(m);
    expect(c.to).toBe(ERC6538_REGISTRY_ADDRESS);
    expect(c.value).toBe(0n);
    expect(c.data.startsWith('0x')).toBe(true);
    expect(c.data.slice(0, 10)).toBe(keccak256(toBytes('registerKeys(uint256,bytes)')).slice(0, 10));
    expect(c.preview.metaAddress).toBe(m);
    expect(c.preview.schemeId).toBe(1n);
  });

  it('builds lookup call and rejects non-addresses', () => {
    const c = buildLookupCall('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
    expect(c.preview.registrant).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(buildLookupCall('0x70997970C51812dc3A010C7d01b50e0d17dc79C8').preview.registrant).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(() => buildLookupCall('vitalik.eth')).toThrow(/INVALID_INPUT/);
  });

  it('refuses a registrant with a wrong EIP-55 checksum instead of normalizing it (L4-I3)', async () => {
    // One letter's case flipped: a mistyped or altered address must not silently become a different valid one.
    const bad = '0x70997970c51812dc3A010C7d01b50e0d17dc79C8';
    expect(() => buildLookupCall(bad)).toThrow(/INVALID_INPUT: registrant address checksum does not match/);
    expect(() => buildLookupCall('0x70997970C51812DC3A010C7D01B50E0D17DC79C8')).toThrow(/checksum does not match/);
    const calls: string[] = [];
    await expect(lookupMetaAddress(client((m) => { calls.push(m); return '0x6001'; }), bad)).rejects.toThrow(/checksum does not match/);
    expect(calls).toEqual([]);
  });

  it('fails closed when the registry has no code or answers garbage', async () => {
    await expect(assertRegistryDeployed(client(() => '0x'))).rejects.toThrow(/CHAIN_DISABLED/);
    await expect(assertRegistryDeployed(client(() => 5))).rejects.toThrow(/RPC_FAILURE/);
    await expect(assertRegistryDeployed(client(() => '0xzz'))).rejects.toThrow(/RPC_FAILURE/);
    await expect(assertRegistryDeployed(client(() => '0x6001'))).resolves.toBeUndefined();
  });

  it('lookup: registered, empty, malformed', async () => {
    const m = meta();
    const enc = (b: Hex): Hex => encodeAbiParameters([{ type: 'bytes' }], [b]);
    const who = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const mk = (ret: string) => client((method) => (method === 'eth_getCode' ? '0x6001' : ret));
    expect(await lookupMetaAddress(mk(enc(metaAddressToRegistryBytes(m))), who)).toBe(m);
    expect(await lookupMetaAddress(mk(enc('0x')), who)).toBeUndefined();
    await expect(lookupMetaAddress(mk(enc('0x1234')), who)).rejects.toThrow(/INVALID_INPUT/);
    await expect(lookupMetaAddress(mk('0x1234'), who)).rejects.toThrow(/RPC_FAILURE/);
    await expect(lookupMetaAddress(client(() => '0x'), who)).rejects.toThrow(/CHAIN_DISABLED/);
  });
});
