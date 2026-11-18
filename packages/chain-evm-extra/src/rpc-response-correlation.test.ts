import { describe, expect, it } from 'vitest';
import { createFetchRpc, type FetchLike } from './cli-lib.js';

const RPC_URL = 'https://rpc.example.invalid/private-path';

type Request = { readonly jsonrpc: string; readonly id: number; readonly method: string };

function responder(response: (request: Request) => unknown): FetchLike {
  return (_url, init) => {
    const request = JSON.parse(init.body) as Request;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(response(request))),
    });
  };
}

describe('read-only JSON-RPC response correlation', () => {
  it('accepts responses echoing each unique numeric request id and JSON-RPC version', async () => {
    const ids: number[] = [];
    const rpc = createFetchRpc(RPC_URL, responder((request) => {
      ids.push(request.id);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: request.method === 'eth_chainId' ? '0x1' : '0x6080',
      };
    }));
    expect(await rpc.getChainId()).toBe(1n);
    expect(await rpc.getCode('0x0000000000000000000000000000000000000001')).toBe('0x6080');
    expect(ids).toEqual([1, 2]);
  });

  for (const [name, response] of [
    ['mismatched numeric id', (id: number) => ({ jsonrpc: '2.0', id: id + 1, result: '0x1' })],
    ['missing id', () => ({ jsonrpc: '2.0', result: '0x1' })],
    ['stringified id', (id: number) => ({ jsonrpc: '2.0', id: String(id), result: '0x1' })],
    ['missing version', (id: number) => ({ id, result: '0x1' })],
    ['wrong version', (id: number) => ({ jsonrpc: '1.0', id, result: '0x1' })],
  ] as const) {
    it(`rejects ${name} before accepting eth_chainId`, async () => {
      const rpc = createFetchRpc(RPC_URL, responder((request) => response(request.id)));
      await expect(rpc.getChainId()).rejects.toThrow();
    });
  }

  it('rejects an unrelated eth_getCode response even after a correctly correlated chain-id call', async () => {
    const rpc = createFetchRpc(RPC_URL, responder((request) => ({
      jsonrpc: '2.0',
      id: request.method === 'eth_getCode' ? request.id + 1 : request.id,
      result: request.method === 'eth_chainId' ? '0x1' : '0x6080',
    })));
    expect(await rpc.getChainId()).toBe(1n);
    await expect(rpc.getCode('0x0000000000000000000000000000000000000001')).rejects.toThrow();
  });
});
