import { expect, test } from '@playwright/test';
import { configureRpc, mockNetwork, stageVerifiedErc20Payment, type MockNetworkState } from './flowMocks';
import { generateKeys } from './helpers';

// The same spec runs under both build profiles: lean must not offer (or accept) an unbound manual digest.
const lean = (process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full') === 'lean';

test(`receipt creation ${lean ? 'requires a validated invoice (lean)' : 'keeps the manual digest mode (full)'}`, async ({ page, context }) => {
  test.setTimeout(120_000);
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const meta = await generateKeys(page);
  stageVerifiedErc20Payment(state, meta);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText(/Finished\. 1 announcements checked, 1 payments found\./)).toBeVisible();

  const panel = page.getByRole('region', { name: 'Seller-signed receipt' });
  await expect(panel).toBeVisible();
  // Invoice binding is offered in both profiles.
  await expect(panel.getByLabel('Signed invoice link or fragment')).toBeVisible();
  const manual = panel.getByLabel('Invoice digest (entered manually)');
  if (lean) {
    await expect(manual).toHaveCount(0);
    await expect(panel).not.toContainText('entered manually and is not matched');
    await panel.getByRole('button', { name: 'Sign receipt', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'only signs receipts bound to a validated signed invoice' })).toBeVisible();
    await expect(page.getByLabel('Signed receipt JSON')).toHaveCount(0);
  } else {
    await expect(manual).toBeVisible();
    await expect(panel).toContainText('The invoice digest is entered manually and is not matched against invoice contents.');
  }
});
