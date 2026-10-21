import { decodeFunctionData, encodeAbiParameters, keccak256, toFunctionSelector } from 'viem/utils';
import { decodeMetaAddress, encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { erc6538RegistryAbi } from './abi/erc6538.js';
import { FAKE } from './fixtures.testutil.js';
import {
  REGISTRY_ADDRESS, REGISTRY_CODEHASHES, REGISTRY_SCHEME_ID, assertRegistryAvailable, buildClearKeys, buildIncrementNonce,
  buildRegisterKeys, buildRegisterKeysOnBehalf, lookupMeta, registryMetaBytes,
} from './registry.js';
import type { Hex } from './types.js';

const meta = encodeMetaAddress(generateKeySet());

describe('ERC-6538 selectors (fixed by the EIP interface)', () => {
  it('match the EIP function signatures', () => {
    const data = buildRegisterKeys(meta).data;
    expect(data.slice(0, 10)).toBe(toFunctionSelector('registerKeys(uint256,bytes)'));
    expect(buildIncrementNonce().data).toBe(toFunctionSelector('incrementNonce()'));
    const ob = buildRegisterKeysOnBehalf(FAKE.router, `0x${'11'.repeat(65)}`, meta).data;
    expect(ob.slice(0, 10)).toBe(toFunctionSelector('registerKeysOnBehalf(address,uint256,bytes,bytes)'));
  });
});

describe('builders', () => {
  it('registerKeys encodes scheme 1 and the 66-byte spend||view meta-address to the canonical registry', () => {
    expect(REGISTRY_ADDRESS).toBe('0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538');
    const tx = buildRegisterKeys(meta);
    expect(tx.to).toBe(REGISTRY_ADDRESS);
    expect(tx.value).toBe(0n);
    const d = decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data });
    expect(d.functionName).toBe('registerKeys');
    const [scheme, bytes] = d.args as [bigint, Hex];
    expect(scheme).toBe(REGISTRY_SCHEME_ID);
    expect(bytes).toBe(registryMetaBytes(meta));
    expect(bytes.length).toBe(2 + 132);
    const k = decodeMetaAddress(meta);
    expect(bytes.slice(2, 68)).toBe(Buffer.from(k.spendingPublicKey).toString('hex'));
  });

  it('rejects a malformed or key-reusing meta-address', () => {
    expect(() => buildRegisterKeys('st:eth:0x12')).toThrow();
    const k = generateKeySet();
    const same = `st:eth:0x${Buffer.from(k.spendingPublicKey).toString('hex').repeat(2)}`;
    expect(() => buildRegisterKeys(same)).toThrow();
  });

  it('clear keys registers empty bytes; increment nonce has no args', () => {
    const d = decodeFunctionData({ abi: erc6538RegistryAbi, data: buildClearKeys().data });
    expect(d.args).toEqual([1n, '0x']);
    expect(decodeFunctionData({ abi: erc6538RegistryAbi, data: buildIncrementNonce().data }).functionName).toBe('incrementNonce');
  });

  it('on-behalf builder validates registrant and signature', () => {
    expect(() => buildRegisterKeysOnBehalf('0x12', `0x${'11'.repeat(65)}`, meta)).toThrow(/INVALID_INPUT/);
    expect(() => buildRegisterKeysOnBehalf(FAKE.router, '0x', meta)).toThrow(/INVALID_INPUT/);
    expect(() => buildRegisterKeysOnBehalf(FAKE.router, 'zz', meta)).toThrow(/INVALID_INPUT/);
    const d = decodeFunctionData({ abi: erc6538RegistryAbi, data: buildRegisterKeysOnBehalf(FAKE.router, `0x${'11'.repeat(65)}`, meta).data });
    expect(d.args?.[0]).toBe(FAKE.router);
  });
});

function reader(result: unknown) {
  const calls: unknown[][] = [];
  return { calls, chainId: 84532, request: (m: string, p: readonly unknown[]) => { calls.push([m, ...p]); return Promise.resolve(result); } };
}
const enc = (b: string): Hex => encodeAbiParameters([{ type: 'bytes' }], [b as Hex]);

describe('lookupMeta', () => {
  it('returns the canonical meta-address for a valid registry entry and queries the right call', async () => {
    const r = reader(enc(registryMetaBytes(meta)));
    expect(await lookupMeta(r, FAKE.router.toLowerCase().replace(/^0x/, '0x'))).toBe(meta);
    const [m, call, tag] = r.calls[0] as [string, { to: string; data: string }, string];
    expect(m).toBe('eth_call');
    expect(call.to).toBe(REGISTRY_ADDRESS);
    expect(call.data.slice(0, 10)).toBe(toFunctionSelector('stealthMetaAddressOf(address,uint256)'));
    expect(tag).toBe('latest');
  });

  it('ignores empty, wrong-length, off-curve and identical-key entries', async () => {
    expect(await lookupMeta(reader(enc('0x')), FAKE.router)).toBeNull();
    expect(await lookupMeta(reader(enc(`0x${'02'.repeat(65)}`)), FAKE.router)).toBeNull();
    expect(await lookupMeta(reader(enc(`0x${'05'.repeat(66)}`)), FAKE.router)).toBeNull();
    const k = Buffer.from(generateKeySet().spendingPublicKey).toString('hex');
    expect(await lookupMeta(reader(enc(`0x${k}${k}`)), FAKE.router)).toBeNull();
  });

  it('throws on malformed transport results and bad registrant', async () => {
    await expect(lookupMeta(reader(5), FAKE.router)).rejects.toThrow(/RPC_FAILURE/);
    await expect(lookupMeta(reader('0x1234'), FAKE.router)).rejects.toThrow(/RPC_FAILURE/);
    await expect(lookupMeta(reader('0x'), 'nope')).rejects.toThrow(/INVALID_INPUT/);
  });
});

describe('assertRegistryAvailable', () => {
  const code: Hex = '0x60806040aa';
  it('passes only for real code matching the pin', async () => {
    await expect(assertRegistryAvailable(reader(code), keccak256(code))).resolves.toBeUndefined();
    await expect(assertRegistryAvailable(reader(code), `0x${'9'.repeat(64)}`)).rejects.toThrow(/mismatch/);
    await expect(assertRegistryAvailable(reader('0x'), keccak256(code))).rejects.toThrow(/no usable code/);
    await expect(assertRegistryAvailable(reader(`0xef0100${'11'.repeat(20)}`), keccak256(code))).rejects.toThrow(/REGISTRY_UNAVAILABLE/);
  });
  it('fails closed without a pin (none shipped) or with a malformed one', async () => {
    expect(Object.keys(REGISTRY_CODEHASHES)).toHaveLength(0);
    await expect(assertRegistryAvailable(reader(code), undefined)).rejects.toThrow(/no pinned codehash/);
    await expect(assertRegistryAvailable(reader(code), '0x12')).rejects.toThrow(/no pinned codehash/);
  });
});
