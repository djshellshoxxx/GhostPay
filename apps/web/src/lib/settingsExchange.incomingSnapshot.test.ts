import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { applySettingsExchange, exportSettingsExchange, parseSettingsExchange, previewSettingsExchange } from './settingsExchange';

const CHAINS = [84532];
const PIN_A = `02${'ab'.repeat(32)}`;
const PIN_B = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

function setup() {
  const current: Settings = {
    ...DEFAULT_SETTINGS,
    rpcUrls: { '84532': 'https://before.example/' },
    rpcUrlsSecondary: { '84532': 'https://before-secondary.example/' },
    pinnedSigners: [PIN_B],
  };
  const source: Settings = {
    ...current, theme: 'dark',
    rpcUrls: { '84532': 'https://reviewed.example/' },
    rpcUrlsSecondary: { '84532': 'https://reviewed-secondary.example/' },
    pinnedSigners: [PIN_A],
  };
  const incoming = parseSettingsExchange(
    exportSettingsExchange(source, ['preferences', 'rpcUrls', 'rpcUrlsSecondary', 'pinnedSigners'], CHAINS),
    CHAINS,
  );
  const preview = previewSettingsExchange(current, incoming, CHAINS);
  return { current, incoming, preview };
}

describe('settings exchange: imported source cannot change a reviewed preview', () => {
  it('preserves reviewed preferences when the caller edits the parsed source object', () => {
    const { current, incoming, preview } = setup();
    if (incoming.preferences === undefined) throw new Error('missing preferences fixture');
    (incoming.preferences as { theme: 'system' | 'light' | 'dark' }).theme = 'light';

    expect(preview.preferences?.incoming.theme).toBe('dark');
    expect(preview.incoming.preferences?.theme).toBe('dark');
    expect(applySettingsExchange(current, preview, { preferences: true }).theme).toBe('dark');
  });

  it('preserves the primary RPC that the user reviewed and selected', () => {
    const { current, incoming, preview } = setup();
    if (incoming.rpcUrls === undefined) throw new Error('missing primary RPC fixture');
    (incoming.rpcUrls as Record<string, string>)['84532'] = 'https://unreviewed.example/';

    expect(preview.rpcUrls?.entries[0]?.incoming).toBe('https://reviewed.example/');
    expect(preview.incoming.rpcUrls?.['84532']).toBe('https://reviewed.example/');
    expect(applySettingsExchange(current, preview, { rpcUrls: true }).rpcUrls['84532']).toBe('https://reviewed.example/');
  });

  it('preserves the secondary RPC that the user reviewed and selected', () => {
    const { current, incoming, preview } = setup();
    if (incoming.rpcUrlsSecondary === undefined) throw new Error('missing secondary RPC fixture');
    (incoming.rpcUrlsSecondary as Record<string, string>)['84532'] = 'https://unreviewed.example/';

    expect(preview.rpcUrlsSecondary?.entries[0]?.incoming).toBe('https://reviewed-secondary.example/');
    expect(preview.incoming.rpcUrlsSecondary?.['84532']).toBe('https://reviewed-secondary.example/');
    expect(applySettingsExchange(current, preview, { rpcUrlsSecondary: true }).rpcUrlsSecondary['84532'])
      .toBe('https://reviewed-secondary.example/');
  });

  it('preserves the reviewed signer additions and removals after input mutation', () => {
    const { current, incoming, preview } = setup();
    if (incoming.pinnedSigners === undefined) throw new Error('missing signer fixture');
    (incoming.pinnedSigners as string[]).splice(0, 1, PIN_B);

    expect(preview.pinnedSigners?.added).toEqual([PIN_A]);
    expect(preview.pinnedSigners?.removed).toEqual([PIN_B]);
    expect(preview.incoming.pinnedSigners).toEqual([PIN_A]);
    expect(applySettingsExchange(current, preview, { addSigners: [PIN_A], removeSigners: true }).pinnedSigners)
      .toEqual([PIN_A]);
  });
});
