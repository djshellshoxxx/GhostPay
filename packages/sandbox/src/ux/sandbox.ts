import {
  brandProfileId,
  isTestProfileId,
  type RealProfileId,
  type TestAddress,
  type TestProfileId,
} from './brand.js';
import {
  MockChain,
  readRandom,
  toHex,
  type Clock,
  type MockChainOptions,
  type RandomBytes,
} from './chain.js';
import { SandboxError } from './errors.js';
import { DEFAULT_FAUCET_CONFIG, MockFaucet, type FaucetConfig } from './faucet.js';
import { bannerFor, initialModeState, transition, type BannerModel, type ModeState } from './mode.js';

/** A sandbox profile. `kind: 'test'` is part of the type, so it cannot be a RealProfile. */
export interface TestProfile {
  readonly kind: 'test';
  readonly id: TestProfileId;
  readonly address: TestAddress;
}
/** A real profile reference. */
export interface RealProfile {
  readonly kind: 'real';
  readonly id: RealProfileId;
}
/** Either kind of profile. */
export type AnyProfile = TestProfile | RealProfile;

/** Assert a profile is a test profile (runtime check backs the type guard). */
export function assertTestProfile(p: AnyProfile): asserts p is TestProfile {
  if (p.kind !== 'test' || !isTestProfileId(p.id)) {
    throw new SandboxError('real-data-in-test-context', 'expected a sandbox profile');
  }
}
/** Assert a profile is real, and its id carries no test markers. */
export function assertRealProfile(p: AnyProfile): asserts p is RealProfile {
  if (p.kind !== 'real' || isTestProfileId(p.id)) {
    throw new SandboxError('test-data-in-real-context', 'sandbox profile in real context');
  }
}
/**
 * Assert that all profiles share one domain (all test or all real).
 * @security Call before any operation combining profiles (send, import, export, merge).
 */
export function assertSameDomain(...ps: readonly AnyProfile[]): void {
  const kinds = new Set(ps.map((p) => p.kind));
  if (kinds.size > 1) throw new SandboxError('test-data-in-real-context', 'mixing test and real profiles');
  for (const p of ps) {
    if (p.kind === 'test') assertTestProfile(p);
    else assertRealProfile(p);
  }
}

/** Sandbox construction options. */
export interface SandboxOptions {
  readonly rng: RandomBytes;
  readonly clock: Clock;
  readonly faucet?: FaucetConfig;
  readonly chain?: Pick<MockChainOptions, 'confirmationsRequired' | 'maxAccounts' | 'maxTransactions'>;
}

/**
 * Sandbox controller: mode state + mock chain + faucet. Chain access is only possible in
 * test mode; leaving test mode wipes all test data.
 * @security Real mode holds no test data (wiped on exit), and test data is branded.
 */
export class Sandbox {
  private state: ModeState = initialModeState();
  private readonly chain: MockChain;
  private readonly faucet: MockFaucet;
  private readonly rng: RandomBytes;

  public constructor(opts: SandboxOptions) {
    this.rng = opts.rng;
    this.chain = new MockChain({ rng: opts.rng, clock: opts.clock, ...opts.chain });
    this.faucet = new MockFaucet(this.chain, opts.clock, opts.faucet ?? DEFAULT_FAUCET_CONFIG);
  }

  /** Current mode state. */
  public getState(): ModeState {
    return this.state;
  }
  /** Banner model for the current state. */
  public banner(): BannerModel {
    return bannerFor(this.state);
  }
  /** Enter test mode (idempotent). */
  public enter(): ModeState {
    this.state = transition(this.state, 'test');
    return this.state;
  }
  /** Leave test mode and wipe all test data. */
  public exit(): ModeState {
    if (this.state.mode === 'test') this.wipe();
    this.state = transition(this.state, 'real');
    return this.state;
  }
  /** Wipe chain + faucet state while staying in the current mode. Test mode only. */
  public reset(): ModeState {
    this.requireTest();
    this.wipe();
    this.state = Object.freeze({ ...this.state, epoch: this.state.epoch + 1 });
    return this.state;
  }
  /** Chain handle. @throws not-test-mode in real mode. */
  public getChain(): MockChain {
    this.requireTest();
    return this.chain;
  }
  /** Faucet handle. @throws not-test-mode in real mode. */
  public getFaucet(): MockFaucet {
    this.requireTest();
    return this.faucet;
  }
  /** Create a sandbox profile with a fresh account. */
  public createProfile(label?: string): TestProfile {
    this.requireTest();
    const address = this.chain.createAccount(label);
    const id = brandProfileId(toHex(readRandom(this.rng, 8)));
    return Object.freeze({ kind: 'test' as const, id, address });
  }

  private requireTest(): void {
    if (this.state.mode !== 'test') throw new SandboxError('not-test-mode', 'sandbox is not active');
  }
  private wipe(): void {
    this.chain.reset();
    this.faucet.reset();
  }
}
