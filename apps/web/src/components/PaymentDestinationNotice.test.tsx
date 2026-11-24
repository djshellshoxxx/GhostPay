// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils.js';
import { invoiceDigest } from '@ghostpay/invoice-schema';
import { beginAttempt, clearAttempt, rememberPaymentDestination } from '../lib/duplicateAttemptJournal';
import { buildFinal, createPayContext, reviewInvoice } from '../lib/pay';
import { walletAttemptKey, type WalletSession } from '../lib/wallet';
import { fakeManifest } from '../test/fakeManifest';
import { makeParsed, NOW } from '../test/invoiceFixtures';
import { clearSession } from '../lib/session';
import { PaymentDestinationNotice } from './PaymentDestinationNotice';

afterEach(() => { cleanup(); sessionStorage.clear(); clearSession(); vi.unstubAllGlobals(); });

it('updates a prepared review when another request is handed off, cleared, or the wallet changes', async () => {
  const { parsed } = await makeParsed();
  const ctx = await createPayContext(reviewInvoice(parsed, NOW, { status: 'loaded', manifest: fakeManifest(84532) }), undefined, { nowSeconds: NOW });
  const built = buildFinal(ctx, { nowSeconds: NOW });
  const events = new EventTarget();
  const request = vi.fn(() => Promise.reject(new Error('unexpected wallet request')));
  const wallet: WalletSession = {
    chainId: 84532, account: '0x5555555555555555555555555555555555555555',
    wallet: { id: 'fixture', name: 'Fixture', kind: 'injected', provider: {
      request, on: (event, cb) => events.addEventListener(event, cb), removeListener: (event, cb) => events.removeEventListener(event, cb),
    } },
  };
  const network = vi.fn(() => Promise.reject(new Error('unexpected network request')));
  vi.stubGlobal('fetch', network);
  render(<PaymentDestinationNotice wallet={wallet} built={built} invoice={parsed.invoice} />);
  expect(screen.queryByRole('note')).toBeNull();
  const otherInvoice = '0x' + '2'.repeat(64);
  const prior = beginAttempt({ chainId: wallet.chainId, account: wallet.account, key: otherInvoice, kind: 'payment' });
  // The required journal is written first. Only handing off the actual recipient creates a match.
  expect(screen.queryByRole('note')).toBeNull();
  act(() => { rememberPaymentDestination(prior, built.preview.stealth, sessionStorage); });
  expect(screen.getByRole('note').textContent).toContain('same destination for another invoice');
  expect(screen.getByRole('note').textContent).not.toContain(built.preview.stealth);
  act(() => { clearAttempt(otherInvoice, true); });
  expect(screen.queryByRole('note')).toBeNull();
  const key = walletAttemptKey(wallet, built.tx, { kind: 'payment', scope: bytesToHex(invoiceDigest(parsed.invoice)) });
  act(() => {
    const attempt = beginAttempt({ chainId: wallet.chainId, account: wallet.account, key, kind: 'payment' });
    rememberPaymentDestination(attempt, built.preview.stealth, sessionStorage);
  });
  expect(screen.getByRole('note').textContent).toContain('this invoice and destination');
  act(() => { events.dispatchEvent(new Event('accountsChanged')); });
  expect(screen.queryByRole('note')).toBeNull();
  expect(request).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});
