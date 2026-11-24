import { describe, expect, it } from 'vitest';
import { hasControlOrInvisible, isMixedScript, scriptsOf } from './text.js';

describe('Japanese shared-script letters', () => {
  it.each(['コーヒー', 'らーめん', 'ｺｰﾋｰ', 'あ〱', '東京カフェ'])(
    'classifies %s as one CJK script group',
    (value) => {
      expect([...scriptsOf(value)]).toEqual(['CJK']);
      expect(isMixedScript(value)).toBe(false);
    },
  );

  it.each(['pаy', 'A東京', 'Aー'])('preserves mixed-script detection for %s', (value) => {
    expect(isMixedScript(value)).toBe(true);
  });

  it('preserves punctuation, controls and other script handling', () => {
    expect([...scriptsOf('123・!?')]).toEqual([]);
    expect(hasControlOrInvisible('a\u200b')).toBe(true);
    expect([...scriptsOf('ไทย')]).toEqual(['Thai']);
  });
});
