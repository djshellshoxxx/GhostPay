/**
 * Online / offline / relay-reachability state machine.
 *
 * @security Pure reducer. Probe results are injected by the caller (which only ever probes endpoints
 * the user configured, on a user action). State never contains URLs, hosts or keys; endpoints are
 * identified by chain id or the literal `relayer`. Untrusted numbers in probe results are range-checked.
 */

export type RpcTarget = { readonly kind: 'rpc'; readonly chainId: number };
export type RelayerTarget = { readonly kind: 'relayer' };
export type ProbeTarget = RpcTarget | RelayerTarget;

export type FailReason = 'timeout' | 'network' | 'http' | 'chain-mismatch' | 'bad-response';

export type ProbeResult =
  | {
      readonly ok: true;
      readonly latencyMs: number;
      /** Latest block timestamp in seconds, RPC probes only. */
      readonly blockTimestampSec?: number;
    }
  | { readonly ok: false; readonly reason: FailReason };

export type Reachability = 'unknown' | 'reachable' | 'degraded' | 'unreachable' | 'stale';

export interface EndpointState {
  readonly reachability: Reachability;
  /** Consecutive failures since the last success; reset when the browser comes back online. */
  readonly failures: number;
  readonly lastProbeAtMs: number | undefined;
  readonly lastReason: FailReason | undefined;
  readonly latencyMs: number | undefined;
  /** local clock minus block timestamp, seconds (RPC only). */
  readonly clockSkewSec: number | undefined;
}

export interface NetConfig {
  /** Consecutive failures before "unreachable" (default 2). */
  readonly failThreshold: number;
  /** Latency above this is "degraded" (default 3000 ms). */
  readonly slowMs: number;
  /** Results older than this read as "stale" (default 300 000 ms). */
  readonly staleAfterMs: number;
  /** Clock skew beyond this (seconds) flags the clock (default 120). */
  readonly skewWarnSec: number;
}

export const DEFAULT_NET_CONFIG: NetConfig = Object.freeze({
  failThreshold: 2,
  slowMs: 3000,
  staleAfterMs: 300_000,
  skewWarnSec: 120,
});

export const MAX_TRACKED_CHAINS = 64;

export interface NetState {
  readonly browserOnline: boolean;
  readonly hasRelayerConfigured: boolean;
  readonly configuredChains: readonly number[];
  readonly rpc: Readonly<Record<number, EndpointState>>;
  readonly relayer: EndpointState;
  readonly config: NetConfig;
}

export type NetEvent =
  | { readonly type: 'browser-online' }
  | { readonly type: 'browser-offline' }
  | { readonly type: 'configure'; readonly chainsWithRpc: readonly number[]; readonly hasRelayer: boolean }
  | {
      readonly type: 'probe';
      readonly target: ProbeTarget;
      readonly result: ProbeResult;
      readonly atMs: number;
    };

export type Overall =
  'offline' | 'no-rpc' | 'rpc-down' | 'rpc-degraded' | 'relayer-down' | 'clock-skew' | 'ok' | 'unknown';

const EMPTY: EndpointState = Object.freeze({
  reachability: 'unknown',
  failures: 0,
  lastProbeAtMs: undefined,
  lastReason: undefined,
  latencyMs: undefined,
  clockSkewSec: undefined,
});

/** Signed clock skew in seconds: positive means the local clock is ahead of the chain. */
export function clockSkewSec(localNowMs: number, blockTimestampSec: number): number {
  return Math.round(localNowMs / 1000 - blockTimestampSec);
}

/** Creates the initial state. `browserOnline` is injected (e.g. from `navigator.onLine`). */
export function initNetState(browserOnline: boolean, config: Partial<NetConfig> = {}): NetState {
  return {
    browserOnline,
    hasRelayerConfigured: false,
    configuredChains: [],
    rpc: {},
    relayer: EMPTY,
    config: { ...DEFAULT_NET_CONFIG, ...config },
  };
}

const isChainId = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const isTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

function applyProbe(
  prev: EndpointState,
  result: ProbeResult,
  atMs: number,
  localNowMs: number,
  cfg: NetConfig,
  rpc: boolean,
): EndpointState {
  if (!result.ok) {
    const failures = prev.failures + 1;
    const down = failures >= cfg.failThreshold;
    return {
      reachability: down
        ? 'unreachable'
        : prev.reachability === 'unreachable'
          ? 'unreachable'
          : prev.reachability === 'reachable' || prev.reachability === 'degraded'
            ? prev.reachability
            : 'unknown',
      failures,
      lastProbeAtMs: atMs,
      lastReason: result.reason,
      latencyMs: undefined,
      clockSkewSec: undefined,
    };
  }
  // Untrusted numbers from a remote host: reject nonsense as a bad response.
  if (
    !isTime(result.latencyMs) ||
    (result.blockTimestampSec !== undefined && !isTime(result.blockTimestampSec))
  ) {
    return applyProbe(prev, { ok: false, reason: 'bad-response' }, atMs, localNowMs, cfg, rpc);
  }
  const skew =
    rpc && result.blockTimestampSec !== undefined
      ? clockSkewSec(localNowMs, result.blockTimestampSec)
      : undefined;
  return {
    reachability: result.latencyMs > cfg.slowMs ? 'degraded' : 'reachable',
    failures: 0,
    lastProbeAtMs: atMs,
    lastReason: undefined,
    latencyMs: result.latencyMs,
    clockSkewSec: skew,
  };
}

/**
 * Pure transition. While the browser is offline, probe failures are not counted (the network is the
 * cause, not the endpoint). Coming back online resets failure counters and marks results unknown so
 * the user re-checks.
 * @param nowMs Injected clock, used only for skew calculation.
 */
export function reduceNet(state: NetState, event: NetEvent, nowMs: number): NetState {
  switch (event.type) {
    case 'browser-offline':
      return { ...state, browserOnline: false };
    case 'browser-online': {
      const reset = (e: EndpointState): EndpointState => ({ ...e, failures: 0, reachability: 'unknown' });
      const rpc: Record<number, EndpointState> = {};
      for (const [k, v] of Object.entries(state.rpc)) rpc[Number(k)] = reset(v);
      return { ...state, browserOnline: true, rpc, relayer: reset(state.relayer) };
    }
    case 'configure': {
      const chains = [...new Set(event.chainsWithRpc.filter(isChainId))]
        .sort((a, b) => a - b)
        .slice(0, MAX_TRACKED_CHAINS);
      const rpc: Record<number, EndpointState> = {};
      for (const c of chains) rpc[c] = state.rpc[c] ?? EMPTY;
      return {
        ...state,
        configuredChains: chains,
        rpc,
        hasRelayerConfigured: event.hasRelayer,
        relayer: event.hasRelayer ? state.relayer : EMPTY,
      };
    }
    case 'probe': {
      const t = event.target;
      if (!isTime(event.atMs)) return state;
      if (!state.browserOnline && !event.result.ok) return state;
      if (t.kind === 'relayer') {
        if (!state.hasRelayerConfigured) return state;
        return {
          ...state,
          relayer: applyProbe(state.relayer, event.result, event.atMs, nowMs, state.config, false),
        };
      }
      if (!isChainId(t.chainId) || !state.configuredChains.includes(t.chainId)) return state;
      const prev = state.rpc[t.chainId] ?? EMPTY;
      return {
        ...state,
        rpc: {
          ...state.rpc,
          [t.chainId]: applyProbe(prev, event.result, event.atMs, nowMs, state.config, true),
        },
      };
    }
  }
}

/** Reachability as seen at `nowMs`: old results read as `stale`. */
export function effective(e: EndpointState, nowMs: number, cfg: NetConfig): Reachability {
  if (e.lastProbeAtMs === undefined) return e.reachability;
  if (e.reachability === 'unknown' || e.reachability === 'unreachable') return e.reachability;
  return nowMs - e.lastProbeAtMs > cfg.staleAfterMs ? 'stale' : e.reachability;
}

export interface NetSummary {
  readonly overall: Overall;
  /** Chains whose RPC is unreachable. */
  readonly rpcDown: readonly number[];
  readonly relayer: Reachability | 'not-configured';
  /** Matching ux-errors code for the overall state, if any. */
  readonly errorCode:
    'OFFLINE' | 'NO_RPC' | 'RPC_UNREACHABLE' | 'RELAYER_UNREACHABLE' | 'CLOCK_SKEW' | undefined;
}

/** Collapses state to one banner-level answer. Priority: offline, no RPC, RPC down, degraded, relayer, clock. */
export function summarize(state: NetState, nowMs: number): NetSummary {
  const cfg = state.config;
  const rpcDown = state.configuredChains.filter(
    (c) => effective(state.rpc[c] ?? EMPTY, nowMs, cfg) === 'unreachable',
  );
  const relayer = state.hasRelayerConfigured ? effective(state.relayer, nowMs, cfg) : 'not-configured';
  const mk = (overall: Overall, errorCode: NetSummary['errorCode']): NetSummary => ({
    overall,
    rpcDown,
    relayer,
    errorCode,
  });
  if (!state.browserOnline) return mk('offline', 'OFFLINE');
  if (state.configuredChains.length === 0) return mk('no-rpc', 'NO_RPC');
  if (rpcDown.length > 0) return mk('rpc-down', 'RPC_UNREACHABLE');
  const states = state.configuredChains.map((c) => state.rpc[c] ?? EMPTY);
  if (states.some((e) => effective(e, nowMs, cfg) === 'degraded')) return mk('rpc-degraded', undefined);
  if (relayer === 'unreachable') return mk('relayer-down', 'RELAYER_UNREACHABLE');
  if (states.some((e) => e.clockSkewSec !== undefined && Math.abs(e.clockSkewSec) > cfg.skewWarnSec))
    return mk('clock-skew', 'CLOCK_SKEW');
  if (states.every((e) => e.reachability === 'unknown') && relayer !== 'reachable')
    return mk('unknown', undefined);
  return mk('ok', undefined);
}

/**
 * Exponential backoff for a user-confirmed retry loop. Jitter is injected (`jitter01` in [0,1)).
 * @security No timers here; the caller owns scheduling and must not auto-probe without user action.
 */
export function backoffMs(failures: number, jitter01: number, baseMs = 2000, maxMs = 60_000): number {
  const n = Math.max(0, Math.min(30, Math.floor(Number.isFinite(failures) ? failures : 0)));
  const j = Math.min(0.999999, Math.max(0, Number.isFinite(jitter01) ? jitter01 : 0));
  const cap = Math.min(maxMs, baseMs * 2 ** n);
  return Math.floor(cap / 2 + (cap / 2) * j);
}
