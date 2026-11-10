import { expect, it } from 'vitest';
import { signReceipt } from '@ghostpay/invoice-schema';
import { run } from './run.js';
import { allOutput, KEY_BYTES, KEY_HEX, NOW } from './fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_PASS, VIEW_HEX } from './reconciliation-fixtures.testutil.js';

it('fails closed on a wrong viewing key or tampered encrypted receipt archive without publishing recovery', async () => {
  const w = await reconciliationWorld();
  const receipt = signReceipt({
    chainId: 11155111, txHash: '0x' + 'ab'.repeat(32),
    invoiceDigest: '0x' + 'cd'.repeat(32), stealthAddress: w.recipient,
    asset: 'native', amountMinorUnits: '100', issuedAt: NOW,
  }, KEY_BYTES);
  w.io.files.set('receipt.json', JSON.stringify(receipt));
  const original = w.io.files.get('history.json');
  expect(await run(['reconcile', 'archive-receipt', '--in', 'history.json',
    '--receipt', 'receipt.json', ...RECON_CREDS, '--out', 'archived.json', '--json'], w.io)).toBe(0);
  const archived = w.io.files.get('archived.json')!;
  const envelope = JSON.parse(archived) as { ciphertext: string };
  expect(envelope.ciphertext).toMatch(/^[0-9a-f]{32,}$/);
  const first = envelope.ciphertext[0]!;
  w.io.files.set('tampered.json', JSON.stringify({
    ...envelope, ciphertext: (first === 'a' ? 'b' : 'a') + envelope.ciphertext.slice(1),
  }));
  w.io.files.set('wrong-view.hex', '00'.repeat(31) + '03');

  const callsBeforeRecovery = w.calls.length;
  for (const [backup, key, output] of [
    ['archived.json', 'wrong-view.hex', 'wrong-key-recovery.json'],
    ['tampered.json', 'view.hex', 'tampered-recovery.json'],
  ] as const) {
    w.io.out.length = 0;
    w.io.err.length = 0;
    expect(await run(['reconcile', 'import', '--in', 'history.json', '--backup', backup,
      '--viewing-key-file', key, '--approve', '--out', output, '--json'], w.io)).toBe(1);
    expect(JSON.parse(w.io.err.join(''))).toMatchObject({
      ok: false, error: { code: 'BACKUP_AUTHENTICATION_FAILED' },
    });
    expect(w.io.files.has(output)).toBe(false);
    expect(w.io.files.get('history.json')).toBe(original);
    expect(w.io.files.get('archived.json')).toBe(archived);
    expect(w.calls.length).toBe(callsBeforeRecovery);
    for (const secret of [KEY_HEX, VIEW_HEX, RECON_PASS, 'PRIVATE_API_TOKEN'])
      expect(allOutput(w.io)).not.toContain(secret);
  }

  w.io.out.length = 0;
  w.io.err.length = 0;
  expect(await run(['reconcile', 'import', '--in', 'history.json', '--backup', 'archived.json',
    '--viewing-key-file', 'view.hex', '--approve', '--out', 'recovered.json', '--json'], w.io)).toBe(0);
  expect(w.io.files.get('history.json')).toBe(original);
  expect(w.io.files.has('recovered.json')).toBe(true);
  expect(w.calls.length).toBe(callsBeforeRecovery);
});
