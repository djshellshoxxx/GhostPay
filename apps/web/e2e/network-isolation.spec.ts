import { expect, test, type Request } from '@playwright/test';
import { ORIGIN } from './helpers';
import { REDIRECT_HEADER, startHttpRedirectFixture, type HttpRedirectFixture } from './httpRedirectFixture.mjs';

const UNAVAILABLE = 'not available in this environment';
const PRIVATE_SETTINGS = {
  transport: 'local-proxy', requireProxy: true, endpoints: { '11155111': 'https://localhost:9050' },
};

function isHashRead(request: Request): boolean {
  return request.resourceType() === 'fetch' && /\/assets\/index[^/]*\.js$/.test(new URL(request.url()).pathname);
}

const redirectTest = test.extend<{ redirectFixture: HttpRedirectFixture }>({
  redirectFixture: async ({ baseURL }, use) => {
    const fixture = await startHttpRedirectFixture(baseURL ?? ORIGIN);
    try { await use(fixture); } finally { await fixture.close(); }
  },
});

redirectTest('startup hash rejects a redirect without contacting its destination, including after reload', async ({ context, page, redirectFixture }) => {
  const forbidden: string[] = [];
  let hashReads = 0;
  redirectFixture.setRedirect(302, 'https://isolation-sink.invalid/entry.js');
  await page.goto(redirectFixture.origin);
  await expect(page.getByText(/^[0-9a-f]{64}$/, { exact: false }).first()).toBeVisible();
  // Seed once, then use genuine reloads. Reinstalling preferences with addInitScript on every load could
  // hide a regression that cleared or downgraded the persisted policy during the previous session.
  await page.evaluate((settings) => {
    localStorage.setItem('ghostpay.scanPrivacy.v1', JSON.stringify(settings));
  }, PRIVATE_SETTINGS);
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== redirectFixture.origin) {
      forbidden.push(request.url());
      await route.abort();
    } else if (isHashRead(request)) {
      hashReads++;
      // WebKit cannot fulfill 3xx. Keep this a real browser fetch: the loopback HTTP server returns the redirect.
      await route.continue({ headers: { ...request.headers(), [REDIRECT_HEADER]: '1' } });
    } else await route.continue();
  });
  await page.reload();
  await expect(page.getByText(UNAVAILABLE, { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(hashReads).toBe(1);
  expect(redirectFixture.responses).toHaveLength(1);
  expect(redirectFixture.responses[0]?.status).toBe(302);
  expect(forbidden).toEqual([]);
  await page.reload();
  await expect(page.getByText(UNAVAILABLE, { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(hashReads).toBe(2);
  expect(redirectFixture.responses).toHaveLength(2);
  expect(forbidden).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ghostpay.scanPrivacy.v1') ?? '{}') as unknown)).toEqual(PRIVATE_SETTINGS);
});

redirectTest('startup hash never follows a same-origin redirect either', async ({ context, page, redirectFixture }) => {
  const redirected: string[] = [];
  redirectFixture.setRedirect(307, '/isolation-redirect-target.js');
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/isolation-redirect-target.js') {
      redirected.push(request.url());
      await route.fulfill({ status: 200, body: 'redirected asset' });
    } else if (isHashRead(request)) {
      await route.continue({ headers: { ...request.headers(), [REDIRECT_HEADER]: '1' } });
    } else await route.continue();
  });
  await page.goto(redirectFixture.origin);
  await expect(page.getByText(UNAVAILABLE, { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(redirectFixture.responses).toHaveLength(1);
  expect(redirectFixture.responses[0]?.status).toBe(307);
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
