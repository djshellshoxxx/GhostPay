import { describe, expect, it } from 'vitest';
import * as api from './index.js';

describe('ux-sandbox compat re-export', () => {
  it('still resolves every legacy export name', () => {
    const names = [
      'SandboxError', 'MockChain', 'MockFaucet', 'Sandbox', 'MAX_TEST_AMOUNT', 'DEFAULT_FAUCET_CONFIG',
      'SANDBOX_I18N_KEYS', 'isTestAddress', 'isTestTxId', 'isTestProfileId', 'parseTestAddress', 'toTestAmount',
      'brandAddress', 'brandTxId', 'brandProfileId', 'toRealProfileId', 'containsTestData', 'assertNoTestData',
      'assertNoRealData', 'visualModeOf', 'initialModeState', 'transition', 'normalizeModeState', 'bannerFor',
      'readRandom', 'toHex', 'readClock', 'validateFaucetSource', 'buildFaucetGuidance', 'assertTestProfile',
      'assertRealProfile', 'assertSameDomain',
    ];
    for (const n of names) expect((api as Record<string, unknown>)[n], n).toBeDefined();
  });
  it('legacy SandboxError keeps kebab-case codes', () => {
    expect(() => api.parseTestAddress('nope')).toThrow(api.SandboxError);
  });
});
