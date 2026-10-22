import type { Hex } from './hash.js';
import type { Holding, Purpose, StepKind, StepParams } from './types.js';

/** Opaque reference to a holding kept by a method package (note index, address derivation path, ...). Never a secret. */
export interface HoldingRef {
  readonly ref: string;
  readonly holding: Holding;
}

/** Opaque reference to an on-chain or relayer side effect (tx hash, relayer job id, ...). */
export type SideEffectRef = string;

export interface StepInstanceView {
  readonly instanceId: string;
  readonly kind: StepKind;
  readonly stepIndex: number;
  readonly lineagePath: readonly number[];
  readonly params: StepParams;
  readonly intentKey: string | undefined;
  readonly attempts: number;
}

export interface StepQuote {
  readonly feeBps: number;
  readonly gasWeiMax?: bigint;
  /** Parties the quote involves; a party outside the step's trust list counts as drift (EX-8). */
  readonly parties?: readonly string[];
  /** Seller steps only: the method allows continuing without a signature prompt (hops `autoContinue`). */
  readonly autoContinue?: boolean;
}

/** Unsigned, non-secret description of what will be submitted. */
export interface Prepared {
  readonly digest: string;
  /** Method-specific index mixed into the intent key (nonce, precommitment index, leg index). */
  readonly methodIndex?: number;
}

/** Signing capability supplied by the app. The package never stores what it returns. */
export interface SignPort {
  sign(digest: string, scope: string): Promise<string>;
}

export interface EmergencyExit {
  readonly id: string;
  /** Message keys of what the exit reveals (for example re-linking). */
  readonly leakKeys: readonly string[];
}

export type ReconcileResult = 'not-started' | 'pending' | 'done' | 'failed';
export type PoolHealth = 'ok' | 'degraded' | 'sunset' | 'unknown';

/** Driver wiring one step kind to a method package. Supplied by the app; the package does no I/O. */
export interface StepDriver<K extends StepKind = StepKind> {
  readonly kind: K;
  /** Optional pool lifecycle probe (EX-9). Pool steps only. */
  health?(): Promise<PoolHealth>;
  quote(i: StepInstanceView, h: HoldingRef | null): Promise<StepQuote>;
  prepare(i: StepInstanceView, h: HoldingRef | null, q: StepQuote): Promise<Prepared>;
  submit(i: StepInstanceView, p: Prepared, s: SignPort): Promise<{ readonly ref: SideEffectRef }>;
  reconcile(i: StepInstanceView): Promise<ReconcileResult>;
  outputs(i: StepInstanceView): Promise<readonly HoldingRef[]>;
  emergencyExits(h: HoldingRef): readonly EmergencyExit[];
}

/** Sealed run body as stored by the app (the app seals it with its secret box). */
export interface SealedRun {
  readonly id: string;
  readonly body: string;
}
export interface PipelineStore {
  load(id: string): Promise<SealedRun | null>;
  save(r: SealedRun): Promise<void>;
}

export type CheckpointKind = 'CP-1' | 'CP-2' | 'CP-3' | 'CP-4' | 'CP-5';
export interface Checkpoint {
  readonly kind: CheckpointKind;
  readonly runId: string;
  readonly planHash: Hex;
  readonly instanceId?: string;
  /** Message keys shown to the user. */
  readonly keys: readonly string[];
}
export interface Confirmer {
  confirm(c: Checkpoint): Promise<{ readonly ok: boolean; readonly planHash: Hex }>;
}

export interface Clock {
  nowMs(): number;
}
/** Draws a delay in `[minMs, maxMs]`. The app supplies a CSPRNG implementation; this package has none. */
export interface DelayPort {
  draw(minMs: number, maxMs: number): number;
}
export interface CapabilityProbe {
  capabilities(): Promise<ReadonlySet<string>>;
  selfTest(p: Purpose): Promise<boolean>;
}
