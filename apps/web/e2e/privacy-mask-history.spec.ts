import { expect, test, type Page } from '@playwright/test';
import { expectMaskedDocument } from './assertMaskedDocument';
import { createInvoice, generateKeys, openFresh } from './helpers';
import { mockNetwork } from './flowMocks';

// Ported from #569 `c30283d2` (e2e/privacy-mask-history.spec.ts). The other cases of that file do not apply to main's
// #708 design; see docs/handoffs/MASKING_569_DISPOSITIONS_20261127.md.

const privacyControl = (page: Page) => page.getByRole('banner').getByRole('switch', { name: 'Privacy mode', exact: true });
const reveal = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Reveal details for 30 seconds', exact: true });

test('an invoice opened or reloaded in privacy mode needs fresh reveal', async ({ page, context }) => {
  await mockNetwork(context, {});
  // Retain the fragment explicitly so the reload exercises the same real invoice.
  await page.addInitScript(() => {
    localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ autoClearFragment: false }));
  });
  await page.goto('/');
  const meta = await generateKeys(page);
  const memo = 'private-screen-share-memo-286';
  const description = 'private-screen-share-item-286';
  const link = await createInvoice(page, { memo, description });
  await privacyControl(page).check();
  await expectMaskedDocument(page, [link, description, memo, meta]);
  await openFresh(page, link);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(privacyControl(page)).toBeChecked();
    await expect(reveal(page)).toBeVisible();
    await expectMaskedDocument(page, [description, memo, meta, link]);
    await reveal(page).click();
    await expect(page.getByText(description, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(memo, { exact: false }).first()).toBeVisible();
    await expect(page).toHaveTitle('GhostPay');
  }
});
