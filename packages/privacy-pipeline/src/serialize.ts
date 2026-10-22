import { prepareSteps } from './analyze.js';
import { defaultLayers } from './build.js';
import { canonical } from './hash.js';
import { isTestnetChain } from './guard.js';
import { NET_PROFILES, PURPOSES } from './layers.js';
import { RUN_STATUSES, STEP_STATES, type PipelineRun, type StepInstance } from './machine.js';
import { expand, planHash } from './plan.js';
import type { HoldingRef } from './ports.js';
import { STEP_CATALOGUE, isStepKind } from './steps.js';
import type {
  AssetKind,
  CtBackend,
  Holding,
  NetProfileId,
  ParamValue,
  Pipeline,
  PipelineLayers,
  Purpose,
  QuoteMap,
  Step,
} from './types.js';

const ASSET_KINDS: readonly string[] = ['native', 'erc20', 'erc20-permit', 'confidential', 'btc'];
const POOLS: readonly string[] = ['shielded-pool', 'privacy-pools', 'railgun', 'mock-pool'];
const CT: readonly string[] = ['ct1-zama', 'ct2-fhenix', 'ct3-inco', 'ctm-cleartext'];
const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const REF_RE = /^[A-Za-z0-9:_./-]{1,128}$/;
const REASON_RE = /^[A-Za-z0-9:_.-]{1,64}$/;
const HEX_RE = /^0x[0-9a-f]{64}$/;
const MAX_STEPS = 64;
const MAX_INSTANCES = 1024;

const isRec = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const oneOf = (x: unknown, set: readonly string[]): string | null =>
  typeof x === 'string' && set.includes(x) ? x : null;
const nat = (x: unknown): number | null =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null;

/** Field-by-field copy of a holding; `null` when anything is off. */
export function sanitizeHolding(raw: unknown): Holding | null {
  if (!isRec(raw)) return null;
  switch (raw['t']) {
    case 'payer-funds': {
      const wallet = oneOf(raw['wallet'], ['long-lived', 'fresh']);
      const asset = oneOf(raw['asset'], ASSET_KINDS);
      return wallet !== null && asset !== null
        ? { t: 'payer-funds', wallet: wallet as 'fresh', asset: asset as AssetKind }
        : null;
    }
    case 'payment-plan': {
      const parts = nat(raw['parts']);
      const asset = oneOf(raw['asset'], ASSET_KINDS);
      return parts !== null && parts >= 1 && parts <= 64 && asset !== null
        ? { t: 'payment-plan', parts, asset: asset as AssetKind }
        : null;
    }
    case 'note': {
      const pool = oneOf(raw['pool'], POOLS);
      const asset = oneOf(raw['asset'], ASSET_KINDS);
      const holder = oneOf(raw['holder'], ['payer', 'seller']);
      return pool !== null && asset !== null && holder !== null
        ? { t: 'note', pool: pool as 'mock-pool', asset: asset as AssetKind, holder: holder as 'payer' }
        : null;
    }
    case 'stealth': {
      const asset = oneOf(raw['asset'], ASSET_KINDS);
      const origin = oneOf(raw['origin'], ['router', 'pool', 'confidential-router', 'hop']);
      return asset !== null && origin !== null
        ? { t: 'stealth', asset: asset as AssetKind, origin: origin as 'hop' }
        : null;
    }
    case 'owned': {
      const asset = oneOf(raw['asset'], ASSET_KINDS);
      const origin = oneOf(raw['origin'], ['self-derived', 'external', 'pool-exit']);
      return asset !== null && origin !== null
        ? { t: 'owned', asset: asset as AssetKind, origin: origin as 'external' }
        : null;
    }
    case 'paid':
      return { t: 'paid' };
    case 'btc-utxo': {
      const kind = oneOf(raw['kind'], ['sp', 'payjoin-addr', 'plain']);
      return kind !== null ? { t: 'btc-utxo', kind: kind as 'sp' } : null;
    }
    default:
      return null;
  }
}

function sanitizeLayers(raw: unknown): PipelineLayers {
  const d = defaultLayers();
  if (!isRec(raw)) return d;
  const transport: Partial<Record<Purpose, NetProfileId>> = {};
  if (isRec(raw['transport'])) {
    for (const k of PURPOSES) {
      const v = oneOf(raw['transport'][k], NET_PROFILES);
      if (v !== null) transport[k] = v as NetProfileId;
    }
  }
  return {
    transport,
    rpcMode: (oneOf(raw['rpcMode'], ['single', 'quorum', 'own-node', 'light-client']) ??
      d.rpcMode) as PipelineLayers['rpcMode'],
    scanMode: (oneOf(raw['scanMode'], ['range', 'indexer-tor', 'pir2', 'light-client']) ??
      d.scanMode) as PipelineLayers['scanMode'],
    verification: (oneOf(raw['verification'], ['address-free', 'direct']) ??
      d.verification) as PipelineLayers['verification'],
    isolation: (oneOf(raw['isolation'], ['per-step', 'per-purpose']) ??
      d.isolation) as PipelineLayers['isolation'],
  };
}

/**
 * Field-by-field copy of an untrusted pipeline. Unknown fields and parameters are dropped; unknown
 * step kinds, a wrong chain, a malformed id or oversize input return `null`. Total over `unknown`.
 */
export function sanitizePipeline(raw: unknown): Pipeline | null {
  if (!isRec(raw) || raw['v'] !== 1) return null;
  const id = raw['id'];
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  const role = oneOf(raw['role'], ['payer', 'seller']);
  const asset = oneOf(raw['asset'], ASSET_KINDS);
  const chainRaw = raw['chain'];
  if (role === null || asset === null || !isRec(chainRaw)) return null;
  const chain =
    chainRaw['family'] === 'evm'
      ? { family: 'evm' as const, chainId: chainRaw['chainId'] as number }
      : { family: 'btc' as const, network: chainRaw['network'] as string };
  if (!isTestnetChain(chain)) return null;
  if (!Array.isArray(raw['steps']) || raw['steps'].length > MAX_STEPS) return null;
  const steps: Step[] = [];
  for (const s of raw['steps'] as unknown[]) {
    if (!isRec(s) || !isStepKind(s['kind'])) return null;
    const schema = STEP_CATALOGUE[s['kind']].params;
    const params: Record<string, ParamValue> = {};
    if (isRec(s['params'])) {
      for (const k of Object.keys(schema).sort()) {
        const v = s['params'][k];
        if (v !== undefined && typeof v !== 'object') params[k] = v as ParamValue;
      }
    }
    steps.push(Object.keys(params).length === 0 ? { kind: s['kind'] } : { kind: s['kind'], params });
  }
  const ct = oneOf(raw['ctBackend'], CT);
  const gross =
    typeof raw['invoiceGross'] === 'string' && /^[0-9]{1,40}$/.test(raw['invoiceGross'])
      ? raw['invoiceGross']
      : null;
  const pipeline: Pipeline = {
    v: 1,
    id,
    role: role as 'payer',
    chain,
    asset: asset as AssetKind,
    ...(ct === null ? {} : { ctBackend: ct as CtBackend }),
    ...(gross === null ? {} : { invoiceGross: gross }),
    steps,
    layers: sanitizeLayers(raw['layers']),
  };
  // out-of-range parameter values were kept as given on purpose: normalisation reports them to the validator
  return prepareSteps(pipeline.steps).structural.length === 0 ? pipeline : null;
}

function quotesToJson(q: QuoteMap): Record<string, { feeBps: number; gasWeiMax: string }> {
  const out: Record<string, { feeBps: number; gasWeiMax: string }> = {};
  for (const k of Object.keys(q).sort()) {
    const e = q[k];
    if (e !== undefined) out[k] = { feeBps: e.feeBps, gasWeiMax: (e.gasWeiMax ?? 0n).toString(10) };
  }
  return out;
}

/**
 * Versioned, key-sorted JSON of a run. Holds references and state only (EX-2): no signature, raw
 * transaction, key or secret field exists in the run type.
 */
export function serializeRun(r: PipelineRun): string {
  const instances = r.instances.map((i) => ({
    instanceId: i.instanceId,
    state: i.state,
    attempts: i.attempts,
    ...(i.intentKey === undefined ? {} : { intentKey: i.intentKey }),
    ...(i.dueAtMs === undefined ? {} : { dueAtMs: i.dueAtMs }),
    ...(i.waitedMs === undefined ? {} : { waitedMs: i.waitedMs }),
    ...(i.ref === undefined ? {} : { ref: i.ref }),
    ...(i.outputs === undefined ? {} : { outputs: i.outputs }),
    ...(i.failure === undefined ? {} : { failure: i.failure }),
    ...(i.resumeFrom === undefined ? {} : { resumeFrom: i.resumeFrom }),
  }));
  return canonical({
    v: 1,
    id: r.id,
    status: r.status,
    ...(r.pauseReason === undefined ? {} : { pauseReason: r.pauseReason }),
    planHash: r.planHash,
    cp2Done: r.cp2Done,
    pipeline: r.pipeline,
    quotes: quotesToJson(r.quotes),
    instances,
  });
}

function sanitizeRefs(raw: unknown): HoldingRef[] | null {
  if (!Array.isArray(raw) || raw.length > 64) return null;
  const out: HoldingRef[] = [];
  for (const x of raw as unknown[]) {
    if (!isRec(x) || typeof x['ref'] !== 'string' || !REF_RE.test(x['ref'])) return null;
    const holding = sanitizeHolding(x['holding']);
    if (holding === null) return null;
    out.push({ ref: x['ref'], holding });
  }
  return out;
}

/**
 * Parses and validates a serialised run. Total over `unknown`: returns `null` for anything that is not
 * a well-formed run for an allowed testnet whose instances match its pipeline's expansion and whose
 * plan hash matches its pipeline and quotes.
 */
export function sanitizeRun(raw: unknown): PipelineRun | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 1_000_000) return null;
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRec(obj) || obj['v'] !== 1) return null;
  const id = obj['id'];
  const status = oneOf(obj['status'], RUN_STATUSES);
  const hash = obj['planHash'];
  if (
    typeof id !== 'string' ||
    !ID_RE.test(id) ||
    status === null ||
    typeof hash !== 'string' ||
    !HEX_RE.test(hash)
  )
    return null;
  if (typeof obj['cp2Done'] !== 'boolean') return null;
  const pauseReason = obj['pauseReason'];
  if (pauseReason !== undefined && (typeof pauseReason !== 'string' || !REASON_RE.test(pauseReason)))
    return null;
  const pipeline = sanitizePipeline(obj['pipeline']);
  if (pipeline === null || pipeline.id !== id) return null;
  const quotes: Record<string, { feeBps: number; gasWeiMax?: bigint }> = {};
  if (!isRec(obj['quotes'])) return null;
  for (const [k, v] of Object.entries(obj['quotes'])) {
    if (
      !HEX_RE.test(k) ||
      !isRec(v) ||
      typeof v['feeBps'] !== 'number' ||
      !Number.isFinite(v['feeBps']) ||
      typeof v['gasWeiMax'] !== 'string' ||
      !/^[0-9]{1,40}$/.test(v['gasWeiMax'])
    )
      return null;
    quotes[k] = { feeBps: v['feeBps'], gasWeiMax: BigInt(v['gasWeiMax']) };
  }
  let tree;
  try {
    tree = expand(pipeline);
  } catch {
    return null;
  }
  if (
    !Array.isArray(obj['instances']) ||
    obj['instances'].length !== tree.nodes.length ||
    tree.nodes.length > MAX_INSTANCES
  )
    return null;
  const instances: StepInstance[] = [];
  for (let n = 0; n < tree.nodes.length; n++) {
    const node = tree.nodes[n];
    const x = (obj['instances'] as unknown[])[n];
    if (node === undefined || !isRec(x) || x['instanceId'] !== node.instanceId) return null;
    const state = oneOf(x['state'], STEP_STATES);
    const attempts = nat(x['attempts']);
    if (state === null || attempts === null || attempts > 1000) return null;
    const inst: { -readonly [K in keyof StepInstance]: StepInstance[K] } = {
      instanceId: node.instanceId,
      stepIndex: node.stepIndex,
      kind: node.kind,
      lineagePath: node.lineagePath,
      state: state as StepInstance['state'],
      attempts,
    };
    for (const f of ['intentKey', 'ref', 'failure'] as const) {
      const v = x[f];
      if (v !== undefined) {
        if (typeof v !== 'string' || !REF_RE.test(v)) return null;
        inst[f] = v;
      }
    }
    for (const f of ['dueAtMs', 'waitedMs'] as const) {
      const v = x[f];
      if (v !== undefined) {
        const m = nat(v);
        if (m === null) return null;
        inst[f] = m;
      }
    }
    if (x['resumeFrom'] !== undefined) {
      const rf = oneOf(x['resumeFrom'], ['signing', 'submitted']);
      if (rf === null) return null;
      inst.resumeFrom = rf as 'signing';
    }
    if (x['outputs'] !== undefined) {
      const outs = sanitizeRefs(x['outputs']);
      if (outs === null) return null;
      inst.outputs = outs;
    }
    instances.push(inst);
  }
  const run: PipelineRun = {
    v: 1,
    id,
    status: status as PipelineRun['status'],
    ...(pauseReason === undefined ? {} : { pauseReason }),
    planHash: hash as PipelineRun['planHash'],
    pipeline,
    quotes,
    instances,
    cp2Done: obj['cp2Done'],
  };
  if (planHash(pipeline, quotes) !== hash) return null;
  return run;
}
