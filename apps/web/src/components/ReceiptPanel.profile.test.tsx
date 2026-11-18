// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import type { ScanMatch } from '../lib/scanClient';
import { BUILD_PROFILE, ShellProfileContext } from '../lib/buildProfile';
import { SOURCE_CATALOG } from '../i18n/catalog';
import { ReceiptPanel } from './ReceiptPanel';

afterEach(cleanup);
beforeEach(clearSession);

const match = {
  chainId: 84532,
  announcement: { transactionHash: `0x${'c'.repeat(64)}` },
  stealthAddress: `0x${'a'.repeat(40)}`,
  metadata: { kind: 'erc20', token: `0x${'b'.repeat(40)}`, netAmount: 123_456n, viewTag: 1 },
  viaRouter: true,
  receipt: 'verified',
} as unknown as ScanMatch;

const MANUAL = 'Invoice digest (entered manually)';
const LEAN_REFUSED = SOURCE_CATALOG.messages['receipt.lean.refused'] ?? 'missing';
const LEAN_HINT = SOURCE_CATALOG.messages['receipt.lean.hint'] ?? 'missing';

describe('ReceiptPanel build profile', () => {
  it('lean: hides the unbound manual-digest mode and explains the invoice requirement', () => {
    const seller = generateSession();
    render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} profile="lean" />);
    expect(screen.queryByLabelText(MANUAL)).toBeNull();
    expect(screen.queryByText(/entered manually and is not matched/)).toBeNull();
    expect(screen.getByText(new RegExp(LEAN_HINT.slice(0, 40)))).toBeTruthy();
    expect(screen.getByLabelText('Signed invoice link or fragment')).toBeTruthy();
  });

  it('lean: the sign handler itself refuses an unbound receipt', async () => {
    const seller = generateSession();
    const user = userEvent.setup();
    render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} profile="lean" />);
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    expect(screen.getByText(LEAN_REFUSED)).toBeTruthy();
    expect(screen.queryByLabelText('Signed receipt JSON')).toBeNull();
  });

  it('full: keeps the manual-digest mode with its warnings and still signs', async () => {
    const seller = generateSession();
    const user = userEvent.setup();
    render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} profile="full" />);
    expect(screen.getByLabelText(MANUAL)).toBeTruthy();
    expect(screen.getByText(/entered manually and is not matched against invoice contents/)).toBeTruthy();
    expect(screen.getByText(/This field is the seller’s assertion/)).toBeTruthy();
    expect(screen.queryByText(LEAN_REFUSED)).toBeNull();
    await user.type(screen.getByLabelText(MANUAL), `0x${'d'.repeat(64)}`);
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    expect(await screen.findByLabelText('Signed receipt JSON')).toBeTruthy();
    expect(screen.getByText(/seller-supplied, not matched/)).toBeTruthy();
  });

  it('defaults to the compile-time profile (full under the default test config)', () => {
    expect(BUILD_PROFILE).toBe('full');
    const seller = generateSession();
    render(<ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} />);
    expect(screen.getByLabelText(MANUAL)).toBeTruthy();
  });

  it('follows a lean shell even when the compiled profile is full (no prop)', () => {
    const seller = generateSession();
    render(<ShellProfileContext.Provider value="lean"><ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} /></ShellProfileContext.Provider>);
    expect(screen.queryByLabelText(MANUAL)).toBeNull();
    expect(screen.getByText(new RegExp(LEAN_HINT.slice(0, 40)))).toBeTruthy();
  });

  it('keeps manual mode in a full shell with a full build', () => {
    const seller = generateSession();
    render(<ShellProfileContext.Provider value="full"><ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} /></ShellProfileContext.Provider>);
    expect(screen.getByLabelText(MANUAL)).toBeTruthy();
  });

  it('an explicit full prop inside a lean shell stays lean (narrow-only)', () => {
    const seller = generateSession();
    render(<ShellProfileContext.Provider value="lean"><ReceiptPanel match={match} sellerSignerPublicKey={seller.signerPublicKey} profile="full" /></ShellProfileContext.Provider>);
    expect(screen.queryByLabelText(MANUAL)).toBeNull();
  });
});
