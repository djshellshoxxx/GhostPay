import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PAYMENT_REQUEST_FILE_NAME } from '@ghostpay/invoice-schema';
import { configureRpc, mockNetwork, type SentTx } from './flowMocks';
import { createInvoice, generateKeys, openFresh } from './helpers';
import { approveWalletDisclosures, shownWalletDisclosures } from './walletDisclosure';

// F03 x #500: an invoice opened from its request file is the same signed invoice as its link, so the durable
// wallet-attempt journal must refuse a second payment request whichever entry path the payer used.

interface WalletControls { holdSend: boolean; pending: boolean }
interface WalletState { sent?: SentTx; sendCalls?: number }

/** Trimmed copy of the EIP-6963 test wallet in flows.spec.ts (a spec file cannot be imported without its tests). */
async function injectWallet(page: Page, state: WalletState): Promise<void> {
  // Drive the current real disclosure UI just as the shared payment-flow fixtures do.
  await approveWalletDisclosures(page);
  await page.exposeFunction('__recordTx', (tx: SentTx) => {
    state.sent = tx;
    state.sendCalls = (state.sendCalls ?? 0) + 1;
  });
  await page.addInitScript(() => {
    const account = '0x5555555555555555555555555555555555555555';
    const w = window as unknown as { __recordTx: (tx: unknown) => Promise<void>; __e2eWallet: WalletControls };
    const controls: WalletControls = { holdSend: false, pending: false };
    w.__e2eWallet = controls;
    const provider = {
      on: (): void => undefined,
      removeListener: (): void => undefined,
      request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return [account];
          case 'eth_chainId':
            return '0x14a34';
          case 'net_version':
            return '84532';
          case 'eth_sendTransaction': {
            await w.__recordTx({ ...(params?.[0] as Record<string, string>) });
            if (controls.holdSend) {
              controls.pending = true;
              await new Promise<void>(() => undefined); // The wallet never answers: the outcome stays unknown.
            }
            return `0x${'9'.repeat(64)}`;
          }
          default:
            throw new Error(`unsupported ${method}`);
        }
      },
    };
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid: 'e2e-wallet', name: 'E2E Wallet', icon: '', rdns: 'test.e2e' }, provider },
      }));
    });
  });
}

const send = (page: Page) => page.getByRole('button', { name: 'Send payment in my wallet' });

test('a request file cannot re-pay an invoice whose link payment is already recorded', async ({ page, context }) => {
  const first: WalletState = {};
  const second: WalletState = {};
  await mockNetwork(context, {});
  await injectWallet(page, first);
  await configureRpc(page);
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download payment request', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(PAYMENT_REQUEST_FILE_NAME);
  const path = await download.path();
  if (path === null) throw new Error('Synthetic request download was unavailable');
  const requestFile = await readFile(path);

  // Tab A pays through the link; the wallet holds the request, so the journal records an unknown outcome.
  await openFresh(page, link);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Connect E2E Wallet/ }).click();
  await page.getByRole('button', { name: 'Prepare payment' }).click();
  await expect(page.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.holdSend = true; });
  await send(page).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.pending)).toBe(true);
  expect(first.sendCalls).toBe(1);
  expect(await shownWalletDisclosures(page)).toEqual(['eth_requestAccounts', 'eth_sendTransaction']);

  // Tab B opens the same invoice from its request file and reaches the final check through the ordinary flow.
  const tab = await context.newPage();
  await injectWallet(tab, second);
  await configureRpc(tab);
  await tab.goto('/');
  await tab.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
  await tab.getByText('Scan an invoice QR or open a request file', { exact: true }).click();
  await tab.getByLabel('Payment request file', { exact: true }).setInputFiles({
    name: 'synthetic-request.bin', mimeType: 'application/octet-stream', buffer: requestFile,
  });
  await expect(tab.getByRole('heading', { name: 'Review request file', exact: true })).toBeVisible();
  expect(second.sendCalls ?? 0).toBe(0);
  await tab.getByRole('button', { name: 'Open request file', exact: true }).click();
  await expect(tab.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await tab.getByRole('button', { name: 'Continue' }).click();
  await tab.getByRole('button', { name: /Connect E2E Wallet/ }).click();
  await tab.getByRole('button', { name: 'Prepare payment' }).click();
  await expect(tab.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible();
  await send(tab).click();
  await expect(tab.getByRole('alert').filter({ hasText: 'previous wallet attempt' })).toBeVisible();
  expect(await shownWalletDisclosures(tab)).toContain('eth_requestAccounts');
  expect(second.sendCalls ?? 0).toBe(0);
  expect(first.sendCalls).toBe(1);
});
