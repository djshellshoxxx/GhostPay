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
  { id: 'storage', status: 'warn' },
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
