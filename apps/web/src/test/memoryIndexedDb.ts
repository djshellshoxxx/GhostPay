type Handler = (() => void) | null;

interface Database {
  readonly version: number;
  /** Records by key; the adapters under test use string keys only. */
  readonly stores: Map<string, Map<string, unknown>>;
}

interface Request<T> {
  result: T | undefined;
  error: { readonly name: string } | null;
  onsuccess: Handler;
  onerror: Handler;
}

interface Transaction {
  oncomplete: Handler;
  onerror: Handler;
  onabort: Handler;
  objectStore(name: string): {
    get(key: IDBValidKey): Request<unknown>;
    put(value: unknown, key: IDBValidKey): Request<IDBValidKey>;
    getAllKeys(): Request<IDBValidKey[]>;
  };
  abort(): void;
}

const later = (run: () => void): void => { setTimeout(run, 0); };

function stringKey(key: IDBValidKey): string {
  if (typeof key !== 'string') throw new DOMException('Only string keys are supported here.', 'DataError');
  return key;
}

/**
 * In-memory IndexedDB for tests that run a real storage adapter (jsdom and node have none): versioned opens whose upgrade
 * can be aborted (a database created that way is not kept), object stores with out-of-line keys, and transactions whose
 * get, put and getAllKeys requests succeed in order on later tasks and then commit, or roll back on abort. It covers what
 * IdbReconciliationVaultStore and storedHistoryChains call, nothing more.
 */
export function memoryIndexedDb(): IDBFactory {
  const databases = new Map<string, Database>();

  const transaction = (db: Database, scope: string | readonly string[], mode: IDBTransactionMode = 'readonly'): Transaction => {
    const names = typeof scope === 'string' ? [scope] : [...scope];
    for (const name of names) if (!db.stores.has(name)) throw new DOMException(`No object store ${name}`, 'NotFoundError');
    // Writes go to the live records; abort restores these copies.
    const before = new Map(names.map((name) => [name, new Map(db.stores.get(name))]));
    const queue: (() => void)[] = [];
    let finished = false;
    let pumping = false;
    const pump = (): void => {
      if (pumping) return;
      pumping = true;
      later(() => {
        pumping = false;
        if (finished) return;
        const next = queue.shift();
        if (next !== undefined) { next(); pump(); return; }
        finished = true;
        tx.oncomplete?.();
      });
    };
    const request = <T>(run: () => T): Request<T> => {
      if (finished) throw new DOMException('The transaction has finished.', 'TransactionInactiveError');
      const req: Request<T> = { result: undefined, error: null, onsuccess: null, onerror: null };
      queue.push(() => { req.result = run(); req.onsuccess?.(); });
      pump();
      return req;
    };
    const tx: Transaction = {
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore: (name) => {
        const records = db.stores.get(name);
        if (records === undefined || !names.includes(name)) throw new DOMException(`No object store ${name} in this transaction`, 'NotFoundError');
        const writable = (): void => { if (mode === 'readonly') throw new DOMException('The transaction is read-only.', 'ReadOnlyError'); };
        return {
          get: (key) => { const id = stringKey(key); return request(() => records.get(id)); },
          put: (value, key) => { writable(); const id = stringKey(key); return request(() => { records.set(id, value); return id; }); },
          // IndexedDB orders string keys by code unit, as < does.
          getAllKeys: () => request(() => [...records.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))),
        };
      },
      abort: () => {
        if (finished) return;
        finished = true;
        for (const [name, copy] of before) {
          const live = db.stores.get(name);
          live?.clear();
          for (const [key, value] of copy) live?.set(key, value);
        }
        later(() => { tx.onabort?.(); });
      },
    };
    pump();
    return tx;
  };

  const connect = (db: Database, upgrading: () => boolean): unknown => ({
    get version(): number { return db.version; },
    objectStoreNames: { contains: (name: string) => db.stores.has(name) },
    createObjectStore: (name: string) => {
      if (!upgrading()) throw new DOMException('Not in a version change.', 'InvalidStateError');
      db.stores.set(name, new Map());
      return {};
    },
    transaction: (scope: string | readonly string[], mode?: IDBTransactionMode) => transaction(db, scope, mode),
    close: () => undefined,
    onversionchange: null,
  });

  const factory = {
    open: (name: string, version?: number) => {
      const req: Request<unknown> & { transaction: { abort: () => void } | null; onupgradeneeded: Handler; onblocked: Handler } = {
        result: undefined, error: null, onsuccess: null, onerror: null, transaction: null, onupgradeneeded: null, onblocked: null,
      };
      later(() => {
        const existing = databases.get(name);
        const target = version ?? existing?.version ?? 1;
        if (existing !== undefined && target < existing.version) { req.error = { name: 'VersionError' }; req.onerror?.(); return; }
        if (existing !== undefined && target === existing.version) { req.result = connect(existing, () => false); req.onsuccess?.(); return; }
        // A version change works on a copy that is kept only if its upgrade is not aborted.
        const draft: Database = { version: target, stores: new Map([...(existing?.stores ?? [])].map(([store, records]) => [store, new Map(records)])) };
        let upgrading = true;
        let aborted = false;
        req.result = connect(draft, () => upgrading);
        req.transaction = { abort: () => { aborted = true; } };
        req.onupgradeneeded?.();
        later(() => {
          upgrading = false;
          req.transaction = null;
          if (aborted) { req.result = undefined; req.error = { name: 'AbortError' }; req.onerror?.(); return; }
          databases.set(name, draft);
          req.onsuccess?.();
        });
      });
      return req;
    },
  };
  return factory as unknown as IDBFactory;
}
