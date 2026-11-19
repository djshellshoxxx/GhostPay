import { expect, test, type Page } from '@playwright/test';

const SETTINGS_KEY = 'ghostpay.settings.v1';
const NETWORK_KEY = 'ghostpay.networkProfiles.v1';
const settings = async (page: Page): Promise<void> => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
};

test('TM4: a session-only endpoint stays out of storage and settings exchange and expires on reload', async ({ page }) => {
  await page.goto('/');
  await settings(page);
  // Deliberately not detectable by the credential heuristic: the user's retention choice still applies.
  const endpoint = 'https://rpc.example/provider-assigned-opaque-value';
  await page.getByLabel('Base Sepolia RPC URL', { exact: true }).fill(endpoint);
  await page.getByLabel('Keep this endpoint for this session only (not saved to this browser)', { exact: true }).check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)).not.toContain('provider-assigned-opaque-value');
  const exchange = page.getByRole('group', { name: 'Export settings to another device' });
  await expect(exchange.getByRole('checkbox', { name: 'RPC endpoints', exact: true })).toBeDisabled();
  await expect(exchange.getByText(/Session-only RPC URLs.*omitted/)).toBeVisible();
  await page.reload();
  await settings(page);
  await expect(page.getByLabel('Base Sepolia RPC URL', { exact: true })).toHaveValue('');
});

test('TM4/TM14: credential export is omitted and invalid or pending profile choices block RPC until explicitly repaired', async ({ page }) => {
  const endpoint = 'https://rpc.example/?api_key=fixture-value';
  await page.addInitScript(({ settingsKey, networkKey, url }) => {
    localStorage.setItem(settingsKey, JSON.stringify({ rpcUrls: { '84532': url } }));
    localStorage.setItem(networkKey, '{broken');
  }, { settingsKey: SETTINGS_KEY, networkKey: NETWORK_KEY, url: endpoint });
  let providerRequests = 0;
  await page.route('https://rpc.example/**', async (route) => {
    providerRequests++;
    const request = route.request().postDataJSON() as { id: number };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x14a34' }) });
  });
  await page.goto('/');
  await settings(page);
  const network = page.getByRole('group', { name: 'Network profiles' });
  const saveProfile = network.getByRole('button', { name: 'Save network profiles' });
  await expect(network.getByText(/Network profile settings are invalid or unavailable/)).toBeVisible();
  await expect(network.getByText(/In effect now:/)).toHaveCount(0);
  const exchange = page.getByRole('group', { name: 'Export settings to another device' });
  await expect(exchange.getByRole('checkbox', { name: 'RPC endpoints', exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)).toContain('fixture-value');
  await page.getByRole('button', { name: 'Test Base Sepolia', exact: true }).click();
  await expect(page.getByText(/Network profile settings are invalid or unavailable/).first()).toBeVisible();
  expect(providerRequests).toBe(0);

  await saveProfile.click(); // Explicitly save the displayed Direct/single default to repair corrupt storage.
  await expect(network.getByText(/In effect now: RPC reads Direct/)).toBeVisible();
  await page.getByRole('button', { name: 'Test Base Sepolia', exact: true }).click();
  await expect(page.getByText(/Connected\. The endpoint reports the expected chain id/)).toBeVisible();
  expect(providerRequests).toBe(1);

  await network.getByLabel('RPC mode', { exact: true }).selectOption('own-node');
  await saveProfile.click(); // No acknowledgement: no fallback to the already configured public provider.
  await expect(network.getByText(/unacknowledged saved profile are blocked/)).toBeVisible();
  await page.getByRole('button', { name: 'Test Base Sepolia', exact: true }).click();
  await expect(page.getByText(/RPC requests are blocked until you acknowledge/)).toBeVisible();
  expect(providerRequests).toBe(1);

  await network.getByLabel('I have read this notice; apply my choice', { exact: true }).check();
  await saveProfile.click();
  await page.getByRole('button', { name: 'Test Base Sepolia', exact: true }).click();
  await expect(page.getByText(/Own-node mode needs an RPC URL on this computer/)).toBeVisible();
  expect(providerRequests).toBe(1);

  await network.getByLabel('RPC mode', { exact: true }).selectOption('single');
  await saveProfile.click();
  await page.getByRole('button', { name: 'Test Base Sepolia', exact: true }).click();
  await expect(page.getByText(/Connected\. The endpoint reports the expected chain id/)).toBeVisible();
  expect(providerRequests).toBe(2);
});
