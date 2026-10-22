/**
 * Error-code to plain-language guidance catalog.
 *
 * @security Pure and deterministic. Output is built only from the static catalog below and never
 * interpolates the input code, the context, links, keys or RPC URLs (UXERR-2). Unknown or malformed
 * codes map to the generic entry. No I/O, no telemetry.
 */

/** Codes of `InvoiceError` (packages/invoice-schema). Mirrored; a test diffs this against the source. */
export const INVOICE_CODES = [
  'FRAGMENT_FORMAT',
  'FRAGMENT_TOO_LARGE',
  'BASE64URL',
  'UTF8',
  'JSON',
  'SCHEMA',
  'FORBIDDEN_CHARACTER',
  'NON_CANONICAL',
  'DECRYPT',
  'PASSPHRASE_REQUIRED',
  'PASSPHRASE_UNEXPECTED',
  'PASSPHRASE_POLICY',
  'PASSPHRASE',
  'SIGNING',
  'RANDOMNESS',
  'UNSUPPORTED',
] as const;

/** Codes of `ChainAdapterError` (packages/chain-adapters). */
export const ADAPTER_CODES = [
  'INVALID_INPUT',
  'INVALID_MANIFEST',
  'DEPLOYMENT_UNVERIFIED',
  'PAYMENT_UNVERIFIED',
  'CHAIN_DISABLED',
  'CHAIN_MISMATCH',
  'PREVIEW_MISMATCH',
  'UNSUPPORTED_TOKEN',
  'FEE_REJECTED',
  'RPC_URL_REJECTED',
  'RPC_FAILURE',
  'RESPONSE_TOO_LARGE',
  'INVALID_LOG',
  'QUOTE_FAILED',
  'SIGNING_FAILED',
] as const;

/** Codes of `GhostPayCryptoError` (packages/core-crypto). */
export const CRYPTO_CODES = [
  'INVALID_SCALAR',
  'INVALID_POINT',
  'INVALID_META_ADDRESS',
  'INVALID_ANNOUNCEMENT',
  'INVALID_ADDRESS',
  'INVALID_METADATA',
  'INVALID_VIEW_TAG',
  'INVALID_AMOUNT',
  'ZERO_HASH',
  'INFINITY_POINT',
  'ZERO_STEALTH_KEY',
  'VIEW_TAG_MISMATCH',
  'ADDRESS_MISMATCH',
  'KEY_REUSE',
  'RNG_UNAVAILABLE',
  'RNG_FAILURE',
] as const;

/** Codes raised by the app itself (network, relayer, storage, clock). */
export const APP_CODES = [
  'OFFLINE',
  'NO_RPC',
  'RPC_UNREACHABLE',
  'RELAYER_UNREACHABLE',
  'CLOCK_SKEW',
  'STORAGE_BLOCKED',
  'STORAGE_QUOTA',
  'STORAGE_CORRUPT',
  'WALLET_MISSING',
  'USER_REJECTED',
] as const;

export type Severity = 'info' | 'warn' | 'error';
export type RetrySafe = 'yes' | 'no' | 'unknown';
export type ErrorView =
  'home' | 'seller' | 'create' | 'pay' | 'scan' | 'sweep' | 'settings' | 'about' | 'other';
/** How far the operation got. Only `prepare` can make `retrySafe` "yes". */
export type Phase = 'prepare' | 'sign' | 'broadcast' | 'unknown';

/** Machine action a UI may bind to a button. */
export type StepAction =
  'open-settings-rpc' | 'open-settings-relayer' | 'reload' | 'open-troubleshooting' | 'go-online' | 'none';

export interface Step {
  /** Stable i18n key, `step.<name>`. */
  readonly key: string;
  /** English plain text (static). */
  readonly text: string;
  readonly action: StepAction;
}

export interface GuidanceContext {
  readonly view: ErrorView;
  readonly chainId?: number;
  readonly hasRpc: boolean;
  readonly hasRelayer: boolean;
  readonly online: boolean;
  /** Caller-proven progress. Defaults to `unknown`. */
  readonly phase?: Phase;
}

export interface Guidance {
  /** Normalised code that matched, or `UNKNOWN`. Always from the catalog, never echoed input. */
  readonly code: string;
  readonly summary: string;
  readonly cause: string;
  readonly steps: readonly Step[];
  readonly severity: Severity;
  readonly retrySafe: RetrySafe;
  /** Anchor in docs/user/troubleshooting.md. */
  readonly docAnchor: string;
}

const S = {
  addRpc: { key: 'step.addRpc', text: 'Add an RPC in Settings for this chain.', action: 'open-settings-rpc' },
  checkRpc: {
    key: 'step.checkRpc',
    text: 'Check your RPC in Settings: it must answer and match the chain.',
    action: 'open-settings-rpc',
  },
  reload: { key: 'step.reload', text: 'Reload the page and try again.', action: 'reload' },
  docs: { key: 'step.docs', text: 'See the troubleshooting guide.', action: 'open-troubleshooting' },
  goOnline: { key: 'step.goOnline', text: 'Reconnect to the internet, then try again.', action: 'go-online' },
  recopy: {
    key: 'step.recopy',
    text: 'Ask the sender to copy the invoice link again and open the full link.',
    action: 'none',
  },
  newInvoice: { key: 'step.newInvoice', text: 'Ask the seller to create a new invoice.', action: 'none' },
  update: {
    key: 'step.update',
    text: 'Use an up-to-date desktop browser with GhostPay open from its official address.',
    action: 'none',
  },
  restartBrowser: {
    key: 'step.restartBrowser',
    text: 'Restart the browser. If it keeps happening, try another browser.',
    action: 'none',
  },
  recheckAmount: {
    key: 'step.recheckAmount',
    text: 'Review the amount and recipient shown on screen, then start again.',
    action: 'none',
  },
  otherToken: { key: 'step.otherToken', text: 'Choose a token this chain supports.', action: 'none' },
  relayer: {
    key: 'step.relayer',
    text: 'Check the relayer address in Settings, or clear it to send without a relayer.',
    action: 'open-settings-relayer',
  },
  clock: {
    key: 'step.clock',
    text: 'Fix your device date and time (enable automatic time), then reload.',
    action: 'reload',
  },
  storage: {
    key: 'step.storage',
    text: 'Allow site data for this page (leave private mode), then reload.',
    action: 'reload',
  },
  freeSpace: {
    key: 'step.freeSpace',
    text: 'Free up browser storage or export and remove old records.',
    action: 'none',
  },
  wallet: { key: 'step.wallet', text: 'Install or unlock your wallet, then reload.', action: 'reload' },
  noChange: {
    key: 'step.noChange',
    text: 'Nothing was changed. You can try again when ready.',
    action: 'none',
  },
  checkWallet: {
    key: 'step.checkWallet',
    text: 'Check your wallet for a pending or completed transaction before retrying.',
    action: 'none',
  },
  keepKeys: {
    key: 'step.keepKeys',
    text: 'Do not retry with the same stealth key; start a new payment.',
    action: 'none',
  },
  setupKeys: {
    key: 'step.setupKeys',
    text: 'Check that you pasted your own full meta-address or key, with no extra characters.',
    action: 'none',
  },
} as const satisfies Record<string, Step>;

type StepName = keyof typeof S;
type Retry = 'pre' | 'never' | 'unknown';

interface Entry {
  readonly summary: string;
  readonly cause: string;
  readonly steps: readonly StepName[];
  readonly severity: Severity;
  /** `pre`: raised before any signing, so retry is safe once the caller proves phase `prepare`. */
  readonly retry: Retry;
  readonly anchor: string;
  /** Network class: add "go online" / "add RPC" context steps. */
  readonly net?: boolean;
}

const E = (
  summary: string,
  cause: string,
  steps: readonly StepName[],
  severity: Severity,
  retry: Retry,
  anchor: string,
  net?: boolean,
): Entry =>
  net === undefined
    ? { summary, cause, steps, severity, retry, anchor }
    : { summary, cause, steps, severity, retry, anchor, net };

const LINK = ['recopy', 'docs'] as const;
const BAD_INPUT = ['recheckAmount', 'docs'] as const;

const CATALOG: Readonly<Record<string, Entry>> = Object.freeze({
  // Invoice
  FRAGMENT_FORMAT: E(
    'This is not a GhostPay invoice link.',
    'The link does not start with the GhostPay invoice marker.',
    LINK,
    'error',
    'pre',
    'invoice-link',
  ),
  FRAGMENT_TOO_LARGE: E(
    'The invoice link is too large and was rejected.',
    'Invoices are limited to 16 KiB.',
    LINK,
    'error',
    'pre',
    'invoice-link',
  ),
  BASE64URL: E(
    'The invoice link is damaged.',
    'Part of the link was cut off or changed.',
    LINK,
    'error',
    'pre',
    'invoice-link',
  ),
  UTF8: E(
    'The invoice link is damaged.',
    'The link text could not be read.',
    LINK,
    'error',
    'pre',
    'invoice-link',
  ),
  JSON: E(
    'The invoice link is damaged.',
    'The invoice contents are malformed.',
    LINK,
    'error',
    'pre',
    'invoice-link',
  ),
  SCHEMA: E(
    'The invoice is not valid and was rejected.',
    'A field is missing, out of range or unknown.',
    ['newInvoice', 'docs'],
    'error',
    'pre',
    'invoice-link',
  ),
  FORBIDDEN_CHARACTER: E(
    'The invoice contains text that cannot be displayed safely.',
    'A field contains hidden or unsupported control characters.',
    ['newInvoice', 'docs'],
    'error',
    'pre',
    'invoice-link',
  ),
  NON_CANONICAL: E(
    'The invoice link is not in canonical form.',
    'The link was re-encoded or edited.',
    LINK,
    'error',
    'pre',
    'invoice-link',
  ),
  DECRYPT: E(
    'The invoice could not be opened.',
    'The link was changed or is incomplete, so its key does not fit.',
    LINK,
    'error',
    'pre',
    'invoice-link',
  ),
  PASSPHRASE_REQUIRED: E(
    'This invoice needs a passphrase.',
    'The link is protected with a passphrase that has not been supplied.',
    ['recopy', 'docs'],
    'warn',
    'pre',
    'invoice-link',
  ),
  PASSPHRASE_UNEXPECTED: E(
    'This invoice link cannot use that passphrase.',
    'The link is not passphrase protected; ask the sender to confirm the link.',
    ['recopy', 'docs'],
    'error',
    'pre',
    'invoice-link',
  ),
  PASSPHRASE_POLICY: E(
    'The passphrase could not be used.',
    'It does not meet the invoice passphrase policy.',
    ['recheckAmount', 'docs'],
    'error',
    'pre',
    'invoice-link',
  ),
  PASSPHRASE: E(
    'The invoice could not be opened.',
    'The passphrase is wrong or the protected link was changed.',
    ['recopy', 'docs'],
    'error',
    'pre',
    'invoice-link',
  ),
  SIGNING: E(
    'The invoice could not be signed.',
    'Your signing key was not available or refused.',
    ['reload', 'docs'],
    'error',
    'pre',
    'signing',
  ),
  RANDOMNESS: E(
    'Your browser could not provide secure randomness.',
    'The browser random source failed. Nothing was created.',
    ['update', 'restartBrowser'],
    'error',
    'pre',
    'browser',
  ),
  UNSUPPORTED: E(
    'This browser or invoice version is not supported.',
    'A required feature or invoice version is missing.',
    ['update', 'docs'],
    'error',
    'pre',
    'browser',
  ),
  // Chain adapter
  INVALID_INPUT: E(
    'Something you entered was not accepted.',
    'An address, amount or option failed a safety check.',
    BAD_INPUT,
    'error',
    'pre',
    'safety-check',
  ),
  INVALID_MANIFEST: E(
    'The chain configuration is invalid.',
    'The bundled chain list failed validation.',
    ['reload', 'update', 'docs'],
    'error',
    'pre',
    'chain-config',
  ),
  DEPLOYMENT_UNVERIFIED: E(
    'The payment contract could not be verified.',
    'GhostPay could not confirm the deployed contract from the trusted manifest and chain. No payment was sent.',
    ['checkRpc', 'reload', 'docs'],
    'error',
    'pre',
    'chain-config',
    true,
  ),
  PAYMENT_UNVERIFIED: E(
    'The payment could not be verified.',
    'The chain response did not prove that the expected payment was recorded.',
    ['checkRpc', 'reload', 'docs'],
    'error',
    'unknown',
    'rpc',
    true,
  ),
  CHAIN_DISABLED: E(
    'This chain is turned off.',
    'The chain is disabled in this build of GhostPay.',
    ['otherToken', 'docs'],
    'error',
    'pre',
    'chain-config',
  ),
  CHAIN_MISMATCH: E(
    'Your RPC is on a different chain.',
    'The RPC answered with another chain id than expected.',
    ['checkRpc', 'docs'],
    'error',
    'pre',
    'rpc',
    true,
  ),
  PREVIEW_MISMATCH: E(
    'The payment changed after you reviewed it.',
    'What would be sent no longer matches the preview. It was blocked.',
    ['recheckAmount', 'docs'],
    'error',
    'pre',
    'safety-check',
  ),
  UNSUPPORTED_TOKEN: E(
    'This token is not supported on this chain.',
    'Only tokens in the chain list can be used.',
    ['otherToken', 'docs'],
    'error',
    'pre',
    'chain-config',
  ),
  FEE_REJECTED: E(
    'The fee was above the safety limit.',
    'The quoted fee exceeded the maximum GhostPay allows.',
    ['recheckAmount', 'docs'],
    'warn',
    'pre',
    'fees',
  ),
  RPC_URL_REJECTED: E(
    'That RPC address was rejected.',
    'RPC addresses must use https or wss, with no username, password or fragment.',
    ['checkRpc', 'docs'],
    'error',
    'pre',
    'rpc',
  ),
  RPC_FAILURE: E(
    'The RPC did not answer correctly.',
    'The RPC timed out, refused the request or sent an unexpected reply.',
    ['checkRpc', 'reload', 'docs'],
    'error',
    'unknown',
    'rpc',
    true,
  ),
  RESPONSE_TOO_LARGE: E(
    'The RPC reply was too large and was dropped.',
    'The RPC sent more data than GhostPay accepts.',
    ['checkRpc', 'docs'],
    'error',
    'unknown',
    'rpc',
    true,
  ),
  INVALID_LOG: E(
    'A chain record was malformed and skipped.',
    'The RPC returned a log GhostPay could not read.',
    ['checkRpc', 'docs'],
    'warn',
    'pre',
    'rpc',
    true,
  ),
  QUOTE_FAILED: E(
    'No price or route could be fetched.',
    'The RPC or router did not return a usable quote.',
    ['checkRpc', 'reload', 'docs'],
    'error',
    'pre',
    'rpc',
    true,
  ),
  SIGNING_FAILED: E(
    'The transaction could not be signed.',
    'Signing failed or was refused.',
    ['checkWallet', 'docs'],
    'error',
    'never',
    'signing',
  ),
  // Crypto
  INVALID_SCALAR: E(
    'A secret key is not valid.',
    'The key is not a 32-byte value in the allowed range.',
    ['setupKeys', 'docs'],
    'error',
    'pre',
    'keys',
  ),
  INVALID_POINT: E(
    'A public key is not valid.',
    'The key is not a valid compressed point.',
    ['setupKeys', 'docs'],
    'error',
    'pre',
    'keys',
  ),
  INVALID_META_ADDRESS: E(
    'The stealth meta-address is not valid.',
    'It has the wrong length or format.',
    ['setupKeys', 'docs'],
    'error',
    'pre',
    'keys',
  ),
  INVALID_ANNOUNCEMENT: E(
    'An announcement was malformed.',
    'The on-chain announcement could not be read.',
    ['docs'],
    'warn',
    'pre',
    'scan',
  ),
  INVALID_ADDRESS: E(
    'The address is not valid.',
    'It has the wrong length, characters or checksum.',
    BAD_INPUT,
    'error',
    'pre',
    'safety-check',
  ),
  INVALID_METADATA: E(
    'Payment metadata was malformed.',
    'The metadata bytes could not be read.',
    ['docs'],
    'warn',
    'pre',
    'scan',
  ),
  INVALID_VIEW_TAG: E(
    'A view tag was malformed.',
    'The tag has the wrong size.',
    ['docs'],
    'warn',
    'pre',
    'scan',
  ),
  INVALID_AMOUNT: E(
    'The amount is not valid.',
    'It is zero, negative, too large or has too many decimals.',
    BAD_INPUT,
    'error',
    'pre',
    'safety-check',
  ),
  ZERO_HASH: E(
    'A cryptographic check failed.',
    'An all-zero hash was produced; this should not happen.',
    ['reload', 'docs'],
    'error',
    'pre',
    'crypto',
  ),
  INFINITY_POINT: E(
    'A cryptographic check failed.',
    'An invalid key combination was produced.',
    ['reload', 'docs'],
    'error',
    'pre',
    'crypto',
  ),
  ZERO_STEALTH_KEY: E(
    'A cryptographic check failed.',
    'The derived key was empty.',
    ['reload', 'docs'],
    'error',
    'pre',
    'crypto',
  ),
  VIEW_TAG_MISMATCH: E(
    'A payment did not match your keys.',
    'It was meant for someone else.',
    ['docs'],
    'info',
    'pre',
    'scan',
  ),
  ADDRESS_MISMATCH: E(
    'A payment address did not match.',
    'The derived address differs from the announced one.',
    ['docs'],
    'warn',
    'pre',
    'scan',
  ),
  KEY_REUSE: E(
    'A stealth key was about to be reused.',
    'Reuse would link payments, so it was blocked.',
    ['keepKeys', 'docs'],
    'error',
    'pre',
    'keys',
  ),
  RNG_UNAVAILABLE: E(
    'Your browser could not provide secure randomness.',
    'No secure random source is available.',
    ['update', 'restartBrowser'],
    'error',
    'pre',
    'browser',
  ),
  RNG_FAILURE: E(
    'Your browser random source failed.',
    'Secure randomness returned an error.',
    ['restartBrowser', 'update'],
    'error',
    'pre',
    'browser',
  ),
  // App
  OFFLINE: E(
    'You are offline.',
    'The browser reports no network connection.',
    ['goOnline', 'noChange'],
    'warn',
    'unknown',
    'offline',
    true,
  ),
  NO_RPC: E(
    'No RPC is set for this chain.',
    'GhostPay only talks to endpoints you choose.',
    ['addRpc', 'docs'],
    'warn',
    'pre',
    'rpc',
    true,
  ),
  RPC_UNREACHABLE: E(
    'Your RPC could not be reached.',
    'The RPC is down, blocked or the address is wrong.',
    ['checkRpc', 'reload', 'docs'],
    'error',
    'unknown',
    'rpc',
    true,
  ),
  RELAYER_UNREACHABLE: E(
    'Your relayer could not be reached.',
    'The relayer is down, blocked or the address is wrong.',
    ['relayer', 'docs'],
    'warn',
    'unknown',
    'relayer',
  ),
  CLOCK_SKEW: E(
    'Your device clock looks wrong.',
    'Your clock differs from the chain by more than two minutes; expiry checks may be off.',
    ['clock', 'docs'],
    'warn',
    'pre',
    'clock',
  ),
  STORAGE_BLOCKED: E(
    'Browser storage is blocked.',
    'Private mode or site-data settings block saving.',
    ['storage', 'docs'],
    'warn',
    'pre',
    'storage',
  ),
  STORAGE_QUOTA: E(
    'Browser storage is full.',
    'There is no room left to save.',
    ['freeSpace', 'docs'],
    'warn',
    'pre',
    'storage',
  ),
  STORAGE_CORRUPT: E(
    'Saved data could not be read.',
    'A saved record is damaged or from a newer version.',
    ['reload', 'docs'],
    'warn',
    'pre',
    'storage',
  ),
  WALLET_MISSING: E(
    'No wallet was found.',
    'No browser wallet is installed or unlocked.',
    ['wallet', 'docs'],
    'warn',
    'pre',
    'wallet',
  ),
  USER_REJECTED: E(
    'You declined the request in your wallet.',
    'The wallet request was cancelled.',
    ['noChange'],
    'info',
    'unknown',
    'wallet',
  ),
});

const GENERIC: Entry = E(
  'Something went wrong.',
  'An unexpected problem occurred.',
  ['checkRpc', 'reload', 'docs'],
  'error',
  'unknown',
  'general',
);

const CODE_SHAPE = /^[A-Z][A-Z0-9_]{1,39}$/;
const VERSION_SHAPE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;

/** All catalog codes, sorted. @security Static list. */
export function listCodes(): string[] {
  return Object.keys(CATALOG).sort();
}

/** True when `code` is a known catalog code. */
export function isKnownCode(code: string): boolean {
  return Object.hasOwn(CATALOG, code);
}

/**
 * Extracts a well-formed code from a thrown value without trusting it.
 * @security Never returns `message`, `cause` or other text; only a string matching [A-Z][A-Z0-9_]{1,39}.
 */
export function codeOf(thrown: unknown): string {
  if (typeof thrown !== 'object' || thrown === null) return 'UNKNOWN';
  let code: unknown;
  try {
    code = (thrown as { code?: unknown }).code;
  } catch {
    return 'UNKNOWN';
  }
  return typeof code === 'string' && CODE_SHAPE.test(code) ? code : 'UNKNOWN';
}

function dedupe(names: readonly StepName[]): StepName[] {
  return [...new Set(names)];
}

/**
 * Maps a stable error code plus context to guidance.
 * @param code Untrusted string. Looked up by own-property; never echoed.
 * @security `retrySafe` is "yes" only when the entry is pre-signing AND `ctx.phase === 'prepare'` (UXERR-3).
 */
export function recover(code: string, ctx: GuidanceContext): Guidance {
  const known = typeof code === 'string' && Object.hasOwn(CATALOG, code);
  const entry = known ? (CATALOG[code] as Entry) : GENERIC;
  const lead: StepName[] = [];
  if (entry.net === true || !known) {
    if (!ctx.online) lead.push('goOnline');
    else if (!ctx.hasRpc) lead.push('addRpc');
  }
  if (code === 'RELAYER_UNREACHABLE' && !ctx.hasRelayer) lead.push('relayer');
  const names = dedupe([...lead, ...entry.steps]);
  let retrySafe: RetrySafe = 'unknown';
  if (entry.retry === 'never') retrySafe = 'no';
  else if (entry.retry === 'pre' && ctx.phase === 'prepare') retrySafe = 'yes';
  else if (ctx.phase === 'sign' || ctx.phase === 'broadcast') retrySafe = 'no';
  return {
    code: known ? code : 'UNKNOWN',
    summary: entry.summary,
    cause: entry.cause,
    steps: names.map((n) => S[n]),
    severity: entry.severity,
    retrySafe,
    docAnchor: entry.anchor,
  };
}

/** The retry-safety line to show. "Nothing was sent" only when the caller proved it. */
export function retryLine(g: Guidance): string {
  if (g.retrySafe === 'yes') return 'Nothing was sent. It is safe to try again.';
  if (g.retrySafe === 'no') return 'A transaction may have been sent. Check your wallet before trying again.';
  return 'We could not confirm whether anything was sent. Check your wallet before trying again.';
}

/**
 * Text for a "Copy diagnostics" button: code and app version only.
 * @security Both fields are shape-checked; anything else becomes UNKNOWN / unknown. No state, URLs or keys.
 */
export function diagnostics(code: string, appVersion: string): string {
  const c = typeof code === 'string' && CODE_SHAPE.test(code) ? code : 'UNKNOWN';
  const v = typeof appVersion === 'string' && VERSION_SHAPE.test(appVersion) ? appVersion : 'unknown';
  return `GhostPay diagnostics\ncode: ${c}\nversion: ${v}`;
}
