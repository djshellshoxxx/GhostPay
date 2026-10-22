/**
 * Local-only observability events. They carry codes, counts and booleans only: never
 * fragments, keys, memos, line items, API keys, URLs with identifiers or response bodies.
 * Nothing here is ever sent anywhere by the SDK; `onEvent` is a callback the host app owns.
 */
export type SdkEvent =
  | { readonly type: 'invoice.built'; readonly at: number; readonly chainId: number; readonly lineItems: number }
  | { readonly type: 'invoice.signed'; readonly at: number }
  | { readonly type: 'invoice.linked'; readonly at: number; readonly encrypted: boolean; readonly length: number }
  | {
      readonly type: 'invoice.verified';
      readonly at: number;
      readonly ok: boolean;
      readonly trust: string;
      readonly blockers: readonly string[];
    }
  | { readonly type: 'invoice.rejected'; readonly at: number; readonly invoiceCode: string }
  | { readonly type: 'http.request'; readonly at: number; readonly method: string; readonly route: string }
  | { readonly type: 'http.response'; readonly at: number; readonly route: string; readonly status: number; readonly durationMs: number }
  | { readonly type: 'http.error'; readonly at: number; readonly route: string; readonly errorCode: string };

/** Event listener. */
export type SdkEventListener = (event: SdkEvent) => void;

/**
 * Minimal synchronous typed emitter.
 *
 * @remarks A throwing listener never breaks the SDK call that emitted the event and
 * never prevents other listeners from running; the failure is counted in
 * {@link TypedEmitter.listenerErrors} so tests can detect it.
 */
export class TypedEmitter {
  private listeners = new Set<SdkEventListener>();
  private errors = 0;

  /** @returns An unsubscribe function (idempotent). */
  public on(listener: SdkEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: SdkEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(event);
      } catch {
        this.errors++;
      }
    }
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public get listenerErrors(): number {
    return this.errors;
  }
}
