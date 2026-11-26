// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserChecks } from './BrowserChecks';
import { runBrowserChecks } from '../lib/browserChecks';
import type { BrowserCheck } from '../lib/browserChecks';

vi.mock('../lib/browserChecks', () => ({
  browserCheckEnvironment: () => ({ secureContext: true, probeKey: 'test' }),
  runBrowserChecks: vi.fn(),
}));

const passing: readonly BrowserCheck[] = [
  { id: 'secure', status: 'pass' },
  { id: 'digest', status: 'pass' },
  { id: 'storage', status: 'pass' },
];
const failing: readonly BrowserCheck[] = [
  { id: 'secure', status: 'pass' },
  { id: 'digest', status: 'fail' },
  { id: 'storage', status: 'unavailable' },
];
const check = vi.mocked(runBrowserChecks);

beforeEach(() => { check.mockReset(); check.mockResolvedValue(passing); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('shared mobile-friendly self-check footer', () => {
  it('reports local capabilities in an expandable region with explicit integrity limitations', async () => {
    render(<BrowserChecks />);
    const region = screen.getByRole('region', { name: 'Browser self-checks' });
    await waitFor(() => { expect(region.textContent).toContain('All browser capability checks passed'); });
    fireEvent.click(screen.getByText(/Browser self-checks:/));
    expect(region.textContent).toContain('WebCrypto SHA-256 known-answer test');
    expect(region.textContent).toContain('not an independent verification');
    expect(region.querySelectorAll('li')).toHaveLength(3);
    // Passing checks carry no unsupported-capability explanation.
    expect(region.querySelectorAll('.browser-checks-explain')).toHaveLength(0);
  });

  it('labels failed and unavailable results in text and explains each unsupported capability', async () => {
    check.mockResolvedValue([
      { id: 'secure', status: 'fail' },
      { id: 'digest', status: 'unavailable' },
      { id: 'storage', status: 'fail' },
    ]);
    render(<BrowserChecks />);
    const region = screen.getByRole('region', { name: 'Browser self-checks' });
    await waitFor(() => { expect(region.querySelectorAll('li')).toHaveLength(3); });
    const [secure, digest, storage] = [...region.querySelectorAll('li')];
    expect(secure?.querySelector('strong')?.textContent).toBe('Failed');
    expect(secure?.querySelector('strong')?.getAttribute('data-result')).toBe('fail');
    expect(secure?.textContent).toContain('not in a secure context');
    expect(digest?.querySelector('strong')?.textContent).toBe('Unavailable');
    expect(digest?.querySelector('strong')?.getAttribute('data-result')).toBe('unavailable');
    expect(digest?.textContent).toContain('WebCrypto is not available');
    expect(storage?.textContent).toContain('did not return or remove the test value');
    expect(region.querySelectorAll('.browser-checks-explain')).toHaveLength(3);
    // Each explanation is attached to its result for assistive technology.
    for (const item of [secure, digest, storage]) {
      const describedBy = item?.querySelector('strong')?.getAttribute('aria-describedby') ?? '';
      expect(describedBy).not.toBe('');
      expect(document.getElementById(describedBy)?.textContent).not.toBe('');
    }
  });

  it('explains unavailable secure-context reporting and refused storage distinctly from failures', async () => {
    check.mockResolvedValue([
      { id: 'secure', status: 'unavailable' },
      { id: 'digest', status: 'fail' },
      { id: 'storage', status: 'unavailable' },
    ]);
    render(<BrowserChecks />);
    const region = screen.getByRole('region', { name: 'Browser self-checks' });
    await waitFor(() => { expect(region.querySelectorAll('li')).toHaveLength(3); });
    const [secure, digest, storage] = [...region.querySelectorAll('li')];
    expect(secure?.textContent).toContain('does not report whether this page is in a secure context');
    expect(digest?.textContent).toContain('returned a wrong result or an error');
    expect(storage?.textContent).toContain('refused site storage');
    expect(region.textContent).toContain('Check browser capabilities');
  });

  it('shows attention when one check fails without exposing diagnostic exceptions', async () => {
    check.mockResolvedValue(failing);
    render(<BrowserChecks />);
    await waitFor(() => { expect(screen.getByRole('region', { name: 'Browser self-checks' }).textContent).toContain('Check browser capabilities'); });
  });

  it('discards results of an older check finishing after the foreground refresh', async () => {
    let finishOld: ((value: readonly BrowserCheck[]) => void) | undefined;
    check.mockImplementationOnce(() => new Promise<readonly BrowserCheck[]>((resolve) => { finishOld = resolve; }));
    check.mockResolvedValueOnce(failing);
    render(<BrowserChecks />);
    await act(async () => { fireEvent.focus(window); await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByRole('region', { name: 'Browser self-checks' }).textContent).toContain('Check browser capabilities'); });
    await act(async () => { finishOld?.(passing); await Promise.resolve(); });
    expect(screen.getByRole('region', { name: 'Browser self-checks' }).textContent).toContain('Check browser capabilities');
  });
});
