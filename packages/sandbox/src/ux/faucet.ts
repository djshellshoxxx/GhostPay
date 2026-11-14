import { parseTestAddress, toTestAmount, type TestAddress } from './brand.js';
import { readClock, type Clock, type MockChain, type TestTx } from './chain.js';
import { SandboxError } from './errors.js';

/** Faucet policy. */
export interface FaucetConfig {
  readonly dripAmount: bigint;
  /** Minimum ms between drips for one address (>= 1000). */
  readonly cooldownMs: number;
  /** Lifetime drips per address until reset (1..1000). */
  readonly maxDripsPerAddress: number;
}

/** Drip outcome. Expected refusals are values, not exceptions. */
export type DripResult =
  | { readonly ok: true; readonly tx: TestTx; readonly nextAllowedAt: number }
  | {
      readonly ok: false;
      readonly code: 'rate-limited';
      readonly retryAfterMs: number;
      readonly i18nKey: string;
    }
  | { readonly ok: false; readonly code: 'lifetime-limit'; readonly i18nKey: string };

/** Default policy. */
export const DEFAULT_FAUCET_CONFIG: FaucetConfig = Object.freeze({
  dripAmount: 1_000_000n,
  cooldownMs: 60_000,
  maxDripsPerAddress: 10,
});

/**
 * Rate-limited fake faucet, per address, using an injected clock.
 * @security Clock regression (now < last drip) is treated as rate-limited for the whole
 * cooldown, so winding the clock back cannot bypass the limit.
 */
export class MockFaucet {
  private readonly chain: MockChain;
  private readonly clock: Clock;
  private readonly cfg: FaucetConfig;
  private state = new Map<TestAddress, { last: number; count: number }>();

  public constructor(chain: MockChain, clock: Clock, config: FaucetConfig = DEFAULT_FAUCET_CONFIG) {
    toTestAmount(config.dripAmount);
    if (!Number.isSafeInteger(config.cooldownMs) || config.cooldownMs < 1000) {
      throw new SandboxError('invalid-option', 'cooldownMs must be >= 1000');
    }
    if (
      !Number.isSafeInteger(config.maxDripsPerAddress) ||
      config.maxDripsPerAddress < 1 ||
      config.maxDripsPerAddress > 1000
    ) {
      throw new SandboxError('invalid-option', 'maxDripsPerAddress out of range');
    }
    this.chain = chain;
    this.clock = clock;
    this.cfg = Object.freeze({ ...config });
  }

  /** Request a drip. @throws SandboxError for malformed or unknown addresses. */
  public drip(address: unknown): DripResult {
    const addr = parseTestAddress(address);
    if (!this.chain.hasAccount(addr)) throw new SandboxError('unknown-account', 'unknown test account');
    const now = readClock(this.clock);
    const s = this.state.get(addr);
    if (s !== undefined) {
      if (s.count >= this.cfg.maxDripsPerAddress) {
        return { ok: false, code: 'lifetime-limit', i18nKey: 'sandbox.error.lifetimeLimit' };
      }
      const elapsed = now - s.last;
      if (elapsed < 0) {
        return {
          ok: false,
          code: 'rate-limited',
          retryAfterMs: this.cfg.cooldownMs,
          i18nKey: 'sandbox.error.rateLimited',
        };
      }
      if (elapsed < this.cfg.cooldownMs) {
        return {
          ok: false,
          code: 'rate-limited',
          retryAfterMs: this.cfg.cooldownMs - elapsed,
          i18nKey: 'sandbox.error.rateLimited',
        };
      }
    }
    const tx = this.chain.mintFaucet(addr, this.cfg.dripAmount);
    this.state.set(addr, { last: now, count: (s?.count ?? 0) + 1 });
    return { ok: true, tx, nextAllowedAt: now + this.cfg.cooldownMs };
  }

  /** Forget all rate-limit state. */
  public reset(): void {
    this.state = new Map();
  }
}

/** A faucet source supplied by the caller (never hardcoded here). */
export interface FaucetSourceInput {
  readonly id: string;
  readonly url: string;
}

/** Validated source. `trusted` is always false: the package never vouches for a URL. */
export interface FaucetSource {
  readonly id: string;
  readonly url: string;
  readonly host: string;
  readonly trusted: false;
}

/** Guidance step. */
export interface GuidanceStep {
  readonly key: string;
  readonly params: Readonly<Record<string, string>>;
}

/** Guidance data for the faucet panel. */
export interface FaucetGuidance {
  readonly titleKey: string;
  readonly steps: readonly GuidanceStep[];
  readonly warningKeys: readonly string[];
  readonly sources: readonly FaucetSource[];
}

/**
 * Strictly validate a caller-configured faucet URL: https only, no credentials, no control
 * characters or whitespace, length <= 2048, non-empty host, no fragment.
 * @security Rendering must show the host and treat it as untrusted; open with noopener/noreferrer.
 */
export function validateFaucetSource(input: FaucetSourceInput): FaucetSource {
  const { id, url } = input as { id: unknown; url: unknown };
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) {
    throw new SandboxError('invalid-faucet-source', 'bad source id');
  }
  // eslint-disable-next-line no-control-regex
  if (typeof url !== 'string' || url.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(url)) {
    throw new SandboxError('invalid-faucet-source', 'bad url');
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new SandboxError('invalid-faucet-source', 'unparseable url');
  }
  if (
    u.protocol !== 'https:' ||
    u.username !== '' ||
    u.password !== '' ||
    u.hash !== '' ||
    u.hostname === ''
  ) {
    throw new SandboxError('invalid-faucet-source', 'url must be plain https without credentials');
  }
  return Object.freeze({ id, url: u.href, host: u.hostname, trusted: false as const });
}

/**
 * Build generic faucet guidance. Sources are caller configuration only; with none, a
 * "no source configured" step replaces the open-source step.
 */
export function buildFaucetGuidance(
  address: unknown,
  sources: readonly FaucetSourceInput[] = [],
): FaucetGuidance {
  const addr = parseTestAddress(address);
  if (sources.length > 10) throw new SandboxError('invalid-faucet-source', 'too many sources');
  const valid = sources.map(validateFaucetSource);
  if (new Set(valid.map((s) => s.id)).size !== valid.length) {
    throw new SandboxError('invalid-faucet-source', 'duplicate source id');
  }
  const steps: GuidanceStep[] = [
    { key: 'sandbox.faucet.step.copyAddress', params: { address: addr } },
    valid.length > 0
      ? { key: 'sandbox.faucet.step.openSource', params: { count: String(valid.length) } }
      : { key: 'sandbox.faucet.step.noSource', params: {} },
    { key: 'sandbox.faucet.step.pasteAddressOnly', params: {} },
    { key: 'sandbox.faucet.step.waitConfirmations', params: {} },
    { key: 'sandbox.faucet.step.checkBalance', params: {} },
  ];
  return Object.freeze({
    titleKey: 'sandbox.faucet.title',
    steps: Object.freeze(steps),
    warningKeys: Object.freeze([
      'sandbox.faucet.warn.neverSeed',
      'sandbox.faucet.warn.unverified',
      'sandbox.faucet.warn.noValue',
    ]),
    sources: Object.freeze(valid),
  });
}
