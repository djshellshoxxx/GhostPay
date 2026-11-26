import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import {
  applySettingsExchange, exportSettingsExchange, parseSettingsExchange, previewSettingsExchange,
} from './settingsExchange';

const SIGNER = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const EXTRA_SIGNER = `02${'ab'.repeat(32)}`;

/** Deliberately mutable backing structures: a preview must not share its stale-check snapshot with them. */
function setup(): { current: Settings; preview: ReturnType<typeof previewSettingsExchange> } {
  const current: Settings = {
    ...DEFAULT_SETTINGS,
    rpcUrls: { '84532': 'https://primary.example/' },
    rpcUrlsSecondary: { '84532': 'https://secondary.example/' },
    pinnedSigners: [SIGNER],
  };
  const incoming = parseSettingsExchange(
    exportSettingsExchange({ ...current, theme: 'dark' }, ['preferences']),
  );
  return { current, preview: previewSettingsExchange(current, incoming, []) };
}

describe('settings-exchange stale preview snapshots', () => {
  it.each(['preference', 'primary RPC', 'secondary RPC', 'pinned signer'] as const)(
    'refuses applying a preview after in-place %s changes',
    (kind) => {
      const { current, preview } = setup();
      switch (kind) {
        case 'preference':
          Object.assign(current, { theme: 'light' });
          break;
        case 'primary RPC':
          (current.rpcUrls as Record<string, string>)['84532'] = 'https://changed.example/';
          break;
        case 'secondary RPC':
          (current.rpcUrlsSecondary as Record<string, string>)['84532'] = 'https://changed.example/';
          break;
        case 'pinned signer':
          (current.pinnedSigners as string[]).push(EXTRA_SIGNER);
          break;
      }
      expect(() => applySettingsExchange(current, preview, { preferences: true })).toThrow(/Nothing was changed/);
    },
  );

  it('accepts an unchanged equivalent settings value without requiring object identity', () => {
    const { current, preview } = setup();
    expect(preview.basis).toEqual(current);
    const equivalent: Settings = {
      ...current,
      rpcUrls: { ...current.rpcUrls },
      rpcUrlsSecondary: { ...current.rpcUrlsSecondary },
      pinnedSigners: [...current.pinnedSigners],
    };
    expect(applySettingsExchange(equivalent, preview, { preferences: true })).toEqual({
      ...equivalent,
      theme: 'dark',
    });
  });
});
