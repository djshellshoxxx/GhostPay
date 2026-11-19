// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import * as pins from '../lib/invoiceSignerPins';
import { InvoiceSignerVerification } from './InvoiceSignerVerification';

const A = signerPublicKeyHex(new Uint8Array(32).fill(91));
const B = signerPublicKeyHex(new Uint8Array(32).fill(92));
const ready: pins.InvoiceSignerPinsSnapshot = { status: 'ready', pins: [{ label: 'Alice', signer: A }], revision: 1 };
const props = () => ({ snapshot: ready, selected: '', onSelect: vi.fn(), parsed: undefined, status: undefined, scope: {}, identityScope: {}, isCurrent: () => true });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function enterPin(label: string, key = B): void {
  fireEvent.click(screen.getByRole('button', { name: 'Add a signer pin' }));
  fireEvent.change(screen.getByLabelText('Local seller name'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Independently trusted signing public key'), { target: { value: key } });
  fireEvent.click(screen.getByRole('button', { name: 'Review pin change' }));
}

describe('explicit signer pin controls', () => {
  it.each(['unavailable', 'malformed-invoice'] as const)('announces %s politely without competing with the invoice rejection alert', (status) => {
    render(<>
      <InvoiceSignerVerification {...props()} status={status} />
      <div role="alert">The invoice could not be opened. Nothing was sent.</div>
    </>);
    const liveStatus = screen.getByRole('status');
    expect(liveStatus.getAttribute('aria-live')).toBe('polite');
    expect(within(liveStatus).queryByRole('alert')).toBeNull();
    expect(liveStatus.textContent).toMatch(status === 'unavailable' ? /Verification unavailable or interrupted/ : /Malformed invoice/);
    expect(screen.getByRole('alert').textContent).toBe('The invoice could not be opened. Nothing was sent.');
  });

  it('saves nothing before a second confirmation and selects the normalized local name', async () => {
    const save = vi.spyOn(pins, 'changeInvoiceSignerPin').mockResolvedValue('saved');
    const p = props(); render(<InvoiceSignerVerification {...p} />);
    enterPin('Cafe\u0301');
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(B)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm signer pin' })); await Promise.resolve(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ label: 'Café', expectedSigner: null, signer: B, confirmation: B }), expect.any(Function));
    expect(p.onSelect).toHaveBeenCalledWith('Café');
  });

  it('requires review of both full keys to replace an identity and permits cancellation', async () => {
    const save = vi.spyOn(pins, 'changeInvoiceSignerPin').mockResolvedValue('saved');
    render(<InvoiceSignerVerification {...props()} selected="Alice" />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace selected pin' }));
    fireEvent.change(screen.getByLabelText('Independently trusted signing public key'), { target: { value: B } });
    fireEvent.click(screen.getByRole('button', { name: 'Review pin change' }));
    expect(screen.getAllByText(A).length).toBeGreaterThan(0);
    expect(screen.getByText(B)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pin change' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review pin change' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm signer pin' })); await Promise.resolve(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ label: 'Alice', expectedSigner: A, signer: B }), expect.any(Function));
  });

  it('removes a pin explicitly without turning off the existing identity requirement', async () => {
    const save = vi.spyOn(pins, 'changeInvoiceSignerPin').mockResolvedValue('removed');
    const p = props(); render(<InvoiceSignerVerification {...p} selected="Alice" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected pin' }));
    expect(save).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm pin removal' })); await Promise.resolve(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ label: 'Alice', expectedSigner: A, signer: null, confirmation: A }), expect.any(Function));
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('keeps a removed selected identity visibly unavailable instead of selecting another seller', () => {
    render(<InvoiceSignerVerification {...props()} snapshot={{ status: 'ready', pins: [], revision: 2 }} selected="Alice" status="unavailable" />);
    expect(screen.getByRole<HTMLOptionElement>('option', { name: 'Alice (pin unavailable)' }).selected).toBe(true);
    expect(screen.queryByRole('button', { name: 'Replace selected pin' })).toBeNull();
  });

  it.each(['invalid', 'conflict', 'unavailable'] as const)('reports a %s mutation without selecting a key', async (result) => {
    vi.spyOn(pins, 'changeInvoiceSignerPin').mockResolvedValue(result);
    const p = props(); render(<InvoiceSignerVerification {...p} />);
    enterPin('Bob');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm signer pin' })); await Promise.resolve(); });
    expect(screen.getByText(/The pin could not be changed/)).toBeTruthy();
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('rejects a duplicate normalized seller name before confirmation', () => {
    const save = vi.spyOn(pins, 'changeInvoiceSignerPin');
    render(<InvoiceSignerVerification {...props()} />);
    enterPin(' Alice ');
    expect(screen.getByText(/The pin could not be changed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm signer pin' })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('cannot let a late completed pin operation clear a newer invoice’s editing state', async () => {
    let finish: (result: pins.InvoiceSignerPinChangeResult) => void = () => { throw new Error('not initialized'); };
    vi.spyOn(pins, 'changeInvoiceSignerPin').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const p = props(); const view = render(<InvoiceSignerVerification {...p} />);
    enterPin('Bob');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signer pin' }));
    const next = { ...p, scope: {}, identityScope: {} };
    view.rerender(<InvoiceSignerVerification {...next} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a signer pin' }));
    fireEvent.change(screen.getByLabelText('Local seller name'), { target: { value: 'New review' } });
    await act(async () => { finish('saved'); await Promise.resolve(); });
    expect(screen.getByLabelText<HTMLInputElement>('Local seller name').value).toBe('New review');
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('cannot let a late completion clear new editing after a same-invoice storage update', async () => {
    let finish: (result: pins.InvoiceSignerPinChangeResult) => void = () => { throw new Error('not initialized'); };
    vi.spyOn(pins, 'changeInvoiceSignerPin').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const p = props(); const view = render(<InvoiceSignerVerification {...p} />);
    enterPin('Bob'); fireEvent.click(screen.getByRole('button', { name: 'Confirm signer pin' }));
    view.rerender(<InvoiceSignerVerification {...p} scope={{}} snapshot={{ ...ready, revision: 2 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a signer pin' }));
    fireEvent.change(screen.getByLabelText('Local seller name'), { target: { value: 'New review' } });
    await act(async () => { finish('saved'); await Promise.resolve(); });
    expect(screen.getByLabelText<HTMLInputElement>('Local seller name').value).toBe('New review');
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('blocks confirmation if the current invoice or session no longer authorizes it', () => {
    const save = vi.spyOn(pins, 'changeInvoiceSignerPin');
    let current = true;
    render(<InvoiceSignerVerification {...props()} isCurrent={() => current} />);
    enterPin('Bob'); current = false;
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signer pin' }));
    expect(save).not.toHaveBeenCalled();
  });

  it('drops an unmounted operation and exposes an accurate unavailable-storage result', async () => {
    let finish: (result: pins.InvoiceSignerPinChangeResult) => void = () => { throw new Error('not initialized'); };
    vi.spyOn(pins, 'changeInvoiceSignerPin').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const p = props(); const view = render(<InvoiceSignerVerification {...p} />);
    enterPin('Bob'); fireEvent.click(screen.getByRole('button', { name: 'Confirm signer pin' })); view.unmount();
    await act(async () => { finish('saved'); await Promise.resolve(); });
    expect(p.onSelect).not.toHaveBeenCalled();
    render(<InvoiceSignerVerification {...p} snapshot={{ status: 'unavailable', pins: [], revision: 3 }} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add a signer pin' }).disabled).toBe(true);
    expect(screen.getByText(/Saved signer pins cannot be read safely/)).toBeTruthy();
  });
});
