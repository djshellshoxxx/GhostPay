// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalReceipt } from '../lib/payExec';
import { parseEip681, parseSolanaPay, parseTronUri } from '@ghostpay/payment-uri';
import { PaymentProofQr, PaymentRequestQr, PlainPaymentRequest, buildPaymentRequestUri, type PaymentRequestSpec } from './PaymentRequestQr';

afterEach(cleanup);

const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const TOKEN = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
const SOL = '3AWhUGYgsATmPoEc1Xe4rBWMhshjFTQfqmEh2otQ9MtC';
const TRON = 'TBz6MzmC14MVKV1iK1vdD3u5HMd6ZhWWta';

const evmNative: PaymentRequestSpec = { family: 'evm', chainId: 84532, recipient: EVM, token: 'native', amountAtomic: 1000n };
const evmToken: PaymentRequestSpec = { family: 'evm', chainId: 84532, recipient: EVM, token: TOKEN, amountAtomic: 5n };
const sol: PaymentRequestSpec = { family: 'solana', recipient: SOL, amount: '1.5', label: 'Shop' };
const tron: PaymentRequestSpec = { family: 'tron', recipient: TRON, amount: '2', network: 'nile' };

describe('buildPaymentRequestUri', () => {
  it('builds EIP-681 native and ERC-20 requests that re-parse', () => {
    expect(parseEip681(buildPaymentRequestUri(evmNative)).chainId).toBe(84532);
    const t = buildPaymentRequestUri(evmToken);
    expect(t).toContain('/transfer?');
    expect(parseEip681(t).chainId).toBe(84532);
    expect(buildPaymentRequestUri({ ...evmNative, amountAtomic: undefined })).toMatch(/^ethereum:0x/);
    expect(buildPaymentRequestUri({ ...evmToken, amountAtomic: undefined })).not.toContain('uint256');
  });
  it('builds Solana Pay and TRON requests that re-parse', () => {
    expect(parseSolanaPay(buildPaymentRequestUri(sol)).label).toBe('Shop');
    expect(parseTronUri(buildPaymentRequestUri(tron)).network).toBe('nile');
  });
  it('throws on a bad recipient', () => {
    expect(() => buildPaymentRequestUri({ ...sol, recipient: 'nope' })).toThrow();
  });
});

describe('PaymentRequestQr', () => {
  it('shows a QR frame, a text alternative and a copy button for each chain family', () => {
    for (const [spec, scheme] of [[evmNative, 'ethereum:'], [sol, 'solana:'], [tron, 'tron:']] as const) {
      const { container, unmount } = render(<PaymentRequestQr spec={spec} testnet={false} title="Test request" />);
      expect(container.querySelector('[data-qr-kind="shareable"]')).not.toBeNull();
      const text = screen.getByTestId('payment-request-text');
      expect(text.textContent?.startsWith(scheme)).toBe(true);
      expect(screen.getByRole('button', { name: 'Copy payment request' })).toBeTruthy();
      expect(screen.getAllByText('Test request').length).toBeGreaterThan(0);
      unmount();
    }
  });
  it('uses the caution frame for testnets', () => {
    const { container } = render(<PaymentRequestQr spec={evmNative} testnet title="T" />);
    expect(container.querySelector('[data-qr-kind="caution"]')).not.toBeNull();
  });
  it('explains instead of rendering when the request is invalid', () => {
    const { container } = render(<PaymentRequestQr spec={{ ...sol, recipient: 'bad' }} testnet={false} title="T" />);
    expect(container.querySelector('.qr-frame')).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/cannot be shown/i);
  });
  it('renders an optional note', () => {
    render(<PaymentRequestQr spec={sol} testnet={false} title="T" note="Plain transfer only." />);
    expect(screen.getByText('Plain transfer only.')).toBeTruthy();
  });
});

const RECEIPT: LocalReceipt = {
  kind: 'ghostpay-local-receipt',
  version: 1,
  chainId: 84532,
  txHash: `0x${'ab'.repeat(32)}`,
  router: EVM,
  token: 'native',
  gross: '100',
  fee: '1',
  net: '99',
  invoiceNonce: 'n'.repeat(32),
  fiat: 'USD 10000',
  quote: { source: 'fixed', timestamp: 1, expiresAt: 2 },
  status: 'included',
  createdAt: '2026-10-25T00:00:00.000Z',
};

describe('PaymentProofQr', () => {
  it('says it is not independent proof, hides the QR until asked, then shows it with text and copy', () => {
    const { container } = render(<PaymentProofQr receipt={RECEIPT} />);
    expect(screen.getByTestId('proof-disclaimer').textContent).toMatch(/not independent proof of payment/i);
    expect(container.querySelector('.qr-frame')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show proof QR' }));
    expect(container.querySelector('[data-qr-kind="proof"]')).not.toBeNull();
    expect(screen.getByLabelText<HTMLTextAreaElement>('Proof of payment text').value).toContain(RECEIPT.txHash);
    expect(screen.getByRole('button', { name: 'Copy proof JSON' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide proof QR' }));
    expect(container.querySelector('.qr-frame')).toBeNull();
  });
  it('downloads the proof JSON', () => {
    const create = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    render(<PaymentProofQr receipt={RECEIPT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download proof JSON' }));
    expect(create).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it('uses the caution frame when the transaction is not confirmed as included', () => {
    const { container } = render(<PaymentProofQr receipt={{ ...RECEIPT, status: 'unconfirmed' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show proof QR' }));
    expect(container.querySelector('[data-qr-kind="caution"]')).not.toBeNull();
  });
  it('keeps the JSON available when the proof is too large for one QR', () => {
    render(<PaymentProofQr receipt={{ ...RECEIPT, fiat: 'x'.repeat(4000) }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show proof QR' }));
    expect(screen.getByRole('alert').textContent).toMatch(/too large for one QR/i);
    expect(screen.getByRole('button', { name: 'Download proof JSON' })).toBeTruthy();
  });
});

describe('PlainPaymentRequest', () => {
  const type = (label: RegExp, value: string): void => { fireEvent.change(screen.getByLabelText(label), { target: { value } }); };
  it('shows nothing until an address is entered, then a request, with and without an amount', () => {
    const { container } = render(<PlainPaymentRequest family="solana" testnet networkLabel="Solana devnet" />);
    expect(container.querySelector('.qr-frame')).toBeNull();
    type(/Receive address/, SOL);
    expect(screen.getByTestId('payment-request-text').textContent).toBe(`solana:${SOL}`);
    type(/Amount/, '2.5');
    expect(screen.getByTestId('payment-request-text').textContent).toContain('amount=2.5');
  });
  it('builds a TRON request for a named network', () => {
    render(<PlainPaymentRequest family="tron" tronNetwork="shasta" testnet networkLabel="TRON Shasta" />);
    type(/Receive address/, TRON);
    expect(screen.getByTestId('payment-request-text').textContent).toContain('network=shasta');
  });
  it('reports a bad address and declines local TRON chains', () => {
    render(<PlainPaymentRequest family="solana" testnet networkLabel="Solana devnet" />);
    type(/Receive address/, 'nope');
    expect(screen.getByRole('alert')).toBeTruthy();
    cleanup();
    render(<PlainPaymentRequest family="tron" testnet networkLabel="Local" />);
    expect(screen.getByText(/no payment-request link format/)).toBeTruthy();
  });
});
