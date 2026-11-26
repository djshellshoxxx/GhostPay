import { readFileSync } from 'node:fs';
import { parseVerifiedReceipt } from '@ghostpay/invoice-schema';
import { expect, test, type Page } from '@playwright/test';
import { TOKEN_84532 } from '../src/test/announcements';
import { configureRpc, mockNetwork, stageVerifiedErc20Payment, type MockNetworkState } from './flowMocks';
import { generateKeys } from './helpers';

// Exercise the production cascade, including the secret-QR print exclusions.
// index.html loads appearance.css before the bundle; the fixture must load it too or the dark palette is absent.
const appearanceCss = readFileSync(new URL('../public/appearance.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');
const printCss = readFileSync(new URL('../src/styles/print.css', import.meta.url), 'utf8');
const qrCss = readFileSync(new URL('../src/styles/qr.css', import.meta.url), 'utf8');
type Target = 'receipt-one' | 'receipt-two' | 'bill';

test('printing the second signed receipt shows only its transaction beside another receipt and a bill', async ({ page, context }) => {
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const seller = await generateKeys(page);
  const first = stageVerifiedErc20Payment(state, seller, 120);
  const second = stageVerifiedErc20Payment(state, seller, 121);

  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token', { exact: true }).selectOption(TOKEN_84532.toLowerCase());
  await page.getByLabel('Token amount', { exact: true }).fill('1');
  await page.getByLabel('Who pays the 0.25 % checkout fee').selectOption('payer_pays');
  const lineItem = 'Bill for the print selection test';
  await page.getByLabel('Item 1 description').fill(lineItem);
  await page.getByLabel('Item 1 unit price').fill('1.00');
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const link = await page.getByRole('textbox', { name: 'Link', exact: true }).inputValue();

  // Pay and Scan are separate views. Keep the rendered bill as an unselected sibling of the live Scan panels.
  const buyer = await context.newPage();
  await buyer.goto(link);
  await buyer.evaluate(() => { window.print = () => {}; });
  await buyer.getByRole('button', { name: 'Print bill', exact: true }).click();
  const billMarkup = await buyer.getByTestId('printable-bill').evaluate((bill) => {
    window.dispatchEvent(new Event('afterprint'));
    return bill.outerHTML;
  });
  await buyer.close();
  await page.evaluate((markup) => { document.body.insertAdjacentHTML('beforeend', markup); }, billMarkup);

  await nav.getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  const panels = page.getByRole('region', { name: 'Seller-signed receipt' });
  await expect(panels).toHaveCount(2);
  for (const [index, payment] of [first, second].entries()) {
    const panel = panels.nth(index);
    await panel.getByLabel('Signed invoice link or fragment').fill(link);
    await panel.getByLabel('I consent to opening this invoice locally to bind the receipt.').check();
    await panel.getByRole('button', { name: 'Validate invoice for receipt' }).click();
    await panel.getByLabel('I consent to signing these invoice and payment facts.').check();
    await panel.getByRole('button', { name: 'Sign receipt', exact: true }).click();
    const signed = parseVerifiedReceipt(await panel.getByLabel('Signed receipt JSON').inputValue());
    expect(signed.txHash).toBe(payment.txHash);
  }

  // CSS locators keep referring to the same mounted articles when print media hides their parent regions.
  const receipts = page.locator('article.receipt-print');
  const firstId = receipts.nth(0).getByText(first.txHash, { exact: true });
  const secondId = receipts.nth(1).getByText(second.txHash, { exact: true });
  const bill = page.getByTestId('printable-bill');
  const billId = bill.getByText(lineItem, { exact: true });
  const receiptHelp = receipts.nth(1).locator('.context-help-button');
  await expect(firstId).toBeVisible();
  await expect(secondId).toBeVisible();
  await expect(receiptHelp).toBeVisible();
  await expect(billId).toBeAttached();
  await expect(page.locator('[data-print-target]')).toHaveCount(0);

  await page.evaluate(() => { window.print = () => { performance.mark('receipt-print-request'); }; });
  await receipts.nth(1).getByRole('button', { name: 'Print receipt', exact: true }).click();
  expect(await page.evaluate(() => performance.getEntriesByName('receipt-print-request').length)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(secondId).toBeVisible();
  await expect(receipts).toHaveCount(2);
  await expect(receipts.nth(0)).toBeHidden();
  await expect(firstId).toBeHidden();
  await expect(billId).toBeAttached();
  await expect(bill).toBeHidden();
  await expect(billId).toBeHidden();
  await expect(receiptHelp).toBeHidden();
  // This short receipt fits on Letter paper. A second printable page means the Scan view still occupies paper.
  await expect(page.pdf({ format: 'Letter', pageRanges: '2' })).rejects.toThrow(/page range exceeds page count/i);
});

async function printFixture(page: Page, order: 'app-first' | 'print-first', options: {
  target?: Target;
  bill?: boolean;
  receipts?: 0 | 1 | 2;
  media?: 'print' | 'screen';
} = {}): Promise<void> {
  const styles = order === 'app-first' ? [appearanceCss, appCss, printCss, qrCss] : [appearanceCss, printCss, qrCss, appCss];
  const selected = (target: Target): string => options.target === target ? 'data-print-target=""' : '';
  const receipt = (target: 'receipt-one' | 'receipt-two'): string => `
    <article class="receipt-print" data-testid="${target}" ${selected(target)}>
      <h5 data-testid="${target}-content">Signed payment receipt ${target}</h5>
      <p class="hint">Transaction and amount for ${target}</p>
      <div class="receipt-actions" data-testid="${target}-actions">Print and archive actions</div>
      <div class="field" data-testid="${target}-field"><textarea class="receipt-json" data-testid="${target}-json">private receipt JSON</textarea></div>
      <div class="qr-frame qr-kind-proof">
        <div class="qr-body" data-testid="${target}-proof">Proof QR</div>
        <div class="qr-actions" data-testid="${target}-qr-actions">Copy QR controls</div>
        <div class="qr-large" data-testid="${target}-qr-large">Expanded QR overlay</div>
      </div>
      <div class="qr-frame qr-kind-secret" data-qr-print-note="Secret code omitted">
        <div class="qr-body" data-testid="${target}-secret">Secret QR</div>
      </div>
    </article>`;
  const receipts = options.receipts ?? 2;
  await page.setContent(`
    <style>${styles.join('</style><style>')}</style>
    <nav data-testid="private-navigation">Private wallet navigation</nav>
    <main>
      <div data-testid="private-controls">Wallet control and account details</div>
      ${receipts > 0 ? receipt('receipt-one') : ''}
      ${receipts > 1 ? receipt('receipt-two') : ''}
      ${options.bill === false ? '' : `<article class="bill-sheet" data-testid="bill" ${selected('bill')}>
        <h2 data-testid="bill-content">Printable invoice</h2>
        <div class="qr-actions" data-testid="bill-qr-actions">Bill QR actions</div>
        <div class="qr-large" data-testid="bill-qr-large">Expanded bill QR</div>
      </article>`}
    </main>
  `);
  await page.emulateMedia({ media: options.media ?? 'print' });
}

async function expectPrivateUiHidden(page: Page): Promise<void> {
  await expect(page.getByTestId('private-controls')).toBeHidden();
  await expect(page.getByTestId('private-navigation')).toBeHidden();
}

test('a long selected bill can continue onto a second printed page', async ({ page }) => {
  await printFixture(page, 'app-first', { target: 'bill' });
  await page.getByTestId('bill').evaluate(bill => {
    for (let i = 1; i <= 90; i++) {
      const item = document.createElement('p');
      item.textContent = `Invoice item ${i}`;
      bill.append(item);
    }
  });
  const secondPage = await page.pdf({ format: 'Letter', pageRanges: '2' });
  expect(secondPage.byteLength).toBeGreaterThan(0);
});

test('dark screen colors switch to white paper and legible receipt notes when printing', async ({ page }) => {
  await printFixture(page, 'print-first', { target: 'receipt-two', media: 'screen' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const paper = page.locator('body');
  const note = page.getByTestId('receipt-two').locator('.hint');
  await expect(paper).toHaveCSS('background-color', 'rgb(5, 9, 18)');
  await expect(note).toHaveCSS('color', 'rgb(168, 195, 218)');
  await page.emulateMedia({ media: 'print' });
  await expect(paper).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(note).toHaveCSS('color', 'rgb(74, 82, 96)');
  await page.emulateMedia({ media: 'screen' });
  await expect(paper).toHaveCSS('background-color', 'rgb(5, 9, 18)');
  await expect(note).toHaveCSS('color', 'rgb(168, 195, 218)');
});

async function expectReceiptVisible(page: Page, target: 'receipt-one' | 'receipt-two'): Promise<void> {
  await expect(page.getByTestId(target)).toBeVisible();
  await expect(page.getByTestId(target)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByTestId(target)).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.getByTestId(target)).toHaveCSS('border-top-width', '0px');
  await expect(page.getByTestId(`${target}-content`)).toBeVisible();
  await expect(page.getByTestId(`${target}-proof`)).toBeVisible();
  for (const suffix of ['actions', 'field', 'json', 'qr-actions', 'qr-large', 'secret']) {
    await expect(page.getByTestId(`${target}-${suffix}`)).toBeHidden();
  }
}

for (const order of ['app-first', 'print-first'] as const) {
  test(`dark theme keeps the printed page canvas light (${order})`, async ({ page }) => {
    await printFixture(page, order, { target: 'receipt-two', media: 'screen' });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const canvas = page.locator('html');
    await expect(canvas).toHaveCSS('color-scheme', 'dark');
    await page.emulateMedia({ media: 'print' });
    // The root scheme also paints page margins; a white body alone leaves dark paper around it.
    await expect(canvas).toHaveCSS('color-scheme', 'light');
    await expectReceiptVisible(page, 'receipt-two');
    await expectPrivateUiHidden(page);
    await page.emulateMedia({ media: 'screen' });
    await expect(canvas).toHaveCSS('color-scheme', 'dark');
  });

  test(`selected receipt prints without a mounted bill (${order})`, async ({ page }) => {
    await printFixture(page, order, { target: 'receipt-one', bill: false, receipts: 1 });
    await expectReceiptVisible(page, 'receipt-one');
    await expectPrivateUiHidden(page);
  });

  for (const target of ['receipt-one', 'receipt-two'] as const) {
    test(`only selected ${target} prints beside another receipt and a bill (${order})`, async ({ page }) => {
      await printFixture(page, order, { target });
      await expectReceiptVisible(page, target);
      const other = target === 'receipt-one' ? 'receipt-two' : 'receipt-one';
      await expect(page.getByTestId(other)).toBeHidden();
      await expect(page.getByTestId(`${other}-content`)).toBeHidden();
      await expect(page.getByTestId('bill')).toBeHidden();
      await expect(page.getByTestId('bill-content')).toBeHidden();
      await expectPrivateUiHidden(page);
    });
  }

  test(`selected bill alone remains printable (${order})`, async ({ page }) => {
    await printFixture(page, order, { target: 'bill', receipts: 0 });
    await expect(page.getByTestId('bill')).toBeVisible();
    await expect(page.getByTestId('bill-content')).toBeVisible();
    await expect(page.getByTestId('bill-qr-actions')).toBeHidden();
    await expect(page.getByTestId('bill-qr-large')).toBeHidden();
    await expect(page.getByTestId('receipt-one')).toHaveCount(0);
    await expectPrivateUiHidden(page);
  });

  test(`selected bill excludes every signed receipt (${order})`, async ({ page }) => {
    await printFixture(page, order, { target: 'bill' });
    await expect(page.getByTestId('bill')).toBeVisible();
    await expect(page.getByTestId('bill-content')).toBeVisible();
    for (const target of ['receipt-one', 'receipt-two']) {
      await expect(page.getByTestId(target)).toBeHidden();
      await expect(page.getByTestId(`${target}-content`)).toBeHidden();
    }
    await expect(page.getByTestId('bill-qr-actions')).toBeHidden();
    await expect(page.getByTestId('bill-qr-large')).toBeHidden();
    await expectPrivateUiHidden(page);
  });

  test(`printing without a selected document reveals no receipt or bill (${order})`, async ({ page }) => {
    await printFixture(page, order);
    for (const target of ['receipt-one', 'receipt-two', 'bill']) {
      await expect(page.getByTestId(target)).toBeHidden();
      await expect(page.getByTestId(`${target}-content`)).toBeHidden();
    }
    await expectPrivateUiHidden(page);
  });

  test(`print selection does not hide ordinary screen content (${order})`, async ({ page }) => {
    await printFixture(page, order, { target: 'receipt-one', media: 'screen' });
    await expect(page.getByTestId('private-controls')).toBeVisible();
    await expect(page.getByTestId('private-navigation')).toBeVisible();
    await expect(page.getByTestId('receipt-one')).toBeVisible();
    await expect(page.getByTestId('receipt-two')).toBeVisible();
    await expect(page.getByTestId('receipt-one-actions')).toBeVisible();
    await expect(page.getByTestId('receipt-one-json')).toBeVisible();
    await expect(page.getByTestId('bill')).toBeHidden();
  });
}
