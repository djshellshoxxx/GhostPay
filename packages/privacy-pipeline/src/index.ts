export { PipelineError } from './errors.js';
export type { PipelineErrorCode } from './errors.js';
export { TESTNET_CHAIN_IDS, BTC_TESTNETS, isTestnetChain, assertTestnetChain } from './guard.js';
export type { ChainRef } from './guard.js';
export type { Hex } from './hash.js';
export type * from './types.js';
export {
  STEP_CATALOGUE,
  STEP_KINDS,
  isStepKind,
  normalizeParams,
  compoundFeeBps,
  CT_MIN_DWELL_MS,
  POOL_RELAYER_FEE_BPS_CAP,
  ROUTER_FEE_BPS,
  SWEEP_RELAYER_FEE_MIN_BPS,
  SWEEP_RELAYER_FEE_MAX_BPS,
} from './steps.js';
export type { StepDef, ParamSpec, ParamSchema } from './steps.js';
export { CHAIN_RULES, evalPred, matchRule } from './chainRules.js';
export type { ChainRuleDef, ChainPattern, ParamPred, StepMatch, Relation, Effect } from './chainRules.js';
export { chainMatrix, MATRIX_ROWS, MATRIX_COLS } from './matrix.js';
export type { ChainMatrixCell } from './matrix.js';
export { validate, projectToSelection } from './validate.js';
export { checkJoin } from './join.js';
export { expand, planHash, instanceIdOf } from './plan.js';
export { simulate, COMMON_SHAPES } from './summary.js';
export { templateFor } from './presets.js';
export type { PresetId, Downgrade, TemplateTarget } from './presets.js';
export { newPipeline, addStep, removeStep, moveStep, nextKinds, defaultLayers } from './build.js';
export type { Built, NewPipelineArgs } from './build.js';
export { reduceStep, reducePipeline } from './machine.js';
export type { StepInstance, StepEvent, StepState, PipelineRun, RunEvent, RunStatus } from './machine.js';
export {
  createExecutor,
  createRun,
  simulateWithDrivers,
  DEFAULT_REQUOTE_TOLERANCE_BPS,
  OVERDUE_MS,
} from './executor.js';
export type { Executor, ExecutorPorts, ExecEvent, AbortReport, RunStatusReport } from './executor.js';
export type * from './ports.js';
export { serializeRun, sanitizeRun, sanitizePipeline, sanitizeHolding } from './serialize.js';
