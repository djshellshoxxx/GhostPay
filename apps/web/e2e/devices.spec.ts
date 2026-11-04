import { expect, test, type Page } from '@playwright/test';
import { generateKeys } from './helpers';

// Runs in the device projects only (Chromium-engine emulation of viewport/touch/UA; not WebKit, not real devices).
const ROUTES = ['Home', 'Seller keys', 'Create invoice', 'Pay', 'Scan and receive', 'Sweep', 'Public registry', 'Settings', 'About and privacy'] as const;

async function go(page: Page, route: typeof ROUTES[number]): Promise<void> {
  const button = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: route, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toBeVisible();
}

test('core routes fit the device viewport without horizontal overflow or clipped controls', async ({ page }, info) => {
  await page.goto('/');
  await generateKeys(page);
  for (const route of ROUTES) {
    await go(page, route);
    const label = `${info.project.name}/${route}`;
    await expect(page.getByRole('main'), `${label}: main landmark`).toBeVisible();
    const layout = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const clipped = [...document.querySelectorAll<HTMLElement>('main button, main a[href], main input, main select, main textarea, main summary')]
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
});
