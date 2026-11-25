import { describe, expect, it } from 'vitest';
import { ConfigError, alignedStart, parseConfig } from './config.js';

const ENV = {
  GHOSTPAY_INDEXER_RPC_URL: 'https://sepolia.example.org/v3/secretkey',
  GHOSTPAY_INDEXER_CHAIN_ID: '11155111',
  GHOSTPAY_INDEXER_ANNOUNCER: '0x55649E01B5Df198D18D95b5cc5051630cfD45564',
  GHOSTPAY_INDEXER_START_BLOCK: '5212345',
};

describe('parseConfig', () => {
  it('applies loopback and wire-contract defaults', () => {
    expect(parseConfig(ENV)).toEqual({
      rpcUrl: ENV.GHOSTPAY_INDEXER_RPC_URL,
      chainId: 11155111,
      announcer: '0x55649e01b5df198d18d95b5cc5051630cfd45564',
      startBlock: 5212345n,
      dbPath: './light-indexer.sqlite',
      host: '127.0.0.1',
      port: 8787,
      allowedOrigins: [],
      confirmations: 0,
      pollMs: 4000,
      maxReorgDepth: 128,
      alignBlocks: 1000,
      maxWindowBlocks: 2000,
      maxPageSize: 1000,
      maxResponseBytes: 8 * 1024 * 1024,
    });
  });
  it('reads overrides and exact CORS origins', () => {
    const c = parseConfig({ ...ENV, GHOSTPAY_INDEXER_PORT: '0', GHOSTPAY_INDEXER_ALIGN_BLOCKS: '500', GHOSTPAY_INDEXER_CORS_ORIGINS: 'https://a.example.org, http://127.0.0.1:5173', GHOSTPAY_INDEXER_DB: '/var/lib/x.sqlite', GHOSTPAY_INDEXER_HOST: '' });
    expect(c).toMatchObject({ port: 0, alignBlocks: 500, maxWindowBlocks: 1000, allowedOrigins: ['https://a.example.org', 'http://127.0.0.1:5173'], dbPath: '/var/lib/x.sqlite', host: '127.0.0.1' });
  });
  it('rejects invalid values naming the variable but never echoing the value', () => {
    const bad: Record<string, string | undefined>[] = [
      { GHOSTPAY_INDEXER_RPC_URL: undefined },
      { GHOSTPAY_INDEXER_RPC_URL: 'not a url' },
      { GHOSTPAY_INDEXER_RPC_URL: 'file:///etc/passwd' },
      { GHOSTPAY_INDEXER_CHAIN_ID: '1' },
      { GHOSTPAY_INDEXER_CHAIN_ID: '8453' },
      { GHOSTPAY_INDEXER_CHAIN_ID: 'x' },
      { GHOSTPAY_INDEXER_ANNOUNCER: '0x1234' },
      { GHOSTPAY_INDEXER_START_BLOCK: '-1' },
      { GHOSTPAY_INDEXER_START_BLOCK: '99999999999999999' },
      { GHOSTPAY_INDEXER_PORT: '70000' },
      { GHOSTPAY_INDEXER_POLL_MS: '1' },
      { GHOSTPAY_INDEXER_CORS_ORIGINS: 'https://a.example.org/path' },
      { GHOSTPAY_INDEXER_CORS_ORIGINS: '*' },
      { GHOSTPAY_INDEXER_CORS_ORIGINS: 'ftp://a.example.org' },
      { GHOSTPAY_INDEXER_MAX_WINDOW_BLOCKS: '10' },
    ];
    for (const b of bad) {
      const env = { ...ENV, ...b };
      try {
        parseConfig(env);
        expect.unreachable(JSON.stringify(b));
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        expect((e as Error).message).toContain(Object.keys(b)[0]);
        expect((e as Error).message).not.toMatch(/secretkey|passwd|example/);
      }
    }
  });
  it('aligns the start block down to the window grid', () => {
    expect(alignedStart(5212345n, 1000)).toBe(5212000n);
    expect(alignedStart(5212000n, 1000)).toBe(5212000n);
    expect(alignedStart(7n, 1)).toBe(7n);
  });
});
