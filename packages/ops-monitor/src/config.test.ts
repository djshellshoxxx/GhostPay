import { describe, expect, it } from 'vitest';
import { parseOpsConfig } from './config.js';
import { MonitorError } from './errors.js';

const ADDR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const chain = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  chainId: 84532,
  rpcUrlEnvs: ['A', 'B'],
  manifestFile: '/m.json',
  tokens: [ADDR],
  ...over,
});
const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ chains: [chain()], ...over });

describe('parseOpsConfig', () => {
  it('accepts a minimal config with defaults', () => {
    const c = parseOpsConfig(base());
    expect(c.chains[0]).toMatchObject({ chainId: 84532, rpcUrlEnvs: ['A', 'B'], tokens: [ADDR] });
    expect(c.output).toEqual({ dedupeMinutes: 60 });
    expect(c.release).toBeUndefined();
  });

  it('accepts a full config', () => {
    const c = parseOpsConfig(
      base({
        release: { mirrors: ['https://pay.example.org'], sha256sumsFile: '/s', files: ['index.html'] },
        relayer: { chainId: 84532, address: ADDR.toLowerCase(), balanceFloorWei: '10', maxNonceGap: 2, dailyUnreimbursedCapWei: '99' },
        announcements: { baselinePerBlock: 0.5, windowBlocks: 100 },
        output: { prometheusFile: '/p', webhookUrlEnv: 'HOOK', dedupeMinutes: 5, stateFile: '/st' },
      }),
    );
    expect(c.relayer).toMatchObject({ address: ADDR, balanceFloorWei: 10n, dailyUnreimbursedCapWei: 99n });
    expect(c.announcements).toEqual({ baselinePerBlock: 0.5, windowBlocks: 100 });
    expect(c.output.webhookUrlEnv).toBe('HOOK');
  });

  const bad: [string, Record<string, unknown>][] = [
    ['not an object', [] as unknown as Record<string, unknown>],
    ['unknown top-level key', base({ extra: 1 })],
    ['no chains', { chains: [] }],
    ['duplicate chain', { chains: [chain(), chain()] }],
    ['chainId float', { chains: [chain({ chainId: 1.5 })] }],
    ['rpc env lower case', { chains: [chain({ rpcUrlEnvs: ['lower'] })] }],
    ['rpc env missing', { chains: [chain({ rpcUrlEnvs: [] })] }],
    ['rpc url instead of env name', { chains: [chain({ rpcUrlEnvs: ['https://rpc.example/key'] })] }],
    ['bad token', { chains: [chain({ tokens: ['0x12'] })] }],
    ['unknown chain key', { chains: [chain({ rpcUrls: [] })] }],
    ['plain-http mirror', base({ release: { mirrors: ['http://pay.example.org'], sha256sumsFile: '/s', files: ['a'] } })],
    ['mirror with credentials', base({ release: { mirrors: ['https://u:p@pay.example.org'], sha256sumsFile: '/s', files: ['a'] } })],
    ['mirror not a url', base({ release: { mirrors: ['nope'], sha256sumsFile: '/s', files: ['a'] } })],
    ['file path traversal', base({ release: { mirrors: ['https://pay.example.org'], sha256sumsFile: '/s', files: ['../etc/passwd'] } })],
    ['file with query', base({ release: { mirrors: ['https://pay.example.org'], sha256sumsFile: '/s', files: ['a?x=1'] } })],
    ['relayer on unmonitored chain', base({ relayer: { chainId: 1, address: ADDR, balanceFloorWei: '1', maxNonceGap: 1, dailyUnreimbursedCapWei: '1' } })],
    ['relayer wei not decimal', base({ relayer: { chainId: 84532, address: ADDR, balanceFloorWei: '1e18', maxNonceGap: 1, dailyUnreimbursedCapWei: '1' } })],
    ['relayer zero cap', base({ relayer: { chainId: 84532, address: ADDR, balanceFloorWei: '1', maxNonceGap: 1, dailyUnreimbursedCapWei: '0' } })],
    ['baseline zero', base({ announcements: { baselinePerBlock: 0 } })],
    ['window too large', base({ announcements: { baselinePerBlock: 1, windowBlocks: 5001 } })],
    ['webhook without state file', base({ output: { webhookUrlEnv: 'HOOK' } })],
    ['webhook env as url', base({ output: { webhookUrlEnv: 'https://hooks.example/x', stateFile: '/s' } })],
    ['dedupe negative', base({ output: { dedupeMinutes: -1 } })],
  ];
  it.each(bad)('refuses %s', (_n, raw) => {
    expect(() => parseOpsConfig(raw)).toThrow(MonitorError);
  });

  it('never echoes config values in errors', () => {
    try {
      parseOpsConfig(base({ relayer: { chainId: 84532, address: 'SECRET-VALUE', balanceFloorWei: '1', maxNonceGap: 1, dailyUnreimbursedCapWei: '1' } }));
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SECRET-VALUE');
    }
  });
});
