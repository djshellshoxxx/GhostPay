import { assertTestnet } from './guard.js';
import { HopError, type HopLeg, type HopPlan, type PlanStore } from './types.js';

const FORBIDDEN_KEY = /sig|signature|rawTx|privateKey|secret/i;
const BIG = '__big__';

/**
 * Serialises a plan to JSON (bigints as decimal strings).
 *
 * @remarks HOP-REQ-7: refuses any key matching `sig|signature|rawTx|privateKey|secret` anywhere in
 * the object graph, so no signed payload or key can reach storage through this path.
 *
 * @param plan Plan.
 * @returns JSON text.
 * @throws {HopError} `PRESIGN_FORBIDDEN`.
 */
export function serializePlan(plan: HopPlan): string {
  assertTestnet(plan.chainId);
  const walk = (v: unknown): void => {
    if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEY.test(k)) throw new HopError('PRESIGN_FORBIDDEN', 'signed material must not be persisted');
        walk(x);
      }
    }
  };
  walk(plan);
  return JSON.stringify(plan, (_k, v: unknown) => (typeof v === 'bigint' ? { [BIG]: v.toString() } : v));
}

/**
 * Parses text produced by {@link serializePlan}.
 *
 * @param text JSON.
 * @returns Plan.
 * @throws {HopError} `INVALID_INPUT` on malformed data, `PRESIGN_FORBIDDEN` on forbidden keys.
 */
export function parsePlan(text: string): HopPlan {
  let plan: HopPlan;
  try {
    plan = JSON.parse(text, (_k, v: unknown) => {
      if (v !== null && typeof v === 'object' && BIG in v) return BigInt((v as Record<string, string>)[BIG] as string);
      return v;
    }) as HopPlan;
  } catch {
    throw new HopError('INVALID_INPUT', 'plan JSON');
  }
  if (typeof plan !== 'object' || plan === null || !Array.isArray(plan.legs) || typeof plan.chainId !== 'number') {
    throw new HopError('INVALID_INPUT', 'plan shape');
  }
  serializePlan(plan);
  return plan;
}

/** In-memory store (tests, previews). */
export function createMemoryPlanStore(): PlanStore & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    save: (plan) => {
      raw.set(plan.id, serializePlan(plan));
      return Promise.resolve();
    },
    load: (id) => {
      const t = raw.get(id);
      return Promise.resolve(t === undefined ? null : parsePlan(t));
    },
  };
}

/** Abstract sealing port, e.g. a wrapper over `@ghostpay/secret-box`. Optional: this package does not depend on it. */
export interface Sealer {
  seal(plain: Uint8Array): Promise<Uint8Array>;
  open(sealed: Uint8Array): Promise<Uint8Array>;
}

/** Abstract blob storage (keystore export, IndexedDB). */
export interface BlobStore {
  put(key: string, value: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

/**
 * Plan store that seals the serialised plan through an injected {@link Sealer} before it reaches `blobs`.
 *
 * @param blobs Blob storage.
 * @param sealer Encryption port.
 * @returns Store.
 */
export function createSealedPlanStore(blobs: BlobStore, sealer: Sealer): PlanStore {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    save: async (plan) => {
      await blobs.put(`hops/${plan.id}`, await sealer.seal(enc.encode(serializePlan(plan))));
    },
    load: async (id) => {
      const b = await blobs.get(`hops/${id}`);
      return b === null ? null : parsePlan(dec.decode(await sealer.open(b)));
    },
  };
}

/** Whitelisted leg keys (anything else is a presign smell). */
const LEG_KEYS: ReadonlySet<string> = new Set<keyof HopLeg>([
  'index', 'from', 'to', 'fromIndex', 'toIndex', 'delayMs', 'dueAtMs', 'relayerId',
  'expectedAmountIn', 'expectedFee', 'state', 'nonce', 'deadlineS', 'txHash',
]);

/**
 * Asserts waiting/planned legs carry no signing state and every leg only has whitelisted keys.
 *
 * @param plan Plan.
 * @throws {HopError} `PRESIGN_FORBIDDEN`.
 */
export function assertNoPresign(plan: HopPlan): void {
  for (const l of plan.legs) {
    for (const k of Object.keys(l)) if (!LEG_KEYS.has(k)) throw new HopError('PRESIGN_FORBIDDEN', 'unexpected leg field');
    if ((l.state === 'planned' || l.state === 'waiting' || l.state === 'due') && (l.nonce !== undefined || l.txHash !== undefined)) {
      throw new HopError('PRESIGN_FORBIDDEN', 'signing state on an unsigned leg');
    }
  }
}
