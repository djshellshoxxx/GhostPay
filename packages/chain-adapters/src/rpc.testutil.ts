import type { RpcTransport } from './rpc.js';

export type Handler = (method: string, params: unknown[], id: number) => unknown;
export class FakeRpcError extends Error {
  public constructor(public readonly rpcCode: number) {
    super('rpc');
  }
}

/** Fake transport implementing a JSON-RPC node from a handler. Throw `FakeRpcError` for JSON-RPC errors. */
export function fakeTransport(handler: Handler, calls: { method: string; params: unknown[] }[] = []): RpcTransport {
  return {
    send(_url, body) {
      const req = JSON.parse(body) as { method: string; params: unknown[]; id: number };
      calls.push({ method: req.method, params: req.params });
      try {
        const result = handler(req.method, req.params, req.id);
        if (typeof result === 'string' && result.startsWith('RAW:')) return Promise.resolve(result.slice(4));
        return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
      } catch (e) {
        if (e instanceof FakeRpcError) {
          return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: e.rpcCode, message: 'x' } }));
        }
        return Promise.reject(e instanceof Error ? e : new Error('boom'));
      }
    },
  };
}

export const noSleep = (): Promise<void> => Promise.resolve();
