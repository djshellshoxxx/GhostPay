import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PolicySchemeError,
  UNLIMITED,
  ZERO_HASH,
  buildLimitsTree,
  buildPolicyRecord,
  consumeWindow,
  findPolicyFromCandidates,
  parsePolicyRecord,
  serializePolicyRecord,
  windowHeadroom,
  type Address,
  type Hex,
  type PolicySchemeErrorCode,
  type WindowState,
} from './index.js';
import { toLimits, vectors } from './fixtures.testutil.js';

interface RawState { window: string; bucket: string; current: string; previous: string }
interface ClientVectors {
  window: {
    headroom: { id: string; state: RawState; limit: string; windowSeconds: string; at: string; expected: string }[];
    mismatch: { id: string; state: RawState; limit: string; windowSeconds: string; at: string; error: PolicySchemeErrorCode }[];
    consumeSequence: {
      limit: string;
      windowSeconds: string;
      start: RawState;
      steps: ({ at: string; amount: string; after: RawState } | { at: string; amount: string; error: PolicySchemeErrorCode })[];
    };
  };
  records: {
    valid: { id: string; canonical: string }[];
    invalid: { id: string; base: string; patch: Record<string, unknown>; error: PolicySchemeErrorCode }[];
    candidateSearch: {
      id: string;
      policyHash: Hex;
      destinations: Address[];
      delaySeconds: string[];
      limitsRoots: Hex[];
      expected: { destination: Address; delaySeconds: string; limitsRoot: Hex } | null;
    }[];
  };
}

const cv = JSON.parse(readFileSync(resolve(import.meta.dirname, '../vectors/client-v1.json'), 'utf8')) as ClientVectors;
const st = (s: RawState): WindowState => ({ window: BigInt(s.window), bucket: BigInt(s.bucket), current: BigInt(s.current), previous: BigInt(s.previous) });
const leafOf = (v: { limit: string; windowSeconds: string }) => ({ limit: BigInt(v.limit), windowSeconds: BigInt(v.windowSeconds) });

function codeOf(fn: () => unknown): PolicySchemeErrorCode | 'no error' {
  try {
    fn();
    return 'no error';
  } catch (e) {
    if (e instanceof PolicySchemeError) return e.code;
    throw e;
  }
}

describe('limit window headroom (vectors)', () => {
  for (const v of cv.window.headroom) {
    it(v.id, () => {
      expect(windowHeadroom(st(v.state), leafOf(v), BigInt(v.at))).toBe(BigInt(v.expected));
    });
  }
  for (const v of cv.window.mismatch) {
    it(`mismatch: ${v.id}`, () => {
      expect(codeOf(() => windowHeadroom(st(v.state), leafOf(v), BigInt(v.at)))).toBe(v.error);
    });
  }
  it('consume sequence mirrors _consume', () => {
    const seq = cv.window.consumeSequence;
    let s = st(seq.start);
    for (const step of seq.steps) {
      if ('error' in step) {
        expect(codeOf(() => consumeWindow(s, leafOf(seq), BigInt(step.amount), BigInt(step.at)))).toBe(step.error);
      } else {
        s = consumeWindow(s, leafOf(seq), BigInt(step.amount), BigInt(step.at));
        expect(s).toEqual(st(step.after));
      }
    }
  });
  it('headroom never exceeds what consume accepts (and consume accepts exactly the headroom)', () => {
    for (const v of cv.window.headroom) {
      const leaf = leafOf(v);
      if (leaf.limit === UNLIMITED) continue;
      const h = windowHeadroom(st(v.state), leaf, BigInt(v.at));
      if (h > 0n) expect(() => consumeWindow(st(v.state), leaf, h, BigInt(v.at))).not.toThrow();
      expect(codeOf(() => consumeWindow(st(v.state), leaf, h + 1n, BigInt(v.at)))).toBe('INVALID_LIMIT');
    }
  });
  it('refuses malformed state and leaf input', () => {
    const fresh = st(cv.window.consumeSequence.start);
    expect(codeOf(() => windowHeadroom({ ...fresh, current: -1n }, { limit: 1n, windowSeconds: 1n }, 0n))).toBe('INVALID_INPUT');
    expect(codeOf(() => windowHeadroom(fresh, { limit: 0n, windowSeconds: 1n }, 0n))).toBe('INVALID_LIMIT');
    expect(codeOf(() => windowHeadroom(fresh, { limit: 5n, windowSeconds: 0n }, 0n))).toBe('INVALID_LIMIT');
    expect(codeOf(() => windowHeadroom(fresh, { limit: 5n, windowSeconds: 1n }, -1n))).toBe('INVALID_INPUT');
    expect(codeOf(() => consumeWindow(fresh, { limit: UNLIMITED, windowSeconds: 0n }, 1n, 1n))).toBe('INVALID_LIMIT');
    expect(codeOf(() => consumeWindow(fresh, { limit: 5n, windowSeconds: 1n }, -1n, 1n))).toBe('INVALID_INPUT');
  });
});

const acct = (id: string) => {
  const a = vectors.accounts.find((x) => x.id === id);
  if (a === undefined) throw new Error(id);
  const tree = vectors.limitTrees.find((t) => t.id === a.policy.tree);
  return {
    metaAddress: a.metaAddress,
    policy: { destination: a.policy.destination, delaySeconds: BigInt(a.policy.delaySeconds), limitsRoot: a.policy.limitsRoot },
    limits: tree === undefined ? [] : toLimits(tree),
  };
};

describe('policy record (vectors)', () => {
  for (const v of cv.records.valid) {
    it(`build + serialize is canonical: ${v.id}`, () => {
      const rec = buildPolicyRecord(acct(v.id));
      expect(serializePolicyRecord(rec)).toBe(v.canonical);
    });
    it(`parse round trip: ${v.id}`, () => {
      const rec = parsePolicyRecord(v.canonical);
      expect(serializePolicyRecord(rec)).toBe(v.canonical);
      const parsed = JSON.parse(v.canonical) as { policy: { limitsRoot: Hex } };
      expect(rec.tree?.root ?? ZERO_HASH).toBe(parsed.policy.limitsRoot);
      // A reordered and re-spaced copy parses to the same canonical form.
      const reordered = JSON.parse(v.canonical) as Record<string, unknown> & { limits: unknown[] };
      reordered.limits = [...reordered.limits].reverse();
      expect(serializePolicyRecord(parsePolicyRecord(JSON.stringify(reordered, null, 2)))).toBe(v.canonical);
    });
  }
  for (const v of cv.records.invalid) {
    it(`rejects: ${v.id}`, () => {
      const base = cv.records.valid.find((x) => x.id === v.base);
      if (base === undefined) throw new Error(v.base);
      const obj = { ...(JSON.parse(base.canonical) as Record<string, unknown>), ...v.patch };
      expect(codeOf(() => parsePolicyRecord(JSON.stringify(obj)))).toBe(v.error);
      expect(codeOf(() => parsePolicyRecord(obj))).toBe(v.error);
    });
  }
  it('rejects non-JSON, oversize input and non-objects', () => {
    expect(codeOf(() => parsePolicyRecord('{'))).toBe('INVALID_INPUT');
    expect(codeOf(() => parsePolicyRecord('null'))).toBe('INVALID_INPUT');
    expect(codeOf(() => parsePolicyRecord('[]'))).toBe('INVALID_INPUT');
    expect(codeOf(() => parsePolicyRecord(' '.repeat(70_000)))).toBe('INVALID_INPUT');
  });
  it('buildPolicyRecord refuses a policy the meta-address does not commit to', () => {
    const a = acct('acct-001');
    expect(codeOf(() => buildPolicyRecord({ ...a, policy: { ...a.policy, delaySeconds: 3600n } }))).toBe('INVALID_POLICY');
  });
  it('buildPolicyRecord accepts limits in any order and with the tree prebuilt', () => {
    const a = acct('acct-001');
    const tree = buildLimitsTree(a.limits);
    expect(serializePolicyRecord(buildPolicyRecord({ ...a, limits: [...a.limits].reverse() }))).toBe(cv.records.valid[0]?.canonical);
    expect(tree.root).toBe(a.policy.limitsRoot);
  });
});

describe('policy recovery from candidates (vectors)', () => {
  for (const v of cv.records.candidateSearch) {
    it(v.id, () => {
      const found = findPolicyFromCandidates({
        policyHash: v.policyHash,
        destinations: v.destinations,
        delaySeconds: v.delaySeconds.map(BigInt),
        limitsRoots: v.limitsRoots,
      });
      expect(found).toEqual(v.expected === null ? null : { ...v.expected, delaySeconds: BigInt(v.expected.delaySeconds) });
    });
  }
  it('bounds the search space', () => {
    const many = Array.from({ length: 1001 }, (_, i) => BigInt(3600 + i));
    expect(
      codeOf(() =>
        findPolicyFromCandidates({ policyHash: ZERO_HASH, destinations: Array(101).fill(vectors.accounts[0]?.policy.destination) as Address[], delaySeconds: many, limitsRoots: [ZERO_HASH] }),
      ),
    ).toBe('INVALID_INPUT');
  });
});
