import { defaultLayers, newPipeline } from './build.js';
import type { ChainRef } from './guard.js';
import type { AssetKind, Context, Pipeline, PipelineLayers, Role, Step } from './types.js';

export const SEPOLIA: ChainRef = { family: 'evm', chainId: 11155111 };
export const ANVIL: ChainRef = { family: 'evm', chainId: 31337 };
export const BASE_SEPOLIA: ChainRef = { family: 'evm', chainId: 84532 };
export const BTC_SIGNET: ChainRef = { family: 'btc', network: 'signet' };

export const ALL_CAPS: readonly string[] = [
  'sweep-relayer',
  'payer-sponsor',
  'eip7702',
  'erc4337-entrypoint',
  'erc4337-paymaster',
  'manifest:shielded-pool',
  'manifest:privacy-pools',
  'manifest:railgun',
  'pool-note',
  'pool-relayer',
  'asp-publisher',
  'manifest:confidential-ct1',
  'manifest:confidential-ct2',
  'manifest:confidential-ct3',
  'seller-accepts-ct',
  'payjoin-directory',
  'payjoin-ffi',
  'payjoin-v1-endpoint',
  'multi-rpc',
  'own-node',
  'light-client',
  'tor-indexer',
  'pir-servers',
  'tor-browser-asserted',
  'tor-socks',
  'onion-rpc',
  'onion-relayer',
  'i2p-proxy',
  'nym-build',
  'nym-socks5',
  'ohttp-gateway-rpc',
  'ohttp-gateway-relayer',
];

export function ctx(
  over: Partial<Context> & { caps?: readonly string[]; self?: readonly string[] } = {},
): Context {
  const { caps, self, ...rest } = over;
  return {
    env: 'node',
    capabilities: new Set(caps ?? []),
    testMode: false,
    selfTests: new Set((self ?? []) as never[]),
    ...rest,
  };
}

export const fullCtx = (over: Partial<Context> = {}): Context => ctx({ caps: ALL_CAPS, ...over });

export function pipe(
  role: Role,
  steps: readonly Step[],
  o: {
    asset?: AssetKind;
    chain?: ChainRef;
    layers?: Partial<PipelineLayers>;
    id?: string;
    ctBackend?: 'ct1-zama' | 'ct3-inco' | 'ct2-fhenix' | 'ctm-cleartext';
    invoiceGross?: string;
  } = {},
): Pipeline {
  const base = newPipeline({
    id: o.id ?? 'p1',
    role,
    chain: o.chain ?? SEPOLIA,
    asset: o.asset ?? 'erc20-permit',
    steps,
    ...(o.ctBackend === undefined ? {} : { ctBackend: o.ctBackend }),
    ...(o.invoiceGross === undefined ? {} : { invoiceGross: o.invoiceGross }),
  });
  return { ...base, layers: { ...defaultLayers(), ...o.layers } };
}

const s = (kind: Step['kind'], params?: Step['params']): Step =>
  params === undefined ? { kind } : { kind, params };
export { s as step };

/** The user's chain from chaining spec 3.5, payer side. */
export const PAYER_3_5: readonly Step[] = [
  s('src.wallet'),
  s('payer.fresh-wallet'),
  s('amount.shape', { mode: 'denom', parts: 1 }),
  s('pool.deposit', { pool: 'shielded-pool', n: 1 }),
  s('pool.dwell'),
  s('pay.from-pool'),
];
/** Seller side of 3.5. */
export const SELLER_3_5: readonly Step[] = [s('recv.stealth', { origin: 'pool' }), s('hygiene.sweep')];
