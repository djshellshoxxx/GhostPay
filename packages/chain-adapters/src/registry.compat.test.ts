import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { decodeFunctionData, encodeAbiParameters, getAddress, keccak256 } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { erc6538RegistryAbi } from './abi/erc6538Registry.js';
import { SEPOLIA } from './fixtures.testutil.js';
import {
  ERC6538_ENTRY_TYPEHASH,
  ERC6538_REGISTRY,
  ERC6538_SCHEME_ID,
  assertRegisterKeysTx,
  buildRegisterKeysTx,
  lookupMetaAddress,
  registryBytesFor,
  verifyRegistry,
} from './registry.js';
import { createClient, type RpcClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

const WHO = getAddress('0x00000000000000000000000000000000000a11ce');
const meta = encodeMetaAddress(generateKeySet());

function node(h: { code?: string; typehash?: string; entry?: Hex }): Promise<RpcClient> {
  return createClient(SEPOLIA, 'https://rpc.example.test', {
    sleep: noSleep,
    retries: 0,
    chainRecheckMs: 0,
    transport: fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (m === 'eth_getCode') return h.code ?? '0x6001';
      if (m === 'eth_call') {
        const data = (p[0] as { data: string }).data;
        if (data.startsWith('0x')) {
          return data.length === 10 ? (h.typehash ?? ERC6538_ENTRY_TYPEHASH) : encodeAbiParameters([{ type: 'bytes' }], [h.entry ?? '0x']);
        }
      }
      return null;
    }),
  });
}

describe('ERC-6538 constants', () => {
  it('registry address and type hash are the canonical values', () => {
    expect(ERC6538_REGISTRY).toBe('0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538');
    expect(ERC6538_SCHEME_ID).toBe(1n);
    expect(ERC6538_ENTRY_TYPEHASH).toBe(keccak256(new TextEncoder().encode('Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)')));
  });
  it('ABI exposes registerKeys(uint256,bytes) and stealthMetaAddressOf(address,uint256)', () => {
    const sigs = erc6538RegistryAbi.filter((x) => x.type === 'function').map((f) => `${f.name}(${f.inputs.map((i) => i.type).join(',')})`);
    expect(sigs).toContain('registerKeys(uint256,bytes)');
    expect(sigs).toContain('stealthMetaAddressOf(address,uint256)');
  });
});

describe('registerKeys calldata', () => {
  it('registers exactly the 66-byte meta-address bytes under scheme 1, with no value', () => {
    const tx = buildRegisterKeysTx(meta);
    expect(tx.to).toBe(ERC6538_REGISTRY);
    expect(tx.value).toBe(0n);
    const d = decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data });
    expect(d.functionName).toBe('registerKeys');
    expect(d.args).toEqual([1n, registryBytesFor(meta)]);
    expect(registryBytesFor(meta)).toBe(`0x${meta.slice('st:eth:0x'.length)}`);
    expect(registryBytesFor(meta)).toHaveLength(2 + 132);
    expect(() => assertRegisterKeysTx(tx, meta)).not.toThrow();
  });
  it('rejects a tampered transaction (target, value, data, other meta-address, other function)', () => {
    const tx = buildRegisterKeysTx(meta);
    const other = encodeMetaAddress(generateKeySet());
    expect(() => assertRegisterKeysTx({ ...tx, to: WHO }, meta)).toThrow(/unexpected registry transaction/);
    expect(() => assertRegisterKeysTx({ ...tx, value: 1n }, meta)).toThrow(/unexpected registry transaction/);
    expect(() => assertRegisterKeysTx(tx, other)).toThrow(/differs from the meta-address/);
    expect(() => assertRegisterKeysTx({ ...tx, data: '0x1234' }, meta)).toThrow(/cannot be decoded/);
    expect(() => assertRegisterKeysTx({ ...tx, data: `${tx.data.slice(0, 10)}${'0'.repeat(64)}${tx.data.slice(74)}` as Hex }, meta)).toThrow(/differs|decoded/);
    const inc = '0x' + keccak256(new TextEncoder().encode('incrementNonce()')).slice(2, 10);
    expect(() => assertRegisterKeysTx({ ...tx, data: inc as Hex }, meta)).toThrow(/unexpected registry transaction/);
  });
  it('refuses a malformed meta-address', () => {
    expect(() => buildRegisterKeysTx('st:eth:0x12')).toThrow();
  });
});

describe('verifyRegistry', () => {
  it('passes when code exists and the type hash probe answers correctly', async () => {
    await expect(verifyRegistry(await node({}))).resolves.toBeUndefined();
  });
  it('fails closed without code or with a wrong answer', async () => {
    await expect(verifyRegistry(await node({ code: '0x' }))).rejects.toThrow(/not deployed/);
    await expect(verifyRegistry(await node({ typehash: `0x${'11'.repeat(32)}` }))).rejects.toThrow(/did not answer/);
  });
});

describe('lookupMetaAddress', () => {
  it('returns the canonical meta-address, or undefined when empty', async () => {
    expect(await lookupMetaAddress(await node({ entry: registryBytesFor(meta) }), WHO)).toBe(meta);
    expect(await lookupMetaAddress(await node({}), WHO)).toBeUndefined();
  });
  it('rejects malformed entries instead of guessing', async () => {
    await expect(lookupMetaAddress(await node({ entry: '0x1234' }), WHO)).rejects.toThrow(/unexpected length|wrong length/);
    await expect(lookupMetaAddress(await node({ entry: `0x${'00'.repeat(66)}` }), WHO)).rejects.toThrow(/not a valid meta-address|invalid keys/);
  });
  it('rejects a non-ABI answer', async () => {
    const c = await createClient(SEPOLIA, 'https://rpc.example.test', {
      sleep: noSleep,
      transport: fakeTransport((m) => (m === 'eth_chainId' ? '0xaa36a7' : '0x12')),
    });
    await expect(lookupMetaAddress(c, WHO)).rejects.toThrow(/malformed registry answer|not ABI-encoded bytes|malformed eth_getCode result|malformed eth_call result/);
    const c2 = await createClient(SEPOLIA, 'https://rpc.example.test', {
      sleep: noSleep,
      transport: fakeTransport((m) => (m === 'eth_chainId' ? '0xaa36a7' : 7)),
    });
    await expect(lookupMetaAddress(c2, WHO)).rejects.toThrow(/malformed registry answer|not ABI-encoded bytes|malformed eth_getCode result|malformed eth_call result/);
  });
});
