import { describe, expect, it } from 'vitest';
import { PipelineError } from './errors.js';
import { ALL_CAPS, ANVIL, BASE_SEPOLIA, BTC_SIGNET, SEPOLIA, ctx, fullCtx } from './fixtures.testutil.js';
import { templateFor, type PresetId } from './presets.js';
import { COMMON_SHAPES } from './summary.js';
import type { ChainRef } from './guard.js';
import type { Context, Env, Purpose, Role } from './types.js';
import { validate } from './validate.js';

const PRESETS: PresetId[] = ['standard', 'enhanced', 'maximum', 'confidential-amount'];
const ROLES: Role[] = ['payer', 'seller'];
const CHAINS: ChainRef[] = [ANVIL, SEPOLIA, BASE_SEPOLIA, BTC_SIGNET, { family: 'btc', network: 'regtest' }];
const ENVS: Env[] = ['web', 'web-onion', 'node'];
const POOL_CAPS = [
  'manifest:shielded-pool',
  'manifest:privacy-pools',
  'manifest:railgun',
  'pool-note',
  'pool-relayer',
  'payer-sponsor',
  'eip7702',
  'erc4337-entrypoint',
  'erc4337-paymaster',
];
const CT_CAPS = [
  'manifest:confidential-ct1',
  'manifest:confidential-ct3',
  'manifest:confidential-ct2',
  'seller-accepts-ct',
];
const NET_CAPS = [
  'tor-browser-asserted',
  'tor-socks',
  'onion-rpc',
  'onion-relayer',
  'multi-rpc',
  'tor-indexer',
  'pir-servers',
  'ohttp-gateway-rpc',
  'ohttp-gateway-relayer',
  'sweep-relayer',
];
const CAP_POOL = [...POOL_CAPS, ...CT_CAPS, ...NET_CAPS];
const ALL_PURPOSES: Purpose[] = [
  'rpc',
  'scan',
  'read-address',
  'relayer',
  'sponsor',
  'pool-relayer',
  'decrypt-relayer',
  'payjoin-directory',
];

function capSubsets(): string[][] {
  const out: string[][] = [
    [],
    [...ALL_CAPS],
    [...POOL_CAPS],
    [...CT_CAPS],
    [...NET_CAPS],
    [...POOL_CAPS.slice(0, 5), ...NET_CAPS],
    [...CT_CAPS, ...NET_CAPS],
  ];
  for (let i = 0; i < CAP_POOL.length; i++) {
    out.push([CAP_POOL[i] as string]);
    for (let j = i + 1; j < CAP_POOL.length; j++) out.push([CAP_POOL[i] as string, CAP_POOL[j] as string]);
  }
  return out;
}

describe('presets (PL-11, PP-12)', () => {
  const subsets = capSubsets();
  it('every template validates ok (modulo acks) for every generated context', () => {
    let n = 0;
    for (const chain of CHAINS) {
      for (const env of ENVS) {
        for (const caps of subsets) {
          for (const self of [[] as Purpose[], ALL_PURPOSES]) {
            const c: Context = {
              env,
              capabilities: new Set(caps),
              testMode: false,
              selfTests: new Set(self),
            };
            for (const preset of PRESETS) {
              for (const role of ROLES) {
                const { pipeline } = templateFor(preset, role, c, { chain, asset: 'erc20-permit' });
                const v = validate(pipeline, c);
                if (!v.ok)
                  throw new Error(
                    `${preset}/${role} ${JSON.stringify(chain)} ${env} [${caps.join(',')}] self=${self.length}: ${JSON.stringify(v.blocking)}`,
                  );
                n += 1;
              }
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(10_000);
  }, 120_000);

  it('templates never contain hops, unwrap, payjoin or a second pool, and use only common shapes', () => {
    for (const caps of [[], ALL_CAPS]) {
      for (const preset of PRESETS) {
        for (const role of ROLES) {
          const { pipeline } = templateFor(
            preset,
            role,
            fullCtx({ capabilities: new Set(caps), selfTests: new Set(ALL_PURPOSES) }),
            { chain: SEPOLIA, asset: 'erc20-permit' },
          );
          const kinds = pipeline.steps.map((x) => x.kind);
          expect(kinds).not.toContain('hops.forward');
          expect(kinds).not.toContain('ct.unwrap');
          expect(kinds).not.toContain('btc.payjoin-contribute');
          expect(kinds.filter((k) => k === 'pool.deposit').length).toBeLessThanOrEqual(1);
          expect(JSON.stringify(pipeline)).not.toContain('payjoin');
          expect(COMMON_SHAPES.some((s) => s.join('>') === kinds.join('>'))).toBe(true);
        }
      }
    }
  });
  it('maximum with every capability picks pools; its seller never sweeps after exit (T-3)', () => {
    const c = fullCtx({ selfTests: new Set(ALL_PURPOSES), env: 'web' });
    const payer = templateFor('maximum', 'payer', c, { chain: SEPOLIA, asset: 'erc20-permit' });
    expect(payer.pipeline.steps.map((x) => x.kind)).toEqual([
      'src.wallet',
      'payer.fresh-wallet',
      'amount.shape',
      'pool.deposit',
      'pool.dwell',
      'pay.from-pool',
    ]);
    expect(payer.downgrades).toEqual([]);
    const seller = templateFor('maximum', 'seller', c, { chain: SEPOLIA, asset: 'erc20-permit' });
    expect(seller.pipeline.steps.map((x) => x.kind)).toEqual([
      'recv.stealth',
      'pool.deposit',
      'pool.dwell',
      'pool.exit',
    ]);
    expect(seller.pipeline.steps[1]?.params).toMatchObject({ pool: 'privacy-pools', exitGas: 'eip7702' });
    expect(seller.pipeline.layers.transport.rpc).toBe('tor-browser');
    expect(seller.pipeline.layers.scanMode).toBe('pir2');
  });
  it('without capabilities maximum degrades step by step and records each downgrade', () => {
    const p = templateFor('maximum', 'payer', ctx(), { chain: SEPOLIA, asset: 'erc20-permit' });
    expect(p.pipeline.steps.map((x) => x.kind)).toEqual([
      'src.wallet',
      'payer.fresh-wallet',
      'amount.shape',
      'pay.submit',
    ]);
    expect(p.downgrades[0]).toMatchObject({ option: 'steps', wanted: 'pool' });
    const q = templateFor('maximum', 'seller', ctx(), { chain: SEPOLIA, asset: 'erc20-permit' });
    expect(q.pipeline.steps.map((x) => x.kind)).toEqual(['recv.stealth', 'sweep.delay', 'hygiene.sweep']);
  });
  it('failing self-tests never produce non-direct transport', () => {
    const c = fullCtx({ selfTests: new Set(), env: 'web' });
    const t = templateFor('enhanced', 'seller', c, { chain: SEPOLIA, asset: 'erc20-permit' });
    expect(t.pipeline.layers.transport).toEqual({});
    expect(t.downgrades.some((d) => d.option.startsWith('transport.'))).toBe(true);
    expect(t.downgrades.some((d) => d.option === 'scanMode')).toBe(true);
  });
  it('confidential-amount uses a backend and ct.sweep; falls back without manifests', () => {
    const c = fullCtx({ selfTests: new Set(ALL_PURPOSES) });
    const payer = templateFor('confidential-amount', 'payer', c, { chain: SEPOLIA, asset: 'erc20' });
    expect(payer.pipeline.steps.map((x) => x.kind)).toEqual(['src.wallet', 'ct.wrap', 'pay.submit']);
    const seller = templateFor('confidential-amount', 'seller', c, { chain: SEPOLIA, asset: 'erc20' });
    expect(seller.pipeline.steps.map((x) => x.kind)).toEqual(['recv.stealth', 'ct.sweep']);
    expect(seller.pipeline.asset).toBe('confidential');
    const base = templateFor('confidential-amount', 'seller', c, { chain: BASE_SEPOLIA, asset: 'erc20' });
    expect(base.pipeline.ctBackend).toBe('ct3-inco');
    const none = templateFor('confidential-amount', 'seller', ctx(), {
      chain: SEPOLIA,
      asset: 'erc20-permit',
    });
    expect(none.pipeline.steps.map((x) => x.kind)).toEqual(['recv.stealth', 'sweep.delay', 'hygiene.sweep']);
  });
  it('btc templates are silent-payment only for every preset', () => {
    for (const preset of PRESETS) {
      const p = templateFor(preset, 'payer', ctx(), { chain: BTC_SIGNET, asset: 'btc' }).pipeline;
      expect(p.steps).toEqual([{ kind: 'btc.send', params: { mode: 'silent-payment' } }]);
      const q = templateFor(preset, 'seller', ctx(), { chain: BTC_SIGNET, asset: 'btc' }).pipeline;
      expect(q.steps).toEqual([{ kind: 'btc.recv', params: { mode: 'silent-payment' } }]);
    }
  });
  it('guards: testnet only, confidential token family rejected, pool origin and id respected', () => {
    expect(() =>
      templateFor('standard', 'payer', ctx(), { chain: { family: 'evm', chainId: 1 }, asset: 'erc20' }),
    ).toThrow(PipelineError);
    expect(() => templateFor('standard', 'payer', ctx(), { chain: SEPOLIA, asset: 'confidential' })).toThrow(
      PipelineError,
    );
    const t = templateFor('standard', 'seller', ctx(), {
      chain: SEPOLIA,
      asset: 'erc20',
      origin: 'pool',
      id: 'mine',
    });
    expect(t.pipeline.id).toBe('mine');
    expect(t.pipeline.steps[0]?.params).toEqual({ origin: 'pool' });
  });
  it('enhanced and maximum fall back on quorum/own scan modes by capability', () => {
    const c = ctx({ caps: ['multi-rpc', 'pir-servers'], self: [] });
    const t = templateFor('maximum', 'seller', c, { chain: SEPOLIA, asset: 'erc20' });
    expect(t.pipeline.layers.rpcMode).toBe('quorum');
    expect(t.pipeline.layers.scanMode).toBe('pir2');
    const d = templateFor('enhanced', 'seller', ctx(), { chain: SEPOLIA, asset: 'erc20' });
    expect(d.downgrades.map((x) => x.option)).toEqual(expect.arrayContaining(['rpcMode', 'scanMode']));
  });
});
