import type { Page } from '@playwright/test';

/**
 * For specs written before the wallet disclosure gate: whenever the real "Review wallet disclosure" dialog is shown,
 * record the method it names and press its real "Continue to wallet" button, as a user would. Nothing is stubbed: a
 * request the page does not show is never approved. Specs about the disclosure itself drive the dialog explicitly.
 *
 * Playwright runs the handler before actions and auto-waiting assertions, so every flow still awaits a visible step
 * after a wallet action.
 */
export async function approveWalletDisclosures(page: Page, shown: string[] = []): Promise<readonly string[]> {
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Review wallet disclosure' }), async (dialog) => {
    shown.push(await dialog.locator('dd code').first().innerText());
    await dialog.getByRole('button', { name: 'Continue to wallet' }).click();
  });
  return shown;
}
