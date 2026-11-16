import { describe, expect, it } from 'vitest';
import { Metrics } from './metrics.js';
import { createLogger, parseLogLevel } from './log.js';
import { timedRpcFetch } from './rpcMetrics.js';

describe('exact aggregate counters and bounded latency histograms', () => {
  it('keeps cumulative wei exact beyond Number precision in text and JSON', () => {
    const metrics = new Metrics();
    const amount = (1n << 100n) + 1n;
    metrics.addInteger('relayer_gas_spent_wei_total', amount, { chain_id: 1 });
    metrics.addInteger('relayer_gas_spent_wei_total', 3n, { chain_id: 1 });
    metrics.addInteger('relayer_gas_spent_wei_total', -1n, { chain_id: 1 });
    expect(metrics.render()).toContain(`relayer_gas_spent_wei_total{chain_id="1"} ${(amount + 3n).toString()}`);
    expect(metrics.stats().integerCounters['relayer_gas_spent_wei_total']).toBe((amount + 3n).toString());
    expect(metrics.stats().integerSamples).toContainEqual({ name: 'relayer_gas_spent_wei_total', labels: { chain_id: '1' }, value: (amount + 3n).toString() });
  });

  it('uses cumulative fixed buckets and rejects invalid samples and user labels', () => {
    const metrics = new Metrics();
    metrics.observe('relayer_sweep_latency_seconds', 0.1, { chain_id: 1, owner: 'secret' });
    metrics.observe('relayer_sweep_latency_seconds', 2, { chain_id: 1 });
    metrics.observe('relayer_sweep_latency_seconds', -1, { chain_id: 1 });
    metrics.observe('relayer_sweep_latency_seconds', Infinity, { chain_id: 1 });
    const text = metrics.render();
    expect(text).toContain('relayer_sweep_latency_seconds_bucket{chain_id="1",le="0.1"} 1');
    expect(text).toContain('relayer_sweep_latency_seconds_bucket{chain_id="1",le="5"} 2');
    expect(text).toContain('relayer_sweep_latency_seconds_bucket{chain_id="1",le="+Inf"} 2');
    expect(text).toContain('relayer_sweep_latency_seconds_sum{chain_id="1"} 2.1');
    expect(text).toContain('relayer_sweep_latency_seconds_count{chain_id="1"} 2');
    expect(text).not.toContain('secret');
    expect(metrics.stats().histograms[0]).toMatchObject({ name: 'relayer_sweep_latency_seconds', count: 2, sum: 2.1 });
  });

  it('bounds all histogram and exact-counter series', () => {
    const metrics = new Metrics();
    for (let chain_id = 0; chain_id < 1000; chain_id++) {
      metrics.observe('relayer_rpc_latency_seconds', 1, { chain_id });
      metrics.addInteger('relayer_gas_spent_wei_total', 1n, { chain_id });
    }
    expect(metrics.stats().histograms.length).toBeLessThanOrEqual(64);
    expect(metrics.render().split('\n').filter((line) => line.startsWith('relayer_gas_spent_wei_total{')).length).toBeLessThanOrEqual(512);
  });
});

describe('RPC latency instrumentation', () => {
  it('records real fetch attempts and failures without retaining URLs or request bodies', async () => {
    const metrics = new Metrics();
    let now = 0;
    const result = new Response('{}');
    const impl: typeof fetch = () => { now += 250; return Promise.resolve(result); };
    const measured = timedRpcFetch(metrics, 1, () => now, impl);
    expect(await measured('https://rpc.example/private-key', { body: 'owner-secret' })).toBe(result);
    const failing = timedRpcFetch(metrics, 1, () => now, () => { now += 100; return Promise.reject(new Error('provider secret')); });
    await expect(failing('https://rpc.example/private-key')).rejects.toThrow('provider secret');
    const text = metrics.render();
    expect(text).toContain('relayer_rpc_latency_seconds_count{chain_id="1"} 2');
    expect(text).toContain('relayer_rpc_latency_seconds_sum{chain_id="1"} 0.35');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('private-key');
  });
});

describe('configured log severity', () => {
  it('filters below the configured level and rejects unsupported environment values without echoing them', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line), () => 0, parseLogLevel('warn'));
    logger.log('info', 'hidden');
    logger.log('warn', 'visible');
    logger.log('error', 'failure');
    expect(lines).toHaveLength(2);
    expect(lines.join('')).not.toContain('hidden');
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('error')).toBe('error');
    expect(() => parseLogLevel('private-secret')).toThrow('LOG_LEVEL must be info, warn, or error');
  });
});
