// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrintTarget } from './usePrintTarget';

function Target(props: { name: string; targetKey?: string; onFinished?: () => void }) {
  const { printRef, print } = usePrintTarget();
  return (
    <>
      <button type="button" onClick={() => { print(props.onFinished); }}>Print {props.name}</button>
      <article key={props.targetKey ?? props.name} ref={printRef} data-testid={props.name}>
        {props.name} document
      </article>
    </>
  );
}

function afterPrint(): void {
  act(() => { window.dispatchEvent(new Event('afterprint')); });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('usePrintTarget', () => {
  it('selects only the requested document before invoking the browser print dialog', () => {
    render(<><Target name="receipt" /><Target name="other-receipt" /><p>Wallet details</p></>);
    const target = screen.getByTestId('receipt');
    const other = screen.getByTestId('other-receipt');
    const before = document.body.textContent;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(document.querySelectorAll('[data-print-target]')).toHaveLength(1);
      expect(target.hasAttribute('data-print-target')).toBe(true);
      expect(other.hasAttribute('data-print-target')).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));

    expect(print).toHaveBeenCalledOnce();
    expect(document.body.textContent).toBe(before);
    afterPrint();
    expect(document.querySelector('[data-print-target]')).toBeNull();
    expect(document.body.textContent).toBe(before);
  });

  it('finishes the previous target before selecting a different receipt or bill', () => {
    const receiptDone = vi.fn();
    const billDone = vi.fn();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<><Target name="receipt" onFinished={receiptDone} /><Target name="bill" onFinished={billDone} /></>);

    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print bill' }));

    expect(print).toHaveBeenCalledTimes(2);
    expect(receiptDone).toHaveBeenCalledOnce();
    expect(billDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('receipt').hasAttribute('data-print-target')).toBe(false);
    expect(screen.getByTestId('bill').hasAttribute('data-print-target')).toBe(true);
    expect(document.querySelectorAll('[data-print-target]')).toHaveLength(1);
    afterPrint();
    afterPrint();
    expect(receiptDone).toHaveBeenCalledOnce();
    expect(billDone).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-print-target]')).toBeNull();
  });

  it('ignores a duplicate request while active and permits another print after completion or cancel', () => {
    const done = vi.fn();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<Target name="receipt" onFinished={done} />);
    const button = screen.getByRole('button', { name: 'Print receipt' });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(print).toHaveBeenCalledOnce();
    afterPrint();
    expect(done).toHaveBeenCalledOnce();
    expect(screen.getByTestId('receipt').hasAttribute('data-print-target')).toBe(false);
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('receipt').hasAttribute('data-print-target')).toBe(true);
    afterPrint();
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('handles afterprint synchronously inside window.print without retaining a stale job', () => {
    const done = vi.fn();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    render(<Target name="receipt" onFinished={done} />);

    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));
    expect(document.querySelector('[data-print-target]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));
    expect(print).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-print-target]')).toBeNull();
  });

  it('clears selection after a synchronous print failure and preserves the error', () => {
    const done = vi.fn();
    const error = new Error('Print dialog unavailable');
    const print = vi.spyOn(window, 'print').mockImplementationOnce(() => { throw error; }).mockImplementation(() => undefined);
    const { result } = renderHook(usePrintTarget);
    render(<article ref={result.current.printRef} data-testid="receipt">Signed receipt</article>);

    expect(() => { result.current.print(done); }).toThrow(error);
    expect(done).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-print-target]')).toBeNull();
    afterPrint();
    expect(done).toHaveBeenCalledOnce();
    result.current.print(done);
    expect(print).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('receipt').hasAttribute('data-print-target')).toBe(true);
    afterPrint();
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('revokes an unmounted target without calling its completion callback or affecting the next job', () => {
    const oldDone = vi.fn();
    const nextDone = vi.fn();
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const oldView = render(<Target name="old" onFinished={oldDone} />);
    const oldTarget = screen.getByTestId('old');
    fireEvent.click(screen.getByRole('button', { name: 'Print old' }));
    oldView.unmount();

    expect(oldTarget.hasAttribute('data-print-target')).toBe(false);
    render(<Target name="next" onFinished={nextDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print next' }));
    expect(screen.getByTestId('next').hasAttribute('data-print-target')).toBe(true);
    afterPrint();
    expect(oldDone).not.toHaveBeenCalled();
    expect(nextDone).toHaveBeenCalledOnce();
  });

  it('revokes a replaced element and requires a new print request for its replacement', () => {
    const done = vi.fn();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const view = render(<Target name="receipt" targetKey="old" onFinished={done} />);
    const oldTarget = screen.getByTestId('receipt');
    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));
    view.rerender(<Target name="receipt" targetKey="new" onFinished={done} />);
    const newTarget = screen.getByTestId('receipt');

    expect(newTarget).not.toBe(oldTarget);
    expect(oldTarget.hasAttribute('data-print-target')).toBe(false);
    expect(newTarget.hasAttribute('data-print-target')).toBe(false);
    afterPrint();
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));
    expect(print).toHaveBeenCalledTimes(2);
    expect(newTarget.hasAttribute('data-print-target')).toBe(true);
    afterPrint();
    expect(done).toHaveBeenCalledOnce();
  });

  it('does not print when its target is absent or detached', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const done = vi.fn();
    const { result } = renderHook(usePrintTarget);
    result.current.print(done);
    const detached = document.createElement('article');
    result.current.printRef(detached);
    result.current.print(done);

    expect(print).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    expect(detached.hasAttribute('data-print-target')).toBe(false);
    result.current.printRef(null);
  });
});
