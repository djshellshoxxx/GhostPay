import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { getAddress, type Address, type Hex } from 'viem';
import { generateKeys, openFresh } from './helpers';
import { ANVIL_ACCOUNTS, Anvil, loadDevnet, type DevnetState } from './devnet/chain';
import { Erc20Wallet, installErc20Fixture, type Erc20Fixture, type Erc20Mode } from './devnet/erc20';
import { createErc20Invoice, walletDisclosure } from './devnet/erc20Ui';
import { openSite, PagesNetwork, PAGES_BASE } from './devnet/pages';
import { nav, walletJournal } from './devnet/ui';

const mode: Erc20Mode = (() => {
  const selected = process.env['GHOSTPAY_PAGES_ERC20'];
  if (selected !== 'plain' && selected !== 'permit') throw new Error('The ERC-20 boundary suite requires the dedicated plain or permit Pages run.');
  return selected;
})();
const GROSS = 100_000_000n;
const NET = 99_750_000n;
const DUPLICATE = 'A previous wallet attempt for this action already exists in this browser profile.';
const UNKNOWN_PAYMENT = 'The wallet request failed with an unknown outcome and may already have been submitted.';
test.setTimeout(180_000);

interface Journey {
  readonly anvil: Anvil;
  readonly state: DevnetState;
  readonly fixture: Erc20Fixture;
  readonly network: PagesNetwork;
  readonly context: BrowserContext;
  readonly payer: Page;
  readonly wallet: Erc20Wallet;
  readonly link: string;
}

/** Each boundary gets fresh browser storage and an isolated chain snapshot. The complete backup gate is exercised
 * in the companion recovery journey; these focused payer cases use the existing explicit UI waiver for invoice setup. */
async function withInvoice(browser: Browser, baseURL: string | undefined, run: (journey: Journey) => Promise<void>): Promise<void> {
  if (baseURL === undefined || !baseURL.endsWith(PAGES_BASE)) throw new Error('A real /GhostPay/ Pages artifact is required.');
  const state = loadDevnet();
  const anvil = new Anvil(state.rpcUrl);
  const fixture = await installErc20Fixture(anvil, state, mode, [ANVIL_ACCOUNTS.payer]);
  const snapshot = await fixture.snapshot();
  const network = new PagesNetwork(state, new URL(baseURL).origin);
  const contexts: BrowserContext[] = [];
  try {
    const sellerContext = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    contexts.push(sellerContext);
    await network.install(sellerContext);
    const seller = await sellerContext.newPage();
    await openSite(seller);
    await generateKeys(seller);
    const link = await createErc20Invoice(seller, baseURL, { description: 'ERC-20 interrupted browser payment' });
    await sellerContext.close();

    const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    contexts.push(context);
    await network.install(context);
    const payer = await context.newPage();
    const wallet = new Erc20Wallet(anvil, state, ANVIL_ACCOUNTS.payer);
    await wallet.inject(payer);
    await run({ anvil, state, fixture, network, context, payer, wallet, link });
    network.expectClean();
    expect(network.sentRaw).toHaveLength(0);
  } finally {
    await anvil.automine(true);
    for (const context of contexts) await context.close();
    await fixture.revert(snapshot);
  }
}

async function connect(page: Page, wallet: Erc20Wallet, link: string): Promise<void> {
  await page.bringToFront();
  await openFresh(page, link);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: `Connect ${wallet.name} (test.e2e.erc20)`, exact: true }).click();
  const disclosure = await walletDisclosure(page, 'eth_requestAccounts');
  await disclosure.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare payment', exact: true })).toBeEnabled();
}

async function prepare(journey: Journey): Promise<Address> {
  const { payer, wallet } = journey;
  await connect(payer, wallet, journey.link);
  await payer.getByRole('button', { name: 'Prepare payment', exact: true }).click();
  if (mode === 'permit') {
    const permit = await walletDisclosure(payer, 'eth_signTypedData_v4');
    expect(wallet.signatures).toHaveLength(0);
    await permit.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    await expect.poll(() => wallet.signatures.length).toBe(1);
  }
  const final = payer.locator('[aria-labelledby="final-h"]');
  await expect(final.getByRole('heading', { name: 'Final check before your wallet', exact: true })).toBeVisible();
  const destination = final.locator('dt').filter({ hasText: /^One-time destination$/ }).locator('xpath=following-sibling::dd[1]');
  return getAddress((await destination.textContent()) ?? '');
}

/** Stop at the payment disclosure, after any exact approval has really mined. No payment request has reached the wallet. */
async function paymentDisclosure(journey: Journey): Promise<Locator> {
  const { payer, wallet, fixture } = journey;
  await payer.getByRole('button', { name: mode === 'plain' ? 'Approve exactly, then send payment in my wallet' : 'Send payment in my wallet', exact: true }).click();
  if (mode === 'plain') {
    const approval = await walletDisclosure(payer, 'eth_sendTransaction');
    await expect(approval.getByText('approve', { exact: true })).toBeVisible();
    await approval.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
  }
  const payment = await walletDisclosure(payer, 'eth_sendTransaction');
  await expect(payment.getByText(mode === 'plain' ? 'payERC20' : 'payERC20WithPermit', { exact: true })).toBeVisible();
  expect(wallet.sends).toHaveLength(mode === 'plain' ? 1 : 0);
  expect(wallet.hashes).toHaveLength(mode === 'plain' ? 1 : 0);
  expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(mode === 'plain' ? GROSS : 0n);
  return payment;
}

async function recoverHistory(page: Page, wallet: Erc20Wallet): Promise<Locator> {
  await page.bringToFront();
  await nav(page).getByRole('button', { name: 'Pay', exact: true }).click();
  const history = page.getByRole('region', { name: 'Wallet attempt journal', exact: true });
  await expect(history).toContainText('Connect the relevant wallet account and chain to reveal its attempts.');
  await history.getByLabel('Network for wallet history').selectOption('84532');
  await expect(history.getByLabel('Network for wallet history')).toHaveValue('84532');
  await history.getByRole('button', { name: 'Find wallet for history', exact: true }).click();
  await history.getByRole('button', { name: `Connect ${wallet.name}`, exact: true }).click();
  const disclosure = await walletDisclosure(page, 'eth_requestAccounts');
  await disclosure.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
  return history;
}

test('cancel at the payment disclosure preserves an exact approval without claiming payment', async ({ browser, baseURL }) => {
  await withInvoice(browser, baseURL, async (journey) => {
    const { payer, wallet, fixture, anvil } = journey;
    const before = await fixture.tokenBalance(fixture.usdc, wallet.account);
    const stealth = await prepare(journey);
    const payment = await paymentDisclosure(journey);
    await payment.getByRole('button', { name: 'Cancel wallet request', exact: true }).click();
    await expect(payment).toHaveCount(0);
    await expect(payer.getByRole('alert')).toContainText(mode === 'plain'
      ? 'Approval was confirmed, but no payment was sent.'
      : 'Wallet disclosure was cancelled or became stale. Review again before continuing.');
    await expect(payer.getByRole('heading', { name: 'Submitted', exact: true })).toHaveCount(0);
    expect(wallet.sends).toHaveLength(mode === 'plain' ? 1 : 0);
    expect(wallet.hashes).toHaveLength(mode === 'plain' ? 1 : 0);
    expect(wallet.signatures).toHaveLength(mode === 'plain' ? 0 : 1);
    expect((await walletJournal(payer)).filter((attempt) => attempt.kind === 'payment')).toEqual([]);
    expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(mode === 'plain' ? GROSS : 0n);
    expect(await fixture.tokenBalance(fixture.usdc, wallet.account)).toBe(before);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(0n);
    expect(await anvil.balance(stealth)).toBe(0n);
    if (mode === 'permit') expect(await fixture.permitNonce(fixture.usdc, wallet.account)).toBe(0n);
  });
});

test('pending payment survives reload and blocks the same invoice in a second tab before another wallet send', async ({ browser, baseURL }) => {
  await withInvoice(browser, baseURL, async (journey) => {
    const { payer, wallet, fixture, anvil, context, state } = journey;
    const before = await fixture.tokenBalance(fixture.usdc, wallet.account);
    const stealth = await prepare(journey);
    const payment = await paymentDisclosure(journey);
    await anvil.automine(false);
    await payment.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    await expect.poll(() => wallet.hashes.length).toBe(mode === 'plain' ? 2 : 1);
    const hash = wallet.hashes.at(-1) as Hex;
    await expect(payer.getByRole('status').filter({ hasText: 'Waiting for inclusion…' })).toBeVisible();
    expect((await anvil.tx(hash))?.blockNumber).toBeNull();
    await expect.poll(async () => (await walletJournal(payer)).filter((attempt) => attempt.kind === 'payment')).toMatchObject([{ status: 'submitted', hash, chainId: 84532 }]);
    await expect(payer.getByRole('heading', { name: 'Submitted', exact: true })).toHaveCount(0);

    await payer.reload();
    expect(new URL(payer.url()).hash).toBe('');
    await nav(payer).getByRole('button', { name: 'Pay', exact: true }).click();
    await expect(payer.getByRole('region', { name: 'Wallet attempt journal', exact: true })).not.toContainText(hash);
    const history = await recoverHistory(payer, wallet);
    const row = history.getByRole('listitem').filter({ hasText: hash });
    await row.getByRole('button', { name: 'Check status on my RPC', exact: true }).click();
    await expect(row).toContainText('Pending. The RPC sees the transaction without a verified receipt.');

    // Same context means real shared localStorage and Web Locks. No storage is injected or copied into the new tab.
    const second = await context.newPage();
    const secondWallet = new Erc20Wallet(anvil, state, wallet.account, 'Second Tab Wallet');
    await secondWallet.inject(second);
    await connect(second, secondWallet, journey.link);
    expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(mode === 'plain' ? GROSS : 0n);
    await second.getByRole('button', { name: 'Prepare payment', exact: true }).click();
    if (mode === 'plain') {
      await expect(second.getByRole('heading', { name: 'Final check before your wallet', exact: true })).toBeVisible();
      await second.getByRole('button', { name: 'Send payment in my wallet', exact: true }).click();
      const duplicate = await walletDisclosure(second, 'eth_sendTransaction');
      await duplicate.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    }
    await expect(second.getByRole('alert')).toContainText(DUPLICATE);
    expect(secondWallet.requests).not.toContain('eth_signTypedData_v4');
    expect(secondWallet.requests).not.toContain('eth_sendTransaction');
    expect(secondWallet.sends).toHaveLength(0);
    expect(secondWallet.signatures).toHaveLength(0);
    expect(secondWallet.hashes).toHaveLength(0);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(0n);
    await second.close();

    await anvil.mine(101);
    await anvil.automine(true);
    await payer.bringToFront();
    // Returning to the original tab does not authorize a new transaction. Only its public RPC status is refreshed.
    await row.getByRole('button', { name: 'Check status on my RPC', exact: true }).click();
    await expect(row).toContainText('The RPC confirmed execution of this transaction.');
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(NET);
    expect(before - await fixture.tokenBalance(fixture.usdc, wallet.account)).toBe(GROSS);
    expect(wallet.hashes).toHaveLength(mode === 'plain' ? 2 : 1);
  });
});

test('a lost wallet response retains an unknown outcome without inventing a hash or sending twice', async ({ browser, baseURL }) => {
  await withInvoice(browser, baseURL, async (journey) => {
    const { payer, wallet, fixture, anvil, network, state } = journey;
    const stealth = await prepare(journey);
    const payment = await paymentDisclosure(journey);
    wallet.loseNextResponse();
    await payment.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    await expect.poll(() => wallet.hashes.length).toBe(mode === 'plain' ? 2 : 1);
    const hash = wallet.hashes.at(-1) as Hex;
    await expect.poll(async () => (await anvil.receipt(hash))?.status).toBe('0x1');
    await expect.poll(async () => (await walletJournal(payer)).filter((attempt) => attempt.kind === 'payment')).toMatchObject([{ status: 'unknown', chainId: 84532 }]);
    const recorded = (await walletJournal(payer)).filter((attempt) => attempt.kind === 'payment');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.hash).toBeUndefined();
    await expect(payer.getByRole('heading', { name: 'Submitted', exact: true })).toHaveCount(0);
    const history = payer.getByRole('region', { name: 'Wallet attempt journal', exact: true });
    await expect(history).not.toContainText(hash);
    const unknown = history.getByRole('listitem').filter({ hasText: 'Outcome unknown; check your wallet before retrying.' });
    await expect(unknown).toHaveCount(1);
    await expect(unknown.getByRole('button', { name: 'Check status on my RPC', exact: true })).toHaveCount(0);
    await expect(payer.getByRole('alert')).toContainText(mode === 'plain'
      ? 'Approval was confirmed, but the payment was not confirmed.' : UNKNOWN_PAYMENT);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(NET);

    // The UI may offer review again, but it must not convert this unknown result into another wallet broadcast.
    const simulations = (): number => network.calls.filter((call) => call.method === 'eth_call'
      && (call.params[0] as { to?: string } | undefined)?.to?.toLowerCase() === state.router.toLowerCase()).length;
    const simulationsBefore = simulations();
    await payer.getByRole('button', { name: 'Send payment in my wallet', exact: true }).click();
    await expect.poll(simulations).toBeGreaterThan(simulationsBefore);
    await expect(payer.getByRole('button', { name: 'Send payment in my wallet', exact: true })).toBeEnabled();
    await expect(payer.getByRole('alert')).toContainText(mode === 'plain'
      ? 'Approval was confirmed, but the payment was not confirmed.' : UNKNOWN_PAYMENT);
    await expect(payer.getByRole('alert')).not.toContainText(/nothing was (sent|paid)/i);
    expect(wallet.sends).toHaveLength(mode === 'plain' ? 2 : 1);
    expect(wallet.hashes).toHaveLength(mode === 'plain' ? 2 : 1);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(NET);
    expect((await walletJournal(payer)).filter((attempt) => attempt.kind === 'payment')).toEqual(recorded);
  });
});

for (const change of ['account', 'network'] as const) {
  test(`${change} change closes an open payment disclosure and invalidates its prepared authority`, async ({ browser, baseURL }) => {
    await withInvoice(browser, baseURL, async (journey) => {
      const { payer, wallet, fixture } = journey;
      const before = await fixture.tokenBalance(fixture.usdc, wallet.account);
      const stealth = await prepare(journey);
      const payment = await paymentDisclosure(journey);
      await expect(payment).toBeVisible();
      if (change === 'account') await wallet.setAccount(payer, ANVIL_ACCOUNTS.reloadPayer);
      else await wallet.setChain(payer, '0x7a69');
      await expect(payment).toHaveCount(0);
      await expect(payer.getByRole('heading', { name: 'Final check before your wallet', exact: true })).toHaveCount(0);
      await expect(payer.getByText('The wallet account, network or provider changed. Reconnect and review again.', { exact: true })).toBeVisible();
      expect(wallet.sends).toHaveLength(mode === 'plain' ? 1 : 0);
      expect(wallet.hashes).toHaveLength(mode === 'plain' ? 1 : 0);
      expect(wallet.signatures).toHaveLength(mode === 'plain' ? 0 : 1);
      expect((await walletJournal(payer)).filter((attempt) => attempt.kind === 'payment')).toEqual([]);
      expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(mode === 'plain' ? GROSS : 0n);
      expect(await fixture.tokenBalance(fixture.usdc, wallet.account)).toBe(before);
      expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(0n);
      if (mode === 'permit') expect(await fixture.permitNonce(fixture.usdc, wallet.account)).toBe(0n);
    });
  });
}

test('RPC outage blocks review before any wallet authorization and recovers after the endpoint returns', async ({ browser, baseURL }) => {
  await withInvoice(browser, baseURL, async (journey) => {
    const { payer, wallet, network, anvil } = journey;
    const before = await anvil.nonce(wallet.account);
    network.rpcDown = true;
    await openFresh(payer, journey.link);
    await expect(payer.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
    await expect(payer.getByRole('alert').filter({ hasText: 'Blocked by a safety check (RPC_FAILURE).' })).toBeVisible({ timeout: 60_000 });
    await expect(payer.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    expect(wallet.requests).not.toContain('eth_requestAccounts');
    expect(wallet.signatures).toHaveLength(0);
    expect(wallet.sends).toHaveLength(0);
    expect(await walletJournal(payer)).toEqual([]);
    expect(network.rpcDownHits).toBeGreaterThan(0);
    network.rpcDown = false;
    await connect(payer, wallet, journey.link);
    expect(await anvil.nonce(wallet.account)).toBe(before);
    expect(wallet.sends).toHaveLength(0);
  });
});

test('rejected initial authorization creates no payment and does not consume token funds', async ({ browser, baseURL }) => {
  await withInvoice(browser, baseURL, async (journey) => {
    const { payer, wallet, fixture } = journey;
    const before = await fixture.tokenBalance(fixture.usdc, wallet.account);
    if (mode === 'plain') {
      await prepare(journey);
      await payer.getByRole('button', { name: 'Approve exactly, then send payment in my wallet', exact: true }).click();
    } else {
      await connect(payer, wallet, journey.link);
      await payer.getByRole('button', { name: 'Prepare payment', exact: true }).click();
    }
    const method = mode === 'plain' ? 'eth_sendTransaction' : 'eth_signTypedData_v4';
    const disclosure = await walletDisclosure(payer, method);
    wallet.rejectNext(method);
    await disclosure.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    await expect(payer.getByRole('alert')).toContainText('You rejected the request in your wallet.');
    expect(wallet.hashes).toHaveLength(0);
    expect(wallet.signatures).toHaveLength(0);
    expect(wallet.sends).toHaveLength(mode === 'plain' ? 1 : 0);
    expect((await walletJournal(payer)).filter((attempt) => attempt.kind === 'payment')).toEqual([]);
    expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(0n);
    expect(await fixture.tokenBalance(fixture.usdc, wallet.account)).toBe(before);
    await expect(payer.getByRole('heading', { name: 'Submitted', exact: true })).toHaveCount(0);
  });
});
