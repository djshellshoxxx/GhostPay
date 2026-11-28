import { expect, test } from '@playwright/test';
import { configureRpc, CORS, mockNetwork, RPC, stageVerifiedErc20Payment, type MockNetworkState } from './flowMocks';
import { generateKeys, ORIGIN } from './helpers';

const INDEXER = 'https://indexer.e2e.test';
const FINISHED = 'Finished. 0 announcements checked, 0 payments found.';
const CAVEAT = 'An indexer can omit announcements even when block hashes match. These results may be missing payments.';
const hash = (block: number): string => `0x${block.toString(16).padStart(64, '0')}`;

for (const layout of [
  { name: 'desktop', width: 1280, locale: 'en', chain: 'Chain', startBlock: 'Start block', start: 'Start scan' },
  { name: '320px RTL', width: 320, locale: 'ar', chain: 'السلسلة', startBlock: 'كتلة البداية', start: 'بدء المسح' },
] as const) {
  test(`indexer completion discloses possible missing payments with details closed (${layout.name})`, async ({ page, context }) => {
    await page.setViewportSize({ width: layout.width, height: 850 });
    const state: MockNetworkState = {};
    await mockNetwork(context, state);
    // Indexer verification also reads genesis, unlike the ordinary flow fixture's end-of-window reads.
    // Give that synthetic block a valid zero parent instead of the shared mock's hash(-1).
    await context.route(`${RPC}/**`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON() as { id: number; method: string; params: unknown[] };
      if (body.method !== 'eth_getBlockByNumber' || body.params[0] !== '0x0') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { number: '0x0', hash: hash(0), parentHash: hash(0) } }),
      });
    });
    const indexerRequests: URL[] = [];
    await context.route(`${INDEXER}/**`, async (route) => {
      const request = route.request();
      const headers = { ...CORS, 'access-control-allow-methods': 'GET, OPTIONS' };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      const url = new URL(request.url());
      indexerRequests.push(url);
      expect(request.method()).toBe('GET');
      expect(url.pathname).toBe('/v1/logs');
      expect([...url.searchParams.keys()].sort()).toEqual(['chainId', 'from', 'pageSize', 'to']);
      expect(url.searchParams.get('chainId')).toBe('84532');
      const from = Number(url.searchParams.get('from'));
      const to = Math.min(Number(url.searchParams.get('to')), 500);
      expect(from).toBe(0);
      expect(to).toBe(500);
      // The indexer supplies a complete canonical header range, but omits the genuine synthetic payment in RPC.
      // Matching block hashes cannot prove that every announcement was returned.
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          headers: Array.from({ length: to - from + 1 }, (_, i) => {
            const block = from + i;
            return { number: String(block), hash: hash(block), parentHash: hash(Math.max(0, block - 1)) };
          }),
          announcements: [],
        }),
      });
    });
    const offOrigin: string[] = [];
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith('http') && ![ORIGIN, RPC, INDEXER].includes(url.origin)) offOrigin.push(url.href);
    });
    await configureRpc(page);
    await page.goto('/');
    const meta = await generateKeys(page);
    stageVerifiedErc20Payment(state, meta);
    expect(state.logs).toHaveLength(2);

    await page.locator('nav button[data-view="settings"]').click();
    await page.getByLabel('Announcement source', { exact: true }).selectOption('indexer');
    await page.getByLabel('Base Sepolia indexer URL', { exact: true }).fill(INDEXER);
    await page.getByRole('button', { name: 'Save scan privacy', exact: true }).click();
    await expect(page.getByText('Scan privacy settings saved. They apply to the next scan.', { exact: true })).toBeVisible();
    if (layout.locale === 'ar') {
      await page.getByLabel('Language', { exact: true }).selectOption('ar');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    }
    await page.locator('nav button[data-view="scan"]').click();
    const scan = page.locator('section[aria-labelledby="scan-h"]');
    const disclosure = scan.locator('details').filter({ has: page.getByText('What each party learns with your scan privacy settings', { exact: true }) });
    await expect(disclosure).not.toHaveAttribute('open');
    await scan.getByLabel(layout.chain, { exact: true }).selectOption({ label: 'Base Sepolia' });
    await scan.getByLabel(layout.startBlock, { exact: true }).fill('0');
    await scan.getByRole('button', { name: layout.start, exact: true }).click();

    // Scan outcomes remain reviewed English in unreviewed locales; surrounding Arabic still exercises RTL layout.
    const completion = scan.getByRole('note').filter({ hasText: FINISHED });
    await expect(completion).toBeVisible();
    expect(indexerRequests).toHaveLength(1);
    expect(workers.some((url) => url.startsWith(`${ORIGIN}/assets/scanner.worker-`))).toBe(true);
    expect(offOrigin).toEqual([]);
    await expect(scan.getByRole('alert')).toHaveCount(0);
    await expect(disclosure).not.toHaveAttribute('open');
    await expect(completion).toContainText(CAVEAT);
    await expect(completion).toContainText(FINISHED);

    await completion.scrollIntoViewIfNeeded();
    await expect(completion).toBeInViewport();
    const caveatRects = await completion.evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const offset = node.textContent?.indexOf(text) ?? -1;
        if (offset < 0) continue;
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + text.length);
        return [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right }));
      }
      return [];
    }, CAVEAT);
    expect(caveatRects.length).toBeGreaterThan(layout.width === 320 ? 1 : 0);
    for (const rect of caveatRects) {
      expect(rect.left).toBeGreaterThanOrEqual(-1);
      expect(rect.right).toBeLessThanOrEqual(layout.width + 1);
    }
    const documentWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    expect(documentWidth).toBeLessThanOrEqual(layout.width + 1);
  });
}
