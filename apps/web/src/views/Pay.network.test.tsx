// @vitest-environment jsdom
import type { RpcClient } from '@ghostpay/chain-adapters';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildInvoiceLink } from '../lib/invoiceCreate';
import type { ManifestState } from '../lib/manifest';
import { createNetworkAuthority, type NetworkAuthority, type NetworkAuthorization } from '../lib/networkAuthorization';
import type { Services } from '../lib/services';
import { clearSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { BASE_FORM, makeParsed, NOW } from '../test/invoiceFixtures';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp, setHash } from '../test/render';

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
  clearSession();
});

it('replacing an invoice revokes its renewed preflight and waits for the current manifest before one new grant', async () => {
  const original = await makeParsed();
  const replacement = await buildInvoiceLink({ ...BASE_FORM, lineItems: [{ description: 'Replacement network invoice', quantity: '1', unitPrice: '100.00' }] }, 'https://app.test/', NOW);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test/' } }));
  setHash(original.fragment);
  const authority = createNetworkAuthority();
  network = authority;
  const readyRpc = withManifestChain(mockRpc(84532, () => '0x'));
  let releaseOldRpc!: (rpc: RpcClient) => void;
  const oldRpc = new Promise<RpcClient>((resolve) => { releaseOldRpc = resolve; });
  let releaseManifest!: (manifest: ManifestState) => void;
  const nextManifest = new Promise<ManifestState>((resolve) => { releaseManifest = resolve; });
  const loadManifest = vi.fn<Services['loadManifest']>()
    .mockResolvedValueOnce({ status: 'loaded', manifest: backedManifest(84532) })
    .mockReturnValueOnce(nextManifest);
  const grants: NetworkAuthorization[] = [];
  const createRpc = vi.fn<Services['createRpc']>((chain, url, grant) => {
    authority.assertRpcAuthorization(grant, chain.chainId, url);
    if (grant === undefined) throw new Error('Expected a preflight authorization');
    grants.push(grant);
    return grants.length === 2 ? oldRpc : Promise.resolve(readyRpc);
  });
  renderApp(makeServices({ network: authority, loadManifest, createRpc }));
  const user = userEvent.setup();
  await screen.findByText('Seller receives (net)');
  expect(createRpc).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole('button', { name: 'Cancel network activity' }));
  await user.click(screen.getByRole('button', { name: 'Review network access for this invoice' }));
  expect(createRpc).toHaveBeenCalledTimes(2);
  expect(grants[1]?.signal.aborted).toBe(false);

  await act(async () => {
    setHash(replacement.fragment);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
  });
  await waitFor(() => { expect(loadManifest).toHaveBeenCalledTimes(2); });
  expect(grants[1]?.signal.aborted).toBe(true);
  // No provisional preflight against the previous invoice's cached manifest.
  expect(createRpc).toHaveBeenCalledTimes(2);

  await act(async () => { releaseManifest({ status: 'loaded', manifest: backedManifest(84532) }); await nextManifest; });
  await screen.findByText('Seller receives (net)');
  expect(screen.getByText('Replacement network invoice')).toBeTruthy();
  expect(createRpc).toHaveBeenCalledTimes(3);
  expect(grants[2]?.signal.aborted).toBe(false);

  await act(async () => { releaseOldRpc(readyRpc); await oldRpc; });
  expect(createRpc).toHaveBeenCalledTimes(3);
  expect(screen.getByText('Replacement network invoice')).toBeTruthy();
});
