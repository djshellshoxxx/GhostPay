// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { toFunctionSelector } from 'viem';
import { createDefaultServices } from '../lib/defaultServices';
import { buildInvoiceLink } from '../lib/invoiceCreate';
import type { NetworkAuthority, NetworkAuthorization } from '../lib/networkAuthorization';
import type { Services } from '../lib/services';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { FAKE_ANNOUNCER, FAKE_ROUTER, FAKE_SWEEP_RELAYER } from '../test/fakeManifest';
import { BASE_FORM, makeParsed, NOW } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';

interface RpcRequest {
  readonly id: number;
  readonly method: string;
  readonly params: readonly unknown[];
}

const manifestReads: readonly RpcRequest[] = [
  { id: 2, method: 'eth_call', params: [{ to: FAKE_ROUTER, data: toFunctionSelector('FEE_RECIPIENT()') }, 'latest'] },
  { id: 3, method: 'eth_call', params: [{ to: FAKE_ROUTER, data: toFunctionSelector('ANNOUNCER()') }, 'latest'] },
  { id: 4, method: 'eth_call', params: [{ to: FAKE_ROUTER, data: toFunctionSelector('FEE_BPS()') }, 'latest'] },
  { id: 5, method: 'eth_getCode', params: [FAKE_ROUTER, 'latest'] },
  { id: 6, method: 'eth_getCode', params: [FAKE_SWEEP_RELAYER, 'latest'] },
  { id: 7, method: 'eth_getCode', params: [FAKE_ANNOUNCER, 'latest'] },
];

let network: NetworkAuthority | undefined;
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  setHash('');
});
afterEach(() => {
  network?.dispose();
  network = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSession();
});

it('finishes six replacement manifest reads before Continue is enabled, then releasing the revoked request sends nothing', async () => {
  const form = { ...BASE_FORM, token: 'native', tokenAmount: '0.5', encrypt: true };
  const original = await makeParsed(form);
  const replacement = await buildInvoiceLink({ ...form, lineItems: [{ description: 'Replacement network invoice', quantity: '1', unitPrice: '100.00' }] }, 'https://app.test/', NOW);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test/' } }));
  setHash(original.fragment);
  const requests: RpcRequest[] = [];
  const signals: (AbortSignal | null | undefined)[] = [];
  let rejectOldFetch!: (reason: Error) => void;
  const oldFetch = new Promise<Response>((_resolve, reject) => { rejectOldFetch = reject; });
  let chainChecks = 0;
  let completedChainChecks = 0;
  const backend = withManifestChain(mockRpc(84532, (method) => { throw new Error(`Unexpected RPC method: ${method}`); }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit): Promise<Response> => {
    expect(url).toBe('https://rpc.test/');
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as RpcRequest;
    requests.push({ id: body.id, method: body.method, params: body.params });
    signals.push(init.signal);
    if (body.method === 'eth_chainId') {
      if (++chainChecks === 2) return oldFetch; // Deliberately ignore abort until the old route is released.
      completedChainChecks++;
    }
    const result = body.method === 'eth_chainId' ? '0x14a34' : await backend.request(body.method, body.params);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  }));
  const defaults = createDefaultServices();
  const authority = defaults.network;
  if (authority === undefined) throw new Error('Expected the production network authority');
  network = authority;
  const grants: NetworkAuthorization[] = [];
  const requestOwners: NetworkAuthorization[] = [];
  let renewedSettled = false;
  let replacementChecked = false;
  let releaseReplacement!: () => void;
  const replacementDelivery = new Promise<void>((resolve) => { releaseReplacement = resolve; });
  const createRpc: Services['createRpc'] = async (chain, url, grant) => {
    if (grant === undefined) throw new Error('Expected an operation grant');
    const operation = grants.push(grant);
    try {
      const client = await defaults.createRpc(chain, url, grant);
      if (operation === 3) {
        replacementChecked = true;
        // Pause only delivery of the verified replacement client, preserving the real RPC and authorization path.
        await replacementDelivery;
      }
      return {
        ...client,
        request(method: string, params: readonly unknown[]): Promise<unknown> {
          requestOwners.push(grant);
          return client.request(method, params);
        },
      };
    } finally {
      if (operation === 2) renewedSettled = true;
    }
  };
  renderApp(makeServices({ network: authority, createRpc, loadManifest: () => Promise.resolve({ status: 'loaded', manifest: backedManifest(84532) }) }));
  const user = userEvent.setup();
  const continueButton = (): HTMLButtonElement => screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' });
  await waitFor(() => { expect(continueButton().disabled).toBe(false); });
  expect(requests).toEqual([{ id: 1, method: 'eth_chainId', params: [] }, ...manifestReads]);

  await user.click(screen.getByRole('button', { name: 'Cancel network activity' }));
  await user.click(screen.getByRole('button', { name: 'Review network access for this invoice' }));
  await waitFor(() => { expect(requests).toHaveLength(8); });
  expect(signals[7]?.aborted).toBe(false);
  await act(async () => {
    setHash(replacement.fragment);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
  });
  await waitFor(() => { expect(replacementChecked && renewedSettled).toBe(true); });
  expect(screen.getByText('Replacement network invoice')).toBeTruthy();
  expect(continueButton().disabled).toBe(true);
  expect(signals[7]?.aborted).toBe(true);
  expect(grants[1]?.signal.aborted).toBe(true);
  expect(grants[2]?.signal.aborted).toBe(false);
  expect(completedChainChecks).toBe(2);
  expect(requests).toHaveLength(9);
  const beforeContextReady = requests.length;
  const ownerOffset = requestOwners.length;

  await act(async () => { releaseReplacement(); await replacementDelivery; });
  await waitFor(() => { expect(continueButton().disabled).toBe(false); });
  // The six new requests belong to the replacement grant, while the old route is still held and already revoked.
  expect(requests.slice(beforeContextReady)).toEqual(manifestReads);
  const replacementOwners = requestOwners.slice(ownerOffset);
  expect(replacementOwners).toHaveLength(6);
  expect(replacementOwners.every((grant) => grant === grants[2])).toBe(true);
  expect(completedChainChecks).toBe(2);
  const beforeOldRelease = requests.length;
  const completedRequests = [...requests];

  await act(async () => {
    rejectOldFetch(new TypeError('Synthetic failed old request'));
    await oldFetch.catch(() => undefined);
  });
  expect(requests).toHaveLength(beforeOldRelease);
  expect(requests).toEqual(completedRequests);
  expect(completedChainChecks).toBe(2);
  expect(grants).toHaveLength(3);
  expect(continueButton().disabled).toBe(false);
  expect(screen.getByText('Replacement network invoice')).toBeTruthy();
});
