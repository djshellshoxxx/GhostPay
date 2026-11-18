import { SandboxError } from './errors.js';

/** App mode. */
export type AppMode = 'real' | 'test';
/** Visual mode. In test mode this is forced to `test-distinct` and is derived, never stored. */
export type VisualMode = 'normal' | 'test-distinct';

/** Immutable mode state. */
export interface ModeState {
  readonly mode: AppMode;
  /** Derived from mode; cannot diverge. */
  readonly visual: VisualMode;
  /** Number of resets/transitions, to key UI caches. */
  readonly epoch: number;
}

/** Derive the visual mode. @security Test mode can never render as normal. */
export function visualModeOf(mode: AppMode): VisualMode {
  return mode === 'test' ? 'test-distinct' : 'normal';
}

/** Create the initial state (real mode). */
export function initialModeState(): ModeState {
  return Object.freeze({ mode: 'real', visual: 'normal', epoch: 0 });
}

/** Transition to a mode; epoch increments on every change. */
export function transition(state: ModeState, next: AppMode): ModeState {
  if (next !== 'real' && next !== 'test') throw new SandboxError('invalid-option', 'bad mode');
  if (state.mode === next) return state;
  return Object.freeze({ mode: next, visual: visualModeOf(next), epoch: state.epoch + 1 });
}

/** Re-validate a state (e.g. from untrusted storage). Returns a normalized, frozen state. */
export function normalizeModeState(raw: unknown): ModeState {
  if (typeof raw !== 'object' || raw === null) throw new SandboxError('invalid-option', 'bad state');
  const r = raw as Record<string, unknown>;
  const mode = r['mode'];
  const epoch = r['epoch'];
  if ((mode !== 'real' && mode !== 'test') || !Number.isSafeInteger(epoch) || (epoch as number) < 0) {
    throw new SandboxError('invalid-option', 'bad state');
  }
  // Ignore any supplied `visual`: it is always re-derived.
  return Object.freeze({ mode, visual: visualModeOf(mode), epoch: epoch as number });
}

/** Banner descriptor. */
export interface BannerModel {
  readonly visible: boolean;
  readonly visual: VisualMode;
  readonly role: 'status' | 'none';
  /** i18n keys, in display order. */
  readonly keys: readonly string[];
  /** Key to prefix on every amount / address / tx label. */
  readonly labelPrefixKey: string | null;
}

/** i18n keys required by this package (for the i18n lint). */
export const SANDBOX_I18N_KEYS = [
  'sandbox.banner.title',
  'sandbox.banner.body',
  'sandbox.banner.noRealFunds',
  'sandbox.banner.exit',
  'sandbox.label.test',
  'sandbox.faucet.title',
  'sandbox.faucet.step.copyAddress',
  'sandbox.faucet.step.openSource',
  'sandbox.faucet.step.noSource',
  'sandbox.faucet.step.pasteAddressOnly',
  'sandbox.faucet.step.waitConfirmations',
  'sandbox.faucet.step.checkBalance',
  'sandbox.faucet.warn.neverSeed',
  'sandbox.faucet.warn.unverified',
  'sandbox.faucet.warn.noValue',
  'sandbox.error.rateLimited',
  'sandbox.error.lifetimeLimit',
  'sandbox.reset.confirm',
] as const;

/**
 * Banner for a state. In test mode it is always visible, always a `status` region and
 * cannot be turned off. @security Prevents users mistaking test funds for real ones.
 */
export function bannerFor(state: ModeState): BannerModel {
  if (state.mode === 'test') {
    return Object.freeze({
      visible: true,
      visual: 'test-distinct',
      role: 'status',
      keys: Object.freeze([
        'sandbox.banner.title',
        'sandbox.banner.body',
        'sandbox.banner.noRealFunds',
        'sandbox.banner.exit',
      ]),
      labelPrefixKey: 'sandbox.label.test',
    });
  }
  return Object.freeze({
    visible: false,
    visual: 'normal',
    role: 'none',
    keys: Object.freeze([]),
    labelPrefixKey: null,
  });
}
