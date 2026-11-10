import { describe, expect, it } from 'vitest';
import { createAccountState, serializeAccountState } from '@ghostpay/merchant-multisig';
import { policy2of3 } from '../../merchant-multisig/src/fixtures.testutil.js';
import { makeIo, stdoutJson } from './fixtures.testutil.js';
import { manifestWire } from './payment-fixtures.testutil.js';
import { run } from './run.js';

describe('operator preflight and diagnostic export', () => {
  it('exports structured offline diagnostics to an atomic private output without reading environment secrets', async () => {
    const io = makeIo(); io.env['RPC_URL'] = 'https://secret.example/token';
    expect(await run(['diagnostics', '--out', 'report.json', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, schemaVersion: 1, networkContacted: false, providerTrustEstablished: false, version: '0.1.0' });
    const report: unknown = JSON.parse(io.files.get('report.json')!);
    expect(report).toMatchObject({ ok: true, checks: expect.any(Array) as unknown });
    expect(io.out.join('') + io.files.get('report.json')).not.toContain('secret.example');
  });
  it('validates a webhook event with explicit schema type and no authentication claim', async () => {
    const io = makeIo({ event: JSON.stringify({ id: 'evt', type: 'invoice.paid', createdAt: 1, data: { invoiceId: 'inv', currency: 'USD', amountMinor: '1' } }) });
    expect(await run(['config', 'validate', '--kind', 'webhook-event', '--in', 'event', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ ok: true, kind: 'webhook-event', configurationOnly: true, paymentVerified: false });
  });
  it('reports failing offline self-tests with exit 1 in both human and machine output', async () => {
    const io = makeIo(); io.nodeVersion = '20.0.0';
    expect(await run(['diagnostics', '--json'], io)).toBe(1);
    expect(stdoutJson(io)).toMatchObject({ ok: false, networkContacted: false });
    io.out.length = 0;
    expect(await run(['diagnostics'], io)).toBe(1);
    expect(io.out.join('')).toContain('reported a failure');
    io.nodeVersion = '22.0.0'; io.out.length = 0;
    expect(await run(['diagnostics'], io)).toBe(0);
    expect(io.out.join('')).toContain('passed');
  });
  it('keeps an existing diagnostic report intact unless explicitly replaced', async () => {
    const io = makeIo({ report: 'previous' });
    expect(await run(['diagnostics', '--out', 'report', '--json'], io)).toBe(3);
    expect(io.files.get('report')).toBe('previous');
    expect(await run(['diagnostics', '--out', 'report', '--force', '--json'], io)).toBe(0);
    expect(io.files.get('report')).toContain('networkContacted');
  });
  it('validates a signed-policy snapshot and deployment schema without trusting either authority', async () => {
    const io = makeIo({ account: serializeAccountState(createAccountState(policy2of3())), manifest: JSON.stringify(manifestWire()) });
    expect(await run(['config', 'validate', '--kind', 'merchant-account', '--in', 'account'], io)).toBe(0);
    expect(io.out.join('')).toContain('No provider, payment or policy authority');
    io.out.length = 0;
    expect(await run(['config', 'validate', '--kind', 'deployment', '--in', 'manifest', '--chain', '11155111', '--json'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ kind: 'deployment', configurationOnly: true, networkContacted: false });
  });
  it.each([
    ['unsupported', '{}', [], 2],
    ['subscription', '{"private":"never-print-me"}', [], 6],
    ['merchant-account', '{}', [], 6],
    ['webhook-event', '{"id":"x","id":"x"}', [], 6],
    ['deployment', JSON.stringify(manifestWire()), ['--chain', '99999999'], 6],
    ['deployment', JSON.stringify(manifestWire()), ['--chain', '84532'], 6],
    ['deployment', JSON.stringify(manifestWire()), [], 2],
    ['deployment', JSON.stringify(manifestWire()), ['--chain', '1.5'], 2],
  ] as const)('rejects invalid %s configuration with the documented exit category', async (kind, value, extra, code) => {
    const io = makeIo({ input: value });
    expect(await run(['config', 'validate', '--kind', kind, '--in', 'input', ...extra, '--json'], io)).toBe(code);
    expect(io.out.join('') + io.err.join('')).not.toContain('never-print-me');
  });
});
