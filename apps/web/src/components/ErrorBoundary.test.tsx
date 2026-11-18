// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

beforeEach(() => {
  // React reports every error a boundary catches through console.error.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function View(props: { readonly explode: boolean }): ReactNode {
  if (props.explode) throw new RangeError('Invalid time value for memo <hostile invoice text>');
  return <p>View content</p>;
}
const noop = (): void => undefined;

describe('ErrorBoundary (G1-01)', () => {
  it('renders its children while they work', () => {
    render(<ErrorBoundary onBack={noop}><View explode={false} /></ErrorBoundary>);
    expect(screen.getByText('View content')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a fixed error panel instead of unmounting the app, and never the error text', () => {
    const { container } = render(<><h1>App header</h1><ErrorBoundary onBack={noop}><View explode /></ErrorBoundary></>);
    expect(screen.getByRole('heading', { name: 'App header' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/This page stopped after an unexpected error/);
    expect(screen.getByRole('alert').textContent).toMatch(/a transaction may already have been sent/);
    expect(container.textContent).not.toMatch(/hostile invoice text|Invalid time value/);
    expect(screen.queryByText('View content')).toBeNull();
    expect(screen.getByText(/seller keys that are not backed up/)).toBeTruthy();
  });

  it('Back to Home leaves the failed view through onBack and renders the children again', () => {
    function Harness(): ReactNode {
      const [explode, setExplode] = useState(true);
      return <ErrorBoundary onBack={() => { setExplode(false); }}><View explode={explode} /></ErrorBoundary>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(screen.getByText('View content')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the error when the reset key changes (the user navigated to another view), not before', () => {
    const { rerender } = render(<ErrorBoundary resetKey="pay" onBack={noop}><View explode /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<ErrorBoundary resetKey="pay" onBack={noop}><View explode={false} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<ErrorBoundary resetKey="home" onBack={noop}><View explode={false} /></ErrorBoundary>);
    expect(screen.getByText('View content')).toBeTruthy();
  });

  it('offers a page reload', () => {
    const reload = vi.fn();
    render(<ErrorBoundary onBack={noop} reload={reload}><View explode /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Reload the page' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
