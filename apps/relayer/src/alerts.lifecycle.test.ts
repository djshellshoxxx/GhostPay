import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebhookAlerts, type AlertSink } from './alerts.js';
import { createLogger } from './log.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request }));

interface Posted {
  request: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  respond: (response: IncomingMessage) => void;
  options: { signal?: AbortSignal; headers: Record<string, string> };
}
const posted: Posted[] = [];
const sinks: (AlertSink & { close?: () => void })[] = [];
const options = { url: 'https://hooks.example/x', allowedHosts: ['hooks.example'], secret: 's'.repeat(40), now: () => 0 };
const sink = (over: Partial<Parameters<typeof createWebhookAlerts>[0]> = {}) => {
  const result = createWebhookAlerts({ ...options, ...over });
  sinks.push(result);
  return result as AlertSink & { close?: () => void };
};

beforeEach(() => {
  vi.useFakeTimers();
  posted.length = 0;
  request.mockReset().mockImplementation((_url, opts: Posted['options'], respond: Posted['respond']) => {
    const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    req.destroy.mockImplementation((error: Error) => { req.emit('error', error); return req; });
    opts.signal?.addEventListener('abort', () => { req.destroy(new Error('aborted')); }, { once: true });
    posted.push({ request: req, respond, options: opts });
    return req;
  });
});
afterEach(() => {
  for (const current of sinks.splice(0)) current.close?.();
  vi.useRealTimers();
});

function respond(status: number) {
  const destroy = vi.fn();
  const resume = vi.fn();
  const response = Object.assign(new EventEmitter(), { statusCode: status, destroy, resume });
  return { response: response as unknown as IncomingMessage, destroy, resume };
}

describe('webhook resource lifecycle', () => {
  it('aborts a request after three seconds even before a socket or headers arrive', async () => {
    sink().send({ kind: 'low_balance', chainId: 1 });
    expect(posted).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3_001);
    expect(posted[0]?.request.destroy).toHaveBeenCalled();
  });

  it('destroys an unused response instead of draining an unlimited or stalled body', async () => {
    sink().send({ kind: 'low_balance', chainId: 1 });
    const response = respond(204);
    posted[0]?.respond(response.response);
    await vi.advanceTimersByTimeAsync(0);
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(response.resume).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posted).toHaveLength(1);
  });

  it('bounds concurrent deliveries and cancels active and queued work on close', async () => {
    const alerts = sink();
    for (let chainId = 1; chainId <= 1000; chainId++) alerts.send({ kind: 'low_balance', chainId });
    expect(posted.length).toBeLessThanOrEqual(4);
    expect(alerts).toHaveProperty('close', expect.any(Function));
    alerts.close?.();
    for (const active of posted) expect(active.request.destroy).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    alerts.send({ kind: 'breaker_open', chainId: 2 });
    expect(posted.length).toBeLessThanOrEqual(4);
  });

  it('retries one transient status with the exact signed body and idempotency key', async () => {
    sink().send({ kind: 'breaker_open', chainId: 1 });
    posted[0]?.respond(respond(503).response);
    await vi.advanceTimersByTimeAsync(251);
    expect(posted).toHaveLength(2);
    expect(posted[1]?.request.end.mock.calls[0]).toEqual(posted[0]?.request.end.mock.calls[0]);
    expect(posted[1]?.options.headers).toEqual(posted[0]?.options.headers);
    expect(posted[0]?.options.headers['Idempotency-Key']).toMatch(/^[a-f0-9]{64}$/);
    posted[1]?.respond(respond(503).response);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posted).toHaveLength(2);
  });

  it('does not retry redirects or permanent status failures', async () => {
    const alerts = sink();
    alerts.send({ kind: 'breaker_open', chainId: 1 });
    alerts.send({ kind: 'breaker_open', chainId: 2 });
    posted[0]?.respond(respond(302).response);
    posted[1]?.respond(respond(401).response);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posted).toHaveLength(2);
  });

  it('does not leak transaction hashes, addresses, signatures, or secrets into logs', () => {
    const lines: string[] = [];
    const txHash = `0x${'ab'.repeat(32)}`;
    createLogger((line) => lines.push(line)).log('info', 'receipt', { txHash } as never);
    expect(lines.join('')).not.toContain(txHash);
  });
});
