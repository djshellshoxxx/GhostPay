import { analyze, holdingMatches } from './analyze.js';
import { PipelineError } from './errors.js';
import { assertTestnetChain, type ChainRef } from './guard.js';
import { STEP_CATALOGUE, STEP_KINDS } from './steps.js';
import { validate } from './validate.js';
import type {
  AssetKind,
  Context,
  CtBackend,
  Pipeline,
  PipelineLayers,
  PipelineValidation,
  Role,
  Step,
  StepKind,
} from './types.js';

/** Default layers: everything direct, single RPC, range scan, address-free verification, per-step isolation. */
export function defaultLayers(): PipelineLayers {
  return {
    transport: {},
    rpcMode: 'single',
    scanMode: 'range',
    verification: 'address-free',
    isolation: 'per-step',
  };
}

export interface NewPipelineArgs {
  readonly id: string;
  readonly role: Role;
  readonly chain: ChainRef;
  readonly asset: AssetKind;
  readonly ctBackend?: CtBackend;
  readonly invoiceGross?: string;
  readonly steps?: readonly Step[];
  readonly layers?: PipelineLayers;
}

/**
 * Creates a pipeline value.
 *
 * @security Throws `E_WRONG_CHAIN` outside the allowed testnets and `E_BAD_INPUT` for a malformed id.
 */
export function newPipeline(a: NewPipelineArgs): Pipeline {
  assertTestnetChain(a.chain);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(a.id)) throw new PipelineError('E_BAD_INPUT', 'id');
  return {
    v: 1,
    id: a.id,
    role: a.role,
    chain: a.chain,
    asset: a.asset,
    ...(a.ctBackend === undefined ? {} : { ctBackend: a.ctBackend }),
    ...(a.invoiceGross === undefined ? {} : { invoiceGross: a.invoiceGross }),
    steps: a.steps ?? [],
    layers: a.layers ?? defaultLayers(),
  };
}

export interface Built {
  readonly pipeline: Pipeline;
  readonly validation: PipelineValidation;
}

function rebuild(p: Pipeline, steps: readonly Step[], ctx: Context): Built {
  const pipeline = { ...p, steps };
  return { pipeline, validation: validate(pipeline, ctx) };
}

/** Inserts a step (at the end by default). Returns a new pipeline and its validation. Out-of-range index: `E_BAD_INPUT`. */
export function addStep(p: Pipeline, step: Step, ctx: Context, index: number = p.steps.length): Built {
  if (!Number.isInteger(index) || index < 0 || index > p.steps.length)
    throw new PipelineError('E_BAD_INPUT', 'index');
  return rebuild(p, [...p.steps.slice(0, index), step, ...p.steps.slice(index)], ctx);
}

/** Removes the step at `index`. */
export function removeStep(p: Pipeline, index: number, ctx: Context): Built {
  if (!Number.isInteger(index) || index < 0 || index >= p.steps.length)
    throw new PipelineError('E_BAD_INPUT', 'index');
  return rebuild(p, [...p.steps.slice(0, index), ...p.steps.slice(index + 1)], ctx);
}

/** Moves the step at `from` to position `to` (index in the resulting list). */
export function moveStep(p: Pipeline, from: number, to: number, ctx: Context): Built {
  if (!Number.isInteger(from) || from < 0 || from >= p.steps.length)
    throw new PipelineError('E_BAD_INPUT', 'from');
  if (!Number.isInteger(to) || to < 0 || to >= p.steps.length) throw new PipelineError('E_BAD_INPUT', 'to');
  const rest = [...p.steps.slice(0, from), ...p.steps.slice(from + 1)];
  return rebuild(p, [...rest.slice(0, to), p.steps[from] as Step, ...rest.slice(to)], ctx);
}

/**
 * Step kinds whose input matches the current tail holding (custom builder list). For an empty pipeline,
 * the start steps of this role and chain family. Empty after a terminal holding (`owned`, `paid`).
 */
export function nextKinds(p: Pipeline): readonly StepKind[] {
  const family = p.chain.family;
  const fits = (k: StepKind): boolean =>
    STEP_CATALOGUE[k].family === family &&
    (STEP_CATALOGUE[k].role === 'both' || STEP_CATALOGUE[k].role === p.role);
  const a = analyze(p);
  if (a.structural.length > 0) return [];
  if (p.steps.length === 0) return STEP_KINDS.filter((k) => fits(k) && STEP_CATALOGUE[k].start);
  const tail = a.outHoldings[a.outHoldings.length - 1];
  if (tail === undefined || tail.t === 'owned' || tail.t === 'paid') return [];
  return STEP_KINDS.filter(
    (k) => fits(k) && STEP_CATALOGUE[k].accepts.some((pat) => holdingMatches(tail, pat)),
  );
}
