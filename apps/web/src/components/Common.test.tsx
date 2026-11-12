// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton, Field, Mono, Notice, SafeText, downloadText } from './Common';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared presentation helpers', () => {
  it.each([
    ['info', 'Note', 'note'],
    ['warn', 'Warning', 'note'],
    ['error', 'Problem', 'alert'],
    ['ok', 'Done', 'note'],
  ] as const)('renders the %s notice with an overridable title', (kind, fallbackTitle, role) => {
    const { rerender } = render(<Notice kind={kind}>Message body</Notice>);
    expect(screen.getByRole(role).textContent).toContain(fallbackTitle);
    expect(screen.getByRole(role).textContent).toContain('Message body');
    rerender(<Notice kind={kind} title="Custom title">Updated body</Notice>);
    expect(screen.getByRole(role).textContent).toContain('Custom title');
    expect(screen.queryByText(fallbackTitle)).toBeNull();
  });

  it('connects field labels and optional hints to the supplied control', () => {
    const { rerender } = render(<Field label="RPC URL" hint="Use HTTPS">{(id, describedBy) => <input id={id} aria-describedby={describedBy} />}</Field>);
    const input = screen.getByLabelText('RPC URL');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Use HTTPS').id).toBe(input.getAttribute('aria-describedby'));
    rerender(<Field label="Amount">{(id, describedBy) => <input id={id} aria-describedby={describedBy} />}</Field>);
    expect(screen.getByLabelText('Amount').getAttribute('aria-describedby')).toBeNull();
  });

  it('reports successful and failed clipboard writes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { rerender } = render(<CopyButton text="local value" label="Copy value" />);
    await user.click(screen.getByRole('button', { name: 'Copy value' }));
    expect(writeText).toHaveBeenCalledWith('local value');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();

    writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    rerender(<CopyButton key="retry" text="second value" label="Copy again" />);
    await user.click(screen.getByRole('button', { name: 'Copy again' }));
    expect(await screen.findByRole('button', { name: 'Copy failed: select the text manually' })).toBeTruthy();
  });

  it('starts a local text download and revokes the object URL', () => {
    const blob = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let clicked: { href: string; download: string; rel: string; connected: boolean } | undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = { href: this.href, download: this.download, rel: this.rel, connected: this.isConnected };
    });
    vi.useFakeTimers();
    downloadText('receipt.json', '{"ok":true}', 'application/json');
    expect(blob).toHaveBeenCalledOnce();
    expect(clicked).toEqual({ href: 'blob:local', download: 'receipt.json', rel: 'noopener', connected: true });
    expect(click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:local');
    vi.useRealTimers();
  });

  it('renders sanitized text notices only when markers or mixed scripts need explanation', () => {
    const { rerender, container } = render(<SafeText value="normal text" />);
    expect(container.textContent).toBe('normal text');
    expect(container.querySelector('.hint')).toBeNull();
    rerender(<SafeText value={'pa\u202Eypal'} />);
    expect(container.textContent).toContain('hidden or direction-changing character');
    expect(container.textContent).toContain('⟨U+202E⟩');
    rerender(<SafeText value="aа" />);
    expect(container.textContent).toContain('lookalikes');
    rerender(<SafeText value={'pa\u202Eypal'} notice={false} />);
    expect(container.querySelector('.hint')).toBeNull();
  });

  it('renders monospace children as content', () => {
    render(<Mono>0xabc</Mono>);
    expect(screen.getByText('0xabc').tagName).toBe('CODE');
    expect(screen.getByText('0xabc').className).toContain('mono');
  });
});

describe('CopyButton localization', () => {
  it('shows the copy outcome in the active language (catalog draft) and English without a provider', async () => {
    const { I18nProvider } = await import('../i18n/context');
    const es = (await import('../../locales/es.json')).default as { messages: Record<string, string> };
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    render(<I18nProvider initialPreference="es" target={document.documentElement}><CopyButton text="x" label="Copiar" /></I18nProvider>);
    await user.click(await screen.findByRole('button', { name: 'Copiar' }));
    expect(await screen.findByRole('button', { name: es.messages['common.copy.failed'] ?? 'MISSING' })).toBeTruthy();
  });

  it('does not report a completed copy for replacement text', async () => {
    let complete: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    const writeText = vi.fn(() => pending);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { rerender } = render(<CopyButton text="first receipt" label="Copy receipt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy receipt' }));
    rerender(<CopyButton text="second receipt" label="Copy receipt" />);
    await act(async () => { complete?.(); await pending; });
    expect(writeText).toHaveBeenCalledWith('first receipt');
    expect(screen.getByRole('button', { name: 'Copy receipt' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });

  it('clears a previous copy result when its text changes', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    const { rerender } = render(<CopyButton text="first receipt" label="Copy receipt" />);
    await user.click(screen.getByRole('button', { name: 'Copy receipt' }));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    rerender(<CopyButton text="second receipt" label="Copy receipt" />);
    expect(screen.getByRole('button', { name: 'Copy receipt' })).toBeTruthy();
  });
});
