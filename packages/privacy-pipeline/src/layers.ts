import type { NStep } from './analyze.js';
import type { Context, Issue, NetProfileId, Pipeline, Purpose } from './types.js';

export const PURPOSES: readonly Purpose[] = [
  'rpc',
  'scan',
  'read-address',
  'relayer',
  'sponsor',
  'pool-relayer',
  'decrypt-relayer',
  'payjoin-directory',
];
export const NET_PROFILES: readonly NetProfileId[] = [
  'direct',
  'tor-browser',
  'tor-socks',
  'onion',
  'i2p-outproxy',
  'nym-mixfetch',
  'nym-socks5',
  'ohttp',
];
/** Purposes whose counterparty is a relay-like service that sees the client IP when direct (R-31). */
export const RELAY_LIKE: readonly Purpose[] = [
  'relayer',
  'sponsor',
  'pool-relayer',
  'decrypt-relayer',
  'payjoin-directory',
];

const RPC_LIKE: readonly Purpose[] = ['rpc', 'scan', 'read-address'];

/** Environment and capability requirements of a network profile for one purpose (profiles 7.4). */
export function profileRequirement(
  profile: NetProfileId,
  purpose: Purpose,
  ctx: Context,
): 'ok' | 'env' | 'cap' {
  const caps = ctx.capabilities;
  const side = RPC_LIKE.includes(purpose) ? 'rpc' : 'relayer';
  switch (profile) {
    case 'direct':
      return 'ok';
    case 'tor-browser':
      return ctx.env === 'node' ? 'env' : caps.has('tor-browser-asserted') ? 'ok' : 'cap';
    case 'tor-socks':
      return ctx.env !== 'node' ? 'env' : caps.has('tor-socks') ? 'ok' : 'cap';
    case 'onion':
      if (!(ctx.env === 'web-onion' || (ctx.env === 'node' && caps.has('tor-socks'))))
        return ctx.env === 'node' ? 'cap' : 'env';
      return caps.has(`onion-${side}`) ? 'ok' : 'cap';
    case 'i2p-outproxy':
      return ctx.env !== 'node' ? 'env' : caps.has('i2p-proxy') ? 'ok' : 'cap';
    case 'nym-mixfetch':
      return ctx.env !== 'web' ? 'env' : caps.has('nym-build') ? 'ok' : 'cap';
    case 'nym-socks5':
      return ctx.env !== 'node' ? 'env' : caps.has('nym-socks5') ? 'ok' : 'cap';
    case 'ohttp':
      return caps.has(`ohttp-gateway-${side}`) ? 'ok' : 'cap';
  }
}

/** Purposes used by the steps, with the step indices that use each. */
export function usedPurposes(steps: readonly NStep[]): Map<Purpose, number[]> {
  const m = new Map<Purpose, number[]>();
  for (const st of steps) {
    for (const p of st.def.purposes(st.params)) {
      const arr = m.get(p) ?? [];
      arr.push(st.index);
      m.set(p, arr);
    }
  }
  return m;
}

const e = (code: Issue['code'], key: string, steps: readonly number[], detail?: string): Issue => ({
  severity: 'error',
  code,
  key,
  steps,
  ...(detail === undefined ? {} : { detail }),
});

/** Shape check of the layers value (unknown purposes, profiles or modes). Total over `unknown`. */
export function checkLayerShape(L: unknown): Issue[] {
  const out: Issue[] = [];
  if (typeof L !== 'object' || L === null)
    return [e('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [], 'layers')];
  const rec = L as Record<string, unknown>;
  const t: unknown = rec['transport'];
  if (typeof t !== 'object' || t === null) {
    out.push(e('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [], 'transport'));
  } else {
    for (const [k, v] of Object.entries(t)) {
      if (!(PURPOSES as readonly string[]).includes(k) || !(NET_PROFILES as readonly unknown[]).includes(v)) {
        out.push(e('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [], `transport.${k}`));
      }
    }
  }
  const enums: [string, readonly string[]][] = [
    ['rpcMode', ['single', 'quorum', 'own-node', 'light-client']],
    ['scanMode', ['range', 'indexer-tor', 'pir2', 'light-client']],
    ['verification', ['address-free', 'direct']],
    ['isolation', ['per-step', 'per-purpose']],
  ];
  for (const [name, allowed] of enums) {
    const v = rec[name];
    if (typeof v !== 'string' || !allowed.includes(v))
      out.push(e('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [], name));
  }
  return out;
}

/**
 * Layer rules: L-1 (self-test, never fall back to direct), R-28 (environment), capability checks,
 * R-26/R-30 mode requirements, C-32 (relay-like party reached directly), isolation note (Q4).
 * Call {@link checkLayerShape} first; this assumes a well-shaped layers value.
 */
export function validateLayers(p: Pipeline, ctx: Context, used: Map<Purpose, number[]>): Issue[] {
  const out: Issue[] = [];
  const L = p.layers;
  const t: Readonly<Record<string, unknown>> = L.transport;
  for (const [purpose, steps] of used) {
    const profile = (t[purpose] as NetProfileId | undefined) ?? 'direct';
    if (profile === 'direct') {
      if (RELAY_LIKE.includes(purpose)) {
        out.push({
          severity: 'warn',
          code: 'WARN',
          key: 'privacy.warn.networkDirectToParty',
          ruleId: 'C-32',
          detail: purpose,
          steps,
        });
      }
      continue;
    }
    if (!ctx.selfTests.has(purpose)) out.push(e('E_SELFTEST', 'privacy.err.selfTestFailed', steps, purpose));
    const req = profileRequirement(profile, purpose, ctx);
    if (req === 'env') out.push(e('E_WRONG_ENV', 'privacy.err.wrongEnv', steps, `${purpose}:${profile}`));
    if (req === 'cap') out.push(e('E_CAPABILITY', `privacy.err.requires.cap.${profile}`, steps, purpose));
    if (profile.startsWith('nym'))
      out.push({ severity: 'warn', code: 'WARN', key: 'privacy.warn.experimental', detail: purpose, steps });
  }
  if (L.isolation === 'per-step' && Object.values(t).includes('tor-browser')) {
    out.push({ severity: 'warn', code: 'WARN', key: 'privacy.warn.chain.isolationUnenforced', steps: [] });
  }
  const scanTor = ['tor-browser', 'tor-socks', 'onion'].includes(
    (t['rpc'] as string | undefined) ?? 'direct',
  );
  if (L.scanMode === 'indexer-tor' && !scanTor)
    out.push(e('E_REQUIRES', 'privacy.err.requires.torForIndexer', [], 'scanMode'));
  const need: [boolean, string][] = [
    [L.rpcMode === 'quorum', 'multi-rpc'],
    [L.rpcMode === 'own-node', 'own-node'],
    [L.rpcMode === 'light-client' || L.scanMode === 'light-client', 'light-client'],
    [L.scanMode === 'indexer-tor', 'tor-indexer'],
    [L.scanMode === 'pir2', 'pir-servers'],
  ];
  for (const [cond, cap] of need)
    if (cond && !ctx.capabilities.has(cap))
      out.push(e('E_CAPABILITY', `privacy.err.requires.cap.${cap}`, [], cap));
  return out;
}
