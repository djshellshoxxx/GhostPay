import { expect, test, type BrowserContext } from '@playwright/test';
import { eip712DomainSeparator } from '@ghostpay/chain-adapters';
import { encodeAbiParameters } from 'viem';
import { FAKE_ROUTER } from '../src/test/fakeManifest';
import { configureRpc, CORS, mockNetwork, RPC, SEL, word } from './flowMocks';
import { approveWalletDisclosure, createInvoice, generateKeys, openFresh } from './helpers';
import { injectWallet, type WalletControls } from './walletFixture';

const token = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const account = '0x5555555555555555555555555555555555555555';

async function mockToken(context: BrowserContext, supportsPermit: boolean): Promise<void> {
  const name = 'Fixture token';
  const responses = new Map([
    [SEL('allowance(address,address)'), word('0')],
    [SEL('name()'), encodeAbiParameters([{ type: 'string' }], [name])],
    [SEL('nonces(address)'), word('0')],
    [SEL('DOMAIN_SEPARATOR()'), supportsPermit
      ? eip712DomainSeparator({ name, version: '2', chainId: 84532, verifyingContract: token }) : word('0')],
  ]);
  await context.route(`${RPC}/**`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as { id: number; method: string; params: [{ to?: string; data?: string }?] };
    if (body.method !== 'eth_call') return route.fallback();
    const call = body.params[0];
    if (call?.to?.toLowerCase() !== token.toLowerCase()) return route.fallback();
    const result = responses.get(call.data?.slice(0, 10) ?? '');
    if (result === undefined) return route.fallback();
    return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result }, headers: CORS });
  });
}

for (const method of ['eth_signTypedData_v4', 'eth_sendTransaction'] as const) {
  test(`reviews the exact ${method} token request and handles wallet rejection`, async ({ page, context }) => {
    await mockNetwork(context, {});
    await mockToken(context, method === 'eth_signTypedData_v4');
    await configureRpc(page);
    await injectWallet(page, {});
    await page.goto('/');
    await generateKeys(page);
    const link = await createInvoice(page, { tokenSymbol: 'USDC' });
    await openFresh(page, link);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /Connect E2E Wallet/ }).click();
    await approveWalletDisclosure(page, 'eth_requestAccounts');
    await page.evaluate((selected) => {
      (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.rejectMethod = selected;
    }, method);
    await page.getByRole('button', { name: 'Prepare payment', exact: true }).click();
    if (method === 'eth_sendTransaction') await page.getByRole('button', { name: 'Approve exactly, then send payment in my wallet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Review wallet disclosure' });
    await expect(dialog.getByText(method, { exact: true })).toBeVisible();
    await expect(dialog.getByText(account, { exact: true })).toBeVisible();
    await expect(dialog.getByText(new RegExp('^' + token + '$', 'i'))).toBeVisible();
    await expect(dialog.getByText(FAKE_ROUTER, { exact: true })).toBeVisible();
    await expect(dialog.getByText('500000', { exact: true })).toBeVisible();
    await expect(dialog.getByText(method === 'eth_sendTransaction' ? 'approve' : 'Permit', { exact: true })).toBeVisible();
    await dialog.getByText('Exact request (JSON)', { exact: true }).click();
    const preview: unknown = JSON.parse(await dialog.locator('pre').innerText());
    const calls = () => page.evaluate(() => (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.calls);
    expect(await calls()).not.toContain(method);
    await approveWalletDisclosure(page, method);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/You rejected the request in your wallet/).first()).toBeVisible();
    const received = await page.evaluate(() => (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.rejectedRequest);
    expect(received).toEqual(preview);
    expect((await calls()).filter((call) => call === method)).toHaveLength(1);
    if (method === 'eth_signTypedData_v4') expect(await calls()).not.toContain('eth_sendTransaction');
  });
}
