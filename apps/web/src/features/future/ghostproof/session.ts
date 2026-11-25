import { captureReceiptReviewOptions, failedReview, reviewReceipt, type ReceiptReview, type ReceiptReviewError,
  type ReceiptReviewOptions, type ReceiptReviewResult } from './review';

export type ReceiptImportState =
  | { readonly status: 'idle' | 'checking' | 'disposed' }
  | { readonly status: 'ready'; readonly review: ReceiptReview }
  | { readonly status: 'error'; readonly code: ReceiptReviewError };

/**
 * One active offline import. Abort the caller's signal on lock or identity changes.
 * Cancellation clears this session immediately; a later WebCrypto result cannot restore
 * it. A consumer must also discard its own previously returned view on cancellation.
 */
export function createReceiptImportSession(): {
  readonly snapshot: () => ReceiptImportState;
  readonly importReceipt: (text: unknown, options: ReceiptReviewOptions) => Promise<ReceiptReviewResult>;
  readonly clear: () => void;
  readonly dispose: () => void;
} {
  let generation = 0;
  let disposed = false;
  let state: ReceiptImportState = Object.freeze({ status: 'idle' });
  let cancelCurrent: (() => void) | undefined;
  const clear = (): void => {
    generation++;
    cancelCurrent?.();
    cancelCurrent = undefined;
    state = Object.freeze({ status: disposed ? 'disposed' : 'idle' });
  };
  const importReceipt = async (text: unknown, options: ReceiptReviewOptions): Promise<ReceiptReviewResult> => {
    if (disposed) return failedReview('DISPOSED');
    clear();
    const current = generation;
    const controller = new AbortController();
    const onAbort = (): void => { if (current === generation) clear(); };
    const captured = captureReceiptReviewOptions(options);
    if (captured === undefined) {
      state = Object.freeze({ status: 'error', code: 'INVALID_CONTEXT' });
      return failedReview('INVALID_CONTEXT');
    }
    const sessionSignal = captured.signal;
    if (sessionSignal.aborted) return failedReview('CANCELLED');
    cancelCurrent = () => {
      try { sessionSignal.removeEventListener('abort', onAbort); } catch { /* Invalid callers cannot strand local state. */ }
      controller.abort();
    };
    try {
      sessionSignal.addEventListener('abort', onAbort, { once: true });
    } catch {
      clear();
      state = Object.freeze({ status: 'error', code: 'INVALID_CONTEXT' });
      return failedReview('INVALID_CONTEXT');
    }
    state = Object.freeze({ status: 'checking' });
    let result: ReceiptReviewResult;
    try { result = await reviewReceipt(text, { ...captured, signal: controller.signal }); }
    catch { result = failedReview('VERIFIER_UNAVAILABLE'); }
    if (current !== generation || disposed) return failedReview('CANCELLED');
    // Keep the session listener for a completed review, so a later lock clears it too.
    state = result.ok ? Object.freeze({ status: 'ready', review: result.review })
      : Object.freeze({ status: 'error', code: result.code });
    return result;
  };
  return Object.freeze({ snapshot: () => state, importReceipt, clear, dispose: () => { disposed = true; clear(); } });
}
