import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNetworkAuthority, type NetworkAuthorization, type NetworkAuthority, type NetworkAuthorizationRequest } from './networkAuthorization';
import { authorizedOperationFetch } from './networkOperation';

const authorities: NetworkAuthority[] = [];
afterEach(() => { for (const authority of authorities.splice(0)) authority.dispose(); });

function fixture() {
  const sent = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response('ok')));
  const network = createNetworkAuthority({ storage: () => ({ getItem: () => null }), fetchFn: sent });
  authorities.push(network);
  return { network, fetchFn: sent, sent };
}
const request = (endpoint: string, signal?: AbortSignal): NetworkAuthorizationRequest => ({
  action: 'btc-scan', category: 'rpc', network: { kind: 'btc', network: 'regtest' }, endpoint, match: 'prefix',
  ...(signal === undefined ? {} : { signal }),
});

describe('finite Bitcoin operation destinations', () => {
  it('dispatches only to the explicitly granted origin and path boundary', async () => {
    const h = fixture();
    const fetch = authorizedOperationFetch(h, [request('https://node.example/api')]);
    expect(await (await fetch('https://node.example/api/blocks/tip/height', {})).text()).toBe('ok');
    for (const forbidden of ['https://node.example/api-other', 'https://another.example/api', 'not-a-url']) {
      await expect(fetch(forbidden, {})).rejects.toThrow();
    }
    expect(h.sent).toHaveBeenCalledTimes(1);
    h.network.invalidate();
    await expect(fetch('https://node.example/api/blocks/tip/height', {})).rejects.toThrow();
    expect(h.sent).toHaveBeenCalledTimes(1);
  });

  it('selects the most specific prefix and never borrows an overlapping grant after cancellation', async () => {
    const h = fixture(); const narrow = new AbortController();
    const fetch = authorizedOperationFetch(h, [request('https://node.example/api'), request('https://node.example/api/source', narrow.signal)]);
    narrow.abort();
    await expect(fetch('https://node.example/api/source/height', {})).rejects.toThrow();
    expect(h.sent).not.toHaveBeenCalled();
    expect(await (await fetch('https://node.example/api/blocks/tip/height', {})).text()).toBe('ok');
    expect(h.sent).toHaveBeenCalledTimes(1);
  });

  it('does not expand an exact-URL grant into a prefix', async () => {
    const h = fixture();
    const fetch = authorizedOperationFetch(h, [{ ...request('https://node.example/one'), match: 'exact' }]);
    await expect(fetch('https://node.example/one/extra', {})).rejects.toThrow();
    expect(await (await fetch('https://node.example/one', {})).text()).toBe('ok');
    expect(h.sent).toHaveBeenCalledTimes(1);
  });

  it('disposes earlier grants when a later endpoint refuses construction', () => {
    const h = fixture(); const issued: NetworkAuthorization[] = [];
    const network: NetworkAuthority = { ...h.network, authorize: (input) => { const context = h.network.authorize(input); issued.push(context); return context; } };
    expect(() => authorizedOperationFetch({ ...h, network }, [request('https://node.example/api'), request('invalid')])).toThrow();
    expect(issued).toHaveLength(1);
    expect(issued[0]?.signal.aborted).toBe(true);
    expect(h.sent).not.toHaveBeenCalled();
  });

  it('preserves the explicitly injected test-service seam when no browser authority exists', () => {
    const fetchFn = vi.fn<ReturnType<typeof authorizedOperationFetch>>();
    expect(authorizedOperationFetch({ fetchFn }, [])).toBe(fetchFn);
  });
});
