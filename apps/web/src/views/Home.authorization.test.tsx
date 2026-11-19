// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetworkAuthority, type NetworkAuthority } from '../lib/networkAuthorization';
import { clearSession } from '../lib/session';
import { makeServices, renderApp } from '../test/render';

const DIGEST = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const authorities: NetworkAuthority[] = [];
const elements: HTMLElement[] = [];

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/GhostPay/');
});
afterEach(() => {
  cleanup();
  for (const authority of authorities.splice(0)) authority.dispose();
  for (const element of elements.splice(0)) element.remove();
  vi.restoreAllMocks();
  clearSession();
});

function entry(src: string): void {
  const script = document.createElement('script');
  script.type = 'module';
  script.setAttribute('src', src);
  document.head.appendChild(script);
  elements.push(script);
}

function authority(fetchFn: (url: string, init: RequestInit) => Promise<Response>): NetworkAuthority {
  const network = createNetworkAuthority({ fetchFn, origin: () => window.location.origin });
  authorities.push(network);
  return network;
}

describe('Home release hash with production network authority', () => {
  it.each([false, true])('authorizes and hashes the exact document-relative entry under a project path (base element: %s)', async (withBase) => {
    if (withBase) {
      const base = document.createElement('base');
      base.setAttribute('href', '/GhostPay/nested/');
      document.head.appendChild(base);
      elements.push(base);
    }
    entry('./assets/index-home.js');
    const expected = `${window.location.origin}/GhostPay/${withBase ? 'nested/' : ''}assets/index-home.js`;
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response('abc')));
    const network = authority(fetchFn);
    const authorize = vi.fn(network.authorize);
    renderApp(makeServices({ network: { ...network, authorize }, fetchFn }));
    expect(authorize).toHaveBeenCalledWith({ action: 'release-hash', category: 'resource', endpoint: expected });
    expect(await screen.findByText(DIGEST)).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(expected, expect.objectContaining({
      credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
    }));
  });

  it('refuses a foreign module script without an unguarded fetch fallback', async () => {
    entry('https://foreign.example/assets/index.js');
    const fetchFn = vi.fn(() => Promise.resolve(new Response('abc')));
    renderApp(makeServices({ network: authority(fetchFn), fetchFn }));
    expect(await screen.findByText(/not available in this environment/)).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(DIGEST)).toBeNull();
  });

  it('revokes the pending resource grant when Home unmounts and ignores a late response', async () => {
    entry('./assets/index-home.js');
    let resolve!: (response: Response) => void;
    const response = new Promise<Response>((done) => { resolve = done; });
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => response);
    const rendered = renderApp(makeServices({ network: authority(fetchFn), fetchFn }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    const signal = fetchFn.mock.calls[0]?.[1].signal;
    expect(signal?.aborted).toBe(false);
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolve(new Response('abc')); await response; });
    expect(screen.queryByText(DIGEST)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
