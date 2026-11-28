import { expect, test, type Page } from '@playwright/test';
import { createInvoice, generateKeys } from './helpers';

// These cases exercise the built app with a paused clock and synthetic lifecycle events. They do not claim a
// physical-device sleep or a real BFCache restoration. No wallet, live chain or external service is used.
const POLICY = 'ghostpay.invoice-preview-retention.v1';
const DELAY = 300_000;
const DESCRIPTION = 'Synthetic retained invoice draft';
const preference = (page: Page) => page.getByLabel('Clear generated invoice previews automatically');
const preview = (page: Page) => page.getByRole('textbox', { name: 'Link', exact: true });
type ReturnEvent = 'pageshow' | 'visibilitychange' | 'resume';

async function restore(page: Page, event: ReturnEvent): Promise<void> {
  await page.evaluate((kind) => {
    if (kind === 'pageshow') window.dispatchEvent(new PageTransitionEvent(kind, { persisted: true }));
    else document.dispatchEvent(new Event(kind));
  }, event);
}

async function openInvoice(page: Page, baseURL: string | undefined) {
  if (baseURL === undefined) throw new Error('A local test origin is required.');
  const origin = new URL(baseURL).origin;
  let externalRequests = 0;
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      externalRequests++;
      await route.abort();
    } else await route.continue();
  });
  // Install before mounting: changing Date must not reset the existing idle lease's monotonic origin.
  await page.clock.install({ time: new Date('2026-11-26T00:00:00Z') });
  await page.goto('/');
  await generateKeys(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  const createdAt = await page.evaluate(() => Date.now());
  await createInvoice(page, { description: DESCRIPTION, encrypt: false });
  await page.evaluate(() => {
    localStorage.setItem('synthetic-retained-invoice', 'retained-invoice');
    sessionStorage.setItem('synthetic-pending-attempt', 'pending-attempt');
  });
  return { createdAt, externalRequests: () => externalRequests };
}

async function savedRecords(page: Page) {
  // Compare inside the browser; failures report booleans rather than storage contents or generated invoice links.
  const before = await page.evaluateHandle(() => ({
    local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }),
  }));
  return async () => {
    expect(await before.evaluate((saved) => ({
      localUnchanged: saved.local === JSON.stringify({ ...localStorage }),
      sessionUnchanged: saved.session === JSON.stringify({ ...sessionStorage }),
    }))).toEqual({ localUnchanged: true, sessionUnchanged: true });
    await before.dispose();
  };
}

for (const event of ['pageshow', 'visibilitychange', 'resume'] as const) {
  test(`invoice preview expires on simulated ${event} at its deadline with timers paused`, async ({ page, baseURL }) => {
    const state = await openInvoice(page, baseURL);
    await expect(preference(page)).toHaveValue('0');
    await preference(page).selectOption(String(DELAY));
    const expectRecordsPreserved = await savedRecords(page);
    await page.clock.setSystemTime(state.createdAt + DELAY - 1);
    await restore(page, event);
    await expect(preview(page)).toBeVisible();
    await page.clock.setSystemTime(state.createdAt + DELAY);
    await restore(page, event);
    await expect(preview(page)).toHaveCount(0);
    await expect(page.getByText(/The invoice preview closed under your retention setting/)).toBeVisible();
    await expect(page.getByLabel('Item 1 description')).toHaveValue(DESCRIPTION);
    await expect(page.getByLabel('Token amount')).toHaveValue('0.5');
    await expectRecordsPreserved();
    expect(state.externalRequests()).toBe(0);
  });
}

test('returning from suspension preserves a default-off preview', async ({ page, baseURL }) => {
  const state = await openInvoice(page, baseURL);
  const expectRecordsPreserved = await savedRecords(page);
  await page.clock.setSystemTime(state.createdAt + DELAY + 1);
  await restore(page, 'pageshow');
  await expect(preview(page)).toBeVisible();
  await expect(preference(page)).toHaveValue('0');
  await expect(page.getByText(/The invoice preview closed under your retention setting/)).toHaveCount(0);
  await expectRecordsPreserved();
  expect(state.externalRequests()).toBe(0);
});

test('resume rereads revoked cleanup consent without a delivered storage event', async ({ page, baseURL }) => {
  const state = await openInvoice(page, baseURL);
  await preference(page).selectOption(String(DELAY));
  await page.getByRole('button', { name: 'Preview screen-data cleanup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear previewed screen data', exact: true })).toBeVisible();
  // Simulate a changed saved policy whose storage event was missed while this page was suspended.
  await page.evaluate((key) => { localStorage.setItem(key, '{"delay":0}'); }, POLICY);
  const expectRecordsPreserved = await savedRecords(page);
  await page.clock.setSystemTime(state.createdAt + DELAY + 1);
  await restore(page, 'resume');
  await expect(preview(page)).toBeVisible();
  await expect(preference(page)).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Clear previewed screen data', exact: true })).toHaveCount(0);
  await expectRecordsPreserved();
  expect(state.externalRequests()).toBe(0);
});
