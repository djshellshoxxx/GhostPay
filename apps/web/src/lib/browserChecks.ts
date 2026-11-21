/**
 * Local-only browser capability diagnostics.
 * These are NOT source-integrity attestation, wallet trust or payment verification.
 * The storage probe contains no secrets and is removed before returning.
 */
export type BrowserCheckId = 'secure' | 'digest' | 'storage';
export type BrowserCheckStatus = 'pass' | 'warn' | 'fail';
export type BrowserCheck = Readonly<{ id: BrowserCheckId; status: BrowserCheckStatus }>;

export interface BrowserCheckEnvironment {
  readonly secureContext: boolean;
  readonly digest?: (input: ArrayBuffer) => Promise<ArrayBuffer>;
  readonly storage?: Pick<Storage, 'setItem' | 'getItem' | 'removeItem'>;
  readonly probeKey: string;
}

const EXPECTED_ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const PROBE_VALUE = 'ghostpay-capability-probe';
let nextProbe = 0;

export function browserCheckEnvironment(): BrowserCheckEnvironment {
  let digest: BrowserCheckEnvironment['digest'];
  let storage: BrowserCheckEnvironment['storage'];
  let randomId: string | undefined;
  try {
    const browserCrypto = window.crypto;
    if (browserCrypto?.subtle !== undefined) {
      digest = (data) => browserCrypto.subtle.digest('SHA-256', data);
    }
    randomId = browserCrypto?.randomUUID?.();
  } catch { /* The check will report unavailable cryptography. */ }
  try { storage = window.localStorage; } catch { /* Storage can be denied. */ }

  // This ID is only for a transient, non-secret storage probe; never a key or security token.
  const probeKey = `__ghostpay_capability_${randomId ?? `${Date.now()}_${++nextProbe}`}`;
  return {
    secureContext: window.isSecureContext === true,
    ...(digest !== undefined ? { digest } : {}),
    ...(storage !== undefined ? { storage } : {}),
    probeKey,
  };
}

export async function runBrowserChecks(env: BrowserCheckEnvironment): Promise<readonly BrowserCheck[]> {
  const secure: BrowserCheckStatus = env.secureContext ? 'pass' : 'fail';
  let digest: BrowserCheckStatus = 'fail';
  if (env.digest !== undefined) {
    try {
      const input = new ArrayBuffer(3);
      new Uint8Array(input).set([97, 98, 99]);
      const output = new Uint8Array(await env.digest(input));
      const actual = [...output].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual === EXPECTED_ABC_SHA256) digest = 'pass';
    } catch { /* Fail closed, without storing or rendering provider exception details. */ }
  }

  let storage: BrowserCheckStatus = 'warn';
  if (env.storage !== undefined) {
    try {
      env.storage.setItem(env.probeKey, PROBE_VALUE);
      const equal = env.storage.getItem(env.probeKey) === PROBE_VALUE;
      env.storage.removeItem(env.probeKey);
      if (equal) storage = 'pass';
    } catch {
      // A failed write/read/delete is not evidence that storage is usable.
      try { env.storage.removeItem(env.probeKey); } catch { /* No sensitive value was stored. */ }
    }
  }
  return [
    { id: 'secure', status: secure },
    { id: 'digest', status: digest },
    { id: 'storage', status: storage },
  ];
}
