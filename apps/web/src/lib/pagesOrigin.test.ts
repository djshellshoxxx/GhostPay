import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockWallet, MOCK_ACCOUNT } from '../test/mockWallet';
import { connectWallet, sendViaWallet, signTypedDataViaWallet, type WalletInfo } from './wallet';
import { loadBundledManifest } from './manifest';
import { fakeManifestJson } from '../test/fakeManifest';

const approved = 'https://pay.example:8443';
const explanation = /hosting origin/i;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Pages payment origin', () => {
  it.each(['http://pay.example:8443', 'https://copy.example:8443', 'https://pay.example:8444', 'https://pay.example'])(
    'refuses every wallet interaction on %s, including saved sessions', async (origin) => {
      vi.stubEnv('VITE_GHOSTPAY_PAGES_ORIGIN', approved);
      vi.stubGlobal('location', new URL(origin + '/GhostPay/'));
      vi.stubGlobal('origin', origin);
      const provider = new MockWallet();
      const wallet: WalletInfo = { id: 'fixture', name: 'Fixture', kind: 'injected', provider };
      const disclosure = vi.fn(() => Promise.resolve({ assertCurrent() {} }));
      const session = { wallet, account: MOCK_ACCOUNT, chainId: 84532, disclosure } as const;
      await expect(connectWallet(wallet, 84532, undefined, undefined, { disclosure })).rejects.toThrow(explanation);
      await expect(sendViaWallet(session, { to: MOCK_ACCOUNT, value: 0n, data: '0x' })).rejects.toThrow(explanation);
      await expect(signTypedDataViaWallet(session, '{}')).rejects.toThrow(explanation);
      expect(disclosure).not.toHaveBeenCalled();
      expect(provider.calls).toHaveLength(0);
      const state = loadBundledManifest(84532, { '84532': fakeManifestJson(84532) });
      expect(state.status === 'invalid' && state.reason).toMatch(explanation);
    },
  );

  it('refuses an opaque browsing context even if its URL has the approved origin', async () => {
    vi.stubEnv('VITE_GHOSTPAY_PAGES_ORIGIN', approved);
    vi.stubGlobal('location', new URL(approved + '/GhostPay/'));
    vi.stubGlobal('origin', 'null');
    const provider = new MockWallet();
    await expect(connectWallet({ id: 'fixture', name: 'Fixture', kind: 'injected', provider }, 84532)).rejects.toThrow(explanation);
    expect(provider.calls).toHaveLength(0);
  });

  it('allows a wallet on the approved origin under a project subpath and preserves the signature gate', async () => {
    vi.stubEnv('VITE_GHOSTPAY_PAGES_ORIGIN', approved);
    vi.stubGlobal('location', new URL(approved + '/GhostPay/'));
    vi.stubGlobal('origin', approved);
    const provider = new MockWallet();
    const session = await connectWallet({ id: 'fixture', name: 'Fixture', kind: 'injected', provider }, 84532);
    expect(session.account).toBe(MOCK_ACCOUNT);
    expect(provider.calls.map(({ method }) => method)).toContain('eth_requestAccounts');
    const state = loadBundledManifest(84532, { '84532': fakeManifestJson(84532) }, ['02' + '11'.repeat(32)]);
    expect(state.status === 'invalid' && state.reason).toMatch(/signature/);
    expect(loadBundledManifest(84532, {})).toEqual({ status: 'absent' });
  });
});
