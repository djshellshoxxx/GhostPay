import { expect, type Page } from '@playwright/test';

/** Assert absence without attaching document contents or private values to failure output. */
export async function expectMaskedDocument(page: Page, values: readonly string[]): Promise<void> {
  await expect(page).toHaveTitle('GhostPay');
  const needles = values.map((value) => value.toLowerCase());
  expect(needles).not.toContain('');
  const tree = (await page.locator('body').ariaSnapshot()).toLowerCase();
  expect(needles.findIndex((needle) => tree.includes(needle)), 'private fixture index in accessibility tree').toBe(-1);
  const leaked = await page.evaluate((secrets) => {
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
    const surfaces = {
      markup: document.documentElement.outerHTML,
      text: document.body.textContent ?? '',
      fields: Array.from(fields, (field) => field.value).join('\n'),
    };
    return Object.entries(surfaces).flatMap(([surface, text]) => {
      const index = secrets.findIndex((value) => text.toLowerCase().includes(value));
      return index === -1 ? [] : [{ surface, index }];
    });
  }, needles);
  expect(leaked, 'private fixtures in the live document').toEqual([]);
}
