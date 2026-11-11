import { describe, expect, it } from 'vitest';
import { BUILD_PROFILE, profileFromDefine, resolveProfile, type BuildProfile } from './buildProfile';

const values: readonly (BuildProfile | undefined)[] = [undefined, 'full', 'lean'];

describe('resolveProfile (narrow-only)', () => {
  for (const explicit of values) {
    for (const shell of values) {
      for (const build of ['full', 'lean'] as const) {
        const expected = explicit === 'lean' || shell === 'lean' || build === 'lean' ? 'lean' : 'full';
        it(`(${String(explicit)}, ${String(shell)}, ${build}) -> ${expected}`, () => {
          expect(resolveProfile(explicit, shell, build)).toBe(expected);
        });
      }
    }
  }

  it('an explicit full prop never widens a lean build or a lean shell', () => {
    expect(resolveProfile(undefined, 'full', 'lean')).toBe('lean');
    expect(resolveProfile('full', 'lean', 'full')).toBe('lean');
    expect(resolveProfile('full', undefined, 'lean')).toBe('lean');
    expect(resolveProfile('full', 'full', 'full')).toBe('full');
  });
});

describe('profileFromDefine (fail closed)', () => {
  it.each([
    [undefined, 'lean'],
    ['lean', 'lean'],
    ['full', 'full'],
    ['FULL', 'lean'],
    ['', 'lean'],
    [null, 'lean'],
    [1, 'lean'],
  ] as const)('%j -> %s', (raw, expected) => {
    expect(profileFromDefine(raw)).toBe(expected);
  });

  it('is pinned to full under the unit-test config', () => {
    expect(BUILD_PROFILE).toBe('full');
  });
});
