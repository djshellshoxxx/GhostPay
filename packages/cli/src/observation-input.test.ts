import { describe, expect, it } from 'vitest';
import { run } from './run.js';
import { observation, PAYER, paymentWorld, VERIFY_ARGS } from './payment-fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_LIVE } from './reconciliation-fixtures.testutil.js';

const MALFORMED_BLOCKS: readonly unknown[] = ['100', '0x00', '0x', '0X1', 100, null];

function errorOf(stderr: string[]): { code?: string } {
  return (JSON.parse(stderr.join('')) as { error: { code?: string } }).error;
}

describe('malformed observation fields are invalid input, not network failures (R11-3)', () => {
  for (const command of ['inspect', 'verify'] as const) {
    it.each(MALFORMED_BLOCKS.map((bn) => [bn]))(`payment ${command} rejects blockNumber %j as INVALID_INPUT, exit 1, no RPC`, async (bn) => {
      const { io, calls } = paymentWorld();
      const v = observation();
      (v['log'] as Record<string, unknown>)['blockNumber'] = bn;
      io.files.set('claim.json', JSON.stringify(v));
      const args = command === 'inspect' ? ['--in', 'claim.json'] : VERIFY_ARGS;
      expect(await run(['payment', command, ...args, '--json'], io)).toBe(1);
      expect(errorOf(io.err)).toMatchObject({ code: 'INVALID_INPUT' });
      expect(calls).toHaveLength(0);
    });
  }

  for (const sub of ['propose', 'record'] as const) {
    it.each(MALFORMED_BLOCKS.map((bn) => [bn]))(`reconcile ${sub} rejects a current blockNumber %j as INVALID_INPUT, exit 1, no RPC`, async (bn) => {
      const w = await reconciliationWorld();
      w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [{ ...w.current, log: { ...w.current.log, blockNumber: bn } }] }));
      const extra = sub === 'record' ? ['--approve', '--out', 'next.json'] : [];
      const code = await run(['reconcile', sub, '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, ...extra, '--json'], w.io);
      expect(errorOf(w.io.err)).toMatchObject({ code: 'INVALID_INPUT' });
      expect(code).toBe(1);
      expect(w.calls).toHaveLength(0);
    });

    it(`reconcile ${sub} reports a wrong emitter as INVALID_LOG, not INTERNAL`, async () => {
      const w = await reconciliationWorld();
      w.io.files.set('current.json', JSON.stringify({ version: 1, observations: [{ ...w.current, log: { ...w.current.log, address: PAYER } }] }));
      const extra = sub === 'record' ? ['--approve', '--out', 'next.json'] : [];
      const code = await run(['reconcile', sub, '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, ...extra, '--json'], w.io);
      expect(errorOf(w.io.err)).toMatchObject({ code: 'INVALID_LOG' });
      expect(code).toBe(1);
      expect(w.calls).toHaveLength(0);
    });
  }
});
