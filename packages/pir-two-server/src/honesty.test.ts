import { describe, expect, it } from 'vitest';
import { PIR2_CLAIMS, SAME_OPERATOR_NOTICE } from './honesty.js';

describe('honesty text', () => {
  const all = JSON.stringify(PIR2_CLAIMS) + SAME_OPERATOR_NOTICE;
  it('states non-collusion and the not-protected items', () => {
    expect(PIR2_CLAIMS.trustAssumption).toMatch(/two independent operators/);
    expect(PIR2_CLAIMS.noCollusionNotice).toMatch(/do not collude/);
    const dnh = PIR2_CLAIMS.doesNotHide.join(' ');
    for (const p of [/IP address/, /That you use PIR/, /on-chain/, /collude/, /malicious server/, /Timing/]) expect(dnh).toMatch(p);
    expect(SAME_OPERATOR_NOTICE).toMatch(/NO privacy/);
  });
  it('never uses forbidden marketing words', () => {
    expect(all).not.toMatch(/anonym|untraceable|\bmix(er|ing)?\b/i);
  });
});
