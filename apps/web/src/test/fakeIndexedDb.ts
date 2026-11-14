import { vi } from 'vitest';

/** Open requests handed out by {@link installOpenFactory}; tests fire their callbacks by hand. */
export interface PendingOpen {
  /** The adapters read it as a real connection; tests hand in a {@link FakeDb}. */
  result: IDBDatabase | FakeDb;
  onsuccess?: () => void;
  onerror?: () => void;
  onblocked?: () => void;
  onupgradeneeded?: () => void;
}

/** Replaces `indexedDB.open` with a factory whose requests settle only when the test says so. */
export function installOpenFactory(): { readonly requests: PendingOpen[]; readonly open: ReturnType<typeof vi.fn> } {
  const requests: PendingOpen[] = [];
  const open = vi.fn(() => {
    const request = { result: undefined as unknown as IDBDatabase };
    requests.push(request);
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  return { requests, open };
}

export interface FakeDbOptions {
  /** What `get` resolves with (undefined: no record). */
  readonly getResult?: unknown;
  /** Error every `put`/`add` request reports; the transaction then aborts with it. */
  readonly putError?: { readonly name: string };
  /** `transaction()` throws this DOMException name (InvalidStateError: the browser already closed the connection). */
  readonly throwOnTransaction?: string;
}

export type FakeDb = Omit<IDBDatabase, 'close'> & {
  readonly transactions: number;
  readonly close: ReturnType<typeof vi.fn>;
};

/**
 * A one-store connection whose requests succeed in order on later microtasks and then commit, or abort on a request error.
 * It covers what the key vault and reconciliation adapters call, nothing more.
 */
export function fakeDb(options: FakeDbOptions = {}): FakeDb {
  const db = {
    transactions: 0,
    close: vi.fn(),
    onversionchange: null as (() => void) | null,
    onclose: null as (() => void) | null,
    objectStoreNames: { contains: (): boolean => true },
    transaction: (): unknown => {
      db.transactions += 1;
      if (options.throwOnTransaction !== undefined) throw new DOMException('The database connection is closing.', options.throwOnTransaction);
      const queue: (() => void)[] = [];
      let scheduled = false;
      const tx = {
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: null as { readonly name: string } | null,
        aborted: false,
        abort: (): void => { tx.aborted = true; queueMicrotask(() => { tx.onabort?.(); }); },
        objectStore: () => ({
          get: () => request((r) => { r.result = options.getResult; r.onsuccess?.(); }),
          put: () => request((r) => { write(r); }),
          add: () => request((r) => { write(r); }),
          delete: () => request((r) => { r.onsuccess?.(); }),
        }),
      };
      const pump = (): void => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (tx.aborted) return;
          const next = queue.shift();
          if (next !== undefined) { next(); pump(); return; }
          tx.oncomplete?.();
        });
      };
      interface Req { result: unknown; error: { readonly name: string } | null; onsuccess: (() => void) | null; onerror: (() => void) | null }
      const request = (run: (r: Req) => void): Req => {
        const r: Req = { result: undefined, error: null, onsuccess: null, onerror: null };
        queue.push(() => { run(r); });
        pump();
        return r;
      };
      const write = (r: Req): void => {
        if (options.putError === undefined) { r.onsuccess?.(); return; }
        r.error = options.putError;
        tx.error = options.putError;
        r.onerror?.();
        tx.abort();
      };
      return tx;
    },
  };
  return db as unknown as FakeDb;
}
