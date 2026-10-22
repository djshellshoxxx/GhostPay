import { describe, expect, it } from 'vitest';
import { allShippedStrings, BANNED_PATTERN, BODY_POINTS, findBanned, LIMITATIONS, singleSweepLine, TITLE } from './labels.js';
import { previewCost } from './plan.js';
import { makePlan } from './helpers.testutil.js';

describe('labels', () => {
  it('title and all five body points present (HOP-UX-1)', () => {
    expect(TITLE).toBe('Delayed forwarding (weak)');
    expect(BODY_POINTS).toHaveLength(5);
    expect(BODY_POINTS[0]).toContain('follow your funds hop by hop');
    expect(BODY_POINTS[1]).toContain('delay and cost, not unlinkability');
    expect(BODY_POINTS[2]).toContain('Automated analysis links these hops easily');
    expect(BODY_POINTS[3]).toContain('sees each hop');
    expect(BODY_POINTS[4]).toContain('real unlinkability use a shared pool exit');
  });
  it('N1..N9 all present', () => {
    expect(LIMITATIONS).toHaveLength(9);
    LIMITATIONS.forEach((l, i) => expect(l.startsWith(`N${i + 1}:`)).toBe(true));
  });
  it('banned-word grep over every shipped string and generated previews (HOP-UX-3)', async () => {
    for (const s of allShippedStrings()) expect(findBanned(s), s).toBeNull();
    for (const over of [{}, { handoff: 'pool-exit' as const }, { relayers: [{ id: 'a', url: 'x' }] }]) {
      const { plan } = await makePlan(over);
      for (const t of previewCost(plan).text) expect(findBanned(t), t).toBeNull();
    }
    expect(singleSweepLine('1')).toContain('same unlinkability against the payer');
  });
  it('the grep itself works', () => {
    for (const w of ['anonymous', 'Anonymise', 'untraceable', 'mixing', 'launder', 'obfuscate', 'Private']) {
      expect(findBanned(`this is ${w} text`)).not.toBeNull();
      expect(BANNED_PATTERN.test(w)).toBe(true);
    }
    expect(findBanned('plain text')).toBeNull();
  });
});
