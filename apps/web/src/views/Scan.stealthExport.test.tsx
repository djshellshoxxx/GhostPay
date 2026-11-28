// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, findChain, RpcHttpError, type RpcClient } from '@ghostpay/chain-adapters';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import * as exportModule from '../lib/paymentKeyExport';
import { TEST_N, captureDownloads } from '../lib/paymentKeyExport.testutil';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { decryptPaymentKeys } from '../lib/stealthExport';
import type { Services } from '../lib/services';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { FAKE_CODE, backedManifest, withManifestChain } from '../test/manifestChain';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderApp } from '../test/render';

const VAULT_PASS = 'violet comet maple lantern';
const FILE_PASS = 'orbit-lantern-cobalt-meadow-violet';
const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });

let downloads: ReturnType<typeof captureDownloads>;

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  downloads = captureDownloads();
});

afterEach(() => {
  downloads.restore();
  setKeyVaultStoreForTests(undefined);
  vi.restoreAllMocks();
  clearSession();
});

/** Runs a scan that finds one payment to freshly generated keys, with every eth_getCode the scan RPC answers recorded. */
async function scanOnePayment(
  codeFor: (stealthAddress: string) => Record<string, string> = () => ({}),
  paymentLookup?: RpcClient['request'],
): Promise<{ user: ReturnType<typeof userEvent.setup>; stealthAddress: string; codeQueries: string[] }> {
  const pub = generateSession();
  const store = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(store);
  await saveEncryptedVault(VAULT_PASS, { N: TEST_N }, store);
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 2_500_000n });
  const scanRpc = withManifestChain(chainWithLogs(84532, 500, [mine.log]), { code: { ...FAKE_CODE, ...codeFor(mine.stealthAddress) } });
  const codeQueries: string[] = [];
  const recorded: RpcClient = { ...scanRpc, request: (method, params, options) => {
    if (method === 'eth_getCode') {
      const address = String(params[0]).toLowerCase();
      codeQueries.push(address);
      if (address === mine.stealthAddress.toLowerCase() && paymentLookup !== undefined) return paymentLookup(method, params, options);
    }
    return scanRpc.request(method, params, options);
  } };
  const user = userEvent.setup();
  renderApp(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(recorded), createScanWorker: () => new InlineWorker() }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  await user.type(screen.getByLabelText('Start block'), '100');
  await user.click(screen.getByRole('button', { name: 'Start scan' }));
  expect(await screen.findByText('Payments found')).toBeTruthy();
  await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
  return { user, stealthAddress: mine.stealthAddress, codeQueries };
}

describe('Scan > Payment details (spec 18)', () => {
  it('downloads and derives nothing when a payment is discovered; every row offers payment details and the results offer a bulk export', async () => {
    const publicRecord = vi.spyOn(exportModule, 'exportPublicRecord');
    const { stealthAddress, codeQueries } = await scanOnePayment();
    expect(downloads.files).toEqual([]);
    expect(publicRecord).not.toHaveBeenCalled();
    expect(codeQueries).not.toContain(stealthAddress.toLowerCase());
    const row = screen.getByText(stealthAddress).closest('li') as HTMLElement;
    expect(within(row).getByRole('button', { name: 'Payment details' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' })).toBeTruthy();
  });

  it('exports the encrypted keypair through the RPC the scan used, with ownership labelled apart from the receipt', async () => {
    const encrypted = exportModule.exportEncryptedPayment;
    const spy = vi.spyOn(exportModule, 'exportEncryptedPayment').mockImplementation((m, c, p, o) => encrypted(m, c, p, { ...o, N: TEST_N }));
    const { user, stealthAddress, codeQueries } = await scanOnePayment();
    const row = screen.getByText(stealthAddress).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Payment details' }));
    expect(within(row).getByText(/could not be verified as a payment/)).toBeTruthy();
    expect(within(row).getByText('Your keys control this address. This is not payment confirmation or finality.')).toBeTruthy();
    expect(within(row).getByText('Base Sepolia (chain ID 84532)')).toBeTruthy();
    await user.type(within(row).getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(within(row).getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(within(row).getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(within(row).getByRole('button', { name: 'Download encrypted keypair' }));
    await waitFor(() => { expect(downloads.files).toHaveLength(1); }, { timeout: 30_000 });
    expect(spy.mock.calls[0]?.[3].rpc?.chainId).toBe(84532);
    expect(codeQueries.filter((a) => a === stealthAddress.toLowerCase())).toHaveLength(1);
    const opened = await decryptPaymentKeys(await downloads.files[0]!.blob.text(), FILE_PASS, { expectedChainId: 84532 });
    expect(opened.header.payments[0]?.stealthAddress).toBe(stealthAddress);
  });

  it.each(['single', 'archive'] as const)('cancels the actual %s export RPC retry before another lookup', async (mode) => {
    let lookups = 0;
    let resumeRetry: (() => void) | undefined;
    const client = await createClient(findChain(84532)!, 'https://rpc.test', {
      transport: { send: (_url, body) => {
        const { id, method } = JSON.parse(body) as { id: number; method: string };
        if (method === 'eth_getCode' && ++lookups === 1) throw new RpcHttpError(429);
        return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id, result: method === 'eth_chainId' ? '0x14a34' : '0x' }));
      } },
      retries: 1, sleep: () => new Promise<void>((resolve) => { resumeRetry = resolve; }),
    });
    let completed: Promise<unknown> | undefined;
    const { user, stealthAddress } = await scanOnePayment(undefined, (method, params, options) => {
      completed = client.request(method, params, options);
      return completed;
    });
    const panel = within(mode === 'single' ? screen.getByText(stealthAddress).closest('li')! : screen.getByTestId('payment-keys-archive'));
    await user.click(panel.getByRole('button', { name: mode === 'single' ? 'Payment details' : 'Export all payment keys (encrypted)' }));
    await user.type(panel.getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.type(panel.getByLabelText('New passphrase for the export file (at least 14 characters)'), FILE_PASS);
    await user.type(panel.getByLabelText('Repeat the export file passphrase'), FILE_PASS);
    await user.click(panel.getByRole('button', { name: mode === 'single' ? 'Download encrypted keypair' : 'Download encrypted archive' }));
    await waitFor(() => { expect(resumeRetry).toBeDefined(); }, { timeout: 30_000 });
    await user.click(panel.getByRole('button', { name: 'Cancel' }));
    resumeRetry!();
    await expect(completed).rejects.toThrow();
    expect(lookups).toBe(1);
    expect(downloads.files).toEqual([]);
  });

  it('refuses the private key of an address that holds code (contract or EIP-7702 delegation)', async () => {
    const { user, stealthAddress, codeQueries } = await scanOnePayment((a) => ({ [a.toLowerCase()]: '0xef0100aabbccddeeff00112233445566778899aabbcc' }));
    const row = screen.getByText(stealthAddress).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Payment details' }));
    await user.type(within(row).getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    await user.click(within(row).getByRole('button', { name: 'Prepare the private key download' }));
    await user.click(within(row).getByRole('button', { name: 'Download the private key' }));
    await waitFor(() => { expect(within(row).getByRole('alert').textContent).toMatch(/contract code/); }, { timeout: 30_000 });
    expect(codeQueries).toContain(stealthAddress.toLowerCase());
    expect(downloads.files).toEqual([]);
  });

  it('the bulk export shows the count and chain of the scan results before confirming', async () => {
    const { user } = await scanOnePayment();
    await user.click(screen.getByRole('button', { name: 'Export all payment keys (encrypted)' }));
    expect(screen.getByTestId('payment-keys-archive-summary').textContent).toBe('1 payment key found on Base Sepolia (chain ID 84532), scope: all discovered payments.');
    expect(downloads.files).toEqual([]);
  });

  it('a key change clears the results and with them every export panel', async () => {
    const { user, stealthAddress } = await scanOnePayment();
    const row = screen.getByText(stealthAddress).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Payment details' }));
    await user.type(within(row).getByLabelText('Passphrase of your encrypted vault'), VAULT_PASS);
    const { act } = await import('@testing-library/react');
    act(() => { generateSession(); });
    expect(screen.queryByText(stealthAddress)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Payment details' })).toBeNull();
    expect(screen.queryByLabelText('Passphrase of your encrypted vault')).toBeNull();
  });
});
