/**
 * Presets as ordered preference lists. First acceptable value wins; the last entry is always the option default.
 * @security Presets never enable hops, never pick experimental, test-only, stub or watch values, never change the Bitcoin mode.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { deepFreeze } from './freeze.js';
import { OPTION_IDS } from './types.js';
import type { OptionId, PresetDef, PresetId } from './types.js';

type Prefs = Partial<Record<OptionId, readonly string[]>>;

function mk(id: PresetId, order: readonly OptionId[], raw: Prefs): PresetDef {
  const prefer: Partial<Record<OptionId, readonly string[]>> = {};
  for (const opt of OPTION_IDS) {
    const list = raw[opt];
    if (!list) continue;
    const d = OPTION_CATALOGUE[opt].defaultValue;
    prefer[opt] = list[list.length - 1] === d ? list : [...list, d];
  }
  return { id, order: [...new Set(order)], prefer };
}

const BASE: Prefs = {
  'sweep.destination': ['self-derived'],
  'sweep.verification': ['address-free'],
  'sweep.dust': ['on'],
  'sweep.knownWalletGuard': ['on'],
  'sweep.delay': ['off'],
  'sweep.exit': ['plain'],
  'sweep.exitGas': ['buffer'],
  'pay.payerMode': ['direct'],
  'pay.source': ['wallet'],
  'pay.amountBlur': ['off'],
  'pay.amountVisibility': ['public'],
  'pay.bufferRounding': ['grid125'],
  'invoice.encrypt': ['on'],
  'invoice.coarseTime': ['on'],
  'invoice.padding': ['off'],
  'invoice.quoteRounding': ['on'],
  'identity.perChainKeys': ['off'],
  'identity.perInvoiceMeta': ['off'],
  'net.rpcProfile': ['direct'],
  'net.relayerProfile': ['direct'],
  'net.rpcMode': ['single'],
  'net.endpointSeparation': ['off'],
  'net.scanMode': ['range'],
  'net.scanAlign': ['on'],
  'relayer.multi': ['off'],
  'btc.mode': ['silent-payment'],
  'btc.change': ['on'],
  'btc.rbf': ['on'],
  'btc.ordering': ['bip69', 'caller'],
  'btc.feeRateNormalise': ['off'],
  'btc.psbtStrip': ['off'],
};

const ENHANCED: Prefs = {
  ...BASE,
  'sweep.delay': ['jitter', 'off'],
  'pay.payerMode': ['fresh-wallet', 'direct'],
  'pay.amountBlur': ['round', 'delay', 'off'],
  'invoice.padding': ['on', 'off'],
  'identity.perChainKeys': ['on', 'off'],
  'net.rpcProfile': ['tor-browser', 'onion', 'direct'],
  'net.relayerProfile': ['tor-browser', 'onion', 'direct'],
  'net.rpcMode': ['quorum', 'single'],
  'net.endpointSeparation': ['on', 'off'],
  'net.scanMode': ['indexer-tor', 'range'],
  'relayer.multi': ['on', 'off'],
  'btc.feeRateNormalise': ['on', 'off'],
};

const MAXIMUM: Prefs = {
  ...ENHANCED,
  'sweep.exit': ['privacy-pools', 'railgun', 'shielded-pool', 'plain'],
  'sweep.exitGas': ['eip7702', 'permit-sponsored', 'buffer'],
  'sweep.poolAmountPlan': ['denominations'],
  'pay.payerMode': ['eip7702-sponsored', 'erc4337-paymaster', 'permit-relay', 'fresh-wallet', 'direct'],
  'pay.source': ['shielded-pool', 'wallet'],
  'pay.amountBlur': ['denom', 'round', 'delay', 'off'],
  'identity.perInvoiceMeta': ['on', 'off'],
  'net.rpcProfile': ['tor-browser', 'tor-socks', 'onion', 'ohttp', 'direct'],
  'net.relayerProfile': ['tor-browser', 'tor-socks', 'onion', 'ohttp', 'direct'],
  'net.scanMode': ['pir2', 'indexer-tor', 'range'],
  'btc.psbtStrip': ['on', 'off'],
};

const CONFIDENTIAL: Prefs = {
  ...ENHANCED,
  'pay.amountVisibility': ['ct1-zama', 'ct3-inco', 'ct2-fhenix', 'public'],
  'pay.amountBlur': ['delay', 'off'],
};

/**
 * Shielded (issue 284, F18): the pool track only. Same pool preferences as `maximum` for the exit, amount plan and pool
 * payment source, with buffer-funded exit gas and none of its network hardening, payer sponsors or amount splitting.
 * Rules R-11 and R-13 keep confidential amounts in their separate track. Selected policy D04/D05 is recorded in
 * docs/handoffs/PR644_CONFIGURATION_DECISIONS_20261124.md. Advanced gas values remain explicit, validated edits;
 * buffer funding does not remove a pool submitter's consent requirements or establish privacy qualification.
 */
const SHIELDED: Prefs = {
  ...BASE,
  'sweep.exit': ['privacy-pools', 'railgun', 'shielded-pool', 'plain'],
  'sweep.exitGas': ['buffer'],
  'sweep.poolAmountPlan': ['denominations'],
  'pay.source': ['shielded-pool', 'wallet'],
  'pay.amountBlur': ['delay', 'off'],
};

/** The five presets, in display order. Deeply frozen: a preset cannot be edited at run time. */
export const PRESETS: Readonly<Record<PresetId, PresetDef>> = deepFreeze({
  standard: mk('standard', OPTION_IDS, BASE),
  enhanced: mk('enhanced', OPTION_IDS, ENHANCED),
  shielded: mk('shielded', ['sweep.exit', 'sweep.exitGas', 'pay.source', 'pay.amountBlur', ...OPTION_IDS], SHIELDED),
  maximum: mk(
    'maximum',
    ['sweep.exit', 'sweep.exitGas', 'pay.source', 'pay.payerMode', 'pay.amountBlur', 'net.rpcProfile', 'net.relayerProfile', 'net.rpcMode', 'net.endpointSeparation', 'net.scanMode', ...OPTION_IDS],
    MAXIMUM,
  ),
  'confidential-amount': mk('confidential-amount', ['pay.amountVisibility', ...OPTION_IDS], CONFIDENTIAL),
});
