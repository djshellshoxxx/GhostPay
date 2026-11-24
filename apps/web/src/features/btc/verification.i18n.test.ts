import { describe, expect, it } from 'vitest';
import { SOURCE_TRANSLATOR } from '../../i18n/source';
import { SECURITY_KEYS } from '../../i18n/securityKeys';
import { SCAN_CHECKS, SCAN_CHECK_KEYS, SCAN_LIMITS, SCAN_LIMIT_KEYS, SCAN_MODES, SCAN_MODE_KEYS } from './verification';

describe('Bitcoin scan disclosure source parity', () => {
  it('preserves every verification limit and data-source disclosure exactly in the approved source catalog', () => {
    expect(SCAN_CHECK_KEYS.map((key) => SOURCE_TRANSLATOR.t(key))).toEqual(SCAN_CHECKS);
    expect(SCAN_LIMIT_KEYS.map((key) => SOURCE_TRANSLATOR.t(key))).toEqual(SCAN_LIMITS);
    expect(SCAN_MODE_KEYS.map((mode) => Object.fromEntries(Object.entries(mode).map(([field, key]) => [field, SOURCE_TRANSLATOR.t(key)])))).toEqual(SCAN_MODES);
    const keys = [...SCAN_CHECK_KEYS, ...SCAN_LIMIT_KEYS, ...SCAN_MODE_KEYS.flatMap((mode) => Object.values(mode))];
    expect(keys).toHaveLength(21);
    for (const key of keys) expect(SECURITY_KEYS.has(key), key).toBe(true);
  });
});
