import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Exercise the production cascade, including the secret-QR print exclusions.
// Component/hook tests separately verify that the buttons select one document.
const appCss = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');
const printCss = readFileSync(new URL('../src/styles/print.css', import.meta.url), 'utf8');
const qrCss = readFileSync(new URL('../src/styles/qr.css', import.meta.url), 'utf8');
type Target = 'receipt-one' | 'receipt-two' | 'bill';

async function printFixture(page: Page, order: 'app-first' | 'print-first', options: {
  target?: Target;
  bill?: boolean;
  receipts?: 0 | 1 | 2;
  media?: 'print' | 'screen';
} = {}): Promise<void> {
  const styles = order === 'app-first' ? [appCss, printCss, qrCss] : [printCss, qrCss, appCss];
  const selected = (target: Target): string => options.target === target ? 'data-print-target=""' : '';
  const receipt = (target: 'receipt-one' | 'receipt-two'): string => `
    <article class="receipt-print" data-testid="${target}" ${selected(target)}>
      <h5 data-testid="${target}-content">Signed payment receipt ${target}</h5>
      <p>Transaction and amount for ${target}</p>
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
