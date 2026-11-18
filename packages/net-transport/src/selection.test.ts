import { describe, expect, it } from 'vitest';
import { FIRST_USE_NOTICE, PROFILE_LABELS, PROFILE_VERIFICATION, TOR_BROWSER_NOTICE, UNVERIFIED_NOTICE } from './claims.js';
import { PROFILE_IDS } from './profile.js';
import { PURPOSES } from './credentials.js';
import {
  DEFAULT_WEB_NETWORK_SELECTION,
  checkOwnNodeRpcUrl,
  effectiveSelection,
  firstUseNotices,
  isNonDefaultSelection,
  parseWebNetworkSelection,
  profileForPurpose,
  type WebNetworkSelection,
} from './selection.js';

const SEPOLIA = { kind: 'evm', chainId: 11155111 } as const;
const ONION = 'http://2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion/';
const tor: WebNetworkSelection = { rpcProfile: 'direct', relayerProfile: 'tor-browser', rpcMode: 'single', noticeAcknowledged: true };

describe('TM14 unverified marking', () => {
  it('only direct is loopback-tested; Tor, onion, I2P, Nym and OHTTP are unverified in code and labels', () => {
    for (const id of PROFILE_IDS) {
      const want = id === 'direct' ? 'loopback-tested' : 'unverified';
      expect(PROFILE_VERIFICATION[id]).toBe(want);
      expect(PROFILE_LABELS[id].verification).toBe(want);
      if (want === 'unverified') {
        expect(PROFILE_LABELS[id].title).toMatch(/unverified/);
        expect(PROFILE_LABELS[id].doesNotHide[0]).toBe(UNVERIFIED_NOTICE);
      } else expect(PROFILE_LABELS[id].doesNotHide).not.toContain(UNVERIFIED_NOTICE);
    }
    expect(UNVERIFIED_NOTICE).not.toMatch(/anonym|untraceab|unlinkab/i);
  });
});

describe('TM14 web selection', () => {
  it('default is unchanged: direct everywhere, single RPC, no notice', () => {
    expect(parseWebNetworkSelection(undefined)).toBe(DEFAULT_WEB_NETWORK_SELECTION);
    expect(DEFAULT_WEB_NETWORK_SELECTION).toEqual({ rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'single', noticeAcknowledged: false });
    expect(isNonDefaultSelection(DEFAULT_WEB_NETWORK_SELECTION)).toBe(false);
    expect(firstUseNotices(DEFAULT_WEB_NETWORK_SELECTION)).toEqual([]);
    for (const p of PURPOSES) expect(profileForPurpose(DEFAULT_WEB_NETWORK_SELECTION, p)).toBe('direct');
  });

  it('parses a valid selection and rejects anything else as a whole', () => {
    expect(parseWebNetworkSelection(tor)).toEqual(tor);
    expect(parseWebNetworkSelection({ rpcMode: 'own-node' })).toEqual({ ...DEFAULT_WEB_NETWORK_SELECTION, rpcMode: 'own-node' });
    for (const bad of [null, [], 'x', { rpcProfile: 'tor-socks' }, { rpcProfile: 'ohttp' }, { rpcMode: 'quorum' }, { noticeAcknowledged: 'yes' }, { ...tor, extra: 1 }]) {
      expect(parseWebNetworkSelection(bad)).toBe(DEFAULT_WEB_NETWORK_SELECTION);
    }
  });

  it('routes relayer purposes and RPC purposes separately', () => {
    expect(profileForPurpose(tor, 'quote')).toBe('tor-browser');
    expect(profileForPurpose(tor, 'sweep')).toBe('tor-browser');
    expect(profileForPurpose(tor, 'submit')).toBe('tor-browser');
    expect(profileForPurpose(tor, 'scan-bulk')).toBe('direct');
    expect(profileForPurpose(tor, 'read-address')).toBe('direct');
    expect(profileForPurpose(tor, 'health')).toBe('direct');
  });

  it('a non-default selection applies only after the first-use notice is acknowledged', () => {
    const pending = { ...tor, noticeAcknowledged: false };
    expect(effectiveSelection(pending)).toBe(DEFAULT_WEB_NETWORK_SELECTION);
    expect(effectiveSelection(tor)).toBe(tor);
    expect(firstUseNotices(tor)).toEqual([FIRST_USE_NOTICE, TOR_BROWSER_NOTICE, UNVERIFIED_NOTICE]);
    expect(firstUseNotices({ ...DEFAULT_WEB_NETWORK_SELECTION, rpcMode: 'own-node' })).toEqual([FIRST_USE_NOTICE]);
  });

  it('own-node accepts only loopback or onion RPC URLs on testnets', () => {
    expect(checkOwnNodeRpcUrl('http://127.0.0.1:8545', SEPOLIA)).toMatch(/^http:\/\/127\.0\.0\.1:8545/);
    expect(checkOwnNodeRpcUrl(ONION, SEPOLIA)).toContain('.onion');
    expect(() => checkOwnNodeRpcUrl('https://rpc.example.org', SEPOLIA)).toThrow(/loopback or onion/);
    expect(() => checkOwnNodeRpcUrl('http://127.0.0.1:8545', { kind: 'evm', chainId: 1 })).toThrow(/not allowed/);
  });
});
