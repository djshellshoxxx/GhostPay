import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureOperations, FIXTURE_META, FIXTURE_PAYMENT } from './refund-batch.mjs';

const dir = mkdtempSync(join(tmpdir(), 'ghostpay-refund-fixture-'));
const db = new FixtureOperations(dir, { fixture: true });
try {
  const input = { fixture: true, original: { ...FIXTURE_PAYMENT },
    request: { idempotencyKey: 'demo-refund-1', amount: '600000', destinationMeta: FIXTURE_META } };
  const preview = db.preview('refund', input);
  db.approve(preview.id, preview.confirmation, input);
  const result = db.submitted(preview.id, preview.confirmation, 0, 'fixture-tx:demo-1');
  console.log(JSON.stringify({ fixtureOnly: true, sendsFunds: false, phase: result.phase,
    outcome: result.items[0].status, reservedBaseUnits: result.plan.amount }));
} finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
