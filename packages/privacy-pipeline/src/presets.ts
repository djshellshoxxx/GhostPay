import { prepareSteps } from './analyze.js';
import { defaultLayers, newPipeline } from './build.js';
import { PipelineError } from './errors.js';
import { assertTestnetChain, type ChainRef } from './guard.js';
import { profileRequirement, usedPurposes } from './layers.js';
import { validate } from './validate.js';
import type {
  AssetKind,
  Context,
  CtBackend,
  NetProfileId,
  Pipeline,
  PipelineLayers,
  Role,
  Step,
} from './types.js';

export type PresetId = 'standard' | 'enhanced' | 'maximum' | 'confidential-amount';

/** One preference that could not be honoured. Text comes from keys in the app, not from this package. */
export interface Downgrade {
  readonly option: string;
  readonly wanted: string;
  readonly got: string;
}

/** Facts needed to build a template that the planning `Context` does not carry. */
export interface TemplateTarget {
  readonly chain: ChainRef;
  /** Token family of the payment: `native`, `erc20` or `erc20-permit` (EVM), ignored on BTC. */
  readonly asset: AssetKind;
  /** Where a seller's funds arrive from. Default `router`. */
  readonly origin?: 'router' | 'pool';
  readonly id?: string;
}

interface Candidate {
  readonly label: string;
  readonly asset: AssetKind;
  readonly steps: readonly Step[];
}

const TRANSPORT_PREF: Readonly<Record<PresetId, readonly NetProfileId[]>> = {
  standard: ['direct'],
  enhanced: ['tor-browser', 'onion', 'direct'],
  maximum: ['tor-browser', 'tor-socks', 'onion', 'ohttp', 'direct'],
  'confidential-amount': ['tor-browser', 'onion', 'direct'],
};
const RPC_MODE_PREF: Readonly<Record<PresetId, readonly PipelineLayers['rpcMode'][]>> = {
  standard: ['single'],
  enhanced: ['quorum', 'single'],
  maximum: ['quorum', 'single'],
  'confidential-amount': ['quorum', 'single'],
};
const SCAN_PREF: Readonly<Record<PresetId, readonly PipelineLayers['scanMode'][]>> = {
  standard: ['range'],
  enhanced: ['indexer-tor', 'range'],
  maximum: ['pir2', 'indexer-tor', 'range'],
  'confidential-amount': ['indexer-tor', 'range'],
};
const CT_PREF: readonly CtBackend[] = ['ct1-zama', 'ct3-inco', 'ct2-fhenix'];
const POOL_PREF = ['privacy-pools', 'railgun', 'shielded-pool'] as const;
const EXIT_GAS_PREF = ['eip7702', 'permit-sponsored', 'buffer'] as const;
const SPONSOR_PREF = ['eip7702-sponsored', 'erc4337-paymaster', 'permit-relay'] as const;

const st = (kind: Step['kind'], params?: Step['params']): Step =>
  params === undefined ? { kind } : { kind, params };

function payerCandidates(preset: PresetId, t: TemplateTarget): Candidate[] {
  const a = t.asset;
  const std: Candidate = {
    label: 'standard',
    asset: a,
    steps: [st('src.wallet'), st('pay.submit', { payerMode: 'direct', route: 'router' })],
  };
  if (t.chain.family === 'btc')
    return [{ label: 'btc', asset: 'btc', steps: [st('btc.send', { mode: 'silent-payment' })] }];
  const shaped = (extra: Step[], mode: string, tail: Step[]): Step[] => [
    st('src.wallet'),
    ...extra,
    st('amount.shape', { mode }),
    ...tail,
  ];
  const pay = (m: string): Step => st('pay.submit', { payerMode: m, route: 'router' });
  switch (preset) {
    case 'standard':
      return [std];
    case 'enhanced':
      return [
        {
          label: 'fresh-wallet+round',
          asset: a,
          steps: shaped([st('payer.fresh-wallet')], 'round', [pay('direct')]),
        },
        { label: 'round', asset: a, steps: shaped([], 'round', [pay('direct')]) },
        std,
      ];
    case 'maximum':
      return [
        {
          label: 'pool',
          asset: a,
          steps: shaped([st('payer.fresh-wallet')], 'denom', [
            st('pool.deposit', { pool: 'shielded-pool' }),
            st('pool.dwell'),
            st('pay.from-pool'),
          ]),
        },
        ...SPONSOR_PREF.map((m) => ({ label: m, asset: a, steps: shaped([], 'round', [pay(m)]) })),
        {
          label: 'fresh-wallet+round',
          asset: a,
          steps: shaped([st('payer.fresh-wallet')], 'round', [pay('direct')]),
        },
        { label: 'round', asset: a, steps: shaped([], 'round', [pay('direct')]) },
        std,
      ];
    case 'confidential-amount':
      return [
        ...CT_PREF.map((b) => ({
          label: b,
          asset: a,
          steps: [st('src.wallet'), st('ct.wrap', { backend: b }), pay('direct')],
        })),
        std,
      ];
  }
}

function sellerCandidates(preset: PresetId, t: TemplateTarget): Candidate[] {
  const a = t.asset;
  if (t.chain.family === 'btc')
    return [{ label: 'btc', asset: 'btc', steps: [st('btc.recv', { mode: 'silent-payment' })] }];
  const origin = t.origin ?? 'router';
  const recv = st('recv.stealth', { origin });
  const std: Candidate = {
    label: 'standard',
    asset: a,
    steps: [recv, st('hygiene.sweep', { destination: 'self-derived' })],
  };
  switch (preset) {
    case 'standard':
      return [std];
    case 'enhanced':
      return [{ label: 'delay', asset: a, steps: [recv, st('sweep.delay'), st('hygiene.sweep')] }, std];
    case 'maximum': {
      const pools: Candidate[] = [];
      for (const pool of POOL_PREF) {
        for (const exitGas of EXIT_GAS_PREF) {
          pools.push({
            label: `${pool}/${exitGas}`,
            asset: a,
            steps: [recv, st('pool.deposit', { pool, n: 2, exitGas }), st('pool.dwell'), st('pool.exit')],
          });
        }
      }
      return [
        ...pools,
        { label: 'delay', asset: a, steps: [recv, st('sweep.delay'), st('hygiene.sweep')] },
        std,
      ];
    }
    case 'confidential-amount':
      return [
        ...CT_PREF.map((b) => ({
          label: b,
          asset: 'confidential' as const,
          ctBackend: b,
          steps: [st('recv.stealth', { origin: 'confidential-router' }), st('ct.sweep')],
        })),
        { label: 'delay', asset: a, steps: [recv, st('sweep.delay'), st('hygiene.sweep')] },
        std,
      ] as Candidate[];
  }
}

function pickLayers(
  preset: PresetId,
  steps: readonly Step[],
  ctx: Context,
  downgrades: Downgrade[],
): PipelineLayers {
  const base = defaultLayers();
  const used = usedPurposes(prepareSteps(steps).steps);
  const transport: Partial<Record<keyof PipelineLayers['transport'], NetProfileId>> = {};
  const prefs = TRANSPORT_PREF[preset];
  for (const purpose of [...used.keys()].sort()) {
    const ok =
      prefs.find(
        (p) => p === 'direct' || (ctx.selfTests.has(purpose) && profileRequirement(p, purpose, ctx) === 'ok'),
      ) ?? 'direct';
    if (ok !== (prefs[0] as NetProfileId))
      downgrades.push({ option: `transport.${purpose}`, wanted: prefs[0] as string, got: ok });
    if (ok !== 'direct') transport[purpose] = ok;
  }
  const rpcTor = ['tor-browser', 'tor-socks', 'onion'].includes(transport['rpc'] ?? 'direct');
  const rpcMode =
    RPC_MODE_PREF[preset].find(
      (m) => m === 'single' || ctx.capabilities.has(m === 'quorum' ? 'multi-rpc' : m),
    ) ?? 'single';
  if (rpcMode !== RPC_MODE_PREF[preset][0])
    downgrades.push({ option: 'rpcMode', wanted: RPC_MODE_PREF[preset][0] as string, got: rpcMode });
  const scanNeeds: Record<PipelineLayers['scanMode'], boolean> = {
    range: true,
    'indexer-tor': rpcTor && ctx.capabilities.has('tor-indexer'),
    pir2: ctx.capabilities.has('pir-servers'),
    'light-client': ctx.capabilities.has('light-client'),
  };
  const scanMode = SCAN_PREF[preset].find((m) => scanNeeds[m]) ?? 'range';
  if (scanMode !== SCAN_PREF[preset][0])
    downgrades.push({ option: 'scanMode', wanted: SCAN_PREF[preset][0] as string, got: scanMode });
  return { ...base, transport, rpcMode, scanMode };
}

/**
 * Pipeline template for a preset and role. The first candidate that validates under `ctx` wins; every
 * choice below the first is reported as a downgrade. Templates never contain hops, unwrap, PayJoin or a
 * second pool (PP-12). Acks are not added; the caller shows `validate().requiredAcks`.
 *
 * Deviation: the spec derives templates from the profile preset by `selectionToPipeline`; this package
 * imports no profile package, so the preference data lives here.
 *
 * @security Throws `E_WRONG_CHAIN` outside the allowed testnets and `E_BAD_INPUT` for a confidential
 * `target.asset` (pick the token family; confidential receipts come from the preset).
 */
export function templateFor(
  preset: PresetId,
  role: Role,
  ctx: Context,
  target: TemplateTarget,
): { pipeline: Pipeline; downgrades: readonly Downgrade[] } {
  assertTestnetChain(target.chain);
  if (target.asset === 'confidential') throw new PipelineError('E_BAD_INPUT', 'asset');
  const cands = role === 'payer' ? payerCandidates(preset, target) : sellerCandidates(preset, target);
  let i = 0;
  for (;;) {
    const c = cands[i] as Candidate & { ctBackend?: CtBackend };
    const downgrades: Downgrade[] =
      i === 0 ? [] : [{ option: 'steps', wanted: (cands[0] as Candidate).label, got: c.label }];
    const layers = pickLayers(preset, c.steps, ctx, downgrades);
    const pipeline = newPipeline({
      id: target.id ?? `tpl-${preset}-${role}`,
      role,
      chain: target.chain,
      asset: c.asset,
      ...(c.ctBackend === undefined ? {} : { ctBackend: c.ctBackend }),
      steps: c.steps,
      layers,
    });
    if (i === cands.length - 1 || validate(pipeline, ctx).ok) return { pipeline, downgrades };
    i += 1;
  }
}
