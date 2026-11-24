import { expect, test } from '@playwright/test';
import { approveWalletDisclosure, createInvoice, generateKeys, openFresh } from './helpers';
import { configureRpc, mockNetwork, type SentTx } from './flowMocks';
import { injectWallet, type WalletControls } from './walletFixture';

for (const switchAt of ['open disclosure', 'away from checkout', 'direct reload'] as const) {
  test(`changing wallet ${switchAt} discards the decrypted invoice across navigation and reload`, async ({ page, context }) => {
    const state: { sent?: SentTx; sendCalls?: number } = {};
    await mockNetwork(context, state);
    await injectWallet(page, state);
    await configureRpc(page, { autoClearFragment: false });
    await page.goto('/');
    await generateKeys(page);
    const memo = 'Account A private service reference';
    const link = await createInvoice(page, { encrypt: true, memo });
    await openFresh(page, link);
    await expect(page.getByText(memo)).toBeVisible();
    const clearsFragment = await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem('ghostpay.settings.v1') ?? '{}') as { readonly autoClearFragment?: boolean };
      return settings.autoClearFragment;
    });
    expect(clearsFragment).toBe(false);
    expect(new URL(page.url()).hash).toBe(new URL(link).hash);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /Connect E2E Wallet/ }).click();
    await approveWalletDisclosure(page, 'eth_requestAccounts');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(page.getByRole('button', { name: 'Prepare payment' })).toBeVisible();
    if (switchAt === 'open disclosure') {
      await page.getByRole('button', { name: 'Prepare payment' }).click();
      await page.getByRole('button', { name: 'Send payment in my wallet' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    } else if (switchAt === 'direct reload') {
      await page.reload();
    } else {
      await nav.getByRole('button', { name: 'Home', exact: true }).click();
    }
    if (switchAt !== 'direct reload') await page.evaluate(() => { (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.changeAccount(); });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const assertPrivate = async (): Promise<void> => {
      await expect(page.locator('body')).not.toContainText(memo);
      expect(await page.locator('body').ariaSnapshot()).not.toContain(memo);
      expect(new URL(page.url()).hash).toBe('');
    };
    await assertPrivate();
    await nav.getByRole('button', { name: 'Home', exact: true }).click();
    await nav.getByRole('button', { name: 'Pay', exact: true }).click();
    await assertPrivate();
    await page.reload();
    await nav.getByRole('button', { name: 'Pay', exact: true }).click();
    await assertPrivate();
    expect(state.sent).toBeUndefined();
    expect(state.sendCalls ?? 0).toBe(0);
  });
}
