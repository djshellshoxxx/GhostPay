// A browser process may cache localStorage independently of other tabs. IndexedDB provides an authoritative snapshot.
const DATABASE = 'ghostpay-wallet-attempt-journal';
const STORE = 'journal';
const SNAPSHOT = 'snapshot';

function openJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let failed = false;
    const refuse = (): void => {
      failed = true;
      reject(new Error('wallet attempt database unavailable'));
    };
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onblocked = refuse;
    request.onerror = refuse;
    request.onsuccess = () => {
      if (failed) request.result.close();
      else resolve(request.result);
    };
  });
}

export async function updateJournalSnapshot<T>(
  update: (saved: unknown) => { readonly result: T; readonly snapshot: string },
): Promise<{ readonly result: T; readonly snapshot: string }> {
  const db = await openJournal();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite', { durability: 'strict' });
      const store = tx.objectStore(STORE);
      const read = store.get(SNAPSHOT);
      let updated: ReturnType<typeof update> | undefined;
      let failure: Error | undefined;
      tx.onabort = () => { reject(failure ?? new Error('wallet attempt snapshot unavailable')); };
      tx.oncomplete = () => {
        if (updated === undefined) reject(new Error('wallet attempt snapshot unavailable'));
        else resolve(updated);
      };
      read.onsuccess = () => {
        try {
          updated = update(read.result);
          if (updated.snapshot !== read.result) store.put(updated.snapshot, SNAPSHOT);
        } catch (error) {
          failure = error instanceof Error ? error : new Error('wallet attempt snapshot unavailable');
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}
