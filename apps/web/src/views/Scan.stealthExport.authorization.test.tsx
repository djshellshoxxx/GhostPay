// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import { createNetworkAuthority, type NetworkAuthority, type NetworkAuthorization } from '../lib/networkAuthorization';
import { TEST_N, captureDownloads } from '../lib/paymentKeyExport.testutil';
import * as scanClient from '../lib/scanClient';
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
async function scanWithAuthority(cancelled: boolean) {
  const seller = generateSession();
  const store = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(store);
  await saveEncryptedVault(VAULT_PASS, { N: TEST_N }, store);
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': RPC } }));
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: seller.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 2_500_000n });
  const inner = withManifestChain(chainWithLogs(84532, 500, [mine.log]));
  let clock = 1_000;
  const authority = createNetworkAuthority({ nowMs: () => clock });
  authorities.push(authority);
  const authorize = vi.fn(authority.authorize);
  const network: NetworkAuthority = { ...authority, authorize };
  const grants: NetworkAuthorization[] = [];
  const codeQueries: string[] = [];
  const createRpc: Services['createRpc'] = (chain, endpoint, grant) => {
    network.assertRpcAuthorization(grant, chain.chainId, endpoint);
    if (grant === undefined) throw new Error('a real authorization is required by this fixture');
    grants.push(grant);
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
  return { user, row, grants, codeQueries, authorize, stealthAddress: mine.stealthAddress, expireScan: () => { clock += 600_001; } };
}

describe('fresh network authorization for explicit payment exports', () => {
  it.each(['cancelled', 'expired'] as const)('exports a discovered payment after its scan grant is %s, without reusing or reviving that grant', async (reason) => {
    const h = await scanWithAuthority(reason === 'cancelled');
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
      { action: 'payment-key-export', endpoint: RPC, chain: { kind: 'evm', chainId: 84532 } },
    ]);
    expect(h.codeQueries.filter((address) => address === h.stealthAddress.toLowerCase())).toHaveLength(1);
    expect(h.grants[0]?.signal.aborted).toBe(true);
    expect(h.grants.at(-1)?.signal.aborted).toBe(true);
  });
});
