// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { DEFAULT_WEB_NETWORK_SELECTION, WEB_NETWORK_SELECTION_KEY } from '@ghostpay/net-transport/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import { createNetworkAuthority, type NetworkAuthority, type NetworkAuthorization } from '../lib/networkAuthorization';
import { TEST_N, captureDownloads } from '../lib/paymentKeyExport.testutil';
import * as scanClient from '../lib/scanClient';
import { SCAN_PRIVACY_KEY } from '../lib/scanPrivacy';
import { clearSession, generateSession } from '../lib/session';
import type { Services } from '../lib/services';
import { SETTINGS_KEY } from '../lib/settings';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderApp } from '../test/render';

const VAULT_PASS = 'violet comet maple lantern';
const RPC = 'https://rpc.test';
const PRIVATE_RPC = 'http://127.0.0.1:8545/private';
const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });
const authorities: NetworkAuthority[] = [];
let downloads: ReturnType<typeof captureDownloads>;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  downloads = captureDownloads();
});
afterEach(() => {
  cleanup();
  for (const authority of authorities.splice(0)) authority.dispose();
  downloads.restore();
  setKeyVaultStoreForTests(undefined);
  vi.restoreAllMocks();
  clearSession();
});

/** The real authority guards every synthetic RPC call, including a client returned by an earlier scan. */
async function scanWithAuthority(cancelled: boolean, endpoint = RPC) {
  const seller = generateSession();
  const store = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(store);
  await saveEncryptedVault(VAULT_PASS, { N: TEST_N }, store);
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': RPC } }));
  if (endpoint === PRIVATE_RPC) {
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ transport: 'local-proxy', requireProxy: true, endpoints: { '84532': PRIVATE_RPC } }));
    window.localStorage.setItem(WEB_NETWORK_SELECTION_KEY, JSON.stringify({ ...DEFAULT_WEB_NETWORK_SELECTION, rpcMode: 'own-node', noticeAcknowledged: true }));
  }
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: seller.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 2_500_000n });
  const inner = withManifestChain(chainWithLogs(84532, 500, [mine.log]));
  let clock = 1_000;
  const codeQueries: string[] = [];
  const fetchedEndpoints: string[] = [];
  const authority = createNetworkAuthority({ nowMs: () => clock, fetchFn: async (url, init) => {
    fetchedEndpoints.push(url);
    const request = JSON.parse(typeof init.body === 'string' ? init.body : '') as { id: number; method: string; params: readonly unknown[] };
    if (request.method === 'eth_getCode') codeQueries.push(String(request.params[0]).toLowerCase());
    const result = request.method === 'eth_chainId' ? '0x14a34' : await inner.request(request.method, request.params);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  } });
  authorities.push(authority);
  const grants: NetworkAuthorization[] = [];
  const authorize = vi.fn((request: Parameters<NetworkAuthority['authorize']>[0]) => {
    const grant = authority.authorize(request); grants.push(grant); return grant;
  });
  const network: NetworkAuthority = { ...authority, authorize };
  const createRpc: Services['createRpc'] = (chain, endpoint, grant) => {
    network.assertRpcAuthorization(grant, chain.chainId, endpoint);
    if (grant === undefined) throw new Error('a real authorization is required by this fixture');
    const client: RpcClient = {
      chainId: chain.chainId,
      request(method, params) {
        network.assertRpcAuthorization(grant, chain.chainId, endpoint, JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }));
        if (method === 'eth_getCode') codeQueries.push(String(params[0]).toLowerCase());
        return inner.request(method, params);
      },
      blockNumber() { grant.assertCurrent(); return inner.blockNumber(); },
      getBlock(number) { grant.assertCurrent(); return inner.getBlock(number); },
      getLogs(filter) { grant.assertCurrent(); return inner.getLogs(filter); },
    };
    return Promise.resolve(client);
  };
  if (cancelled) {
    const original = scanClient.runScan;
    vi.spyOn(scanClient, 'runScan').mockImplementation(async (params) => {
      const result = await original(params);
      if (!params.signal.aborted) await new Promise<void>((resolve) => { params.signal.addEventListener('abort', () => { resolve(); }, { once: true }); });
      return result;
    });
  }
  const user = userEvent.setup();
  renderApp(makeServices({ loadManifest: loaded, createRpc, network, createScanWorker: () => new InlineWorker() }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  await user.type(screen.getByLabelText('Start block'), '100');
  await user.click(screen.getByRole('button', { name: 'Start scan' }));
  await screen.findByText('Payments found');
  if (cancelled) {
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false); });
    expect(grants[0]?.signal.aborted).toBe(true);
  } else {
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
  }
  const row = screen.getByText(mine.stealthAddress).closest('li');
  if (row === null) throw new Error('the discovered payment must remain listed');
  return { user, row, grants, codeQueries, authorize, fetchedEndpoints, stealthAddress: mine.stealthAddress, expireScan: () => { clock += 600_001; } };
}

describe('fresh network authorization for explicit payment exports', () => {
  it.each(['cancelled', 'expired', 'private scan cancelled'] as const)('exports a discovered payment after its scan grant is %s, without reusing or reviving that grant', async (reason) => {
    const endpoint = reason === 'private scan cancelled' ? PRIVATE_RPC : RPC;
    const h = await scanWithAuthority(reason !== 'expired', endpoint);
    if (reason === 'expired') h.expireScan();
    expect(() => h.grants[0]?.assertCurrent()).toThrow();
    const before = h.authorize.mock.calls.length;
    await h.user.click(within(h.row).getByRole('button', { name: 'Payment details' }));
    await h.user.type(within(h.row).getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await h.user.click(within(h.row).getByRole('button', { name: 'Prepare the private key download' }));
    expect(h.authorize).toHaveBeenCalledTimes(before);
    expect(downloads.files).toEqual([]);
    await h.user.click(within(h.row).getByRole('button', { name: 'Download the private key' }));
    await waitFor(() => { expect(downloads.files.length > 0 || within(h.row).queryByRole('alert') !== null).toBe(true); }, { timeout: 30_000 });
    expect(downloads.files.map((file) => file.filename)).toEqual(['ghostpay-stealth-private-key.txt']);
    expect(h.authorize.mock.calls.slice(before).map(([request]) => ({ action: request.action, endpoint: request.endpoint, chain: request.network }))).toEqual([
      { action: 'payment-key-export', endpoint: new URL(endpoint).href, chain: { kind: 'evm', chainId: 84532 } },
    ]);
    expect(h.codeQueries.filter((address) => address === h.stealthAddress.toLowerCase())).toHaveLength(1);
    expect(h.grants[0]?.signal.aborted).toBe(true);
    expect(h.grants.at(-1)?.signal.aborted).toBe(true);
    expect(h.fetchedEndpoints.every((target) => target === new URL(endpoint).href)).toBe(true);
  });

  it('keeps public records offline and refuses a wrong vault passphrase without new authority', async () => {
    const h = await scanWithAuthority(true);
    const before = h.authorize.mock.calls.length;
    await h.user.click(within(h.row).getByRole('button', { name: 'Payment details' }));
    await h.user.click(within(h.row).getByRole('button', { name: 'Download public record' }));
    expect(downloads.files).toHaveLength(1);
    expect(h.authorize).toHaveBeenCalledTimes(before);
    await h.user.type(within(h.row).getByLabelText('Passphrase of your encrypted vault'), 'incorrect passphrase');
    await h.user.click(within(h.row).getByRole('button', { name: 'Prepare the private key download' }));
    await h.user.click(within(h.row).getByRole('button', { name: 'Download the private key' }));
    await waitFor(() => { expect(within(h.row).getByRole('alert')).toBeTruthy(); }, { timeout: 30_000 });
    expect(downloads.files).toHaveLength(1);
    expect(h.authorize).toHaveBeenCalledTimes(before);
    expect(h.codeQueries).not.toContain(h.stealthAddress.toLowerCase());
  });

  it.each([SETTINGS_KEY, WEB_NETWORK_SELECTION_KEY])('rejects changed %s before its storage event, even when the original endpoint stays configured', async (key) => {
    const h = await scanWithAuthority(true);
    const before = h.authorize.mock.calls.length;
    await h.user.click(within(h.row).getByRole('button', { name: 'Payment details' }));
    await h.user.type(within(h.row).getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await h.user.click(within(h.row).getByRole('button', { name: 'Prepare the private key download' }));
    window.localStorage.setItem(key, JSON.stringify(key === SETTINGS_KEY
      ? { rpcUrls: { '84532': RPC }, rpcUrlsSecondary: { '84532': 'https://replacement.test/' } }
      : { ...DEFAULT_WEB_NETWORK_SELECTION, noticeAcknowledged: true }));
    await h.user.click(within(h.row).getByRole('button', { name: 'Download the private key' }));
    await waitFor(() => { expect(within(h.row).getByRole('alert')).toBeTruthy(); }, { timeout: 30_000 });
    expect(downloads.files).toEqual([]);
    expect(h.authorize).toHaveBeenCalledTimes(before);
    expect(h.codeQueries).not.toContain(h.stealthAddress.toLowerCase());
  });
});
