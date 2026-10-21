import { describe, expect, it } from 'vitest';
import { A, FakeRpc, healthy, manifest } from './fixtures.testutil.js';
import { createDedupeState, toPrometheus, toWebhook } from './output.js';
import { runOnce } from './run.js';
import { createW2Probe } from './w2.js';
import { createW4Probe } from './w4.js';
import { createW6Probe } from './w6.js';
import { w1Probe } from './w1.js';
import { w3Probe } from './w3.js';
import { MonitorError } from './errors.js';
import type { Finding, MonitorContext, Probe } from './types.js';

const F = (o: Partial<Finding>): Finding => ({ id: 'W1', severity: 'info', subject: 'x', detail: 'd', ...o });

describe('toPrometheus', () => {
  it('matches the golden output', () => {
    const text = toPrometheus([
      F({ id: 'W1', severity: 'info', chainId: 1, subject: A.router }),
      F({ id: 'W1', severity: 'page', chainId: 1, subject: A.router }),
      F({ id: 'W3', severity: 'warn', subject: 'https://m.example/a"b\\c\nd' }),
    ]);
    expect(text).toBe(
      [
        '# HELP ghostpay_ops_finding_severity Severity of a finding (0 info, 1 warn, 2 page).',
        '# TYPE ghostpay_ops_finding_severity gauge',
        `ghostpay_ops_finding_severity{check="W1",chain_id="1",subject="${A.router}"} 2`,
        'ghostpay_ops_finding_severity{check="W3",subject="https://m.example/a\\"b\\\\c\\nd"} 1',
        '# HELP ghostpay_ops_check_severity Worst severity per check (0 info, 1 warn, 2 page).',
        '# TYPE ghostpay_ops_check_severity gauge',
        'ghostpay_ops_check_severity{check="W1"} 2',
        'ghostpay_ops_check_severity{check="W3"} 1',
        '',
      ].join('\n'),
    );
  });
  it('renders headers for no findings', () => {
    expect(toPrometheus([])).toContain('# TYPE ghostpay_ops_check_severity gauge\n');
  });
});

describe('toWebhook', () => {
  it('null when nothing, info only, or invalid window rejected', () => {
    const s = createDedupeState();
    expect(toWebhook([], 1000, s, 0)).toBeNull();
    expect(toWebhook([F({})], 1000, s, 0)).toBeNull();
    expect(() => toWebhook([], -1, s, 0)).toThrow(MonitorError);
    expect(() => toWebhook([], Number.NaN, s, 0)).toThrow(MonitorError);
  });
  it('dedupes within the window, re-alerts after, and on escalation', () => {
    const s = createDedupeState();
    const w = F({ severity: 'warn', chainId: 1, subject: A.router });
    const p = toWebhook([w, F({})], 1000, s, 10);
    expect(p).toEqual({ version: 1, generatedAt: 10, findings: [w] });
    expect(toWebhook([w], 1000, s, 500)).toBeNull();
    const esc = { ...w, severity: 'page' as const };
    expect(toWebhook([w, esc], 1000, s, 600)?.findings).toEqual([esc]);
    expect(toWebhook([w], 1000, s, 1010)?.findings).toEqual([w]);
    expect(toWebhook([w], 0, s, 1010)?.findings).toEqual([w]);
  });
});

describe('runOnce', () => {
  const ctx: MonitorContext = { rpcs: [], manifests: [], now: 0 };
  it('turns throwing and malformed probes into warns', async () => {
    const boom: Probe = { id: 'W4', run: () => Promise.reject(new Error('https://k.example/secret')) };
    const bad: Probe = { id: 'W5', run: () => Promise.resolve(null as unknown as Finding[]) };
    const ok: Probe = { id: 'W6', run: () => Promise.resolve([F({ id: 'W6' })]) };
    const f = await runOnce([boom, bad, ok], ctx);
    expect(f.map((x) => [x.id, x.severity])).toEqual([['W4', 'warn'], ['W5', 'warn'], ['W6', 'info']]);
    expect(JSON.stringify(f)).not.toContain('secret');
  });
  it('tags adapter error codes only', async () => {
    const { ChainAdapterError } = await import('@ghostpay/chain-adapters');
    const p: Probe = { id: 'W1', run: () => Promise.reject(new ChainAdapterError('RPC_FAILURE', 'http://u')) };
    expect((await runOnce([p], ctx))[0]?.detail).toContain('RPC_FAILURE');
  });
});

describe('privacy: subjects are configured addresses or URLs only', () => {
  it('all probes against a hostile chain emit only configured subjects', async () => {
    const user = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const m = manifest({ policy: true });
    const hostile = new FakeRpc({
      head: 50n,
      blockHash: () => `0x${'cc'.repeat(32)}`,
      logs: () => [{ address: user, topics: [], data: user, blockNumber: '0x1', blockHash: '0x', logIndex: '0x0' }],
      handler: (method, params) => (method === 'eth_chainId' ? '0x1' : healthy({ codes: { [A.router]: user } }, true)(method, params)),
    });
    const configured = new Set<string>([
      m.router, m.sweepRelayer, m.announcer, m.feeRecipient, m.policy?.implementation ?? '', m.policy?.factory ?? '',
      A.pToken, A.hot, 'https://mirror.example', 'monitor',
    ]);
    const ctx: MonitorContext = {
      rpcs: [hostile, hostile],
      manifests: [m],
      now: 0,
      release: {
        mirrors: ['https://mirror.example'],
        sha256sums: '',
        files: ['index.html'],
        manifestCopies: { 1: 'x' },
        fetch: () => Promise.reject(new Error(user)),
      },
    };
    const { createW5Probe } = await import('./w5.js');
    const findings = await runOnce(
      [
        w1Probe,
        createW2Probe({ tokensByChain: { 1: [A.pToken] } }),
        w3Probe,
        createW4Probe(() => ({
          chainId: 1, address: A.hot, balanceWei: 0n, balanceFloorWei: 1n, latestNonce: 0, pendingNonce: 0,
          maxNonceGap: 1, unreimbursedGasWeiToday: 0n, dailyUnreimbursedCapWei: 1n,
        })),
        createW5Probe({ baselinePerBlock: 0.001, windowBlocks: 10 }),
        createW6Probe(),
      ],
      ctx,
    );
    expect(findings.length).toBeGreaterThan(5);
    for (const f of findings) {
      expect(configured.has(f.subject)).toBe(true);
      expect(f.detail.toLowerCase()).not.toContain(user);
    }
  });
});
