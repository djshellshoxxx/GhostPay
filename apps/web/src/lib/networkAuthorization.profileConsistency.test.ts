import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WEB_NETWORK_SELECTION, WEB_NETWORK_SELECTION_KEY } from '@ghostpay/net-transport/browser';
import { createNetworkAuthority, type NetworkAuthority } from './networkAuthorization';
import { loadNetworkSelection } from './networkSelection';
import { SETTINGS_KEY } from './settings';

const authorities: NetworkAuthority[] = [];
afterEach(() => { for (const authority of authorities.splice(0)) authority.dispose(); });
const endpoint = 'https://rpc.test/selected';

function fixture() {
  const values = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': endpoint } })]]);
  const storage = { getItem: (key: string): string | null => values.get(key) ?? null };
  const fetchFn = vi.fn(() => Promise.resolve(new Response('{}')));
  const authority = createNetworkAuthority({ storage: () => storage, fetchFn });
  authorities.push(authority);
  const authorize = () => authority.authorize({ action: 'scan', category: 'rpc', endpoint, network: { kind: 'evm', chainId: 84532 } });
  return { values, storage, fetchFn, authorize };
}

describe('shared browser profile validity', () => {
  it.each(['rpcProfile', 'relayerProfile', 'rpcMode', 'noticeAcknowledged', 'all'])('rejects a saved profile missing %s at both dispatch boundaries', (missing) => {
    const h = fixture();
    const previous = h.authorize();
    const partial: Record<string, unknown> = missing === 'all' ? {} : { ...DEFAULT_WEB_NETWORK_SELECTION };
    delete partial[missing];
    h.values.set(WEB_NETWORK_SELECTION_KEY, JSON.stringify(partial));
    expect(() => loadNetworkSelection(h.storage)).toThrow();
    expect(() => h.authorize()).toThrow();
    expect(() => previous.assertCurrent()).toThrow();
    expect(previous.signal.aborted).toBe(true);
    expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('allows a genuinely absent profile and a complete explicitly saved direct profile', () => {
    const h = fixture();
    expect(loadNetworkSelection(h.storage)).toEqual(DEFAULT_WEB_NETWORK_SELECTION);
    h.authorize().assertCurrent();
    h.values.set(WEB_NETWORK_SELECTION_KEY, JSON.stringify(DEFAULT_WEB_NETWORK_SELECTION));
    expect(loadNetworkSelection(h.storage)).toEqual(DEFAULT_WEB_NETWORK_SELECTION);
    h.authorize().assertCurrent();
    expect(h.fetchFn).not.toHaveBeenCalled();
  });
});
