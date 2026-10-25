// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PRINT_QR_LINK_CHARS } from '../lib/qrKinds';
import { makeParsed } from '../test/invoiceFixtures';
import { PrintBillButton, PrintableBill } from './PrintableBill';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function invoice(patch: Parameters<typeof makeParsed>[0] = {}) {
  return (await makeParsed(patch)).parsed.invoice;
}

describe('PrintableBill', () => {
  it('lays out the invoice with line items, tax, total, expiry and a seller fingerprint', async () => {
    const inv = await invoice({ taxRatePercent: '10', memo: 'Thanks <b>x</b>' });
    render(<PrintableBill invoice={inv} link="#gpi=v1.abc" passphraseProtected chainName="Base Sepolia" tokenLabel="USDC" />);
    const bill = screen.getByTestId('printable-bill');
    expect(bill.className).toContain('bill-sheet');
    expect(screen.getByRole('heading', { name: 'Invoice' })).toBeTruthy();
    expect(screen.getByText('Consulting')).toBeTruthy();
    expect(bill.textContent).toContain('USD 100.00');
    expect(bill.textContent).toContain('USD 10.00');
    expect(bill.textContent).toContain('Base Sepolia');
    expect(bill.textContent).toContain('USDC');
    expect(bill.textContent).toContain('Thanks <b>x</b>');
    expect(bill.textContent).toMatch(/Seller fingerprint/);
    expect(bill.textContent).toMatch(/Expires/);
  });

  it('prints a QR and no bearer warning for a short passphrase link', async () => {
    const inv = await invoice();
    const { container } = render(<PrintableBill invoice={inv} link="#gpi=v1.short" passphraseProtected chainName="C" tokenLabel="T" />);
    expect(container.querySelector('[data-qr-kind="shareable"]')).not.toBeNull();
    expect(screen.queryByTestId('bearer-warning')).toBeNull();
    expect(screen.getByText(/passphrase is not printed/i)).toBeTruthy();
  });

  it('warns that a printed bearer link is readable by anyone and recommends passphrase links', async () => {
    const inv = await invoice();
    const { container } = render(<PrintableBill invoice={inv} link="#gpi=v1.short" passphraseProtected={false} chainName="C" tokenLabel="T" />);
    expect(container.querySelector('[data-qr-kind="bearer"]')).not.toBeNull();
    const warning = screen.getByTestId('bearer-warning').textContent ?? '';
    expect(warning).toMatch(/anyone who sees/i);
    expect(warning).toMatch(/passphrase/i);
  });

  it('omits the QR and the link text for a long link, and says why', async () => {
    const inv = await invoice();
    const long = `#gpi=v1.${'a'.repeat(MAX_PRINT_QR_LINK_CHARS)}`;
    const { container } = render(<PrintableBill invoice={inv} link={long} passphraseProtected={false} chainName="C" tokenLabel="T" />);
    expect(container.querySelector('.qr-frame')).toBeNull();
    expect(screen.getByText(/too long to print as a QR code/i)).toBeTruthy();
    expect(screen.getByTestId('bearer-warning')).toBeTruthy();
    expect(container.textContent).not.toContain(long);
  });

  it('works without a link', async () => {
    const inv = await invoice();
    const { container } = render(<PrintableBill invoice={inv} link={undefined} passphraseProtected={false} chainName="C" tokenLabel="T" />);
    expect(container.querySelector('.qr-frame')).toBeNull();
    expect(screen.queryByTestId('bearer-warning')).toBeNull();
  });

  it('omits line item rows and memo when the invoice has none', async () => {
    const inv = { ...(await invoice()), lineItems: [], memo: undefined };
    render(<PrintableBill invoice={inv} link={undefined} passphraseProtected chainName="C" tokenLabel="T" />);
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('print.css', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/print.css'), 'utf8');
  it('hides the bill on screen, isolates it when printing, and has no external references', () => {
    expect(css).toMatch(/^\.bill-sheet \{ display: none; \}/m);
    expect(css).toContain('@media print');
    expect(css).toContain('body * { visibility: hidden');
    expect(css).not.toMatch(/url\(|@import|http/);
  });
});

describe('PrintBillButton', () => {
  it('prints the page when pressed', async () => {
    const inv = await invoice();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    render(<PrintBillButton invoice={inv} link="#gpi=v1.x" passphraseProtected chainName="C" tokenLabel="T" />);
    fireEvent.click(screen.getByRole('button', { name: 'Print bill' }));
    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
