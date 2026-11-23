import { describe, expect, it } from 'vitest';
import { buildTipPageModel, type TipConfig } from './tip.js';
import { code, META_A, NOW } from './fixtures.testutil.js';

const config: TipConfig = {
  title: 'Tips',
  target: META_A,
  asset: 'ETH',
  decimals: 18,
  suggested: ['1'],
};

describe('tip suggested preset array boundaries', () => {
  it('rejects missing slots rather than emitting incomplete preset rows', () => {
    const onlyHole = Array<string>(1);
    const firstHole = Array<string>(2);
    firstHole[1] = '2';
    const middleHole = Array<string>(3);
    middleHole[0] = '1';
    middleHole[2] = '3';
    const finalHole = Array<string>(2);
    finalHole[0] = '1';

    for (const [label, suggested] of [
      ['only', onlyHole],
      ['first', firstHole],
      ['middle', middleHole],
      ['last', finalHole],
    ] as const) {
      expect(
        code(() => buildTipPageModel({ ...config, suggested }, { raised: '0' }, NOW)),
        label,
      ).toBe('TIP');
    }
  });

  it('preserves fully populated, ascending tip choices and their links', () => {
    const model = buildTipPageModel(
      { ...config, suggested: ['1', '2', '3'] },
      { raised: '0' },
      NOW,
    );
    expect(model.presets.map((preset) => preset.amount)).toEqual(['1', '2', '3']);
    expect(model.presets.every((preset) => preset.uri.startsWith('ghostpay:'))).toBe(true);
  });
});
