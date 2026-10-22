import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeVectors } from './vectors.testutil.js';

const FILE = fileURLToPath(new URL('../test-vectors/ph-vectors.json', import.meta.url));

describe('golden vectors shared with the Foundry tests', () => {
  it('match the committed JSON (set GEN_VECTORS=1 to rewrite it)', () => {
    const { withPm: _withPm, ...v } = computeVectors();
    void _withPm;
    if (process.env['GEN_VECTORS'] === '1') writeFileSync(FILE, `${JSON.stringify(v, null, 2)}\n`);
    const committed = JSON.parse(readFileSync(FILE, 'utf8')) as unknown;
    expect(JSON.parse(JSON.stringify(v))).toEqual(committed);
  });
});
