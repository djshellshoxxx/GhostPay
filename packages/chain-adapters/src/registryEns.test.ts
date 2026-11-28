import { decodeFunctionData, encodeAbiParameters, encodeErrorResult } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRegistryRegistrant } from './registryEns.js';
import type { RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

const WHO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const RESOLVER = '0x1111111111111111111111111111111111111111';
const ZERO = '0x0000000000000000000000000000000000000000';
const resolveAbi = [{ type: 'function', name: 'resolveWithGateways', stateMutability: 'view', inputs: [{ type: 'bytes' }, { type: 'bytes' }, { type: 'string[]' }], outputs: [{ type: 'bytes' }, { type: 'address' }] }] as const;
const answer = (who: Address): Hex => encodeAbiParameters([{ type: 'bytes' }, { type: 'address' }], [encodeAbiParameters([{ type: 'address' }], [who]), RESOLVER]);
const makeClient = (chainId = 1, result: unknown = answer(WHO), code: unknown = '0x6001') => ({
  chainId,
  request: vi.fn((...args: [method: string, params: readonly unknown[]]) => Promise.resolve(args[0] === 'eth_getCode' ? code : result)),
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('explicit ENS registry lookup', () => {
  it('validates ordinary addresses without contacting an ENS or RPC service', async () => {
    const rpc = makeClient(137);
    await expect(resolveRegistryRegistrant(rpc, WHO.toLowerCase())).resolves.toEqual({ registrant: WHO });
    expect(rpc.request).not.toHaveBeenCalled();
    await expect(resolveRegistryRegistrant(rpc, '0x70997970c51812dc3A010C7d01b50e0d17dc79C8')).rejects.toThrow(/INVALID_INPUT/);
    expect(rpc.request).not.toHaveBeenCalled();
  });

  it.each([mainnet, sepolia])('normalizes names and uses only the selected $name RPC', async (chain) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const rpc = makeClient(chain.id);
    await expect(resolveRegistryRegistrant(rpc, 'RaFFY.eth')).resolves.toEqual({ registrant: WHO, name: normalize('RaFFY.eth') });
    expect(rpc.request).toHaveBeenCalledTimes(2);
    expect(rpc.request.mock.calls[0]).toEqual(['eth_getCode', [chain.contracts.ensUniversalResolver.address, 'latest']]);
    const [method, params] = rpc.request.mock.calls[1]!;
    expect(method).toBe('eth_call');
    const call = params[0] as { to: Address; data: Hex };
    expect(call.to.toLowerCase()).toBe(chain.contracts.ensUniversalResolver.address.toLowerCase());
    const decoded = decodeFunctionData({ abi: resolveAbi, data: call.data });
    expect(decoded.args[2]).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('looks up a name that starts like an address', async () => {
    const rpc = makeClient();
    await expect(resolveRegistryRegistrant(rpc, '0xabc.eth')).resolves.toEqual({ registrant: WHO, name: normalize('0xabc.eth') });
    expect(rpc.request).toHaveBeenCalledTimes(2);
  });

  it.each(['', 'plain', 'a..eth', 'alice\u0000.eth', 'a'.repeat(1025), '0x1234', `${WHO}.eth`, `０${WHO.slice(1)}.eth`])('rejects malformed input before network: %s', async (input) => {
    const rpc = makeClient();
    await expect(resolveRegistryRegistrant(rpc, input)).rejects.toThrow(/INVALID_INPUT/);
    expect(rpc.request).not.toHaveBeenCalled();
  });

  it('rejects other chains without contacting a hidden Ethereum endpoint', async () => {
    const rpc = makeClient(137);
    await expect(resolveRegistryRegistrant(rpc, 'alice.eth')).rejects.toThrow(/CHAIN_DISABLED/);
    expect(rpc.request).not.toHaveBeenCalled();
  });

  it('encodes the normalized DNS name and the published ENSIP-1 namehash vector', async () => {
    const rpc = makeClient();
    await resolveRegistryRegistrant(rpc, 'FOO.eth');
    const call = rpc.request.mock.calls[1]![1][0] as { data: Hex };
    const resolved = decodeFunctionData({ abi: resolveAbi, data: call.data });
    expect(resolved.args[0]).toBe('0x03666f6f0365746800');
    // addr(bytes32) selector followed by the official foo.eth vector, independently of viem's namehash helper.
    expect(resolved.args[1]).toBe('0x3b3b57dede9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f');
    expect(resolved.args[2]).toEqual([]);
  });

  it.each(['0x', '0xzz', '0x1', 1, `0x${'ff'.repeat(24577)}`])('refuses absent or malformed resolver code', async (code) => {
    const rpc = makeClient(1, answer(WHO), code);
    await expect(resolveRegistryRegistrant(rpc, 'alice.eth')).rejects.toThrow(/DEPLOYMENT_UNVERIFIED/);
    expect(rpc.request).toHaveBeenCalledTimes(1);
  });

  it.each([answer(ZERO), '0x', '0x1234', 1, `0x${'00'.repeat(4097)}`])('rejects missing or malformed address answers', async (result) => {
    const rpc = makeClient(1, result);
    await expect(resolveRegistryRegistrant(rpc, 'alice.eth')).rejects.toThrow(/INVALID_INPUT|RPC_FAILURE/);
  });

  it('never follows OffchainLookup gateway URLs or leaks provider errors', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const offchain = encodeErrorResult({ abi: [{ type: 'error', name: 'OffchainLookup', inputs: [{ type: 'address' }, { type: 'string[]' }, { type: 'bytes' }, { type: 'bytes4' }, { type: 'bytes' }] }], errorName: 'OffchainLookup', args: [mainnet.contracts.ensUniversalResolver.address, ['https://private.example/{data}'], '0x1234', '0x12345678', '0x'] });
    const request = vi.fn((method: string) => method === 'eth_getCode' ? Promise.resolve('0x6001') : Promise.reject(Object.assign(new Error('private endpoint and queried name'), { code: 3, data: offchain })));
    const rpc: Pick<RpcClient, 'chainId' | 'request'> = { chainId: 1, request };
    await expect(resolveRegistryRegistrant(rpc, 'alice.eth')).rejects.toThrow('RPC_FAILURE: ENS lookup failed or requires an offchain gateway');
    expect(request).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});
