/** User-selectable hygiene options (stored in `ghostpay.settings.v1`, non-secret). */
export interface HygieneSettings {
  readonly destination: 'self-derived' | 'external-fresh' | 'external-reuse';
  readonly verification: 'address-free' | 'direct';
  readonly bufferRounding: 'grid125' | 'sig2' | 'off';
  readonly sweepDust: boolean;
  readonly knownWalletGuard: boolean;
}

/** Spec defaults (section 3). */
export const DEFAULT_HYGIENE_SETTINGS: HygieneSettings = Object.freeze({
  destination: 'self-derived',
  verification: 'address-free',
  bufferRounding: 'grid125',
  sweepDust: true,
  knownWalletGuard: true,
});

const DESTS = ['self-derived', 'external-fresh', 'external-reuse'] as const;
const VERS = ['address-free', 'direct'] as const;
const BUFS = ['grid125', 'sig2', 'off'] as const;

function pick<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
}

/**
 * Sanitizes untrusted stored settings: unknown or invalid values fall back to the spec default; extra keys are dropped.
 * @param raw Parsed JSON (any shape).
 */
export function sanitizeHygieneSettings(raw: unknown): HygieneSettings {
  const o =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_HYGIENE_SETTINGS;
  return {
    destination: pick(o['destination'], DESTS, d.destination),
    verification: pick(o['verification'], VERS, d.verification),
    bufferRounding: pick(o['bufferRounding'], BUFS, d.bufferRounding),
    sweepDust: typeof o['sweepDust'] === 'boolean' ? o['sweepDust'] : d.sweepDust,
    knownWalletGuard: typeof o['knownWalletGuard'] === 'boolean' ? o['knownWalletGuard'] : d.knownWalletGuard,
  };
}

/** Honest option labels (UI copy). */
export const HYGIENE_LABELS = Object.freeze({
  title: 'Sweep hygiene (address hygiene, not anonymity)',
  destination: {
    'self-derived': 'Fresh address derived from your keys (default)',
    'external-fresh': 'Fresh address you paste (cannot be verified as unused without an address-naming read)',
    'external-reuse':
      'Reuse an address (advanced: links the sources to each other; typed confirmation required)',
  },
  verification: {
    'address-free': 'Address-free checks (default)',
    direct: 'Direct reads: tells your RPC which address is yours',
  },
  bufferRounding: {
    grid125:
      'Round the gas buffer up to 1, 2 or 5 times a power of ten (default; may cost the payer up to 2.5x)',
    sig2: 'Round the gas buffer up to 2 significant figures (smaller crowd than the 1-2-5 grid)',
    off: 'Exact gas buffer: fingerprints this client',
  },
});

/** Normative NOT-protected list (spec section 2) for the UI and `docs/user/privacy-limits.md`. */
export const HYGIENE_NOT_PROTECTED: readonly string[] = Object.freeze([
  'The payer still knows the stealth address and sees the sweep. A fresh destination does not hide the link from the payer or any chain observer; this is address hygiene, not anonymity.',
  'The relayer sees owner, destination, amount, timing and IP. A quote and its sweep share the same tuple.',
  'If you later spend the destination together with other funds, it is clustered with them. Hygiene stops at the destination.',
  'Timing is not addressed here.',
  'Decoy-batched or block-scoped RPC reads hide which address matters only from the RPC operator, not from a global observer, and not from an RPC that sees your IP across sessions.',
  'The token emits its own Transfer log, so the link from the stealth address to the destination stays on chain.',
]);
