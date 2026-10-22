import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RandomSource } from '@ghostpay/core-crypto';
import type { Address, Hex } from './types.js';

/** RNG that plays back queued 32-byte chunks, then repeats the last. */
export function scriptedRng(chunks: Uint8Array[]): RandomSource {
  let i = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const chunk = chunks[Math.min(i++, chunks.length - 1)] as Uint8Array;
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(chunk);
      return array;
    },
  };
}

export const hexBytes = (h: string): Uint8Array => Uint8Array.from(Buffer.from(h.slice(2), 'hex'));

export interface VectorLeaf { token: Address; limit: string; windowSeconds: string; leaf: Hex; proof: Hex[] }
export interface VectorTree { id: string; root: Hex; tree: Hex[]; leaves: VectorLeaf[] }
export interface VectorAccount {
  id: string;
  spendingPrivateKey: Hex;
  viewingPrivateKey: Hex;
  ephemeralPrivateKey: Hex;
  spendingPublicKey: Hex;
  viewingPublicKey: Hex;
  scheme1MetaAddress: string;
  metaAddress: string;
  policy: { destination: Address; delaySeconds: string; limitsRoot: Hex; tree: string | null };
  policyHash: Hex;
  ephemeralPublicKey: Hex;
  viewTag: Hex;
  ownerAddress: Address;
  ownerPrivateKey: Hex;
  salt: Hex;
  accountAddress: Address;
}
interface Signed<M> { message: M; structHash: Hex; digest: Hex; signature: Hex }
export interface VectorOrders {
  account: string;
  accountAddress: Address;
  chainId: number;
  domainSeparator: Hex;
  withdraw: Signed<{ token: Address; amount: string; deadline: string; nonce: string; limitLeafHash: Hex }> & {
    limitProof: { limit: string; windowSeconds: string; proof: Hex[] };
  };
  cancelWithdraw: Signed<{ id: Hex }>;
  proposeDestination: Signed<{ newDestination: Address; deadline: string; nonce: string }>;
  cancelDestination: Signed<{ id: Hex }>;
}
export interface Vectors {
  schemeId: string;
  deployment: { chainId: number; deployerPrivateKey: Hex; deployer: Address; implementation: Address; factory: Address; cloneInitCodeHash: Hex };
  typeStrings: Record<'Withdraw' | 'CancelWithdraw' | 'ProposeDestination' | 'CancelDestination', string>;
  typehashes: Record<'Withdraw' | 'CancelWithdraw' | 'ProposeDestination' | 'CancelDestination', Hex>;
  limitTrees: VectorTree[];
  invalidTrees: { note: string; limits: { token: string; limit: string; windowSeconds: string }[]; error: string }[];
  accounts: VectorAccount[];
  orders: VectorOrders[];
}

export const vectors = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../test-vectors/policy-scheme.json'), 'utf8'),
) as Vectors;

export const toLimits = (t: { leaves?: VectorLeaf[]; limits?: { token: string; limit: string; windowSeconds: string }[] }) =>
  (t.leaves ?? t.limits ?? []).map((l) => ({ token: l.token as Address, limit: BigInt(l.limit), windowSeconds: BigInt(l.windowSeconds) }));
