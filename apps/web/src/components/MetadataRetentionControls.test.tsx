// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoicePreviewRetention, PROOF_RETENTION_KEY, RETENTION_KEY, type RetentionScope } from '../lib/metadataRetention';
import { useInvoicePreviewRetention, usePresentationRetention } from '../lib/useInvoicePreviewRetention';
import { MetadataRetentionControls } from './MetadataRetentionControls';

function Fixture() {
  const [preview, setPreview] = useState<object | undefined>({});
  useInvoicePreviewRetention(preview, () => { setPreview(undefined); });
  return <><MetadataRetentionControls />{preview !== undefined && <p>Disposable generated preview</p>}
    <button onClick={() => { setPreview({}); }}>Replace preview</button></>;
}

function ScopedFixture({ scope }: { readonly scope: RetentionScope }) {
  const [preview, setPreview] = useState<object | undefined>({});
  usePresentationRetention(preview, () => { setPreview(undefined); }, scope);
  return <><MetadataRetentionControls scope={scope} />{preview !== undefined && <p>Disposable generated preview</p>}</>;
}

const scopes = [
  { scope: 'invoice', key: RETENTION_KEY, otherKey: PROOF_RETENTION_KEY, label: 'Clear generated invoice previews automatically', preview: 'Preview screen-data cleanup', confirm: 'Clear previewed screen data' },
  { scope: 'proof', key: PROOF_RETENTION_KEY, otherKey: RETENTION_KEY, label: 'Close payment proof previews automatically', preview: 'Preview proof cleanup', confirm: 'Close previewed proofs' },
] as const;

const pageReturnEvents = ['focus', 'pageshow', 'visibilitychange', 'resume'] as const;
const returningScopes = pageReturnEvents.flatMap((event) => scopes.map((scope) => ({ ...scope, event })));
function returnToPage(event: (typeof pageReturnEvents)[number]): void {
  if (event === 'pageshow') window.dispatchEvent(new PageTransitionEvent(event, { persisted: true }));
  else if (event === 'focus') window.dispatchEvent(new Event(event));
  else document.dispatchEvent(new Event(event));
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('invoice presentation retention controls', () => {
  it('previews without deleting, supports cancellation, then clears only after confirmation', () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
    expect(screen.getByText('Generated invoice previews to clear: 1')).toBeTruthy();
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel cleanup' }));
    expect(screen.queryByRole('button', { name: 'Clear previewed screen data' })).toBeNull();
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear previewed screen data' }));
    expect(screen.queryByText('Disposable generated preview')).toBeNull();
    expect(screen.getByText('Previewed screen data cleared.')).toBeTruthy();
  });

  it('invalidates an old destructive preview after generated content changes', () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace preview' }));
    expect(screen.queryByRole('button', { name: 'Clear previewed screen data' })).toBeNull();
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
  });

  it('persists only the selected nonsecret preference and expires while the view is active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    render(<Fixture />);
    fireEvent.change(screen.getByLabelText('Clear generated invoice previews automatically'), { target: { value: '300000' } });
    expect(localStorage.getItem(RETENTION_KEY)).toBe('{"delay":300000}');
    act(() => { vi.advanceTimersByTime(299_000); });
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.queryByText('Disposable generated preview')).toBeNull();
    expect(localStorage.length).toBe(1);
  });

  it('leaves off as the effective policy if saving is denied and removes timers on unmount', () => {
    vi.useFakeTimers();
    const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const result = render(<Fixture />);
    fireEvent.change(screen.getByLabelText('Clear generated invoice previews automatically'), { target: { value: '300000' } });
    expect(screen.getByText('The preference could not be saved. No cleanup policy was changed.')).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('0');
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    result.unmount();
    expect(invoicePreviewRetention.preview().count).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    denied.mockRestore();
  });
});

describe.each(returningScopes)('$scope preference reconciliation on $event', ({ scope, key, otherKey, label, preview, confirm, event }) => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000); });

  it('reconciles a missed cross-tab change and invalidates manual approval without closing a preview', () => {
    render(<ScopedFixture scope={scope} />);
    fireEvent.click(screen.getByRole('button', { name: preview }));
    expect(screen.getByRole('button', { name: confirm })).toBeTruthy();
    localStorage.setItem(key, '{"delay":900000}');
    act(() => { returnToPage(event); });
    expect(screen.getByLabelText<HTMLSelectElement>(label).value).toBe('900000');
    expect(screen.queryByRole('button', { name: confirm })).toBeNull();
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    expect(localStorage.getItem(key)).toBe('{"delay":900000}');
  });

  it('preserves current manual approval when only the other category changes', () => {
    localStorage.setItem(key, '{"delay":900000}');
    render(<ScopedFixture scope={scope} />);
    fireEvent.click(screen.getByRole('button', { name: preview }));
    localStorage.setItem(otherKey, '{"delay":300000}');
    act(() => { returnToPage(event); });
    expect(screen.getByLabelText<HTMLSelectElement>(label).value).toBe('900000');
    expect(screen.getByRole('button', { name: confirm })).toBeTruthy();
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: confirm }));
    expect(screen.queryByText('Disposable generated preview')).toBeNull();
    expect(localStorage.getItem(otherKey)).toBe('{"delay":300000}');
  });

  it.each(['denied', 'malformed'] as const)('shows off and revokes stale approval when the current read is %s', (failure) => {
    localStorage.setItem(key, '{"delay":300000}');
    render(<ScopedFixture scope={scope} />);
    fireEvent.click(screen.getByRole('button', { name: preview }));
    const denied = failure === 'denied'
      ? vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('synthetic storage denial'); })
      : undefined;
    if (failure === 'malformed') localStorage.setItem(key, '{"delay":300000,"delay":0}');
    act(() => { returnToPage(event); });
    expect(screen.getByLabelText<HTMLSelectElement>(label).value).toBe('0');
    expect(screen.queryByRole('button', { name: confirm })).toBeNull();
    act(() => { vi.advanceTimersByTime(301_000); });
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    denied?.mockRestore();
  });
});

describe('retention preference control lifetime', () => {
  it('reads persisted values across category replacement and actual remount without inheriting approval', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    localStorage.setItem(RETENTION_KEY, '{"delay":300000}');
    localStorage.setItem(PROOF_RETENTION_KEY, '{"delay":900000}');
    const view = render(<ScopedFixture scope="invoice" />);
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('300000');
    fireEvent.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
    view.rerender(<ScopedFixture scope="proof" />);
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('900000');
    expect(screen.queryByRole('button', { name: 'Clear previewed screen data' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preview proof cleanup' }));
    localStorage.setItem(RETENTION_KEY, '{"delay":3600000}');
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('900000');
    expect(screen.getByRole('button', { name: 'Close previewed proofs' })).toBeTruthy();
    localStorage.setItem(PROOF_RETENTION_KEY, '{"delay":0}');
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('0');
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
    expect(screen.getByText('Disposable generated preview')).toBeTruthy();
    view.unmount();
    const invoice = render(<ScopedFixture scope="invoice" />);
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('3600000');
    expect(screen.queryByRole('button', { name: 'Clear previewed screen data' })).toBeNull();
    invoice.unmount();
    const proof = render(<ScopedFixture scope="proof" />);
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('0');
    expect(screen.queryByRole('button', { name: 'Close previewed proofs' })).toBeNull();
    proof.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(pageReturnEvents)('withdraws its %s observer when the control unmounts', (event) => {
    const target = event === 'focus' || event === 'pageshow' ? window : document;
    const add = vi.spyOn(target, 'addEventListener');
    const remove = vi.spyOn(target, 'removeEventListener');
    const view = render(<MetadataRetentionControls scope="proof" />);
    const observer = add.mock.calls.find(([name]) => name === event)?.[1];
    expect(observer).toBeTypeOf('function');
    view.unmount();
    expect(remove.mock.calls.some(([name, listener]) => name === event && listener === observer)).toBe(true);
  });
});
