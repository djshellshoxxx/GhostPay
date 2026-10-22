import { getAddress, type Address } from 'viem';
import { assertPoolChain } from './chain.js';
import { fail } from './errors.js';
import { assertField } from './field.js';
import { PoolTree } from './tree.js';

/** `set.json` published by an association-set publisher (spec 6.2). */
export interface AspSet {
  readonly version: 1;
  readonly pool: Address;
  readonly chainId: number;
  /** Deposit labels as decimal strings. */
  readonly labels: readonly string[];
  readonly policy: string;
  readonly generatedAtBlock: number;
}

/** Builds the ASP tree over raw labels (leaves are labels, not hashed). */
export function buildAspTree(labels: readonly bigint[]): PoolTree {
  const t = new PoolTree();
  for (const l of labels) t.insert(l);
  return t;
}

/**
 * Parses a downloaded `set.json` and recomputes its root (SP-ASP-3).
 *
 * @param json Untrusted JSON text.
 * @param expectedRoot The root the publisher registered on-chain.
 * @returns Labels as bigints and the tree.
 * @throws PoolSdkError `ASP_SET_MISMATCH` if malformed or the recomputed root differs.
 * @security The set content is untrusted until the root matches the on-chain registration.
 */
export function verifyAspSet(json: string, expectedRoot: bigint): { set: AspSet; labels: bigint[]; tree: PoolTree } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail('ASP_SET_MISMATCH', 'set is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null) return fail('ASP_SET_MISMATCH', 'set is not an object');
  const o = raw as Record<string, unknown>;
  if (o['version'] !== 1 || typeof o['chainId'] !== 'number' || typeof o['pool'] !== 'string' || typeof o['policy'] !== 'string' || typeof o['generatedAtBlock'] !== 'number' || !Array.isArray(o['labels'])) {
    return fail('ASP_SET_MISMATCH', 'set has wrong shape');
  }
  assertPoolChain(o['chainId']);
  const labels: bigint[] = [];
  for (const l of o['labels'] as unknown[]) {
    if (typeof l !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(l)) return fail('ASP_SET_MISMATCH', 'label is not a decimal string');
    const b = BigInt(l);
    try {
      assertField(b, 'label');
    } catch {
      return fail('ASP_SET_MISMATCH', 'label out of field');
    }
    labels.push(b);
  }
  const tree = buildAspTree(labels);
  if (tree.root() !== expectedRoot) return fail('ASP_SET_MISMATCH', 'recomputed root differs from the registered root');
  const set: AspSet = {
    version: 1,
    pool: getAddress(o['pool']),
    chainId: o['chainId'],
    labels: labels.map(String),
    policy: o['policy'],
    generatedAtBlock: o['generatedAtBlock'],
  };
  return { set, labels, tree };
}
