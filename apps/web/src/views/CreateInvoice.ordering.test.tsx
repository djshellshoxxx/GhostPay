// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatedInvoice, InvoiceForm } from '../lib/invoiceCreate';
import { clearSession } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { renderApp } from '../test/render';

// Keep the actual token choices and UI intact; control only asynchronous invoice-build completion.
const builds = vi.hoisted(() => ({ buildInvoiceLink: vi.fn() }));
vi.mock('../lib/invoiceCreate', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/invoiceCreate')>();
  return { ...original, buildInvoiceLink: builds.buildInvoiceLink };
});

type Pending = {
  amount: string;
  resolve: (value: CreatedInvoice) => void;
  reject: (error: Error) => void;
};
const pending: Pending[] = [];

function result(amount: string): CreatedInvoice {
  return {
    // Registration is opt-in; this view should not inspect the other fields in the mocked result.
    invoice: { v: 1, amountPolicy: { mode: 'fixed_token', tokenAmount: amount } } as CreatedInvoice['invoice'],
    fragment: `#gpi=v1.${amount}`,
    link: `https://app.test/#gpi=v1.${amount}`,
    encrypted: false,
    passphraseProtected: false,
  };
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  pending.length = 0;
  builds.buildInvoiceLink.mockReset();
  builds.buildInvoiceLink.mockImplementation((form: InvoiceForm) => new Promise<CreatedInvoice>((resolve, reject) => {
    pending.push({ amount: form.tokenAmount, resolve, reject });
  }));
});

async function createTwice(): Promise<void> {
  generateWaivedSession();
  const user = userEvent.setup();
  renderApp();
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
  const amount = screen.getByLabelText<HTMLInputElement>('Token amount');
  await user.type(amount, '1');
  await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
  await user.clear(amount);
  await user.type(amount, '2');
  await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
  expect(pending.map((p) => p.amount)).toEqual(['1', '2']);
}

describe('CreateInvoice asynchronous result ordering (static Pages client)', () => {
  it('must not replace a newer invoice link when an older build succeeds later', async () => {
    await createTwice();
    await act(async () => { pending[1]!.resolve(result('2')); await Promise.resolve(); });
    expect(screen.getByLabelText<HTMLTextAreaElement>('Link').value).toContain('#gpi=v1.2');
    await act(async () => { pending[0]!.resolve(result('1')); await Promise.resolve(); });
    expect(screen.getByLabelText<HTMLTextAreaElement>('Link').value).toContain('#gpi=v1.2');
  });

  it('discards pending itemized links after switching to minimal, including a round trip between modes', async () => {
    await createTwice();
    const user = userEvent.setup();
    const choice = screen.getByRole('checkbox', { name: 'Privacy-minimal invoice' });
    await user.click(choice);
    expect(screen.getByRole('checkbox', { name: 'Include a decryption key in the link' })).toBeTruthy();
    expect(screen.getByText(/This key encrypts only the empty item list/)).toBeTruthy();
    await user.click(choice);
    await act(async () => { pending[1]!.resolve(result('2')); await Promise.resolve(); });
    expect(screen.queryByRole('textbox', { name: 'Link', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download invoice link (.txt)' })).toBeNull();
  });

  it('must not discard a newer invoice link when an older build fails later', async () => {
    await createTwice();
    await act(async () => { pending[1]!.resolve(result('2')); await Promise.resolve(); });
    expect(screen.getByLabelText<HTMLTextAreaElement>('Link').value).toContain('#gpi=v1.2');
    await act(async () => { pending[0]!.reject(new Error('obsolete build failed')); await Promise.resolve(); });
    expect(screen.getByLabelText<HTMLTextAreaElement>('Link').value).toContain('#gpi=v1.2');
  });
});
