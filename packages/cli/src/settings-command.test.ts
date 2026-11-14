import { describe, expect, it } from 'vitest';
import { run } from './run.js';
import { makeIo, stdoutJson } from './fixtures.testutil.js';

const preferences = { delayMinSec: 120, delayMaxSec: 900, lockTimeoutMin: 15, theme: 'system', autoClearFragment: true };
const envelope = { format: 'ghostpay-settings', v: 1, settings: preferences };

describe('safe settings configuration preflight', () => {
  it('validates the existing GUI exchange without applying browser preferences or endpoint trust', async () => {
    const io = makeIo({ 'settings.json': JSON.stringify(envelope) });
    expect(await run(['config', 'validate', '--kind', 'settings', '--in', 'settings.json', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, kind: 'settings', settings: preferences, configurationOnly: true,
      browserStorageChanged: false, applied: false, networkContacted: false, paymentVerified: false });
    expect(io.files.size).toBe(1);
  });

  it.each([
    { rpcUrls: { 1: 'https://private.example/API_TOKEN' } }, { rpcUrlsSecondary: {} }, { relayerUrl: 'https://private.example' },
    { pinnedSigners: ['PRIVATE_TOKEN'] }, { spendingKey: 'PRIVATE_TOKEN' }, { theme: 'neon' }, { autoClearFragment: 1 },
    { delayMinSec: -1 }, { delayMinSec: 901 }, { delayMaxSec: 86_401 }, { delayMaxSec: 1.5 },
    { lockTimeoutMin: 0 }, { lockTimeoutMin: 241 },
  ])('rejects unsupported or out-of-bounds settings without echoing their content', async (change) => {
    const io = makeIo({ 'settings.json': JSON.stringify({ ...envelope, settings: { ...preferences, ...change } }) });
    expect(await run(['config', 'validate', '--kind', 'settings', '--in', 'settings.json', '--json'], io)).toBe(6);
    expect(io.err.join('')).toContain('CONFIG_INVALID');
    expect(io.out.join('') + io.err.join('')).not.toMatch(/PRIVATE_TOKEN|private\.example|API_TOKEN/);
  });

  it.each(['{"v":1,"v":1}', JSON.stringify({ ...envelope, v: 2 }), ' '.repeat(4097)])('rejects malformed, future or oversized exchange documents', async (text) => {
    const io = makeIo({ settings: text });
    expect(await run(['config', 'validate', '--kind', 'settings', '--in', 'settings', '--json'], io)).toBe(6);
    expect(io.out).toHaveLength(0);
  });
});
