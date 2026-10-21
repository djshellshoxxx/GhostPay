import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    expect(Object.keys(schema.properties).sort()).toEqual([...keys, 'signature'].sort());
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
