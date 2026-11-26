/**
 * Local-only browser capability diagnostics.
 * These are NOT source-integrity attestation, wallet trust or payment verification.
 * The storage and IndexedDB probes contain no secrets and are removed before returning.
 *
 * Result semantics:
 * - `pass`: the capability exists and produced the expected result.
 * - `fail`: the capability exists (or the browser reported a definite negative) but misbehaved.
 * - `unavailable`: the browser does not offer, or refuses access to, the capability.
 * Neither `fail` nor `unavailable` is ever reported as a pass.
 */
export type BrowserCheckId = 'secure' | 'digest' | 'storage' | 'indexeddb';
export type BrowserCheckStatus = 'pass' | 'fail' | 'unavailable';
export type BrowserCheck = Readonly<{ id: BrowserCheckId; status: BrowserCheckStatus }>;

type ProbeStorage = Pick<Storage, 'setItem' | 'getItem' | 'removeItem'>;
type ProbeIndexedDb = Pick<IDBFactory, 'open' | 'deleteDatabase'>;

export interface BrowserCheckEnvironment {
  /** Omitted when the browser does not expose `isSecureContext`. */
  readonly secureContext?: boolean;
  readonly digest?: (input: ArrayBuffer) => Promise<ArrayBuffer>;
  readonly storage?: ProbeStorage;
  /** Omitted when IndexedDB is absent, null, throws on access or cannot delete databases. */
  readonly indexedDb?: ProbeIndexedDb;
  /** Also names the temporary IndexedDB database. */
  readonly probeKey: string;
}

const EXPECTED_ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const PROBE_VALUE = 'ghostpay-capability-probe';
const IDB_STORE = 'probe';
const IDB_RECORD = 'probe';
/** Upper bound for each of the open/round-trip and delete phases; a browser database that never answers fails. */
const IDB_TIMEOUT_MS = 5_000;
let nextProbe = 0;

export function browserCheckEnvironment(): BrowserCheckEnvironment {
  let digest: BrowserCheckEnvironment['digest'];
  let storage: ProbeStorage | undefined;
  let indexedDb: ProbeIndexedDb | undefined;
  let randomId: string | undefined;
  let browserCrypto: Crypto | undefined;
  try { browserCrypto = window.crypto; } catch { /* The check will report unavailable cryptography. */ }
  try {
    const subtle = browserCrypto?.subtle;
    if (typeof subtle?.digest === 'function') {
      digest = (data) => subtle.digest('SHA-256', data);
    }
  } catch { /* A throwing getter means WebCrypto is unavailable. */ }
  try {
    if (typeof browserCrypto?.randomUUID === 'function') randomId = browserCrypto.randomUUID();
  } catch { /* Fall back to a non-secret local probe name. */ }
  try {
    // Some browsers return null instead of throwing when site storage is disabled.
    const local = window.localStorage as Storage | null | undefined;
    if (local !== null && local !== undefined) storage = local;
  } catch { /* Storage can be denied. */ }
  try {
    const factory = window.indexedDB as IDBFactory | null | undefined;
    // Without deleteDatabase the probe could not clean up after itself, so it is not attempted.
    if (factory !== null && factory !== undefined && typeof factory.open === 'function' && typeof factory.deleteDatabase === 'function') {
      indexedDb = factory;
    }
  } catch { /* IndexedDB access can be denied. */ }
  const secureContext: unknown = window.isSecureContext;

  // This ID is only for a transient, non-secret storage probe; never a key or security token.
  const probeKey = `__ghostpay_capability_${randomId ?? `${Date.now()}_${++nextProbe}`}`;
  return {
    ...(typeof secureContext === 'boolean' ? { secureContext } : {}),
    ...(digest !== undefined ? { digest } : {}),
    ...(storage !== undefined ? { storage } : {}),
    ...(indexedDb !== undefined ? { indexedDb } : {}),
    probeKey,
  };
}

async function checkDigest(digest: BrowserCheckEnvironment['digest']): Promise<BrowserCheckStatus> {
  if (digest === undefined) return 'unavailable';
  try {
    const input = new ArrayBuffer(3);
    new Uint8Array(input).set([97, 98, 99]);
    const output = new Uint8Array(await digest(input));
    const actual = [...output].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return actual === EXPECTED_ABC_SHA256 ? 'pass' : 'fail';
  } catch {
    // Fail closed, without storing or rendering provider exception details.
    return 'fail';
  }
}

function checkStorage(storage: ProbeStorage | undefined, key: string): BrowserCheckStatus {
  if (storage === undefined) return 'unavailable';
  try {
    storage.setItem(key, PROBE_VALUE);
  } catch {
    // A refused write (private mode, quota, blocked site data) means storage is unavailable to this page.
    try { storage.removeItem(key); } catch { /* No sensitive value was stored. */ }
    return 'unavailable';
  }
  let equal = false;
  try { equal = storage.getItem(key) === PROBE_VALUE; } catch { /* A failed read is not evidence of usable storage. */ }
  try {
    storage.removeItem(key);
    // The round trip includes deletion: a probe that survives removal means storage is not behaving.
    if (storage.getItem(key) !== null) return 'fail';
  } catch {
    return 'fail';
  }
  return equal ? 'pass' : 'fail';
}

function withDeadline<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => { timer = setTimeout(() => { resolve(fallback); }, IDB_TIMEOUT_MS); });
  return Promise.race([work, deadline]).finally(() => { clearTimeout(timer); });
}

function settled(request: IDBRequest): Promise<boolean> {
  return new Promise((resolve) => {
    request.onsuccess = () => { resolve(true); };
    request.onerror = () => { resolve(false); };
  });
}

function roundTrip(db: IDBDatabase): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(PROBE_VALUE, IDB_RECORD);
      const read = store.get(IDB_RECORD);
      let value: unknown;
      read.onsuccess = () => { value = read.result; };
      tx.oncomplete = () => { resolve(value === PROBE_VALUE); };
      tx.onerror = () => { resolve(false); };
      tx.onabort = () => { resolve(false); };
    } catch {
      resolve(false);
    }
  });
}

async function checkIndexedDb(factory: ProbeIndexedDb | undefined, name: string): Promise<BrowserCheckStatus> {
  if (factory === undefined) return 'unavailable';
  let request: IDBOpenDBRequest;
  try {
    request = factory.open(name, 1);
  } catch {
    // A synchronous refusal (for example SecurityError when site data is blocked) creates nothing.
    return 'unavailable';
  }
  let abandoned = false;
  let db: IDBDatabase | undefined;
  const opened = new Promise<IDBDatabase | undefined>((resolve) => {
    request.onupgradeneeded = () => {
      try { request.result.createObjectStore(IDB_STORE); } catch { /* The round trip below then fails. */ }
    };
    request.onsuccess = () => {
      // A connection that arrives after the deadline is closed at once so the pending delete can proceed.
      if (abandoned) { try { request.result.close(); } catch { /* Nothing else to release. */ } return; }
      resolve(request.result);
    };
    request.onerror = () => { resolve(undefined); };
  });
  const probe = async (): Promise<BrowserCheckStatus> => {
    const connection = await opened;
    if (connection === undefined) return 'unavailable';
    db = connection;
    return (await roundTrip(connection)) ? 'pass' : 'fail';
  };
  const status = await withDeadline(probe(), 'fail');
  abandoned = true;
  try { db?.close(); } catch { /* Deletion below reports whether cleanup worked. */ }
  let removed: boolean;
  try {
    removed = await withDeadline(settled(factory.deleteDatabase(name)), false);
  } catch {
    removed = false;
  }
  // A refused open leaves nothing to delete; any other probe that cannot be removed is not usable storage.
  if (status === 'unavailable') return 'unavailable';
  return removed ? status : 'fail';
}

export async function runBrowserChecks(env: BrowserCheckEnvironment): Promise<readonly BrowserCheck[]> {
  const secure: BrowserCheckStatus = env.secureContext === undefined ? 'unavailable' : env.secureContext ? 'pass' : 'fail';
  const digest = await checkDigest(env.digest);
  const storage = checkStorage(env.storage, env.probeKey);
  const indexedDb = await checkIndexedDb(env.indexedDb, env.probeKey);
  return [
    { id: 'secure', status: secure },
    { id: 'digest', status: digest },
    { id: 'storage', status: storage },
    { id: 'indexeddb', status: indexedDb },
  ];
}
