import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFragment } from '@ghostpay/invoice-schema';
import { expect, test as base, type Page } from '@playwright/test';
import { generateKeys } from './helpers';

// GP-PAGES-04 browser acceptance with a real Chromium page freeze (CDP Page.setWebLifecycleState) on the built
// full/lean application. Chromium delivers the trusted hidden/freeze/resume events; Playwright's clock holds timers and
// monotonic time while the wall clock jumps, which models OS sleep. It does not exercise physical sleep, BFCache or
// any browser other than Chromium. Runs in the desktop project only (the device projects match device specs).
// Playwright's ordinary page fixture emulates focus even in the background. Connect to the
// disposable browser's default context without those overrides so Chromium can really freeze it.
/**
 * Chromium writes DevToolsActivePort (the debugging port on the first line, the browser path on the second) only once it
 * has bound `--remote-debugging-port=0`, which can be slightly after `launchServer` resolves, so a single read right
 * after launch sometimes fails with ENOENT before any page exists (hosted CI, runs 45889530142 and 45913336841).
 * Wait, bounded, for the file to exist with a numeric port. Any other read error, or no port within the bound, still
 * fails the fixture; no freeze assertion is changed.
 */
async function waitForDevToolsPort(file: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const port = (await readFile(file, 'utf8')).split('\n')[0] ?? '';
      if (/^[1-9][0-9]{0,4}$/.test(port)) return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (Date.now() >= deadline) throw new Error(`Chromium did not publish a DevTools port in ${file} within ${String(timeoutMs)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const test = base.extend<{ nativePage: Page }>({
  nativePage: async ({ playwright, launchOptions }, use) => {
    const server = await playwright.chromium.launchServer({
      ...launchOptions,
      host: '127.0.0.1',
      ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
      args: [...(launchOptions.args ?? []), '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
    });
    try {
      const profile = server.process().spawnargs.find((arg) => arg.startsWith('--user-data-dir='));
      if (!profile) throw new Error('Missing temporary Chromium profile');
      const port = await waitForDevToolsPort(join(profile.slice('--user-data-dir='.length), 'DevToolsActivePort'));
      const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
      try {
        const context = browser.contexts()[0]!;
        await context.addInitScript(() => {
          localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ lockTimeoutMin: 1 }));
        });
        await use(await context.newPage());
      } finally {
        await browser.close();
      }
    } finally {
      await server.close();
    }
  },
});

const minute = 60_000;
for (const { frozenMs, delayedCheck } of [
  { frozenMs: minute - 1, delayedCheck: false },
  { frozenMs: minute, delayedCheck: false },
  { frozenMs: minute + 1, delayedCheck: false },
  { frozenMs: 15_000, delayedCheck: true },
]) {
  test(`idle lock after Chromium freezes for ${frozenMs} ms${delayedCheck ? ' then remains in the background' : ''}`, async ({ nativePage: page, baseURL }) => {
    if (!baseURL) throw new Error('Missing Pages preview URL');
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.goto(baseURL);
    const seller = await generateKeys(page);
    const create = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Create invoice', exact: true });
    if (!delayedCheck && frozenMs < minute) {
      await create.click();
      await page.getByLabel('Token amount').fill('0.5');
      await page.getByLabel('Item 1 description').fill('Freeze control');
      await page.getByLabel('Item 1 unit price').fill('1.00');
    }
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 5000)));
    await page.keyboard.press('Shift');
    const activity = await page.evaluate(() => Date.now());
    const tracker = await page.evaluateHandle(() => {
      const events: string[] = [];
      let timerRan = false;
      for (const kind of ['visibilitychange', 'freeze', 'resume']) {
        document.addEventListener(kind, (event) => {
          if (event.isTrusted) events.push(`${event.type}:${document.visibilityState}`);
        });
      }
      setTimeout(() => { timerRan = true; }, 1);
      return { events, timerRan: () => timerRan, monotonic: performance.now() };
    });
    const session = await page.context().newCDPSession(page);
    await session.send('Page.setWebLifecycleState', { state: 'frozen' });
    await expect.poll(() => tracker.evaluate((state) => state.events)).toContain('freeze:hidden');
    await page.clock.setSystemTime(activity + frozenMs);
    await session.send('Page.setWebLifecycleState', { state: 'active' });
    await expect.poll(() => tracker.evaluate((state) => state.events)).toEqual([
      'visibilitychange:hidden', 'freeze:hidden', 'resume:hidden',
    ]);
    expect(await tracker.evaluate((state) => state.timerRan())).toBe(false);
    expect(await tracker.evaluate((state) => performance.now() - state.monotonic)).toBe(0);

    const locked = page.getByRole('note').filter({ hasText: 'Session locked after inactivity' });
    if (delayedCheck) {
      // Chromium resumed the hidden tab before expiry. Withhold callbacks and input past the
      // deadline, then deliver the overdue periodic check while the tab is still in the background.
      await expect(create).toBeEnabled();
      await page.clock.setSystemTime(activity + minute + 1);
      expect(await page.evaluate(() => document.visibilityState)).toBe('hidden');
      expect(await tracker.evaluate((state) => state.timerRan())).toBe(false);
      await expect(locked).toHaveCount(0);
      await page.clock.fastForward(20_000);
      expect(await tracker.evaluate((state) => state.timerRan())).toBe(true);
    } else if (frozenMs < minute) {
      await expect(create).toBeEnabled();
      // Activate the prepared form without pointer/keyboard input granting a new timeout.
      await page.getByRole('button', { name: 'Create invoice link' }).dispatchEvent('click');
      const link = page.getByRole('textbox', { name: 'Link', exact: true });
      await expect(link).toHaveValue(/#gpi=v1\./);
      const invoice = await parseFragment(new URL(await link.inputValue()).hash);
      expect(invoice.verification.signatureValid).toBe(true);
      expect(invoice.invoice.metaAddress).toBe(seller);
      return;
    }
    await expect(locked).toBeVisible();
    await expect(create).toBeDisabled();
    await page.keyboard.press('Shift');
    await expect(create).toBeDisabled();
  });
}
