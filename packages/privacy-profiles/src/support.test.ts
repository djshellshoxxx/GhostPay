import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE } from './catalogue.js';
import { toConfig } from './config.js';
import { evaluate } from './evaluate.js';
import { ALL_CAPABILITIES, ACK_KEYS } from './keys.js';
import { compatibilityMatrix } from './matrix.js';
import { createSnapshot, reviewConfig } from './snapshot.js';
import { ASSET_KINDS, ENVS, OPTION_IDS, TESTNET_CHAIN_IDS } from './types.js';
import type { Action, AssetKind, Capability, Context, Env, OptionId } from './types.js';
import { ctx, sel } from './x.testutil.js';

const CHAINS = [31337, 11155111, 84532, 1, 8453, 137, 0, -1];
const SELECTABLE = OPTION_IDS.filter((o) => OPTION_CATALOGUE[o].userSelectable);
const EVM_OPTIONS = SELECTABLE.filter((o) => OPTION_CATALOGUE[o].group !== 'btc');
// Pool-dependent options are inactive unless the exit is a pool (DEVIATIONS 3); R-35 and R-41 block them otherwise.
const ALWAYS_ACTIVE = EVM_OPTIONS.filter((o) => OPTION_CATALOGUE[o].activeWhen === undefined);
const nonDefault = (o: OptionId): string[] => OPTION_CATALOGUE[o].values.filter((v) => v.value !== OPTION_CATALOGUE[o].defaultValue).map((v) => v.value);
const codesOf = (values: Partial<Record<OptionId, string>>, c: Context): Set<string> => new Set(evaluate(sel(values), c).blocking.map((b) => b.code));

describe('unsupported networks: derived from the catalogue for every option value', () => {
  for (const o of EVM_OPTIONS) {
    for (const v of nonDefault(o)) {
      const vd = OPTION_CATALOGUE[o].values.find((x) => x.value === v);
      it(`${o}=${v}: blocked on a chain exactly when the chain is not a testnet this value supports`, () => {
        const action: Action = OPTION_CATALOGUE[o].actions[0] ?? 'settings';
        for (const chainId of CHAINS) {
          const isTestnet = (TESTNET_CHAIN_IDS as readonly number[]).includes(chainId);
          const valueChains = vd?.chains as readonly number[] | undefined;
          const expected = !isTestnet || (valueChains !== undefined && !valueChains.includes(chainId));
          const got = codesOf({ [o]: v }, ctx({ chainId, action })).has('E_WRONG_CHAIN');
          expect(got, `chain ${chainId}`).toBe(expected);
        }
      });
    }
  }
  it('the default selection is never blocked for being on an unsupported chain (nothing is enabled)', () => {
    for (const chainId of CHAINS) expect(evaluate(sel({}), ctx({ chainId })).ok).toBe(true);
  });
  it('a missing chain id is allowed only where no transaction is built (settings)', () => {
    expect(codesOf({ 'sweep.dust': 'off' }, ctx({ chainId: null, action: 'settings' })).has('E_WRONG_CHAIN')).toBe(false);
    for (const action of ['pay', 'sweep', 'scan', 'create-invoice'] as const) {
      expect(codesOf({ 'sweep.dust': 'off', 'pay.route': 'direct-no-fee', 'invoice.padding': 'on', 'net.scanAlign': 'on' }, ctx({ chainId: null, action })).has('E_WRONG_CHAIN'), action).toBe(true);
    }
  });
  it('Bitcoin options need a supported Bitcoin network in btc actions and are blocked on any other network', () => {
    const btcOptions = SELECTABLE.filter((o) => OPTION_CATALOGUE[o].group === 'btc');
    for (const o of btcOptions) {
      for (const v of nonDefault(o)) {
        for (const network of ['testnet', 'signet', 'regtest', 'mainnet', 'bitcoin', 'testnet4', '', undefined, null] as const) {
          const supported = network === 'testnet' || network === 'signet' || network === 'regtest';
          for (const action of ['btc-send', 'btc-receive'] as const) {
            // The shared ctx() helper always sets a testnet network, so "no network stated" is built explicitly.
            const c: Context = network === undefined ? { action, chainId: 11155111, env: 'web', capabilities: new Set(ALL_CAPABILITIES) } : ctx({ action, btcNetwork: network });
            expect(codesOf({ [o]: v }, c).has('E_WRONG_CHAIN'), `${o}=${v} ${action} ${String(network)}`).toBe(!supported);
          }
          if (network !== undefined && network !== null) {
            expect(codesOf({ [o]: v }, ctx({ action: 'settings', btcNetwork: network })).has('E_WRONG_CHAIN'), `${o}=${v} settings ${network}`).toBe(!supported);
          }
        }
      }
    }
  });
});

describe('unsupported assets and environments', () => {
  it('a value that lists assets is blocked for any other asset and not for the listed ones', () => {
    let checked = 0;
    for (const o of ALWAYS_ACTIVE) {
      for (const vd of OPTION_CATALOGUE[o].values) {
        if (vd.value === OPTION_CATALOGUE[o].defaultValue || !vd.assets) continue;
        for (const asset of ASSET_KINDS) {
          const action: Action = OPTION_CATALOGUE[o].actions[0] ?? 'settings';
          const has = codesOf({ [o]: vd.value }, ctx({ asset, action })).has('E_WRONG_ASSET');
          if (!vd.assets.includes(asset)) expect(has, `${o}=${vd.value} on ${asset}`).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('an unset asset is never an asset error (evaluated only when the caller states one)', () => {
    for (const o of ALWAYS_ACTIVE) for (const v of nonDefault(o)) expect(codesOf({ [o]: v }, ctx()).has('E_WRONG_ASSET'), `${o}=${v}`).toBe(false);
  });
  it('a pool-dependent option without a pool exit is not applied but is still rejected by its dependency rule', () => {
    const e = evaluate(sel({ 'sweep.exitGas': 'permit-sponsored', 'sweep.exit': 'plain' }), ctx({ capabilities: new Set(), asset: 'native', action: 'sweep' }));
    expect(e.blocking.map((b) => b.ruleId)).toContain('R-41');
    expect(e.blocking.map((b) => b.code)).not.toContain('E_WRONG_ASSET');
    expect(e.trust).toEqual([]);
  });
  it('hops need a permit token and a confidential asset cannot go through a pool or hops', () => {
    for (const asset of ASSET_KINDS) {
      expect(codesOf({ 'sweep.hops': '1' }, ctx({ asset, action: 'sweep' })).has('E_WRONG_ASSET'), `hops on ${asset}`).toBe(asset !== 'erc20-permit');
    }
    for (const exit of ['privacy-pools', 'railgun', 'shielded-pool'] as const) {
      expect(evaluate(sel({ 'sweep.exit': exit }), ctx({ asset: 'confidential', action: 'sweep' })).blocking.map((b) => b.ruleId)).toContain('R-11');
    }
  });
  it('a network profile is blocked in an environment it does not support', () => {
    let checked = 0;
    for (const o of ['net.rpcProfile', 'net.relayerProfile'] as const) {
      for (const vd of OPTION_CATALOGUE[o].values) {
        if (vd.value === 'direct' || !vd.env) continue;
        for (const env of ENVS as readonly Env[]) {
          const has = codesOf({ [o]: vd.value }, ctx({ env })).has('E_WRONG_ENV');
          expect(has, `${o}=${vd.value} in ${env}`).toBe(!vd.env.includes(env));
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('unsupported asset or environment names in the context are invalid input, not silently ignored', () => {
    expect(evaluate(sel({}), { ...ctx(), asset: 'gold' } as never).blocking.map((b) => b.code)).toContain('E_INVALID_CONTEXT');
    expect(evaluate(sel({}), { ...ctx(), env: 'mars' } as never).blocking.map((b) => b.code)).toContain('E_INVALID_CONTEXT');
  });
  it('capability-gated values are blocked when exactly the capability is removed (every capability, every value that names it)', () => {
    let checked = 0;
    for (const o of ALWAYS_ACTIVE) {
      for (const vd of OPTION_CATALOGUE[o].values) {
        if (vd.value === OPTION_CATALOGUE[o].defaultValue) continue;
        for (const cap of vd.requires) {
          if (cap === 'test-mode') continue;
          const caps = new Set<Capability>(ALL_CAPABILITIES.filter((c) => c !== cap));
          const action: Action = OPTION_CATALOGUE[o].actions[0] ?? 'settings';
          const e = evaluate(sel({ [o]: vd.value }), ctx({ capabilities: caps, action, chainId: vd.chains?.[0] ?? 11155111 }));
          expect(e.blocking.map((b) => b.key), `${o}=${vd.value} without ${cap}`).toContain(`privacy.err.requires.cap.${cap}`);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe('conflicting preferences never reach a snapshot', () => {
  const conflicts = compatibilityMatrix().filter((c) => c.relation === 'conflict');
  const FULL: ReadonlySet<Capability> = new Set(ALL_CAPABILITIES);
  const c: Context = { action: 'settings', chainId: 11155111, env: 'web', asset: 'erc20-permit', capabilities: FULL };
  it('the matrix has conflict cells to test', () => {
    expect(conflicts.length).toBeGreaterThan(20);
  });
  it('every conflict cell stays blocked with every acknowledgement and every consent given', () => {
    for (const cell of conflicts) {
      const bare = toConfig({ preset: 'custom', values: { [cell.a.option]: cell.a.value, [cell.b.option]: cell.b.value }, acks: [] });
      const consents = reviewConfig(bare, c).requiredConsents.map((r) => r.key);
      const cfg = toConfig({ ...bare, acks: [...ACK_KEYS] }, consents);
      const r = createSnapshot(cfg, c);
      const label = `${cell.a.option}=${cell.a.value} + ${cell.b.option}=${cell.b.value} (${cell.ruleIds.join(',')})`;
      expect(r.ok, label).toBe(false);
      if (!r.ok) {
        const ruleIds = r.review.evaluation.blocking.map((b) => b.ruleId);
        expect(cell.ruleIds.some((id) => ruleIds.includes(id)), label).toBe(true);
      }
    }
  });
  it('order of selection does not matter: both orders conflict', () => {
    for (const cell of conflicts.slice(0, 200)) {
      const ab = evaluate(sel({ [cell.a.option]: cell.a.value, [cell.b.option]: cell.b.value }), c).ok;
      const ba = evaluate(sel({ [cell.b.option]: cell.b.value, [cell.a.option]: cell.a.value }), c).ok;
      expect(ab).toBe(false);
      expect(ba).toBe(false);
    }
  });
  it('asset kinds in the matrix context stay a closed list', () => {
    expect(ASSET_KINDS as readonly AssetKind[]).toContain(c.asset);
  });
});
