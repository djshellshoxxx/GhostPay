import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { ORIGIN, createInvoice, generateKeys, openFresh } from './helpers';

/** Collects console errors/warnings (CSP violations show up here) so tests can assert there are none. */
function watchConsole(page: Page): ConsoleMessage[] {
  const bad: ConsoleMessage[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') bad.push(m);
  });
  page.on('pageerror', (e) => {
    throw e;
  });
  return bad;
}

test('loads, shows the shell, and raises no console errors or CSP violations', async ({ page }) => {
  const bad = watchConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'GhostPay' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'What do you want to do?' })).toBeVisible();
  // The release hash is computed from the same-origin entry script.
  await expect(page.getByText(/^[0-9a-f]{64}$/, { exact: false }).first()).toBeVisible();
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("script-src 'self'");
  expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer');
  expect(bad.map((m) => m.text())).toEqual([]);
});

test('create invoice -> open link -> review screen (no manifest shipped, so payment is disabled)', async ({ page }) => {
  const bad = watchConsole(page);
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page, { memo: 'Thanks for your business', chainLabel: 'Ethereum Sepolia' });
  await expect(page.getByRole('img', { name: 'QR code containing the invoice link' })).toBeVisible();
  await expect(page.getByText('Bearer link')).toBeVisible();

  await openFresh(page, link);
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  await expect(page.getByText(/Signature matches key [0-9a-f]{66} \(not pinned\)/)).toBeVisible();
  await expect(page.getByText('Ethereum Sepolia', { exact: true })).toBeVisible();
  await expect(page.getByText('Thanks for your business')).toBeVisible();
  await expect(page.getByText('This payment cannot proceed')).toBeVisible();
  await expect(page.getByText(/Payments disabled on this chain/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('verified seller');
  expect(bad.map((m) => m.text())).toEqual([]);
});

test('invoice QR text stays local, rejects foreign links and requires a fresh preview after collapse', async ({ page }) => {
  const bad = watchConsole(page);
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page, { memo: 'Local QR preview only', chainLabel: 'Ethereum Sepolia' });
  const fragment = new URL(link).hash;
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
  await page.getByText('Scan an invoice QR', { exact: true }).click();
  const importer = page.getByRole('region', { name: 'Invoice QR import' });
  const location = page.url();
  await importer.getByLabel('Or paste QR text').fill(`https://foreign.invalid/${fragment}`);
  await importer.getByRole('button', { name: 'Use pasted text' }).click();
  await expect(page.getByRole('alert')).toContainText('Invoice QR not accepted');
  expect(page.url()).toBe(location);
  await expect(page.getByRole('button', { name: 'Open scanned invoice' })).toHaveCount(0);

  await importer.getByLabel('Or paste QR text').fill(fragment);
  await importer.getByRole('button', { name: 'Use pasted text' }).click();
  await expect(page.getByRole('heading', { name: 'Review scanned invoice' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('ghostpay.wallet-attempts.v1'))).toBeNull();
  expect(page.url()).toBe(location);
  await page.getByText('Scan an invoice QR', { exact: true }).click();
  await page.getByText('Scan an invoice QR', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open scanned invoice' })).toHaveCount(0);

  await importer.getByLabel('Or paste QR text').fill(fragment);
  await importer.getByRole('button', { name: 'Use pasted text' }).click();
  await page.getByRole('button', { name: 'Open scanned invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible();
  await expect(page.getByText('Local QR preview only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => sessionStorage.getItem('ghostpay.wallet-attempts.v1'))).toBeNull();
  expect(page.url()).toBe(location);
  expect(bad.map(message => message.text())).toEqual([]);
});

test('egress: parsing and reviewing an invoice makes no request except same-origin', async ({ page, context }) => {
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page, { encrypt: true });

  const seen: string[] = [];
  const blocked: string[] = [];
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    seen.push(url);
    if (new URL(url).origin !== ORIGIN) {
      blocked.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });
  page.on('websocket', (ws) => blocked.push(ws.url()));

  await openFresh(page, link);
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(blocked).toEqual([]);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((u) => u.startsWith(`${ORIGIN}/`))).toBe(true);
  // Nothing that was fetched carries the invoice: the fragment never leaves the browser.
  expect(seen.some((u) => u.includes('gpi='))).toBe(false);
});

test('hostile text in line items and memo is rendered inert', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"\'><svg onload=window.__xss=3>';
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page, { description: evil, memo: evil });
  await openFresh(page, link);
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  await expect(page.getByText(evil, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('main img, main script, main svg[onload]').count()).toBe(0);
  expect(dialogs).toEqual([]);
});

test('a tampered fragment fails closed', async ({ page }) => {
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page);
  const body = link.slice(`${ORIGIN}/#gpi=v1.`.length);
  const mid = Math.floor(body.length / 2);
  const flipped = `${body.slice(0, mid)}${body[mid] === 'A' ? 'B' : 'A'}${body.slice(mid + 1)}`;
  await openFresh(page, `${ORIGIN}/#gpi=v1.${flipped}`);
  await expect(page.getByText('Invoice rejected')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  // Truncation and a wrong prefix are rejected too.
  await openFresh(page, `${ORIGIN}/#gpi=v1.${body.slice(0, 40)}`);
  await expect(page.getByText('Invoice rejected')).toBeVisible();
  await openFresh(page, `${ORIGIN}/#gpi=v2.${body}`);
  await expect(page.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);
});

test('an oversized fragment is rejected', async ({ page }) => {
  await openFresh(page, `${ORIGIN}/#gpi=v1.${'A'.repeat(40_000)}`);
  await expect(page.getByRole('alert')).toContainText('16 KiB');
  await expect(page.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);
});

test('the fragment is removed from the address bar after it is read', async ({ page }) => {
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page);
  await openFresh(page, link);
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  expect(page.url()).toBe(`${ORIGIN}/`);
  expect(await page.evaluate(() => window.location.hash)).toBe('');
  expect(await page.evaluate(() => window.location.href)).toBe(`${ORIGIN}/`);
});

test('no secrets reach localStorage, sessionStorage, IndexedDB or cookies after key generation', async ({ page, context }) => {
  await page.goto('/');
  const meta = await generateKeys(page);
  await createInvoice(page);
  const dump = await page.evaluate(async () => {
    const out: Record<string, unknown> = {
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    };
    const dbs = 'databases' in indexedDB ? await indexedDB.databases() : [];
    const idb: Record<string, unknown> = {};
    for (const info of dbs) {
      if (info.name === undefined) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name as string);
        r.onsuccess = (): void => res(r.result);
        r.onerror = (): void => rej(new Error('idb'));
      });
      const stores: Record<string, unknown> = {};
      for (const name of Array.from(db.objectStoreNames)) {
        stores[name] = await new Promise((res) => {
          const r = db.transaction(name).objectStore(name).getAll();
          r.onsuccess = (): void => res(r.result);
        });
      }
      idb[info.name] = stores;
      db.close();
    }
    out['idb'] = idb;
    return JSON.stringify(out);
  });
  // No 32-byte (64 hex) value of any kind is stored: that is the size of every private key in the app.
  expect(dump).not.toMatch(/[0-9a-fA-F]{64}/);
  expect(dump).not.toContain(meta.slice(9, 60));
  expect(await context.cookies()).toEqual([]);
  // Reloading forgets the keys: they only ever lived in memory.
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  await expect(page.getByRole('button', { name: 'Generate new keys' })).toBeVisible();
});

test('keyboard: skip link and navigation are reachable, focus moves to the new view', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Home' }).first()).toBeFocused();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
});

test('light and dark colour schemes both render with readable text', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const fg = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(bg).not.toBe(fg);
    const lum = (rgb: string): number => {
      const [r, g, b] = (rgb.match(/\d+/g) ?? []).slice(0, 3).map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(bg), lum(fg)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    expect(ratio).toBeGreaterThan(7);
  }
});

test('mobile width: no horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await openFresh(page, link);
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
