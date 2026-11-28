import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { ANNOUNCEMENT_TOPIC, decodePaymentCalldata } from '@ghostpay/chain-adapters';
import { invoiceDigest, parseFragment, verifyReceipt } from '@ghostpay/invoice-schema';
import { bytesToHex } from '@noble/hashes/utils.js';
import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerializedEIP1559 } from 'viem';
import { openFresh } from './helpers';
import { ANVIL_ACCOUNTS, APP_RPC, Anvil, loadDevnet } from './devnet/chain';
import { Erc20Wallet, installErc20Fixture } from './devnet/erc20';
import { createErc20Invoice, createErc20Seller, importSellerKeystore, KEYSTORE_PASS, ledger, scanErc20, walletDisclosure } from './devnet/erc20Ui';
import { configureRpc, gitHead, openSite, PagesNetwork, PAGES_BASE, readSellerVault, storedSettings, tamperCiphertext } from './devnet/pages';
import { identityOf, keysView, nav, receiptPanel, scanMatches, sweepJournal, sweepView } from './devnet/ui';

/**
 * Real lean Pages bytes, real local-chain transactions, actual Worker and ordinary user controls. The only synthetic
 * components are the disposable token contract and EIP-6963 test wallet. Neither product state nor RPC evidence is
 * fabricated. The original seller closes before any sweep: the recovered browser spends the ORIGINAL payment.
 */
const mode = process.env['GHOSTPAY_PAGES_ERC20'];
if (mode !== 'plain' && mode !== 'permit') throw new Error('Run the dedicated ERC-20 Pages qualification with GHOSTPAY_PAGES_ERC20=plain or permit.');
test.setTimeout(420_000);

const GROSS = 100_000_000n;
const FEE = 250_000n;
const NET = 99_750_000n;
const FINALITY = 100;
const WRONG_PASS = 'this is the wrong synthetic passphrase';
const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

async function assertServedArtifact(request: APIRequestContext, baseURL: string): Promise<void> {
  const out = process.env['GHOSTPAY_PAGES_OUT'];
  if (out === undefined) throw new Error('GHOSTPAY_PAGES_OUT is required; a mocked development build is not this qualification.');
  const evidence = JSON.parse(readFileSync(join(out, 'evidence', 'pages-evidence.json'), 'utf8')) as {
    commit: string; profile: string; paymentsEnabledChainIds: number[]; files: number;
  };
  expect(evidence).toMatchObject({ commit: gitHead(), profile: 'lean', paymentsEnabledChainIds: [84532] });
  const sums = readFileSync(join(out, 'evidence', 'SHA256SUMS'), 'utf8').trim().split('\n');
  expect(sums).toHaveLength(evidence.files);
  for (const line of sums) {
    const parsed = /^([0-9a-f]{64}) {2}\.\/(.+)$/.exec(line);
    expect(parsed).not.toBeNull();
    const [, expectedHash, relative] = parsed ?? [];
    if (relative === '.nojekyll') continue; // Empty extensionless marker is not loaded by the browser.
    const response = await request.get(new URL(relative ?? '', baseURL).toString());
    expect(response.status(), relative).toBe(200);
    expect(sha256(await response.body()), relative).toBe(expectedHash);
  }
  const info = await request.get(new URL('build-info.json', baseURL).toString());
  expect(info.status()).toBe(200);
  expect(await info.json()).toMatchObject({ app: 'ghostpay-web', commit: gitHead() });
}

function detail(scope: Locator, label: string): Locator {
  return scope.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
}

function assertEip1559(raw: Hex | undefined): asserts raw is TransactionSerializedEIP1559 {
  if (raw === undefined || !/^0x02(?:[0-9a-f]{2})+$/i.test(raw)) {
    throw new Error('The recovered direct sweep must produce an EIP-1559 transaction.');
  }
}

async function expectEmptySeller(page: Page): Promise<void> {
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys', exact: true })).toBeVisible();
  await expect(keysView(page).locator('code', { hasText: /^st:eth:0x/ })).toHaveCount(0);
  expect(await readSellerVault(page)).toBeNull();
}

test(`ERC-20 ${mode}: approved payment, final scan and receipt, then recovered original funds in a fresh browser`, async ({ browser, baseURL, request }, testInfo) => {
  if (baseURL === undefined || !baseURL.endsWith(PAGES_BASE)) throw new Error('The ERC-20 journey requires the /GhostPay/ Pages base URL.');
  const dn = loadDevnet();
  expect(dn.feeBps).toBe(25);
  const anvil = new Anvil(dn.rpcUrl);
  const fixture = await installErc20Fixture(anvil, dn, mode, [ANVIL_ACCOUNTS.payer]);
  const snapshot = await fixture.snapshot();
  const contexts: BrowserContext[] = [];
  const network = new PagesNetwork(dn, new URL(baseURL).origin);
  const newContext = async (presetRpc = true): Promise<BrowserContext> => {
    const context = await browser.newContext({ baseURL, acceptDownloads: true, serviceWorkers: 'block' });
    contexts.push(context);
    await network.install(context, { presetRpc });
    return context;
  };
  try {
    await assertServedArtifact(request, baseURL);
    const sellerContext = await newContext();
    const seller = await sellerContext.newPage();
    await openSite(seller);
    await seller.bringToFront();
    const backup = await createErc20Seller(seller);
    const link = await createErc20Invoice(seller, baseURL, { description: 'ERC-20 browser recovery qualification', register: true });
    const opened = await parseFragment(new URL(link).hash);
    expect(opened.verification.signatureValid).toBe(true);
    expect(opened.invoice).toMatchObject({
      v: 1, chainId: 84532, token: fixture.usdc.toLowerCase(), feePolicy: 'seller_pays',
      amountPolicy: { mode: 'fixed_token', tokenAmount: GROSS.toString() },
      metaAddress: backup.identity.meta, signer: backup.identity.signer,
    });
    const digest = `0x${bytesToHex(invoiceDigest(opened.invoice))}`;

    const payerContext = await newContext();
    const payer = await payerContext.newPage();
    const wallet = new Erc20Wallet(anvil, dn, ANVIL_ACCOUNTS.payer);
    await wallet.inject(payer);
    const payerBefore = await fixture.tokenBalance(fixture.usdc, wallet.account);
    const feesBefore = await fixture.tokenBalance(fixture.usdc, dn.feeRecipient);
    const nonceBefore = await anvil.nonce(wallet.account);
    const permitBefore = mode === 'permit' ? await fixture.permitNonce(fixture.usdc, wallet.account) : 0n;
    expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(0n);
    await openFresh(payer, link);
    await payer.bringToFront();
    expect(new URL(payer.url()).pathname).toBe(PAGES_BASE);
    await expect(payer.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    expect(new URL(payer.url()).hash).toBe('');
    await expect(payer.getByText(dn.router).first()).toBeVisible();
    await payer.getByRole('button', { name: 'Continue', exact: true }).click();
    await payer.getByRole('button', { name: `Connect ${wallet.name} (test.e2e.erc20)`, exact: true }).click();
    const accountDisclosure = await walletDisclosure(payer, 'eth_requestAccounts');
    expect(wallet.requests).not.toContain('eth_requestAccounts');
    expect(wallet.sends).toHaveLength(0);
    await accountDisclosure.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    await expect.poll(() => wallet.requests.filter((method) => method === 'eth_requestAccounts').length).toBe(1);

    await payer.getByRole('button', { name: 'Prepare payment', exact: true }).click();
    if (mode === 'permit') {
      const permit = await walletDisclosure(payer, 'eth_signTypedData_v4');
      expect(wallet.signatures).toHaveLength(0);
      expect(wallet.sends).toHaveLength(0);
      await expect(permit).toContainText(fixture.usdc);
      await expect(permit).toContainText(dn.router);
      await expect(permit).toContainText(GROSS.toString());
      await permit.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
      await expect.poll(() => wallet.signatures.length).toBe(1);
    }
    const final = payer.locator('[aria-labelledby="final-h"]');
    await expect(final.getByRole('heading', { name: 'Final check before your wallet', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(detail(final, 'Method')).toHaveText(mode === 'permit' ? 'payERC20WithPermit' : 'payERC20');
    await expect(detail(final, 'Gross')).toHaveText('100 USDC');
    await expect(detail(final, 'Fee')).toContainText('0.25 USDC');
    await expect(detail(final, 'Net to seller')).toHaveText('99.75 USDC (minimum accepted 99.75)');
    await expect(detail(final, 'Native value sent')).toHaveText('0 ETH');
    const stealth = getAddress((await detail(final, 'One-time destination').textContent()) ?? '');
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(0n);
    expect(await anvil.balance(stealth)).toBe(0n);
    expect(wallet.sends).toHaveLength(0);
    expect(await anvil.nonce(wallet.account)).toBe(nonceBefore);

    const sendName = mode === 'plain' ? 'Approve exactly, then send payment in my wallet' : 'Send payment in my wallet';
    await final.getByRole('button', { name: sendName, exact: true }).click();
    if (mode === 'plain') {
      const approval = await walletDisclosure(payer, 'eth_sendTransaction');
      expect(wallet.sends).toHaveLength(0);
      await expect(approval.getByText('approve', { exact: true })).toBeVisible();
      await expect(approval).toContainText(fixture.usdc);
      await expect(approval).toContainText(dn.router);
      await expect(approval).toContainText(GROSS.toString());
      await approval.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    }
    const payment = await walletDisclosure(payer, 'eth_sendTransaction');
    await expect(payment.getByText(mode === 'permit' ? 'payERC20WithPermit' : 'payERC20', { exact: true })).toBeVisible();
    expect(wallet.sends).toHaveLength(mode === 'plain' ? 1 : 0);
    expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(mode === 'plain' ? GROSS : 0n);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(0n);
    await payment.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
    await expect.poll(() => wallet.hashes.length).toBe(mode === 'plain' ? 2 : 1);
    const payHash = wallet.hashes.at(-1) as Hex;
    await expect(payer.getByRole('heading', { name: 'Submitted', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(payer.getByText(/Status: included in block .*not necessarily final yet/)).toBeVisible();
    expect(wallet.sends).toHaveLength(mode === 'plain' ? 2 : 1);
    expect(wallet.signatures).toHaveLength(mode === 'plain' ? 0 : 1);
    expect(await fixture.allowance(fixture.usdc, wallet.account)).toBe(0n);
    if (mode === 'permit') expect(await fixture.permitNonce(fixture.usdc, wallet.account)).toBe(permitBefore + 1n);
    expect(payerBefore - await fixture.tokenBalance(fixture.usdc, wallet.account)).toBe(GROSS);
    expect(await fixture.tokenBalance(fixture.usdc, dn.feeRecipient) - feesBefore).toBe(FEE);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(NET);
    expect(await fixture.tokenBalance(fixture.usdc, dn.router)).toBe(0n);
    expect(await anvil.balance(stealth)).toBe(0n);
    if (mode === 'plain') {
      const approvalTx = await anvil.tx(wallet.hashes[0] ?? '');
      expect(approvalTx?.to?.toLowerCase()).toBe(fixture.usdc.toLowerCase());
      expect(decodeFunctionData({ abi: erc20Abi, data: (approvalTx?.input ?? '0x') as Hex })).toMatchObject({ functionName: 'approve', args: [getAddress(dn.router), GROSS] });
    }
    const paymentTx = await anvil.tx(payHash);
    expect(paymentTx?.to?.toLowerCase()).toBe(dn.router.toLowerCase());
    expect(paymentTx?.from.toLowerCase()).toBe(wallet.account.toLowerCase());
    expect(BigInt(paymentTx?.value ?? '0x0')).toBe(0n);
    const decoded = decodePaymentCalldata({ to: dn.router, data: (paymentTx?.input ?? '0x') as Hex, value: 0n }, 84532);
    expect(decoded).toMatchObject({ token: fixture.usdc, gross: GROSS, fee: FEE, net: NET, minNet: NET });
    expect(decoded.stealth.toLowerCase()).toBe(stealth.toLowerCase());
    const receipt = await anvil.receipt(payHash);
    expect(receipt?.status).toBe('0x1');
    expect(receipt?.logs.filter((log) => log.address.toLowerCase() === dn.announcer.toLowerCase() && log.topics[0]?.toLowerCase() === ANNOUNCEMENT_TOPIC.toLowerCase())).toHaveLength(1);

    await seller.bringToFront();
    await scanErc20(seller, { fromStart: true });
    await expect(scanMatches(seller)).toHaveCount(1);
    await expect(scanMatches(seller)).toContainText('waiting for enough confirmations');
    await expect(receiptPanel(seller)).toHaveCount(0);
    await expect(ledger(seller).getByText('Linked to a verified observation.', { exact: true })).toHaveCount(0);
    await anvil.mine(FINALITY + 1);
    await scanErc20(seller, { fromStart: true });
    await expect(scanMatches(seller)).toHaveCount(1);
    await expect(scanMatches(seller)).not.toContainText('waiting for enough confirmations');
    await expect(scanMatches(seller)).toContainText(stealth);
    await expect(scanMatches(seller)).toContainText('99.75 USDC');

    const history = ledger(seller);
    await history.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
    await expect(history.getByText('1 stored record in the current seller and chain scope.', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(history.getByText('Linked to a verified observation.', { exact: true })).toHaveCount(0);
    await history.getByRole('button', { name: 'Confirm proposed invoice match', exact: true }).first().click();
    await expect(history.getByText('Linked to a verified observation.', { exact: true })).toBeVisible();
    await expect(history.getByText('Linked total equals the expected net amount.', { exact: true })).toBeVisible();

    const signed = receiptPanel(seller);
    await signed.getByLabel('Signed invoice link or fragment', { exact: true }).fill(link);
    await signed.getByLabel('I consent to opening this invoice locally to bind the receipt.', { exact: true }).check();
    await signed.getByRole('button', { name: 'Validate invoice for receipt', exact: true }).click();
    await expect(signed.getByText(/Validated invoice matches this scan/)).toBeVisible();
    await expect(signed.getByRole('button', { name: 'Sign receipt', exact: true })).toBeDisabled();
    await signed.getByLabel('I consent to signing these invoice and payment facts.', { exact: true }).check();
    await signed.getByRole('button', { name: 'Sign receipt', exact: true }).click();
    const sellerReceipt: unknown = JSON.parse(await signed.getByLabel('Signed receipt JSON', { exact: true }).inputValue());
    expect(verifyReceipt(sellerReceipt)).toBe(true);
    expect(sellerReceipt).toMatchObject({ invoiceDigest: digest, chainId: 84532, asset: fixture.usdc.toLowerCase(), amountMinorUnits: NET.toString(), txHash: payHash.toLowerCase(), stealthAddress: stealth.toLowerCase(), signerPublicKey: backup.identity.signer });
    await scanErc20(seller, { fromStart: true });
    await expect(scanMatches(seller)).toHaveCount(1);
    await expect(ledger(seller).getByText('1 stored record in the current seller and chain scope.', { exact: true })).toBeVisible();
    expect(network.sentRaw).toHaveLength(0);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(NET);
    await sellerContext.close();
    await payerContext.close();

    const fresh = await newContext(false);
    const recovered = await fresh.newPage();
    await openSite(recovered);
    await recovered.bringToFront();
    expect(await storedSettings(recovered)).toBeNull();
    await nav(recovered).getByRole('button', { name: 'Seller keys', exact: true }).click();
    await expectEmptySeller(recovered);
    const rpcBeforeRecovery = network.methods.length;
    for (const input of [
      { file: backup.keystoreText, pass: WRONG_PASS },
      { file: tamperCiphertext(backup.keystoreText), pass: KEYSTORE_PASS },
    ]) {
      await importSellerKeystore(recovered, input.file, input.pass);
      await expect(keysView(recovered).getByText('Wrong passphrase, or the keystore was modified.', { exact: false })).toBeVisible({ timeout: 60_000 });
      await expect(keysView(recovered).getByLabel('Passphrase', { exact: true })).toHaveValue('');
      await expectEmptySeller(recovered);
      expect(network.methods.length).toBe(rpcBeforeRecovery);
      expect(network.sentRaw).toHaveLength(0);
    }
    await importSellerKeystore(recovered, backup.keystoreText, KEYSTORE_PASS);
    await expect(keysView(recovered).getByText('Keystore decrypted; keys are in memory.', { exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await identityOf(recovered)).toEqual(backup.identity);
    expect(await readSellerVault(recovered)).toBeNull();
    expect(await storedSettings(recovered)).toBeNull();
    expect(network.methods.length).toBe(rpcBeforeRecovery);
    await configureRpc(recovered, APP_RPC);
    await scanErc20(recovered, { fromStart: true });
    await expect(scanMatches(recovered)).toHaveCount(1);
    await expect(scanMatches(recovered)).toContainText(stealth);
    await expect(scanMatches(recovered)).toContainText('99.75 USDC');
    await expect(scanMatches(recovered)).not.toContainText('waiting for enough confirmations');
    // A seller keystore contains keys, not the original profile's local invoice/history records.
    await ledger(recovered).getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
    await expect(ledger(recovered).getByText('No records saved.', { exact: true })).toBeVisible({ timeout: 30_000 });

    const balanceData = encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [stealth] });
    const countBalanceReads = (): number => network.calls.filter((call) => {
      const tx = call.params[0] as { to?: string; data?: string } | undefined;
      return call.method === 'eth_call' && tx?.to?.toLowerCase() === fixture.usdc.toLowerCase() && tx.data === balanceData;
    }).length;
    const balanceReadsBefore = countBalanceReads();
    await scanMatches(recovered).getByRole('button', { name: 'Sweep this payment', exact: true }).click();
    const sweep = sweepView(recovered);
    await expect(sweep.getByRole('button', { name: 'Sign and broadcast directly', exact: true })).toHaveCount(0);
    await expect(sweep).toContainText('read only when you click');
    await expect(sweep).toContainText('not read yet (press the button below)');
    expect(countBalanceReads()).toBe(balanceReadsBefore);
    await sweep.getByRole('button', { name: 'Read balance from the Settings RPC', exact: true }).click();
    await expect(sweep).toContainText('99.75 USDC');
    expect(countBalanceReads()).toBe(balanceReadsBefore + 1);
    await sweep.getByLabel('Directly (the one-time address must hold native coin for gas)', { exact: true }).check();
    await sweep.getByLabel('Destination address (your own wallet)', { exact: true }).fill(ANVIL_ACCOUNTS.destination);
    const sweepButton = sweep.getByRole('button', { name: 'Sign and broadcast directly', exact: true });
    await expect(sweepButton).toBeEnabled();
    await sweepButton.click();
    await expect(sweep.getByText('The stealth address has no native coin for gas.', { exact: false })).toBeVisible({ timeout: 30_000 });
    expect(network.sentRaw).toHaveLength(0);
    expect(await anvil.nonce(stealth)).toBe(0);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(NET);

    const fundingHash = await fixture.topUp(stealth, 10_000_000_000_000_000n);
    expect((await anvil.receipt(fundingHash))?.status).toBe('0x1');
    expect((await anvil.tx(fundingHash))?.to?.toLowerCase()).toBe(stealth.toLowerCase());
    const destinationBefore = await fixture.tokenBalance(fixture.usdc, ANVIL_ACCOUNTS.destination);
    await sweepButton.click();
    await expect.poll(() => network.sentRaw.length, { timeout: 60_000 }).toBe(1);
    const raw = network.sentRaw[0];
    assertEip1559(raw);
    const sweepHash = keccak256(raw);
    const transfer = parseTransaction(raw);
    expect(transfer.chainId).toBe(84532);
    expect(transfer.nonce).toBe(0);
    expect(transfer.to?.toLowerCase()).toBe(fixture.usdc.toLowerCase());
    expect(transfer.value ?? 0n).toBe(0n);
    expect((await recoverTransactionAddress({ serializedTransaction: raw })).toLowerCase()).toBe(stealth.toLowerCase());
    expect(decodeFunctionData({ abi: erc20Abi, data: transfer.data ?? '0x' })).toMatchObject({ functionName: 'transfer', args: [ANVIL_ACCOUNTS.destination, NET] });
    await expect.poll(async () => (await anvil.receipt(sweepHash))?.status).toBe('0x1');
    expect(await fixture.tokenBalance(fixture.usdc, ANVIL_ACCOUNTS.destination) - destinationBefore).toBe(NET);
    expect(await fixture.tokenBalance(fixture.usdc, stealth)).toBe(0n);
    expect(await anvil.nonce(stealth)).toBe(1);
    await expect.poll(() => sweepJournal(recovered)).toMatchObject([{ chainId: 84532, owner: stealth, expectedHash: sweepHash, nonce: 0 }]);
    await sweep.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(sweep.getByRole('note').filter({ has: recovered.locator('.notice-title', { hasText: 'Included on chain' }) })).toHaveCount(1);
    await nav(recovered).getByRole('button', { name: 'Seller keys', exact: true }).click();
    await nav(recovered).getByRole('button', { name: 'Sweep', exact: true }).click();
    await sweep.getByRole('button', { name: 'Read balance from the Settings RPC', exact: true }).click();
    await sweep.getByLabel('Directly (the one-time address must hold native coin for gas)', { exact: true }).check();
    await expect(sweepButton).toBeDisabled();
    expect(network.sentRaw).toHaveLength(1);
    expect(await anvil.nonce(stealth)).toBe(1);

    network.expectClean();
    expect(network.methods).toContain('eth_getLogs');
    expect(network.requests.some((entry) => /^\/GhostPay\/assets\/scanner\.worker-[\w-]+\.js$/.test(new URL(entry.url).pathname))).toBe(true);
    const disclosureMethods = wallet.requests.filter((method) => ['eth_requestAccounts', 'eth_signTypedData_v4', 'eth_sendTransaction'].includes(method));
    expect(disclosureMethods).toEqual(mode === 'plain'
      ? ['eth_requestAccounts', 'eth_sendTransaction', 'eth_sendTransaction']
      : ['eth_requestAccounts', 'eth_signTypedData_v4', 'eth_sendTransaction']);
    const packagePath = createRequire(import.meta.url).resolve('@playwright/test/package.json');
    const playwrightPackage = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: unknown };
    if (typeof playwrightPackage.version !== 'string' || !/^\d+(?:\.\d+)+$/.test(playwrightPackage.version)) {
      throw new Error('Cannot record the installed Playwright version.');
    }
    const browserVersion = browser.version();
    expect(browserVersion).toMatch(/^\d+(?:\.\d+)+$/);
    await testInfo.attach('erc20-public-evidence', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ commit: gitHead(), mode, browserName: browser.browserType().name(), browserVersion, playwrightVersion: playwrightPackage.version, chainId: 84532, token: fixture.usdc, gross: GROSS.toString(), fee: FEE.toString(), net: NET.toString(), paymentHash: payHash, fundingHash, sweepHash, walletMethods: disclosureMethods, recoveredOriginalPayment: true }, null, 2)),
    });
  } finally {
    for (const context of contexts) await context.close();
    await anvil.automine(true);
    await fixture.revert(snapshot);
  }
});
