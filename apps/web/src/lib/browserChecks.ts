/**
 * Local-only browser capability diagnostics.
 * These are NOT source-integrity attestation, wallet trust or payment verification.
 * The storage probe contains no secrets and is removed before returning.
 *
 * Result semantics:
 * - `pass`: the capability exists and produced the expected result.
 * - `fail`: the capability exists (or the browser reported a definite negative) but misbehaved.
 * - `unavailable`: the browser does not offer, or refuses access to, the capability.
 * Neither `fail` nor `unavailable` is ever reported as a pass.
 */
export type BrowserCheckId = 'secure' | 'digest' | 'storage';
export type BrowserCheckStatus = 'pass' | 'fail' | 'unavailable';
export type BrowserCheck = Readonly<{ id: BrowserCheckId; status: BrowserCheckStatus }>;

type ProbeStorage = Pick<Storage, 'setItem' | 'getItem' | 'removeItem'>;

export interface BrowserCheckEnvironment {
  /** Omitted when the browser does not expose `isSecureContext`. */
  readonly secureContext?: boolean;
  readonly digest?: (input: ArrayBuffer) => Promise<ArrayBuffer>;
  readonly storage?: ProbeStorage;
  readonly probeKey: string;
}

const EXPECTED_ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const PROBE_VALUE = 'ghostpay-capability-probe';
let nextProbe = 0;

export function browserCheckEnvironment(): BrowserCheckEnvironment {
  let digest: BrowserCheckEnvironment['digest'];
  let storage: ProbeStorage | undefined;
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
  const secureContext: unknown = window.isSecureContext;

  // This ID is only for a transient, non-secret storage probe; never a key or security token.
  const probeKey = `__ghostpay_capability_${randomId ?? `${Date.now()}_${++nextProbe}`}`;
  return {
    ...(typeof secureContext === 'boolean' ? { secureContext } : {}),
    ...(digest !== undefined ? { digest } : {}),
    ...(storage !== undefined ? { storage } : {}),
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

export async function runBrowserChecks(env: BrowserCheckEnvironment): Promise<readonly BrowserCheck[]> {
  const secure: BrowserCheckStatus = env.secureContext === undefined ? 'unavailable' : env.secureContext ? 'pass' : 'fail';
  const digest = await checkDigest(env.digest);
  const storage = checkStorage(env.storage, env.probeKey);
  return [
    { id: 'secure', status: secure },
    { id: 'digest', status: digest },
    { id: 'storage', status: storage },
  ];
}
