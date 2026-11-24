import { useCallback, useRef, type RefCallback } from 'react';
import '../styles/print.css';

type FinishPrint = (notify?: boolean) => void;
let finishActivePrint: FinishPrint | undefined;

/** Select one document for print media without copying its contents or exposing other mounted receipts. */
export function usePrintTarget(): {
  readonly printRef: RefCallback<HTMLElement>;
  readonly print: (onFinished?: () => void) => void;
} {
  const target = useRef<HTMLElement | null>(null);
  const finishCurrent = useRef<FinishPrint | undefined>(undefined);
  const printRef = useCallback((element: HTMLElement | null): void => {
    // Ref cleanup also revokes a selection when its document is removed or replaced during a print dialog.
    finishCurrent.current?.(false);
    target.current = element;
  }, []);

  const print = useCallback((onFinished?: () => void): void => {
    const element = target.current;
    if (element === null || !element.isConnected || finishCurrent.current !== undefined) return;
    finishActivePrint?.();
    if (target.current !== element || !element.isConnected) return;

    let finished = false;
    const afterPrint = (): void => { finish(); };
    const finish: FinishPrint = (notify = true): void => {
      if (finished) return;
      finished = true;
      element.removeAttribute('data-print-target');
      window.removeEventListener('afterprint', afterPrint);
      finishCurrent.current = undefined;
      if (finishActivePrint === finish) finishActivePrint = undefined;
      if (notify) onFinished?.();
    };

    finishCurrent.current = finish;
    finishActivePrint = finish;
    element.setAttribute('data-print-target', '');
    window.addEventListener('afterprint', afterPrint);
    try {
      // Some browsers return before the dialog closes: retain the selection until afterprint or ref cleanup.
      window.print();
    } catch (error) {
      finish();
      throw error;
    }
  }, []);

  return { printRef, print };
}
