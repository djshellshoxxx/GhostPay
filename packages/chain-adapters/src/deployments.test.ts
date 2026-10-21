import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { MAX_MANIFEST_BYTES, loadDeployment, validateManifest } from './deployments.js';
import { ChainAdapterError } from './errors.js';
import { FAKE, manifestJson } from './fixtures.testutil.js';

const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../../deployments/schema.json', import.meta.url)), 'utf8')) as {
  required: string[];
  properties: Record<string, unknown>;
};
const CHAIN = 11155111;
const mut = (f: (m: Record<string, unknown>) => void): Record<string, unknown> => {
  const m = manifestJson();
  f(m);
  return m;
};
const rejects = (v: unknown, re?: RegExp): void => {
  expect(() => validateManifest(v, CHAIN)).toThrow(re ?? ChainAdapterError);
};

describe('validateManifest', () => {
  it('accepts a synthetic manifest and checksums addresses', () => {
    const m = validateManifest(manifestJson(), CHAIN);
    expect(m.router).toBe(FAKE.router);
    expect(m.feeBps).toBe(25);
    expect(m.signature).toBeUndefined();
    expect(validateManifest({ ...manifestJson(), signature: '0xabcd' }, CHAIN).signature).toBe('0xabcd');
  });
  it('is in sync with deployments/schema.json (keys and required)', () => {
    const keys = Object.keys(manifestJson()).sort();
    expect(keys).toEqual([...schema.required].sort());
    expect(Object.keys(schema.properties).sort()).toEqual(
      [...keys, 'signature', 'donationRecipient', 'policyImplementation', 'policyFactory', 'policyFeeToken', 'policyFlatFee', 'policyFeeRecipient'].sort(),
    );
  });
  it('rejects chainId mismatch with CHAIN_MISMATCH', () => {
    expect(() => validateManifest(manifestJson(84532), CHAIN)).toThrow(/CHAIN_MISMATCH/);
    rejects(mut((m) => (m['chainId'] = 0)));
    rejects(mut((m) => (m['chainId'] = '11155111')));
    rejects(mut((m) => (m['chainId'] = 1.5)));
  });
  it('rejects feeBps != 25', () => {
    for (const v of [0, 24, 26, 10_000, '25', 25.0001]) rejects(mut((m) => (m['feeBps'] = v)), /feeBps/);
  });
  it('rejects zero, malformed and wrongly-checksummed addresses', () => {
    for (const k of ['announcer', 'router', 'sweepRelayer', 'feeRecipient']) {
      rejects(mut((m) => (m[k] = '0x0000000000000000000000000000000000000000')), /zero address/);
      rejects(mut((m) => (m[k] = '0x12')));
      rejects(mut((m) => (m[k] = 5)));
      rejects(mut((m) => (m[k] = '0xAbCdEf0000000000000000000000000000000001')));
      rejects(mut((m) => delete m[k]), /missing/);
    }
  });
  it('donationRecipient is optional: absent means undefined, present is checksummed', () => {
    expect(validateManifest(manifestJson(), CHAIN).donationRecipient).toBeUndefined();
    const don = '0x0000000000000000000000000000000000000e55';
    const m = validateManifest({ ...manifestJson(), donationRecipient: don }, CHAIN);
    expect(m.donationRecipient).toBe(getAddress(don));
  });
  it('rejects a bad donationRecipient (zero, malformed, wrong checksum, non-string, contract collision)', () => {
    rejects(mut((m) => (m['donationRecipient'] = '0x0000000000000000000000000000000000000000')), /zero address/);
    rejects(mut((m) => (m['donationRecipient'] = '0x12')));
    rejects(mut((m) => (m['donationRecipient'] = 5)));
    rejects(mut((m) => (m['donationRecipient'] = '0xAbCdEf0000000000000000000000000000000001')));
    for (const k of ['router', 'sweepRelayer', 'announcer']) rejects(mut((m) => (m['donationRecipient'] = m[k])), /collides/);
  });
  it('rejects role collisions', () => {
    rejects(mut((m) => (m['router'] = m['sweepRelayer'])), /distinct/);
    rejects(mut((m) => (m['announcer'] = m['router'])), /distinct/);
    rejects(mut((m) => (m['feeRecipient'] = m['router'])), /collides/);
    rejects(mut((m) => (m['feeRecipient'] = m['sweepRelayer'])), /collides/);
  });
  it('rejects unknown keys at every level', () => {
    rejects(mut((m) => (m['extra'] = 1)), /unknown key/);
    rejects(mut((m) => ((m['deployTx'] as Record<string, unknown>)['x'] = '0x')), /unknown key/);
    rejects(mut((m) => ((m['bytecodeHashes'] as Record<string, unknown>)['x'] = '0x')), /unknown key/);
  });
  it('rejects non-objects and non-plain objects', () => {
    rejects(null);
    rejects([]);
    rejects('x');
    rejects(Object.create({ chainId: 1 }));
    rejects(mut((m) => (m['deployTx'] = null)));
  });
  it('rejects bad hashes, commit, solc, date, signature', () => {
    rejects(mut((m) => ((m['deployTx'] as Record<string, unknown>)['router'] = `0x${'0'.repeat(64)}`)), /deployTx/);
    rejects(mut((m) => ((m['bytecodeHashes'] as Record<string, unknown>)['sweepRelayer'] = '0x12')), /bytecodeHashes/);
    rejects(mut((m) => (m['commit'] = 'A'.repeat(40))), /commit/);
    rejects(mut((m) => (m['commit'] = 'a'.repeat(39))), /commit/);
    rejects(mut((m) => (m['solcVersion'] = '0.7.6')), /solc/);
    rejects(mut((m) => (m['solcVersion'] = 5)), /solc/);
    rejects(mut((m) => (m['date'] = 'yesterday')), /date/);
    rejects(mut((m) => (m['date'] = '2026-13-45T99:99:99Z')), /date/);
    rejects(mut((m) => (m['signature'] = 'nothex')), /signature/);
    rejects(mut((m) => (m['signature'] = 5)), /signature/);
  });
});

describe('loadDeployment', () => {
  it('parses JSON text', () => {
    expect(loadDeployment(JSON.stringify(manifestJson()), CHAIN).chainId).toBe(CHAIN);
  });
  it('rejects bad JSON, oversize, __proto__ keys and non-strings', () => {
    expect(() => loadDeployment('{nope', CHAIN)).toThrow(/json/);
    expect(() => loadDeployment(' '.repeat(MAX_MANIFEST_BYTES + 1), CHAIN)).toThrow(/size/);
    expect(() => loadDeployment(JSON.stringify(manifestJson()).replace('{', '{"__proto__":{"a":1},'), CHAIN)).toThrow(ChainAdapterError);
    expect(() => loadDeployment(5 as unknown as string, CHAIN)).toThrow(/size/);
  });
});

describe('validateManifest policy section', () => {
  const policy = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const m = manifestJson();
    const h = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
    m['policyImplementation'] = '0x00000000000000000000000000000000000000a1';
    m['policyFactory'] = '0x00000000000000000000000000000000000000a2';
    m['policyFeeToken'] = '0x00000000000000000000000000000000000000a3';
    m['policyFlatFee'] = '3000000';
    m['policyFeeRecipient'] = '0x00000000000000000000000000000000000000a4';
    (m['deployTx'] as Record<string, unknown>)['policyImplementation'] = h(11);
    (m['deployTx'] as Record<string, unknown>)['policyFactory'] = h(12);
    (m['bytecodeHashes'] as Record<string, unknown>)['policyImplementation'] = h(13);
    (m['bytecodeHashes'] as Record<string, unknown>)['policyFactory'] = h(14);
    Object.assign(m, extra);
    return m;
  };
  it('accepts a complete policy section', () => {
    const m = validateManifest(policy(), CHAIN);
    expect(m.policy?.flatFee).toBe(3_000_000n);
    expect(validateManifest(manifestJson(), CHAIN).policy).toBeUndefined();
  });
  it('rejects partial, malformed or colliding policy sections', () => {
    const partial = policy();
    delete partial['policyFlatFee'];
    rejects(partial);
    rejects(policy({ policyFlatFee: '03' }));
    rejects(policy({ policyFlatFee: 3 }));
    rejects(policy({ policyFlatFee: (2n ** 256n).toString() }));
    rejects(policy({ policyFactory: '0x00000000000000000000000000000000000000a1' }));
    rejects(policy({ policyFactory: String(manifestJson()['router']) }));
    rejects(policy({ policyFeeRecipient: '0x00000000000000000000000000000000000000a2' }));
    const noTx = policy();
    delete (noTx['deployTx'] as Record<string, unknown>)['policyFactory'];
    rejects(noTx);
  });
});
