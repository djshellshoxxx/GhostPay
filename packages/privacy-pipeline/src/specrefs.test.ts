import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHAIN_RULES } from './chainRules.js';
import { STEP_CATALOGUE } from './steps.js';

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, '..', '..', '..', 'docs', 'remote', 'privacy-specs');
const text = (file: string): string => readFileSync(join(specDir, file), 'utf8');

describe('spec references (PL-10): every cited id occurs in the cited file', () => {
  const refs: { who: string; file: string; id: string }[] = [];
  for (const r of CHAIN_RULES)
    if (r.specRef !== 'new')
      for (const id of r.specRef.ids) refs.push({ who: r.id, file: r.specRef.file, id });
  for (const [k, d] of Object.entries(STEP_CATALOGUE))
    for (const id of d.specRef.ids) refs.push({ who: k, file: d.specRef.file, id });
  it('has references to check', () => {
    expect(refs.length).toBeGreaterThan(40);
    expect(readdirSync(specDir)).toContain('chaining.md');
  });
  for (const r of refs) {
    it(`${r.who}: ${r.id} in ${r.file}`, () => {
      expect(text(r.file)).toContain(r.id);
    });
  }
  it('rules marked new in the spec table are the ones flagged isNew', () => {
    const spec = text('chaining.md');
    for (const id of ['C-04', 'C-06', 'C-07', 'C-14', 'C-34']) {
      expect(spec).toMatch(new RegExp(`\\| ${id} \\|[^\\n]*\\[new\\]`));
      expect(CHAIN_RULES.find((r) => r.id === id)?.isNew).toBe(true);
    }
  });
  it('every chain rule id from the spec table is either a rule here or documented as handled elsewhere', () => {
    const spec = text('chaining.md');
    const ids = [...spec.matchAll(/^\| (C-\d\d) \|/gm)].map((m) => m[1] as string);
    expect(ids).toHaveLength(35);
    const have = new Set(CHAIN_RULES.map((r) => r.id.slice(0, 4)));
    expect(ids.filter((i) => !have.has(i))).toEqual(['C-21', 'C-31', 'C-33']);
  });
});
