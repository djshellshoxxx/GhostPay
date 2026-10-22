// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QR_KIND_ORDER, QR_KINDS, qrKindClass } from '../lib/qrKinds';
import { QrFrame } from './QrFrame';
import { QrView } from './QrView';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('QrFrame kinds', () => {
  it.each(QR_KIND_ORDER.filter((k) => k !== 'secret'))('%s renders label, icon and border class', (kind) => {
    const { container } = render(<QrFrame kind={kind} text="https://app.test/#x" caption="Test code" />);
    const info = QR_KINDS[kind];
    const group = screen.getByRole('region', { name: info.label });
    expect(group.className).toContain(qrKindClass(kind));
    expect(screen.getByText(info.label)).toBeTruthy();
    expect(container.querySelector('svg.qr-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('img', { name: 'Test code' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy as text' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download SVG' })).toBeTruthy();
  });
  it('the secret kind also renders label, icon and class', () => {
    const { container } = render(<QrFrame kind="secret" text="s" caption="c" />);
    expect(screen.getByRole('region', { name: 'SECRET' }).className).toContain('qr-kind-secret');
    expect(container.querySelector('svg.qr-icon')).not.toBeNull();
    expect(screen.getByText(/Do not screenshot or photograph/)).toBeTruthy();
  });
  it('keeps the QR quiet zone inside the frame and never colours modules', () => {
    const { container } = render(<QrFrame kind="shareable" text="hello" caption="c" />);
    const path = container.querySelector('path.qr-fg')?.getAttribute('d') ?? '';
    expect(path.startsWith('M4 4')).toBe(true);
    expect(container.querySelector('.qr-bg')).not.toBeNull();
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });
  it('legacy QrView still renders caption and download', () => {
    render(<QrView text="x" caption="old" />);
    expect(screen.getByText('old', { selector: 'figcaption' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download QR (SVG)' })).toBeTruthy();
  });
  it('shows a message for payloads too long for a QR', () => {
    render(<QrFrame kind="proof" text={'x'.repeat(5000)} caption="c" />);
    expect(screen.getByText(/too long for a QR/)).toBeTruthy();
  });
});

describe('secret reveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  it('is hidden until revealed, has no copy or download, and auto-hides after 60 s', () => {
    render(<QrFrame kind="secret" text="backup" caption="Backup" />);
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    expect(screen.getByRole('img', { name: 'Backup' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy as text' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download SVG' })).toBeNull();
    act(() => { vi.advanceTimersByTime(59_000); });
    expect(screen.getByRole('img', { name: 'Backup' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1_500); });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/hidden automatically/)).toBeTruthy();
  });
  it('can be hidden manually and hides when the page is hidden', () => {
    render(<QrFrame kind="secret" text="backup" caption="Backup" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide now' }));
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/page was hidden/)).toBeTruthy();
  });
});

describe('show larger', () => {
  it('opens a labelled dialog, Escape closes it and focus returns', async () => {
    const user = userEvent.setup();
    const release = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator) as object, { wakeLock: { request: () => Promise.resolve({ release }) } }));
    render(<QrFrame kind="bearer" text="https://app.test/#k" caption="Link" />);
    const open = screen.getByRole('button', { name: 'Show larger' });
    await user.click(open);
    expect(screen.getByRole('dialog', { name: /PRIVATE LINK QR code, large/ })).toBeTruthy();
    expect(screen.getByText(/brightness/)).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });
  it('closes with the Close button and tolerates a failing wake lock', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator) as object, { wakeLock: { request: () => Promise.reject(new Error('no')) } }));
    render(<QrFrame kind="device" text="s" caption="Settings" />);
    await user.click(screen.getByRole('button', { name: 'Show larger' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('multipart', () => {
  const chunks = ['p1', 'p2', 'p3'];
  function mm(reduce: boolean): void {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q }));
  }
  it('steps manually with Part i of n', async () => {
    mm(false);
    const user = userEvent.setup();
    render(<QrFrame kind="proof" text="p1p2p3" chunks={chunks} caption="Receipt" />);
    expect(screen.getByText('Part 1 of 3')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next part' }));
    expect(screen.getByText('Part 2 of 3')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Previous part' }));
    expect(screen.getByText('Part 1 of 3')).toBeTruthy();
  });
  it('auto-advances slowly and wraps', () => {
    mm(false);
    vi.useFakeTimers();
    render(<QrFrame kind="proof" text="all" chunks={chunks} caption="Receipt" />);
    fireEvent.click(screen.getByRole('checkbox'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('Part 1 of 3')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByText('Part 2 of 3')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('Part 1 of 3')).toBeTruthy();
  });
  it('offers manual stepping only when reduced motion is requested', () => {
    mm(true);
    render(<QrFrame kind="proof" text="all" chunks={chunks} caption="Receipt" />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/reduced motion/)).toBeTruthy();
  });
  it('large view steps parts too', async () => {
    mm(false);
    const user = userEvent.setup();
    render(<QrFrame kind="proof" text="all" chunks={chunks} caption="Receipt" />);
    await user.click(screen.getByRole('button', { name: 'Show larger' }));
    const dlg = screen.getByRole('dialog');
    await user.click(dlg.querySelector('.qr-actions button:last-child') as HTMLElement);
    expect(dlg.textContent).toContain('Part 2 of 3');
    await user.click(dlg.querySelector('.qr-actions button:first-child') as HTMLElement);
    expect(dlg.textContent).toContain('Part 1 of 3');
  });
  it('a single chunk is shown as a plain code', () => {
    render(<QrFrame kind="proof" text="one" chunks={['one']} caption="c" />);
    expect(screen.queryByText(/Part 1/)).toBeNull();
  });
});
