import { expect, test, type Page } from '@playwright/test';
import { createInvoice, generateKeys, openFresh } from './helpers';

// Runs in the device projects only (Chromium-engine emulation of viewport/touch/UA; not WebKit, not real devices).
// Each route maps to the id of the h2 only that view renders, so a wrong view under a selected nav button cannot pass.
const ROUTES = [
  ['Home', 'home-h'], ['Seller keys', 'keys-h'], ['Create invoice', 'inv-h'], ['Pay', 'pay-h'], ['Scan and receive', 'scan-h'],
  ['Sweep', 'sw-h'], ['Public registry', 'reg-h'], ['Settings', 'set-h'], ['About and privacy', 'about-h'],
] as const;

async function go(page: Page, route: string, headingId: string): Promise<void> {
  const button = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: route, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(`main h2#${headingId}`), `${route}: rendered view heading`).toBeVisible();
}

async function assertFits(page: Page, label: string): Promise<void> {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = [...document.querySelectorAll<HTMLElement>('header button, header a[href], nav button, nav a[href], main button, main a[href], main input, main select, main textarea, main summary')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.left < -1 || r.right > width + 1))
      .map(({ el, r }) => `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}] ${String(Math.round(r.left))}..${String(Math.round(r.right))}`);
    return { width, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, clipped };
  });
  expect(layout.scrollWidth, `${label}: document scrollWidth <= clientWidth`).toBeLessThanOrEqual(layout.width);
  expect(layout.bodyScrollWidth, `${label}: body scrollWidth <= clientWidth`).toBeLessThanOrEqual(layout.width);
  expect(layout.clipped, `${label}: primary controls inside viewport`).toEqual([]);
}

test('core routes fit the device viewport without horizontal overflow or clipped controls', async ({ page }, info) => {
  await page.goto('/');
  // Prove the device descriptor took effect (a dropped descriptor would otherwise pass at the 1280px default).
  const expected = info.project.use.viewport?.width;
  expect(expected, 'device project defines a viewport').toBeDefined();
  expect(await page.evaluate(() => document.documentElement.clientWidth), 'emulated CSS viewport width').toBe(expected);
  expect(info.project.use.isMobile, 'mobile emulation flag').toBe(true);
  await generateKeys(page);
  for (const [route, headingId] of ROUTES) {
    await go(page, route, headingId);
    const label = `${info.project.name}/${route}`;
    await expect(page.getByRole('main'), `${label}: main landmark`).toBeVisible();
    await assertFits(page, label);
  }
  // One loaded state: a created invoice opened on the Pay review screen.
  const link = await createInvoice(page, { description: 'Device layout invoice' });
  await openFresh(page, link);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await assertFits(page, `${info.project.name}/Pay-loaded-invoice`);
});
