import { describe, expect, it } from 'vitest';
import * as api from './index.js';

// Every runtime export of the package before this completion work (base c8e131c). Removing or renaming one is a break.
const BASELINE_EXPORTS = [
  'ACK_KEYS', 'ALL_CAPABILITIES', 'CHAIN_ERROR_KEYS', 'CHAIN_RULES', 'CHAIN_WARNING_KEYS', 'ERROR_KEYS', 'OPTION_CATALOGUE',
  'OPTION_GROUPS', 'OPTION_IDS', 'POOL_EXIT_VALUES', 'PRESETS', 'RULES', 'SPONSORED_PAYER_MODES', 'STEP_ASSETS', 'STEP_CATALOGUE',
  'TESTNET_BTC_NETWORKS', 'TESTNET_CHAIN_IDS', 'WARNING_KEYS', 'acknowledge', 'applyPreset', 'chainMatrix', 'compatibilityMatrix',
  'defaultSelection', 'evaluate', 'explain', 'honestLabel', 'sanitizeSelection', 'serializeSelection', 'setOption', 'valueDef',
] as const;

const ADDED_EXPORTS = [
  'ACTIONS', 'ALL_TRUST_PARTIES', 'ASSET_KINDS', 'CONFIG_ERROR_KEYS', 'CONFIG_VERSION', 'ENVS', 'MAX_CONFIG_CHARS',
  'MIGRATION_FROM_VERSIONS', 'createSnapshot', 'describeConfig', 'describePreset', 'emptyConfig', 'evaluateWithApplied',
  'findDependencyCycles', 'loadConfig', 'parseConfig', 'readConsents', 'reviewConfig', 'serializeConfig', 'snapshotIsCurrent',
  'toConfig', 'validateDefinitions',
] as const;

describe('public API', () => {
  it('keeps every export that existed before', () => {
    for (const name of BASELINE_EXPORTS) expect(api, name).toHaveProperty(name);
  });
  it('exposes the new configuration, consent, snapshot, claims and definition checks', () => {
    for (const name of ADDED_EXPORTS) expect(api, name).toHaveProperty(name);
  });
  it('every exported list and table is deeply frozen', () => {
    const open: string[] = [];
    const walk = (x: unknown, path: string, seen = new Set<unknown>()): void => {
      if (typeof x !== 'object' || x === null || seen.has(x) || x instanceof Set || x instanceof Map) return;
      seen.add(x);
      if (!Object.isFrozen(x)) open.push(path);
      for (const k of Reflect.ownKeys(x)) walk((x as Record<PropertyKey, unknown>)[k], `${path}.${String(k)}`, seen);
    };
    for (const [name, value] of Object.entries(api)) if (typeof value === 'object') walk(value, name);
    expect(open).toEqual([]);
  });
  it('does not leak internals (unfrozen evaluator, input guards, freeze helper)', () => {
    for (const name of ['evaluateRaw', 'normalizeSelection', 'normalizeContext', 'deepFreeze', 'isRecord', 'isSet']) expect(api).not.toHaveProperty(name);
  });
  it('every function export is total on undefined input', () => {
    const throwers: string[] = [];
    for (const name of [...BASELINE_EXPORTS, ...ADDED_EXPORTS]) {
      const fn = (api as Record<string, unknown>)[name];
      if (typeof fn !== 'function') continue;
      for (const args of [[], [undefined, undefined, undefined, undefined], [null, null, null, null], [5, 'x', {}, []]]) {
        try {
          (fn as (...a: unknown[]) => unknown)(...args);
        } catch {
          throwers.push(`${name}(${args.length})`);
        }
      }
    }
    expect(throwers).toEqual([]);
  });
});
