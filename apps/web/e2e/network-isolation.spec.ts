import { expect, test, type Request } from '@playwright/test';
import { ORIGIN } from './helpers';

const UNAVAILABLE = 'not available in this environment';
const PRIVATE_SETTINGS = {
  transport: 'local-proxy', requireProxy: true, endpoints: { '11155111': 'https://localhost:9050' },
};

function isHashRead(request: Request): boolean {
  return request.resourceType() === 'fetch' && /\/assets\/index[^/]*\.js$/.test(new URL(request.url()).pathname);
}

test('startup hash rejects a redirect without contacting its destination, including after reload', async ({ context, page }) => {
  const forbidden: string[] = [];
  let hashReads = 0;
  await page.goto('/');
  await expect(page.getByText(/^[0-9a-f]{64}$/, { exact: false }).first()).toBeVisible();
  // Seed once, then use genuine reloads. Reinstalling preferences with addInitScript on every load could
  // hide a regression that cleared or downgraded the persisted policy during the previous session.
  await page.evaluate((settings) => {
    localStorage.setItem('ghostpay.scanPrivacy.v1', JSON.stringify(settings));
  }, PRIVATE_SETTINGS);
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== ORIGIN) {
      forbidden.push(request.url());
      await route.abort();
    } else if (isHashRead(request)) {
      hashReads++;
      await route.fulfill({ status: 302, headers: { location: 'https://isolation-sink.invalid/entry.js' } });
    } else await route.continue();
  });
  await page.reload();
  await expect(page.getByText(UNAVAILABLE, { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(hashReads).toBe(1);
  expect(forbidden).toEqual([]);
  await page.reload();
  await expect(page.getByText(UNAVAILABLE, { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(hashReads).toBe(2);
  expect(forbidden).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ghostpay.scanPrivacy.v1') ?? '{}') as unknown)).toEqual(PRIVATE_SETTINGS);
});

test('startup hash never follows a same-origin redirect either', async ({ context, page }) => {
  const redirected: string[] = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/isolation-redirect-target.js') {
      redirected.push(request.url());
      await route.fulfill({ status: 200, body: 'redirected asset' });
    } else if (isHashRead(request)) {
      await route.fulfill({ status: 307, headers: { location: '/isolation-redirect-target.js' } });
    } else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByText(UNAVAILABLE, { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(redirected).toEqual([]);
});

test('startup hash omits cookies, referrers and fragment identifiers in real browser requests', async ({ context, page }) => {
  await context.addCookies([{ name: 'isolation-test-session', value: 'synthetic-cookie', url: ORIGIN }]);
  const reads: Request[] = [];
  const forbidden: string[] = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== ORIGIN) {
      forbidden.push(request.url());
      await route.abort();
      return;
    }
    if (isHashRead(request)) reads.push(request);
    await route.continue();
  });
  await page.goto('/#isolation-local-marker');
  await expect(page.getByText(/^[0-9a-f]{64}$/, { exact: false }).first()).toBeVisible();
  expect(reads).toHaveLength(1);
  const request = reads[0];
  expect(request).toBeDefined();
  const headers = await request?.allHeaders();
  expect(headers?.['cookie']).toBeUndefined();
  expect(headers?.['referer']).toBeUndefined();
  expect(request?.postData()).toBeNull();
  expect(request?.url()).not.toContain('isolation-local-marker');
  expect(forbidden).toEqual([]);
});

test('startup hash failure remains unavailable without retry or endpoint fallback', async ({ context, page }) => {
  let hashReads = 0;
  const forbidden: string[] = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== ORIGIN) {
      forbidden.push(request.url());
      await route.abort();
    } else if (isHashRead(request)) {
      hashReads++;
      await route.abort('connectionrefused');
    } else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByText(UNAVAILABLE, { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(hashReads).toBe(1);
  expect(forbidden).toEqual([]);
});
