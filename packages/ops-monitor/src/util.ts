import { ChainAdapterError, type RpcClient } from '@ghostpay/chain-adapters';
import { keccak256, toBytes } from 'viem';
import type { Finding, ProbeId, Severity } from './types.js';

const MAX_DETAIL = 300;

/** @internal Reduces any thrown value to a short code (never the message, which may hold URLs). */
export function errTag(e: unknown): string {
  return e instanceof ChainAdapterError ? e.code : 'ERROR';
}

/** @internal Builds a finding with a bounded detail. */
export function mk(id: ProbeId, severity: Severity, subject: string, detail: string, chainId?: number): Finding {
  const d = detail.length > MAX_DETAIL ? detail.slice(0, MAX_DETAIL) : detail;
  return chainId === undefined ? { id, severity, subject, detail: d } : { id, severity, chainId, subject, detail: d };
}

/** @internal 4-byte selector of a signature. */
export function selector(sig: string): string {
  return keccak256(toBytes(sig)).slice(0, 10);
}

/** @internal 32-byte topic/hash of a signature. */
export function topicOf(sig: string): `0x${string}` {
  return keccak256(toBytes(sig));
}

const HEXDATA = /^0x(?:[0-9a-fA-F]{2})*$/;

/** @internal `eth_call` at latest; returns validated hex. */
export async function ethCall(rpc: RpcClient, to: string, data: string): Promise<string> {
  const r = await rpc.request('eth_call', [{ to, data }, 'latest']);
  if (typeof r !== 'string' || !HEXDATA.test(r)) throw new Error('malformed');
  return r;
}

/** @internal Decodes a single ABI word as a lowercase address, or null when malformed. */
export function wordToAddress(hex: string): string | null {
  if (hex.length !== 66 || !/^0x0{24}[0-9a-fA-F]{40}$/.test(hex)) return null;
  return `0x${hex.slice(26).toLowerCase()}`;
}

/** @internal Decodes a single ABI word as a bigint, or null when malformed. */
export function wordToBigint(hex: string): bigint | null {
  return hex.length === 66 ? BigInt(hex) : null;
}

/** @internal Left-pads a 20-byte address into an ABI word (no 0x). */
export function padAddress(a: string): string {
  return a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/** @internal Clients for one chain. */
export function clientsFor(rpcs: readonly RpcClient[], chainId: number): RpcClient[] {
  return rpcs.filter((r) => r.chainId === chainId);
}
