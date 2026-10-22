import { isTestnetChain } from './guard.js';
import type { Context, ErrorCode, Issue, Pipeline, Selection } from './types.js';

/** Defaults of the options a pipeline can project to (profiles section 7). */
export const OPTION_DEFAULTS: Readonly<Record<string, string>> = {
  'pay.payerMode': 'direct',
  'pay.source': 'wallet',
  'pay.amountBlur': 'off',
  'pay.amountVisibility': 'public',
  'pay.route': 'router',
  'pay.amountNoise': 'off',
  'sweep.destination': 'self-derived',
  'sweep.exit': 'plain',
  'sweep.hops': '0',
  'sweep.hopRelayers': 'rotate',
  'sweep.exitGas': 'permit-sponsored',
  'sweep.poolAsp': 'none',
  'sweep.poolSubmit': 'relayer',
  'sweep.poolAmountPlan': 'denominations',
  'sweep.delay': 'off',
  'btc.mode': 'silent-payment',
  'btc.locktime': 'zero',
  'btc.contributeFromSp': 'off',
  'net.rpcProfile': 'direct',
  'net.relayerProfile': 'direct',
  'net.rpcMode': 'single',
  'net.scanMode': 'range',
};

const POOLS = ['privacy-pools', 'railgun', 'shielded-pool', 'mock-pool'];
const SPONSORED = ['permit-relay', 'eip7702-sponsored', 'erc4337-paymaster'];
const TOR = ['tor-browser', 'tor-socks', 'onion'];

interface ValueReq {
  readonly caps?: readonly string[];
  readonly chains?: readonly number[];
  readonly asset?: readonly string[];
}

/** Capability, chain and asset requirements per `option=value` (profiles section 7, derived index 8.2). */
export const VALUE_REQS: Readonly<Record<string, ValueReq>> = {
  'pay.payerMode=permit-relay': { caps: ['payer-sponsor'], asset: ['erc20-permit'] },
  'pay.payerMode=eip7702-sponsored': { caps: ['payer-sponsor', 'eip7702'] },
  'pay.payerMode=erc4337-paymaster': { caps: ['erc4337-entrypoint', 'erc4337-paymaster'] },
  'pay.source=shielded-pool': { caps: ['manifest:shielded-pool', 'pool-note', 'pool-relayer'] },
  'sweep.exit=privacy-pools': { caps: ['manifest:privacy-pools'] },
  'sweep.exit=railgun': { caps: ['manifest:railgun'] },
  'sweep.exit=shielded-pool': { caps: ['manifest:shielded-pool'] },
  'sweep.exitGas=eip7702': { caps: ['eip7702'] },
  'sweep.poolAsp=publisher': { caps: ['asp-publisher'] },
  'pay.amountVisibility=ct1-zama': { caps: ['manifest:confidential-ct1'], chains: [11155111] },
  'pay.amountVisibility=ct2-fhenix': { caps: ['manifest:confidential-ct2'] },
  'pay.amountVisibility=ct3-inco': { caps: ['manifest:confidential-ct3'], chains: [84532] },
  'pay.amountVisibility=ctm-cleartext': { chains: [31337] },
  'btc.mode=payjoin-v2': { caps: ['payjoin-directory', 'payjoin-ffi'] },
  'btc.mode=payjoin-v1': { caps: ['payjoin-v1-endpoint'] },
};

function issue(severity: Issue['severity'], code: Issue['code'], key: string, ruleId?: string): Issue {
  return { severity, code, key, ...(ruleId === undefined ? {} : { ruleId }), steps: [] };
}

/**
 * Local re-statement of the profile rules a pipeline projection can trigger (R-01..R-40 subset).
 * Rule data is defined here on purpose: this package imports no profile package (brief).
 *
 * Not evaluated here (not projected by pipelines): R-21, R-23..R-25, R-27, R-33, R-38 and invoice,
 * identity and announce options; the app runs its own profile evaluation for those.
 */
export function evaluateSelection(sel: Selection, ctx: Context, pipeline: Pipeline): readonly Issue[] {
  const out: Issue[] = [];
  const g = (k: string): string => sel[k] ?? OPTION_DEFAULTS[k] ?? '';
  const caps = ctx.capabilities;
  const hops = g('sweep.hops');
  const exitIsPool = POOLS.includes(g('sweep.exit'));
  const visibility = g('pay.amountVisibility');
  const ct = visibility !== 'public';
  const payerMode = g('pay.payerMode');
  const blur = g('pay.amountBlur');
  const asset = pipeline.asset;

  // R-01
  if (!isTestnetChain(pipeline.chain))
    out.push(issue('error', 'E_WRONG_CHAIN', 'privacy.err.wrongChain', 'R-01'));
  // R-03
  if ((g('sweep.exit') === 'mock-pool' || visibility === 'ctm-cleartext') && !ctx.testMode) {
    out.push(issue('error', 'E_TEST_MODE', 'privacy.err.testModeOnly', 'R-03'));
  }
  // R-04..R-07
  if (hops !== '0') out.push(issue('ack', 'ACK', 'privacy.ack.hopsWeak', 'R-04'));
  if (g('sweep.hopRelayers') === 'direct' && hops !== '0' && hops !== '1') {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.hopsDirectMulti', 'R-05'));
  }
  if (hops !== '0' && g('sweep.hopRelayers') !== 'direct' && !caps.has('sweep-relayer')) {
    out.push(issue('error', 'E_CAPABILITY', 'privacy.err.requires.sweepRelayer', 'R-06'));
  }
  if (hops !== '0' && asset !== 'erc20-permit')
    out.push(issue('error', 'E_WRONG_ASSET', 'privacy.err.hopsNoPermit', 'R-07'));
  // R-08, R-09
  if (hops !== '0' && exitIsPool)
    out.push(issue('warn', 'WARN', 'privacy.warn.hopsBeforePoolNoGain', 'R-08'));
  if (Number(hops) > 2 && exitIsPool)
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.hopsPoolMax2', 'R-09'));
  // R-10
  if (exitIsPool && g('sweep.destination') === 'external-reuse') {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.poolReuseDestination', 'R-10'));
  }
  // R-11
  if (asset === 'confidential' && (g('sweep.exit') !== 'plain' || hops !== '0')) {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.ctNoPoolOrHops', 'R-11'));
  }
  // R-12..R-16
  if (ct && payerMode !== 'direct')
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.ctPayerMode', 'R-12'));
  if (ct && g('pay.source') === 'shielded-pool')
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.ctPoolPay', 'R-13'));
  if (ct && (blur === 'split' || blur === 'denom'))
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.ctSplit', 'R-14'));
  if (ct && (blur === 'round' || g('pay.amountNoise') === 'on'))
    out.push(issue('warn', 'WARN', 'privacy.warn.mootCombination', 'R-15'));
  if (ct && g('pay.route') === 'direct-no-fee')
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.ctDirectPay', 'R-16'));
  // R-17..R-20, R-22
  if (g('pay.source') === 'shielded-pool' && payerMode !== 'direct') {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.poolPayPayerMode', 'R-17'));
  }
  if (g('pay.source') === 'shielded-pool' && ['round', 'split', 'denom'].includes(blur)) {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.poolPayBlur', 'R-18'));
  }
  if (g('pay.source') === 'shielded-pool' && g('pay.route') === 'direct-no-fee') {
    out.push(issue('warn', 'WARN', 'privacy.warn.mootCombination', 'R-19'));
  }
  if (g('pay.route') === 'direct-no-fee' && SPONSORED.includes(payerMode)) {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.directPaySponsored', 'R-20'));
  }
  if (g('pay.amountNoise') === 'on' && blur === 'round') {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.amountNoiseRound', 'R-22'));
  }
  // R-26 (network modes)
  const rpcMode = g('net.rpcMode');
  if (
    (rpcMode === 'quorum' && !caps.has('multi-rpc')) ||
    (rpcMode === 'own-node' && !caps.has('own-node')) ||
    (rpcMode === 'light-client' && !caps.has('light-client'))
  ) {
    out.push(issue('error', 'E_CAPABILITY', 'privacy.err.requires.multiEndpoint', 'R-26'));
  }
  // R-30
  if (g('net.scanMode') === 'indexer-tor' && !TOR.includes(g('net.rpcProfile'))) {
    out.push(issue('error', 'E_REQUIRES', 'privacy.err.requires.torForIndexer', 'R-30'));
  }
  // R-31 (relay-like party reached directly); per-party detail is added by the chain rule C-32.
  const relayLike =
    (hops !== '0' && g('sweep.hopRelayers') !== 'direct') ||
    SPONSORED.includes(payerMode) ||
    g('pay.source') === 'shielded-pool' ||
    (exitIsPool && g('sweep.poolSubmit') === 'relayer') ||
    ct ||
    g('btc.mode') === 'payjoin-v2';
  if (relayLike && g('net.relayerProfile') === 'direct')
    out.push(issue('warn', 'WARN', 'privacy.warn.networkDirectToParty', 'R-31'));
  // R-32
  if ((blur === 'split' || blur === 'denom') && SPONSORED.includes(payerMode)) {
    out.push(issue('warn', 'WARN', 'privacy.warn.sponsorSeesAllParts', 'R-32'));
  }
  // R-34
  if (g('sweep.exit') === 'privacy-pools' && g('sweep.exitGas') === 'permit-sponsored') {
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.ppDepositorMustBeS1', 'R-34'));
  }
  // R-35
  if (
    (g('sweep.poolAsp') === 'publisher' && g('sweep.exit') !== 'shielded-pool') ||
    (g('sweep.poolAmountPlan') !== 'denominations' && !exitIsPool)
  ) {
    out.push(issue('error', 'E_REQUIRES', 'privacy.err.requires.poolExit', 'R-35'));
  }
  // R-36, R-37
  const payjoin = g('btc.mode').startsWith('payjoin');
  if (payjoin && g('btc.locktime') === 'height')
    out.push(issue('error', 'E_CONFLICT', 'privacy.err.conflict.locktimePayjoin', 'R-36'));
  if (g('btc.contributeFromSp') === 'on' && !payjoin)
    out.push(issue('error', 'E_REQUIRES', 'privacy.err.requires.payjoin', 'R-37'));
  // R-39
  if (visibility === 'ct1-zama' && !caps.has('seller-accepts-ct')) {
    out.push(issue('error', 'E_CAPABILITY', 'privacy.err.requires.sellerCt', 'R-39'));
  }
  // R-40
  if (g('net.rpcProfile').startsWith('nym') || g('net.relayerProfile').startsWith('nym')) {
    out.push(issue('warn', 'WARN', 'privacy.warn.experimental', 'R-40'));
  }
  // implicit value requirements
  for (const [k, v] of Object.entries(sel)) {
    if (v === OPTION_DEFAULTS[k]) continue;
    const req = Object.prototype.hasOwnProperty.call(VALUE_REQS, `${k}=${v}`)
      ? VALUE_REQS[`${k}=${v}`]
      : undefined;
    if (req === undefined) continue;
    for (const c of req.caps ?? []) {
      if (!caps.has(c))
        out.push({ ...issue('error', 'E_CAPABILITY', `privacy.err.requires.cap.${c}`), detail: `${k}=${v}` });
    }
    if (
      req.chains !== undefined &&
      pipeline.chain.family === 'evm' &&
      !req.chains.includes(pipeline.chain.chainId)
    ) {
      out.push({ ...issue('error', 'E_WRONG_CHAIN', 'privacy.err.wrongChain'), detail: `${k}=${v}` });
    }
    if (req.asset !== undefined && !req.asset.includes(asset)) {
      out.push({ ...issue('error', 'E_WRONG_ASSET', 'privacy.err.wrongAsset'), detail: `${k}=${v}` });
    }
  }
  // exit gas via permit sponsor needs a permit token and a pool relayer (profiles 7.1), only on a pool exit
  if (exitIsPool && g('sweep.exitGas') === 'permit-sponsored') {
    if (asset !== 'erc20-permit')
      out.push({
        ...issue('error', 'E_WRONG_ASSET', 'privacy.err.wrongAsset'),
        detail: 'sweep.exitGas=permit-sponsored',
      });
    if (!caps.has('pool-relayer'))
      out.push({
        ...issue('error', 'E_CAPABILITY', 'privacy.err.requires.cap.pool-relayer'),
        detail: 'sweep.exitGas=permit-sponsored',
      });
  }
  return out;
}

export type { ErrorCode };
