import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Read the production stylesheets instead of recreating the disputed cascade in test-only CSS.
// The bill stylesheet is imported eagerly by Pay; ReceiptPanel is a separate print target.
const appCss = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');
const billCss = readFileSync(new URL('../src/styles/print.css', import.meta.url), 'utf8');

async function printFixture(page: Page, order: 'app-first' | 'bill-first', withBill: boolean): Promise<void> {
  const styles = order === 'app-first' ? [appCss, billCss] : [billCss, appCss];
  await page.setContent(`
    <style>${styles[0]}</style><style>${styles[1]}</style>
    <nav data-testid="private-navigation">Private wallet navigation</nav>
    <main>
      <div data-testid="private-controls">Wallet control and account details</div>
      <article class="receipt-print" data-testid="receipt">
        <p data-testid="receipt-content">Signed payment receipt</p>
        <div class="receipt-actions" data-testid="receipt-actions">Print and archive actions</div>
        <textarea class="receipt-json" data-testid="receipt-json">private receipt JSON</textarea>
      </article>
      ${withBill ? '<article class="bill-sheet" data-testid="bill"><h2 data-testid="bill-content">Printable invoice</h2></article>' : ''}
    </main>
  `);
  await page.emulateMedia({ media: 'print' });
}

async function visibility(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((element) => getComputedStyle(element).visibility);
}

for (const order of ['app-first', 'bill-first'] as const) {
  test(`receipt prints without a mounted bill (${order})`, async ({ page }) => {
    await printFixture(page, order, false);
    expect(await visibility(page, '[data-testid="receipt"]')).toBe('visible');
    expect(await visibility(page, '[data-testid="receipt-content"]')).toBe('visible');
    expect(await visibility(page, '[data-testid="private-controls"]')).toBe('hidden');
    expect(await visibility(page, '[data-testid="private-navigation"]')).toBe('hidden');
    await expect(page.getByTestId('receipt-actions')).toBeHidden();
    await expect(page.getByTestId('receipt-json')).toBeHidden();
  });

  test(`bill remains the only printed target when a receipt exists (${order})`, async ({ page }) => {
    await printFixture(page, order, true);
    expect(await visibility(page, '[data-testid="bill"]')).toBe('visible');
    expect(await visibility(page, '[data-testid="bill-content"]')).toBe('visible');
    expect(await visibility(page, '[data-testid="receipt"]')).toBe('hidden');
    expect(await visibility(page, '[data-testid="receipt-content"]')).toBe('hidden');
    expect(await visibility(page, '[data-testid="private-controls"]')).toBe('hidden');
    expect(await visibility(page, '[data-testid="private-navigation"]')).toBe('hidden');
  });
}
