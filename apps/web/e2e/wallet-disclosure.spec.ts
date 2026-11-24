import { expect, test, type Page } from '@playwright/test';
import { expectMaskedDocument } from './assertMaskedDocument';
import { FAKE_ROUTER } from '../src/test/fakeManifest';
import { auditAccessibility, retainAccessibilityAudit } from './accessibility-audit';
import { configureRpc, mockNetwork, type SentTx } from './flowMocks';
import { createInvoice, generateKeys, openFresh } from './helpers';
import { injectWallet, type WalletControls } from './walletFixture';

const walletCalls = (page: Page): Promise<readonly string[]> => page.evaluate(() => (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.calls);
const disclosure = (page: Page) => page.getByRole('dialog', { name: 'Review wallet disclosure', exact: true });
const reveal = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Reveal details for 30 seconds', exact: true });

test.afterEach(async ({ page }, info) => {
  await retainAccessibilityAudit(page, info);
});

test('wallet disclosure requires each decision, cancels before wallet exposure, and quick hide revokes the exact transaction preview', async ({ page, context }) => {
  const state: { sent?: SentTx; sendCalls?: number } = {};
  await mockNetwork(context, state);
  await injectWallet(page, state);
  await configureRpc(page);
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page);
  await openFresh(page, link);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await page.getByRole('banner').getByRole('switch', { name: 'Privacy mode', exact: true }).check();
  await reveal(page).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const connect = page.getByRole('button', { name: /Connect E2E Wallet/ });
  await connect.click();
  await expect(disclosure(page).getByText('eth_requestAccounts', { exact: true })).toBeVisible();
  expect(await walletCalls(page)).toEqual([]);
  await expect(disclosure(page).getByRole('button', { name: 'Cancel wallet request', exact: true })).toBeFocused();
  await auditAccessibility(page, 'wallet-disclosure-account-review');
  await page.keyboard.press('Escape');
  await expect(disclosure(page)).toHaveCount(0);
  expect(await walletCalls(page)).toEqual([]);

  await connect.click();
  await disclosure(page).getByRole('button', { name: 'Continue to wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Final check before your wallet', exact: true })).toBeVisible();
  expect((await walletCalls(page)).filter((method) => method === 'eth_requestAccounts')).toHaveLength(1);
  const connectedCalls = await walletCalls(page);
  const send = page.getByRole('button', { name: 'Send payment in my wallet', exact: true });
  await send.click();
  await expect(disclosure(page).getByText('eth_sendTransaction', { exact: true })).toBeVisible();
  await disclosure(page).getByText('Exact request (JSON)', { exact: true }).click();
  const reviewed = JSON.parse(await disclosure(page).locator('pre').innerText()) as { method: string; params: readonly [SentTx & { chainId: string }] };
  expect(reviewed.method).toBe('eth_sendTransaction');
  expect(reviewed.params[0]).toMatchObject({ from: `0x${'5'.repeat(40)}`, to: FAKE_ROUTER, value: '0x6f05b59d3b20000', chainId: '0x14a34' });
  expect(reviewed.params[0].data).toMatch(/^0x[0-9a-f]+$/i);
  expect(await walletCalls(page)).toEqual(connectedCalls);
  expect(state.sent).toBeUndefined();
  await disclosure(page).getByRole('button', { name: 'Cancel wallet request', exact: true }).click();
  await expect(disclosure(page)).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('ghostpay.wallet-attempts.v1'))).toBeNull();
  expect(state.sent).toBeUndefined();

  await send.click();
  await expect(disclosure(page)).toBeVisible();
  await page.keyboard.press('Alt+Shift+H');
  await expect(disclosure(page)).toHaveCount(0);
  await expectMaskedDocument(page, [reviewed.params[0].data, reviewed.params[0].from, reviewed.params[0].value, '0.5 ETH']);
  expect(state.sent).toBeUndefined();
  expect((await walletCalls(page)).filter((method) => method === 'eth_sendTransaction')).toHaveLength(0);
  await expect(page.getByRole('banner').getByRole('switch', { name: 'Privacy mode', exact: true })).toBeFocused();

  await reveal(page).click();
  await send.click();
  await disclosure(page).getByText('Exact request (JSON)', { exact: true }).click();
  expect(JSON.parse(await disclosure(page).locator('pre').innerText())).toEqual(reviewed);
  await disclosure(page).getByRole('button', { name: 'Continue to wallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submitted', exact: true })).toBeVisible();
  expect(state.sendCalls).toBe(1);
  expect(state.sent).toEqual(reviewed.params[0]);
  const hash = `0x${'9'.repeat(64)}`;
  await expect(page.getByText(hash, { exact: true }).first()).toBeVisible();
  await page.evaluate(() => (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.changeAccount());
  await expect(reveal(page)).toBeVisible();
  await expectMaskedDocument(page, [hash, reviewed.params[0].from, reviewed.params[0].data, '0.5 ETH']);
  await reveal(page).click();
  await expect(page.getByText(reviewed.params[0].from, { exact: true })).toHaveCount(0);
  expect(state.sendCalls).toBe(1);
});
