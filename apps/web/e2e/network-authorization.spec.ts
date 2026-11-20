import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { encodeAbiParameters } from 'viem';
import { createInvoice, generateKeys, ORIGIN } from './helpers';
import { installSweepNetwork, SWEEP_RPC } from './sweep-network';

const SETTINGS_KEY = 'ghostpay.settings.v1';
const PROFILE_KEY = 'ghostpay.networkProfiles.v1';
const SCAN_KEY = 'ghostpay.scanPrivacy.v1';
const NEXT_RPC = 'https://rpc.replacement.e2e.test';
const REFUSED = /Network access is not authorized/;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const sweep = (page: Page) => page.locator('section[aria-labelledby="sw-h"]');
const readBalance = (page: Page) => sweep(page).getByRole('button', { name: 'Read balance from the Settings RPC', exact: true });

interface RpcRequest {
  readonly id: string | number;
  readonly method: string;
  readonly params: readonly unknown[];
}

function rpcRequest(request: Request): RpcRequest | undefined {
  if (request.method() !== 'POST') return undefined;
  let raw: unknown;
  try { raw = JSON.parse(request.postData() ?? 'null') as unknown; } catch { return undefined; }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if ((typeof value['id'] !== 'string' && typeof value['id'] !== 'number') || typeof value['method'] !== 'string' || !Array.isArray(value['params'])) return undefined;
  return { id: value['id'], method: value['method'], params: value['params'] };
}

function isBalanceRead(request: Request, owner: string): boolean {
  const payload = rpcRequest(request);
  const call = payload?.params[0];
  if (payload?.method !== 'eth_call' || typeof call !== 'object' || call === null) return false;
  const data = (call as Record<string, unknown>)['data'];
  return typeof data === 'string' && data.startsWith('0x70a08231') && data.toLowerCase().endsWith(owner.slice(2).toLowerCase());
}

/** Observe browser requests themselves; these assertions do not rely on a mocked RPC return value. */
function observeForeignRequests(context: BrowserContext): Request[] {
  const seen: Request[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== ORIGIN && (url.protocol === 'http:' || url.protocol === 'https:')) seen.push(request);
  });
  return seen;
}

/** Seed public preferences once. Genuine reloads must preserve them without an init script rewriting them. */
async function configureOnce(page: Page, extra: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await page.goto('/');
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, { [SETTINGS_KEY]: { rpcUrls: { '84532': SWEEP_RPC } }, ...extra });
  await page.reload();
}

/** Actual built Worker and scan validation establish the payment; no runtime session/state is injected. */
async function scanPayment(page: Page): Promise<void> {
  await nav(page).getByRole('button', { name: 'Scan and receive', exact: true }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  await expect(page.getByText(/Finished\. 1 announcements checked, 1 payments found\./)).toBeVisible();
}

async function openSweep(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sweep this payment', exact: true }).click();
  await expect(readBalance(page)).toBeVisible();
}

test('saved endpoints authorize no background request and local key/invoice operations work offline', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  await context.route('**/*', (route) => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
  await configureOnce(page, { [SETTINGS_KEY]: { rpcUrls: { '84532': SWEEP_RPC }, relayerUrl: 'https://relayer.unapproved.e2e.test' } });
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);

  await context.setOffline(true);
  await generateKeys(page);
  const link = await createInvoice(page, { encrypt: true, memo: 'Offline synthetic invoice' });
  expect(link).toContain('#gpi=v1.');
  expect(foreign).toEqual([]);
});

for (const policy of [
  { name: 'required private path with direct transport', key: SCAN_KEY, value: { transport: 'direct', requireProxy: true } },
  { name: 'acknowledged own-node mode', key: PROFILE_KEY, value: { rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'own-node', noticeAcknowledged: true } },
  { name: 'corrupt required-private-path preference', key: SCAN_KEY, value: { transport: 'direct', requireProxy: null } },
  { name: 'corrupt own-node mode', key: PROFILE_KEY, value: { rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: null, noticeAcknowledged: true } },
] as const) {
  test(`${policy.name} blocks a configured public RPC before dispatch, including after reload`, async ({ context, page }) => {
    const foreign = observeForeignRequests(context);
    await context.route('**/*', (route) => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
    await configureOnce(page, { [policy.key]: policy.value });
    for (let visit = 0; visit < 2; visit++) {
      if (visit !== 0) await page.reload();
      await nav(page).getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Test Base Sepolia', exact: true }).click();
      await expect(page.getByText(REFUSED).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(foreign).toEqual([]);
    }
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, policy.key)).toEqual(policy.value);
  });
}

test('cancelling a loaded payment does not silently restart payment preflight', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  const network = await installSweepNetwork(context, page, 'success');
  await configureOnce(page);
  await generateKeys(page);
  const link = await createInvoice(page, { encrypt: true });
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(network.state.methods).toContain('eth_chainId');
  const before = foreign.length;

  await page.getByRole('button', { name: 'Cancel network activity', exact: true }).click();
  await expect(page.getByText('Network activity cancelled. Start a new action to authorize another request.', { exact: true })).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  expect(foreign).toHaveLength(before);
  await page.getByRole('button', { name: 'Review network access for this invoice', exact: true }).click();
  await page.waitForLoadState('networkidle');
  expect(foreign.length).toBeGreaterThan(before);
  expect(foreign.slice(before).every((request) => new URL(request.url()).origin === SWEEP_RPC)).toBe(true);
  expect(network.state.raws).toEqual([]);
  expect(network.state.unexpected).toEqual([]);
});

test('replacing an invoice aborts a renewed preflight grant before its old request can retry', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  const network = await installSweepNetwork(context, page, 'success');
  await configureOnce(page);
  await generateKeys(page);
  const original = await createInvoice(page, { encrypt: true, description: 'Initial network invoice' });
  const replacement = await createInvoice(page, { encrypt: true, description: 'Replacement network invoice' });
  await page.goto(original);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Cancel network activity', exact: true }).click();

  let heldRequest: Request | undefined;
  let release: (() => void) | undefined;
  let released = false;
  await context.route(`${SWEEP_RPC}/**`, async (route) => {
    const request = route.request();
    if (heldRequest !== undefined || rpcRequest(request)?.method !== 'eth_chainId') return route.fallback();
    heldRequest = request;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.abort('failed');
    released = true;
  });
  await page.getByRole('button', { name: 'Review network access for this invoice', exact: true }).click();
  await expect.poll(() => heldRequest !== undefined).toBe(true);
  // This is a same-document invoice replacement, so the Pay component's own cleanup must revoke the renewed grant.
  await page.goto(replacement);
  await expect(page.getByText('Replacement network invoice', { exact: true })).toBeVisible();
  await expect.poll(() => {
    const failure = heldRequest?.failure();
    return failure !== undefined && failure !== null;
  }).toBe(true);
  // Same-document navigation can retain networkidle from the prior invoice. Continue needs the new manifest reads.
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.waitForLoadState('networkidle');
  expect(network.state.methods.filter((method) => method === 'eth_chainId')).toHaveLength(2);
  const before = foreign.length;
  const completedMethods = [...network.state.methods];
  if (release === undefined) throw new Error('Expected the renewed preflight request to be held');
  release();
  await expect.poll(() => released).toBe(true);
  await page.waitForLoadState('networkidle');
  expect(foreign).toHaveLength(before);
  expect(network.state.methods).toEqual(completedMethods);
  expect(network.state.methods.filter((method) => method === 'eth_chainId')).toHaveLength(2);
  expect(network.state.raws).toEqual([]);
  expect(network.state.unexpected).toEqual([]);
});

test('replacing Settings in a second tab does not authorize a loaded payment to contact the new provider', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  const network = await installSweepNetwork(context, page, 'success');
  await configureOnce(page);
  await generateKeys(page);
  const link = await createInvoice(page, { encrypt: true });
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(network.state.methods).toContain('eth_chainId');
  const before = foreign.length;

  const other = await context.newPage();
  await other.goto('/');
  await nav(other).getByRole('button', { name: 'Settings', exact: true }).click();
  await other.getByLabel('Base Sepolia RPC URL', { exact: true }).fill(NEXT_RPC);
  const replaced = page.evaluate((key) => new Promise<void>((resolve) => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) return;
      window.removeEventListener('storage', onStorage);
      resolve();
    };
    window.addEventListener('storage', onStorage);
  }), SETTINGS_KEY);
  await other.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(other.getByText('Settings saved.', { exact: true })).toBeVisible();
  await replaced;
  await page.waitForLoadState('networkidle');
  expect(foreign).toHaveLength(before);
  expect(foreign.filter((request) => new URL(request.url()).origin === NEXT_RPC)).toEqual([]);
  expect(network.state.raws).toEqual([]);
  expect(network.state.unexpected).toEqual([]);
});

test('an open Settings form adopts another tab’s endpoint without silently overwriting or contacting it', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  await context.route('**/*', (route) => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
  await configureOnce(page);
  await nav(page).getByRole('button', { name: 'Settings', exact: true }).click();
  const firstEndpoint = page.getByLabel('Base Sepolia RPC URL', { exact: true });
  await expect(firstEndpoint).toHaveValue(new URL(SWEEP_RPC).href);
  const other = await context.newPage();
  await other.goto('/');
  await nav(other).getByRole('button', { name: 'Settings', exact: true }).click();
  await other.getByLabel('Base Sepolia RPC URL', { exact: true }).fill(NEXT_RPC);
  await other.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(other.getByText('Settings saved.', { exact: true })).toBeVisible();
  await expect(firstEndpoint).toHaveValue(new URL(NEXT_RPC).href);

  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as { rpcUrls: Record<string, string> }, SETTINGS_KEY);
  expect(saved.rpcUrls['84532']).toBe(new URL(NEXT_RPC).href);
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
});

test('Sweep entry and reentry send no balance request until a new explicit action', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  const network = await installSweepNetwork(context, page, 'success');
  await configureOnce(page);
  const meta = await generateKeys(page);
  const payment = network.setPayment(meta);
  await scanPayment(page);
  const count = (): number => foreign.filter((request) => isBalanceRead(request, payment.stealthAddress)).length;
  const before = count();
  await openSweep(page);
  await page.waitForLoadState('networkidle');
  expect(count()).toBe(before);
  await expect(sweep(page).getByText('5 USDC', { exact: true })).toHaveCount(0);

  await readBalance(page).click();
  await expect(sweep(page).getByText('5 USDC', { exact: true })).toBeVisible();
  expect(count()).toBe(before + 1);
  await nav(page).getByRole('button', { name: 'Home', exact: true }).click();
  await nav(page).getByRole('button', { name: 'Sweep', exact: true }).click();
  await expect(readBalance(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(count()).toBe(before + 1);
  await expect(sweep(page).getByText('5 USDC', { exact: true })).toHaveCount(0);
  await readBalance(page).click();
  await expect(sweep(page).getByText('5 USDC', { exact: true })).toBeVisible();
  expect(count()).toBe(before + 2);
  expect(network.state.raws).toEqual([]);
  expect(network.state.unexpected).toEqual([]);
});

test('a real second-tab endpoint replacement cancels stale balance delivery and requires another click', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  const network = await installSweepNetwork(context, page, 'success');
  await configureOnce(page);
  const meta = await generateKeys(page);
  const payment = network.setPayment(meta);
  await scanPayment(page);
  await openSweep(page);

  let release: (() => void) | undefined;
  let held = false;
  let responseFinished = false;
  await context.route(`${SWEEP_RPC}/**`, async (route) => {
    const request = route.request();
    const payload = rpcRequest(request);
    if (payload === undefined || !isBalanceRead(request, payment.stealthAddress)) return route.fallback();
    held = true;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: encodeAbiParameters([{ type: 'uint256' }], [5_000_000n]) }) });
    responseFinished = true;
  });
  await context.route(`${NEXT_RPC}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const payload = rpcRequest(route.request());
    expect(payload).toBeDefined();
    // balanceOf is an ABI uint256 result, unlike the short quantity returned by eth_chainId.
    const result = payload?.method === 'eth_chainId' ? '0x14a34' : isBalanceRead(route.request(), payment.stealthAddress) ? encodeAbiParameters([{ type: 'uint256' }], [7_000_000n]) : undefined;
    expect(result).toBeDefined();
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: payload?.id, result }) });
  });
  const oldBalances = (): number => foreign.filter((request) => new URL(request.url()).origin === SWEEP_RPC && isBalanceRead(request, payment.stealthAddress)).length;
  const before = oldBalances();
  await readBalance(page).click();
  await expect.poll(() => held).toBe(true);

  const other = await context.newPage();
  await other.goto('/');
  await nav(other).getByRole('button', { name: 'Settings', exact: true }).click();
  await other.getByLabel('Base Sepolia RPC URL', { exact: true }).fill(NEXT_RPC);
  // Saving an endpoint is not a connection check and must not contact it.
  await other.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(other.getByText('Settings saved.', { exact: true })).toBeVisible();
  await expect(sweep(page).getByText(/rpc\.replacement\.e2e\.test/).first()).toBeVisible();
  expect(foreign.filter((request) => new URL(request.url()).origin === NEXT_RPC)).toEqual([]);
  if (release === undefined) throw new Error('Expected the old balance response to be held');
  release();
  await expect.poll(() => responseFinished).toBe(true);
  await page.waitForLoadState('networkidle');
  await expect(sweep(page).getByText('5 USDC', { exact: true })).toHaveCount(0);
  expect(oldBalances()).toBe(before + 1);

  await readBalance(page).click();
  await expect(sweep(page).getByText('7 USDC', { exact: true })).toBeVisible();
  expect(oldBalances()).toBe(before + 1);
  const replacementReads = foreign.filter((request) => new URL(request.url()).origin === NEXT_RPC);
  expect(replacementReads.filter((request) => isBalanceRead(request, payment.stealthAddress))).toHaveLength(1);
  expect(replacementReads.some((request) => rpcRequest(request)?.method === 'eth_chainId')).toBe(true);
  expect(network.state.raws).toEqual([]);
  expect(network.state.unexpected).toEqual([]);
});

test('Sweep action consent cannot override an own-node selection changed in another tab', async ({ context, page }) => {
  const foreign = observeForeignRequests(context);
  const network = await installSweepNetwork(context, page, 'success');
  await configureOnce(page);
  const meta = await generateKeys(page);
  network.setPayment(meta);
  await scanPayment(page);
  await openSweep(page);
  const before = foreign.length;
  const other = await context.newPage();
  await other.goto('/');
  const policyChanged = page.evaluate((key) => new Promise<void>((resolve) => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) return;
      window.removeEventListener('storage', onStorage);
      resolve();
    };
    window.addEventListener('storage', onStorage);
  }), SCAN_KEY);
  await other.evaluate(({ profileKey, scanKey }) => {
    localStorage.setItem(profileKey, JSON.stringify({ rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'own-node', noticeAcknowledged: true }));
    localStorage.setItem(scanKey, JSON.stringify({ transport: 'local-proxy', requireProxy: true, endpoints: { '84532': 'https://localhost:9050/' } }));
  }, { profileKey: PROFILE_KEY, scanKey: SCAN_KEY });
  await policyChanged;
  // This action may explicitly acknowledge the Settings-RPC/private-scan distinction. It must not bypass own-node mode.
  await readBalance(page).click();
  await expect(sweep(page).getByText(REFUSED).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(foreign).toHaveLength(before);
  await expect(sweep(page).getByText('5 USDC', { exact: true })).toHaveCount(0);
  expect(network.state.raws).toEqual([]);
  expect(network.state.unexpected).toEqual([]);
});
