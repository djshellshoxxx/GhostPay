// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoicePreviewRetention, RETENTION_KEY } from '../lib/metadataRetention';
import { useInvoicePreviewRetention } from '../lib/useInvoicePreviewRetention';
import { MetadataRetentionControls } from './MetadataRetentionControls';

function Fixture() {
  const [preview, setPreview] = useState<object | undefined>({});
  useInvoicePreviewRetention(preview, () => { setPreview(undefined); });
  return <><MetadataRetentionControls />{preview !== undefined && <p>Disposable generated preview</p>}
    <button onClick={() => { setPreview({}); }}>Replace preview</button></>;
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
