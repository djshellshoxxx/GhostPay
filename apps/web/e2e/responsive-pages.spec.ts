import { chromium, expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { generateKeys, ORIGIN } from './helpers';

const widths = [320, 375, 768, 1280, 1920];
const extension = fileURLToPath(new URL('./fixtures/zoom', import.meta.url));

async function checkLayout(page: Page, name: string): Promise<void> {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const outside = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, nav a, footer a')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return el.checkVisibility() && r.width > 0 && (r.left < -1 || r.right > width + 1);
      })
      .map((el) => el.id || el.getAttribute('aria-label') || el.tagName);
    return { width, scroll: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth), outside };
  });
  expect(layout.scroll, name).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.outside, name).toEqual([]);
}

async function checkRpc(page: Page): Promise<void> {
  const rows = page.locator('main .rpc-row');
  await expect(page.getByRole('button', { name: 'Test Ethereum Sepolia', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test Base Sepolia', exact: true })).toBeVisible();
  for (const row of await rows.all()) {
    const [a, b] = await row.locator('input[type=url]').evaluateAll((inputs) =>
      inputs.map((input) => input.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number }));
    if (!a || !b) throw new Error('Both RPC URL inputs must be present');
    const narrow = await page.evaluate(() => !matchMedia('(min-width: 40rem)').matches);
    const rowWidth = await row.evaluate((el) => el.clientWidth);
    expect(a.width).toBeGreaterThanOrEqual(narrow ? rowWidth - 2 : (rowWidth - 18) / 2);
    expect(b.width).toBeCloseTo(a.width, 0);
    if (narrow) expect(b.y).toBeGreaterThan(a.y + a.height);
    else {
      expect(b.y).toBeCloseTo(a.y, 0);
      expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
    }
    const button = row.locator('.rpc-test-row button');
    // A control may fit its grid cell while each word is split vertically.
    const splitWords = await button.evaluate((el) => {
      const text = el.firstChild;
      if (!(text instanceof Text)) throw new Error('Expected the RPC Test label');
      return [...text.data.matchAll(/\S+/gu)].filter((word) => {
        const range = document.createRange();
        range.setStart(text, word.index);
        range.setEnd(text, word.index + word[0].length);
        return range.getClientRects().length > 1;
      }).map((word) => word[0]);
    });
    expect(splitWords).toEqual([]);
    await row.locator('input[type=url]').nth(1).focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS('outline-style', 'solid');
  }
}

async function checkPages(page: Page): Promise<void> {
  await page.goto(ORIGIN);
  await generateKeys(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  const routes = await nav.locator('button[data-view]').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('data-view')));
  expect(routes).toEqual(expect.arrayContaining(['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'registry', 'settings', 'about']));
  for (const route of routes) {
    if (!route) throw new Error('Unnamed navigation route');
    const tab = nav.locator(`button[data-view="${route}"]`);
    await tab.press('Enter');
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('main')).toBeFocused();
    await checkLayout(page, route);
    if (route === 'settings') await checkRpc(page);
  }
  for (const path of ['help.html', 'privacy.html']) {
    await page.goto(`${ORIGIN}/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await checkLayout(page, path);
  }
}

for (const width of widths) {
  test(`supported pages and RPC controls reflow at ${String(width)} CSS pixels`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const badAssets: string[] = [];
    page.on('request', (request) => {
      if (['font', 'stylesheet', 'image'].includes(request.resourceType()) && !request.url().startsWith('data:') && new URL(request.url()).origin !== ORIGIN) badAssets.push(request.url());
    });
    page.on('response', (response) => {
      // 304 means a revalidated, still-valid cached copy when the same context navigates again; only failures count.
      if (['font', 'stylesheet', 'image'].includes(response.request().resourceType()) && !response.ok() && response.status() !== 304) badAssets.push(response.url());
    });
    await checkPages(page);
    expect(badAssets).toEqual([]);
  });
}

test('native 200% browser zoom reflows supported pages to 320 CSS pixels', async () => {
  // A normal Chromium build exposes the browser's tab zoom API. Headless shell,
  // deviceScaleFactor, pinch zoom and CSS text scaling cannot exercise it.
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', viewport: null, headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--window-size=640,950', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(ORIGIN);
    const normalDpr = await page.evaluate(() => window.devicePixelRatio);
    expect(await page.evaluate(() => innerWidth)).toBe(640);
    const zoom = await worker.evaluate(async () => {
      type Tabs = {
        query: (query: { active: boolean; lastFocusedWindow: boolean }) => Promise<{ id: number }[]>;
        setZoom: (id: number, zoom: number) => Promise<void>;
        getZoom: (id: number) => Promise<number>;
      };
      const { tabs } = (globalThis as unknown as { chrome: { tabs: Tabs } }).chrome;
      const [tab] = await tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab) throw new Error('No active test tab');
      await tabs.setZoom(tab.id, 2);
      return tabs.getZoom(tab.id);
    });
    expect(zoom).toBe(2);
    await expect.poll(() => page.evaluate(() => [innerWidth, devicePixelRatio])).toEqual([320, normalDpr * 2]);
    await checkPages(page);
    expect(await page.evaluate(() => innerWidth)).toBe(320);
  } finally {
    await context.close();
  }
});

test('app and guides use the dark palette, and the app respects a saved theme', async ({ page }) => {
  const background = (color: string) => expect(page.locator('body')).toHaveCSS('background-color', color);
  await page.emulateMedia({ colorScheme: 'light' });
  for (const path of ['/help.html', '/privacy.html', '/']) {
    await page.goto(path);
    await background('rgb(5, 9, 18)');
  }
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('system');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await background('rgb(247, 248, 250)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await background('rgb(5, 9, 18)');
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.reload();
  await background('rgb(247, 248, 250)');
});
