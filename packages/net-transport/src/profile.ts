import type { RpcTransport } from '@ghostpay/chain-adapters';
import type { Purpose } from './credentials.js';

/** Transport profile ids (spec section 3, selector A). */
export const PROFILE_IDS = ['direct', 'tor-browser', 'tor-socks', 'onion', 'i2p-outproxy', 'nym-mixfetch', 'nym-socks5', 'ohttp'] as const;
/** Profile id. */
export type ProfileId = (typeof PROFILE_IDS)[number];

/** What a profile can honestly claim (spec section 6). */
export type Claim = 'hides-ip-from-destination' | 'dns-remote' | 'stream-isolation' | 'timing-mix' | 'splits-who-what';

/** Result of one self-test check. `detail` never contains URLs or hosts. */
export interface SelfTestCheck {
  /** Check id. */
  readonly id: string;
  /** Pass/fail. */
  readonly ok: boolean;
  /** Fixed explanatory text. */
  readonly detail: string;
}

/** Self-test result. */
export interface SelfTestResult {
  /** True when every check passed. */
  readonly ok: boolean;
  /** Individual checks. */
  readonly checks: readonly SelfTestCheck[];
}

/** Optional live probe for {@link TransportProfile.selfTest}. */
export interface SelfTestOptions {
  /** Aborts the test. */
  readonly signal?: AbortSignal;
  /**
   * Endpoint to send one `eth_chainId` through the profile (the user's own configured RPC or relayer
   * health URL). Never a third-party "what is my IP" service.
   */
  readonly probe?: { readonly url: string; readonly expectedChainId: number };
}

/** A transport profile. Creating one performs no network I/O. */
export interface TransportProfile {
  /** Profile id. */
  readonly id: ProfileId;
  /** Experimental flag (UI toggle required). */
  readonly experimental: boolean;
  /** Claims this profile may display. Empty for `direct` and `tor-browser`. */
  readonly claims: readonly Claim[];
  /** Non-fatal configuration warnings (fixed strings). */
  readonly warnings: readonly string[];
  /**
   * Transport for one purpose. One instance per call is fine.
   *
   * @security Throws `NetTransportError` `PROFILE_SELFTEST` after a failed self-test until a later one
   * passes: there is NO fallback to `direct` (NP-T-5).
   */
  transport(purpose: Purpose): RpcTransport;
  /** Runs local checks, plus an optional probe through the profile. Never throws. */
  selfTest(opts?: SelfTestOptions): Promise<SelfTestResult>;
}
