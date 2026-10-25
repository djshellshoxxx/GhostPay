// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEip681, parseSolanaPay, parseTronUri } from '@ghostpay/payment-uri';
import { PaymentRequestQr, buildPaymentRequestUri, type PaymentRequestSpec } from './PaymentRequestQr';

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
