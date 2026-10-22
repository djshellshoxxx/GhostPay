import { ALL_CAPABILITIES } from './keys.js';
import type { Capability, Context, OptionId, Selection } from './types.js';

export const FULL = new Set<Capability>(ALL_CAPABILITIES);
export const ctx = (over: Partial<Context> = {}): Context => ({
  action: 'settings',
  chainId: 11155111,
  btcNetwork: 'testnet',
  env: 'web',
  capabilities: FULL,
  ...over,
});
export const sel = (values: Partial<Record<OptionId, string>>, acks: Selection['acks'] = []): Selection => ({
  preset: 'custom',
  values,
  acks,
});
