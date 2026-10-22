/**
 * Step catalogue for pipelines (chaining spec section 3). Data and pure projections only: no executor here.
 * @security Projection sets only the options that describe the payment or sweep transaction of that step.
 */
import type { AssetKind, Maturity, OptionId, Pred, SpecRef } from './types.js';

/** Step kinds. */
export type StepKind =
  | 'src.wallet' | 'payer.fresh-wallet' | 'ct.wrap' | 'amount.shape' | 'pool.deposit' | 'pool.dwell'
  | 'pay.submit' | 'pay.from-pool' | 'recv.stealth' | 'sweep.delay' | 'hops.forward' | 'hygiene.sweep'
  | 'pool.exit' | 'ct.sweep' | 'ct.unwrap' | 'btc.send' | 'btc.recv' | 'btc.payjoin-contribute';

/** Pool reference. */
export type PoolRef = 'shielded-pool' | 'privacy-pools' | 'railgun' | 'mock-pool';
/** Typed value held between steps. */
export type Holding =
  | { readonly t: 'payer-funds'; readonly wallet: 'long-lived' | 'fresh'; readonly asset: AssetKind }
  | { readonly t: 'payment-plan'; readonly parts: number; readonly asset: AssetKind }
  | { readonly t: 'note'; readonly pool: PoolRef; readonly asset: AssetKind; readonly holder: 'payer' | 'seller' }
  | { readonly t: 'stealth'; readonly asset: AssetKind; readonly origin: 'router' | 'pool' | 'confidential-router' | 'hop' }
  | { readonly t: 'owned'; readonly asset: AssetKind; readonly origin: 'self-derived' | 'external' | 'pool-exit' }
  | { readonly t: 'paid' }
  | { readonly t: 'btc-utxo'; readonly kind: 'sp' | 'payjoin-addr' | 'plain' };

/** Network purposes a step uses. */
export type Purpose =
  | 'rpc' | 'scan' | 'read-address' | 'relayer' | 'sponsor' | 'pool-relayer' | 'decrypt-relayer' | 'payjoin-directory';

/** Pattern over holdings. */
export type HoldingPattern = { readonly t: Holding['t'] } & Partial<
  Record<'asset' | 'origin' | 'holder' | 'wallet' | 'kind', readonly string[]>
>;
/** Step parameters. */
export type StepParams = Readonly<Record<string, string | number | boolean>>;
/** Closed parameter schema: unknown key is rejected by the validator. */
export type ParamSchema = Readonly<Record<string, { readonly values?: readonly (string | number | boolean)[]; readonly type: 'enum' | 'number' | 'boolean' }>>;

/** Step definition. */
export interface StepDef {
  readonly kind: StepKind;
  readonly role: 'payer' | 'seller' | 'both';
  readonly accepts: readonly HoldingPattern[];
  readonly produces: HoldingPattern;
  readonly fan: 'one' | 'many';
  readonly waits: boolean;
  readonly purposes: readonly Purpose[];
  readonly params: ParamSchema;
  readonly project: (p: StepParams) => Partial<Record<OptionId, string>>;
  readonly specRef: SpecRef;
  readonly maturity: Maturity;
}

const str = (p: StepParams, k: string, d: string): string => {
  const v = p[k];
  return typeof v === 'string' ? v : d;
};
const en = (...values: string[]): ParamSchema[string] => ({ type: 'enum', values });
const NONE: ParamSchema = {};
const ANY_ASSET = ['erc20', 'erc20-permit', 'native', 'confidential'];
const none = (): Partial<Record<OptionId, string>> => ({});

/** All step kinds, with typed inputs and outputs and projection to profile options. */
export const STEP_CATALOGUE: Readonly<Record<StepKind, StepDef>> = {
  'src.wallet': { kind: 'src.wallet', role: 'payer', accepts: [], produces: { t: 'payer-funds', wallet: ['long-lived'] }, fan: 'one', waits: false, purposes: [], params: NONE, project: () => ({ 'pay.payerMode': 'direct' }), specRef: { file: 'payer-hiding.md', ids: ['PH-0'] }, maturity: 'existing' },
  'payer.fresh-wallet': { kind: 'payer.fresh-wallet', role: 'payer', accepts: [{ t: 'payer-funds', wallet: ['long-lived'] }], produces: { t: 'payer-funds', wallet: ['fresh'] }, fan: 'one', waits: true, purposes: ['rpc'], params: NONE, project: () => ({ 'pay.payerMode': 'fresh-wallet' }), specRef: { file: 'payer-hiding.md', ids: ['PH-1'] }, maturity: 'poc' },
  'ct.wrap': { kind: 'ct.wrap', role: 'payer', accepts: [{ t: 'payer-funds', asset: ['erc20', 'erc20-permit'] }], produces: { t: 'payer-funds', asset: ['confidential'] }, fan: 'one', waits: true, purposes: ['rpc'], params: { backend: en('ct1-zama', 'ct2-fhenix', 'ct3-inco', 'ctm-cleartext') }, project: (p) => ({ 'pay.amountVisibility': str(p, 'backend', 'ct1-zama') }), specRef: { file: 'confidential-tokens.md', ids: ['CT-1', 'CT-UX-4'] }, maturity: 'poc' },
  'amount.shape': { kind: 'amount.shape', role: 'payer', accepts: [{ t: 'payer-funds' }], produces: { t: 'payment-plan' }, fan: 'one', waits: false, purposes: [], params: { mode: en('round', 'split', 'denom', 'delay'), noise: { type: 'boolean' } }, project: (p) => ({ 'pay.amountBlur': str(p, 'mode', 'off'), ...(p['noise'] === true ? { 'pay.amountNoise': 'on' } : {}) }), specRef: { file: 'amount-blurring.md', ids: ['AB-ROUND', 'AB-SPLIT', 'AB-DENOM', 'AB-DELAY'] }, maturity: 'poc' },
  'pool.deposit': { kind: 'pool.deposit', role: 'both', accepts: [{ t: 'payer-funds' }, { t: 'stealth' }], produces: { t: 'note' }, fan: 'many', waits: false, purposes: ['rpc', 'pool-relayer'], params: { pool: en('shielded-pool', 'privacy-pools', 'railgun', 'mock-pool'), role: en('payer', 'seller'), plan: en('denominations', 'whole'), gas: en('buffer', 'permit-sponsored', 'topup', 'eip7702'), payerMode: en('direct', 'fresh-wallet', 'permit-relay') }, project: (p) => (str(p, 'role', 'seller') === 'payer' ? none() : { 'sweep.exit': str(p, 'pool', 'shielded-pool'), 'sweep.poolAmountPlan': str(p, 'plan', 'denominations'), 'sweep.exitGas': str(p, 'gas', 'buffer') }), specRef: { file: 'shielded-pool.md', ids: ['SP-EXIT', 'SP-PAY', 'SP-SDK-8'] }, maturity: 'poc' },
  'pool.dwell': { kind: 'pool.dwell', role: 'both', accepts: [{ t: 'note' }], produces: { t: 'note' }, fan: 'one', waits: true, purposes: ['scan'], params: NONE, project: none, specRef: { file: 'shielded-pool.md', ids: ['SP-ASP'] }, maturity: 'poc' },
  'pay.submit': { kind: 'pay.submit', role: 'payer', accepts: [{ t: 'payer-funds' }, { t: 'payment-plan' }], produces: { t: 'paid' }, fan: 'one', waits: true, purposes: ['rpc', 'sponsor'], params: { payerMode: en('direct', 'fresh-wallet', 'permit-relay', 'eip7702-sponsored', 'erc4337-paymaster'), route: en('router', 'direct-no-fee', 'accrual'), amountVisibility: en('public', 'ct1-zama', 'ct2-fhenix', 'ct3-inco', 'ctm-cleartext') }, project: (p) => ({ 'pay.payerMode': str(p, 'payerMode', 'direct'), 'pay.route': str(p, 'route', 'router') === 'accrual' ? 'router' : str(p, 'route', 'router'), 'pay.amountVisibility': str(p, 'amountVisibility', 'public') }), specRef: { file: 'payer-hiding.md', ids: ['PH-0', 'PH-1', 'PH-2', 'PH-3', 'PH-4'] }, maturity: 'poc' },
  'pay.from-pool': { kind: 'pay.from-pool', role: 'payer', accepts: [{ t: 'note', holder: ['payer'] }], produces: { t: 'paid' }, fan: 'one', waits: false, purposes: ['pool-relayer'], params: NONE, project: () => ({ 'pay.source': 'shielded-pool' }), specRef: { file: 'shielded-pool.md', ids: ['SP-PAY'] }, maturity: 'poc' },
  'recv.stealth': { kind: 'recv.stealth', role: 'seller', accepts: [], produces: { t: 'stealth' }, fan: 'one', waits: false, purposes: ['scan'], params: { origin: en('router', 'pool', 'confidential-router') }, project: none, specRef: { file: 'hygiene.md', ids: ['HY-VER'] }, maturity: 'existing' },
  'sweep.delay': { kind: 'sweep.delay', role: 'seller', accepts: [{ t: 'stealth' }], produces: { t: 'stealth' }, fan: 'one', waits: true, purposes: [], params: NONE, project: () => ({ 'sweep.delay': 'jitter' }), specRef: { file: 'amount-blurring.md', ids: ['AB-DELAY'] }, maturity: 'poc' },
  'hops.forward': { kind: 'hops.forward', role: 'seller', accepts: [{ t: 'stealth', asset: ['erc20-permit'] }], produces: { t: 'stealth', origin: ['hop'] }, fan: 'one', waits: true, purposes: ['relayer'], params: { hops: { type: 'number', values: [1, 2, 3, 4] }, relayers: en('rotate', 'same', 'direct') }, project: (p) => ({ 'sweep.hops': String(typeof p['hops'] === 'number' ? p['hops'] : 1), 'sweep.hopRelayers': str(p, 'relayers', 'rotate') }), specRef: { file: 'hops.md', ids: ['HOP-N'] }, maturity: 'poc' },
  'hygiene.sweep': { kind: 'hygiene.sweep', role: 'seller', accepts: [{ t: 'stealth', asset: ['erc20', 'erc20-permit', 'native'] }], produces: { t: 'owned', origin: ['self-derived', 'external'] }, fan: 'one', waits: false, purposes: ['relayer', 'rpc'], params: { destination: en('self-derived', 'external-fresh', 'external-reuse'), verification: en('address-free', 'direct') }, project: (p) => ({ 'sweep.destination': str(p, 'destination', 'self-derived'), 'sweep.verification': str(p, 'verification', 'address-free') }), specRef: { file: 'hygiene.md', ids: ['HY-DST', 'HY-VER', 'HY-BUF', 'HY-FUND'] }, maturity: 'poc' },
  'pool.exit': { kind: 'pool.exit', role: 'seller', accepts: [{ t: 'note', holder: ['seller'] }], produces: { t: 'owned', origin: ['pool-exit'] }, fan: 'many', waits: true, purposes: ['pool-relayer'], params: { poolSubmit: en('relayer', 'self'), poolAsp: en('none', 'publisher'), destination: en('self-derived', 'external-fresh', 'external-reuse') }, project: (p) => ({ 'sweep.poolSubmit': str(p, 'poolSubmit', 'relayer'), 'sweep.poolAsp': str(p, 'poolAsp', 'none'), 'sweep.destination': str(p, 'destination', 'self-derived') }), specRef: { file: 'shielded-pool.md', ids: ['SP-EXIT'] }, maturity: 'poc' },
  'ct.sweep': { kind: 'ct.sweep', role: 'seller', accepts: [{ t: 'stealth', asset: ['confidential'] }], produces: { t: 'owned', origin: ['self-derived'] }, fan: 'one', waits: false, purposes: ['rpc', 'decrypt-relayer'], params: NONE, project: none, specRef: { file: 'confidential-tokens.md', ids: ['CT-DEC-2'] }, maturity: 'poc' },
  'ct.unwrap': { kind: 'ct.unwrap', role: 'seller', accepts: [{ t: 'stealth', asset: ['confidential'] }], produces: { t: 'stealth', asset: ['erc20'] }, fan: 'one', waits: false, purposes: ['rpc'], params: NONE, project: none, specRef: { file: 'confidential-tokens.md', ids: ['CT-DEC-2'] }, maturity: 'poc' },
  'btc.send': { kind: 'btc.send', role: 'payer', accepts: [{ t: 'btc-utxo' }], produces: { t: 'paid' }, fan: 'one', waits: false, purposes: ['rpc', 'payjoin-directory'], params: { mode: en('silent-payment', 'plain', 'payjoin-v2', 'payjoin-v1') }, project: (p) => ({ 'btc.mode': str(p, 'mode', 'silent-payment') }), specRef: { file: 'btc-payjoin.md', ids: ['BPJ-SND'] }, maturity: 'poc' },
  'btc.recv': { kind: 'btc.recv', role: 'seller', accepts: [], produces: { t: 'btc-utxo', kind: ['sp', 'payjoin-addr', 'plain'] }, fan: 'one', waits: false, purposes: ['payjoin-directory'], params: { mode: en('silent-payment', 'plain', 'payjoin-v2', 'payjoin-v1') }, project: (p) => ({ 'btc.mode': str(p, 'mode', 'silent-payment') }), specRef: { file: 'btc-payjoin.md', ids: ['BPJ-RCV-1'] }, maturity: 'poc' },
  'btc.payjoin-contribute': { kind: 'btc.payjoin-contribute', role: 'seller', accepts: [{ t: 'btc-utxo', kind: ['sp'] }], produces: { t: 'btc-utxo', kind: ['payjoin-addr'] }, fan: 'one', waits: false, purposes: ['payjoin-directory'], params: NONE, project: () => ({ 'btc.contributeFromSp': 'on' }), specRef: { file: 'btc-payjoin.md', ids: ['BPJ-RCV-9'] }, maturity: 'poc' },
};

/** Asset kinds a step may handle (helper for validators). */
export const STEP_ASSETS: readonly string[] = ANY_ASSET;
export type { Pred };
