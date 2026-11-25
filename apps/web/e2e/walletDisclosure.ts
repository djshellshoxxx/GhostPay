import type { Page } from '@playwright/test';

/**
 * For specs written before the wallet disclosure gate: whenever the real "Review wallet disclosure" dialog is shown,
 * record the method it names and press its real approve button, as a user would. Nothing is stubbed: a request the
 * page does not show is never approved.
 *
 * It runs inside the page (a test-only init script), so it also works while a spec waits on Node-side state with
 * `expect.poll` (Playwright locator handlers only run before page actions and auto-waiting assertions). The button is
 * found by its role in the dialog, not its text, so localized runs work too. Specs about the disclosure itself drive
 * the dialog explicitly and must not call this.
 */
export async function approveWalletDisclosures(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shown: string[] = [];
    (window as unknown as { __walletDisclosuresShown: string[] }).__walletDisclosuresShown = shown;
    const seen = new WeakSet<Element>();
    const approve = (): void => {
      const dialog = document.querySelector('.wallet-disclosure-dialog');
      if (dialog === null || seen.has(dialog)) return;
      const button = dialog.querySelector<HTMLButtonElement>('.wallet-disclosure-actions .btn.primary');
      if (button === null) return;
      seen.add(dialog);
      shown.push(dialog.querySelector('dd code')?.textContent ?? '?');
      // After the observer callback, so React has committed the dialog before the click arrives.
      setTimeout(() => { if (button.isConnected) button.click(); }, 0);
    };
    new MutationObserver(approve).observe(document, { childList: true, subtree: true });
  });
}

/** The wallet methods the disclosure dialog showed in this page so far, in order. */
export function shownWalletDisclosures(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => [...((window as unknown as { __walletDisclosuresShown?: string[] }).__walletDisclosuresShown ?? [])]);
}
