import { expect, test } from '@playwright/test';
import { generateKeys } from './helpers';

test('unqualified testnet price feeds cannot be selected for an invoice', async ({ page }) => {
  await page.goto('./');
  await generateKeys(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Create invoice' }).click();
  for (const chain of ['Ethereum Sepolia', 'Base Sepolia']) {
    await page.getByLabel('Chain').selectOption({ label: chain });
    for (const label of ['ETH', 'USDC']) {
      await page.getByLabel('Token', { exact: true }).selectOption({ label });
      const fiat = page.getByRole('option', { name: /Fiat price/ });
      if (process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] === 'lean') await expect(fiat).toHaveCount(0);
      else await expect(fiat).toBeDisabled();
      await expect(page.getByLabel('Pricing')).toHaveValue('fixed_token');
    }
  }
});
