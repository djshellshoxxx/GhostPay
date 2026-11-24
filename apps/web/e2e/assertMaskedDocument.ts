import { expect, type Page } from '@playwright/test';

/** Check user-facing and hidden surfaces separately, including non-serialized form values. */
export async function expectMaskedDocument(page: Page, values: readonly string[]): Promise<void> {
  await expect(page).toHaveTitle('GhostPay');
  const tree = (await page.locator('body').ariaSnapshot()).toLowerCase();
  const surfaces = await page.evaluate(() => [
    document.documentElement.outerHTML,
    document.body.textContent ?? '',
    ...Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'), (control) => control.value),
  ].join('\n').toLowerCase());
  for (const value of values) {
    expect(value.length).toBeGreaterThan(0);
    expect(tree).not.toContain(value.toLowerCase());
    expect(surfaces).not.toContain(value.toLowerCase());
  }
}
