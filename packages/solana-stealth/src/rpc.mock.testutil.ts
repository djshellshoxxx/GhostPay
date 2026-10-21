import { base58 } from '@scure/base';
import type { SolanaRpc } from './rpc.js';

type Handler = (params: readonly unknown[]) => unknown;

/** In-memory JSON-RPC double. Records every call; unknown methods throw. */
export class MockRpc implements SolanaRpc {
  public readonly calls: { method: string; params: readonly unknown[] }[] = [];
  public constructor(private readonly handlers: Record<string, Handler>) {}
  public request(method: string, params: readonly unknown[]): Promise<unknown> {
    this.calls.push({ method, params });
    const h = this.handlers[method];
    if (h === undefined) return Promise.reject(new Error('unexpected method ' + method));
    return Promise.resolve(h(params));
  }
}

function compactU16(buf: Uint8Array, i: number): [number, number] {
  let v = 0;
  let shift = 0;
  for (;;) {
    const b = buf[i++] as number;
    v |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [v, i];
    shift += 7;
  }
}

/** Decodes a legacy message into the `getTransaction` json `message` shape. */
export function legacyMessageToJson(m: Uint8Array): {
  accountKeys: string[];
  instructions: { programIdIndex: number; accounts: number[]; data: string }[];
} {
  let [n, i] = compactU16(m, 3);
  const accountKeys: string[] = [];
  for (let k = 0; k < n; k++) accountKeys.push(base58.encode(m.subarray(i + 32 * k, i + 32 * (k + 1))));
  i += 32 * n + 32;
  let nix: number;
  [nix, i] = compactU16(m, i);
  const instructions = [];
  for (let k = 0; k < nix; k++) {
    const programIdIndex = m[i++] as number;
    let na: number;
    [na, i] = compactU16(m, i);
    const accounts = [...m.subarray(i, i + na)];
    i += na;
    let nd: number;
    [nd, i] = compactU16(m, i);
    instructions.push({ programIdIndex, accounts, data: base58.encode(m.subarray(i, i + nd)) });
    i += nd;
  }
  return { accountKeys, instructions };
}
