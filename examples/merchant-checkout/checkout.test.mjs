#!/usr/bin/env node
// Runs checkout.mjs --demo and decodes the printed link: fiat.minorUnits must be in the GhostPay app's minor units
// of the currency (0 decimals for JPY and the other zero-decimal codes, else 2), or the payer is charged 100x or
// 1/100 of the price. Needs built invoice-schema and merchant-hooks. Fake keys only (--demo).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseFragment } from '@ghostpay/invoice-schema';

const script = fileURLToPath(new URL('./checkout.mjs', import.meta.url));

async function invoiceFor(amount, currency) {
  const run = spawnSync(process.execPath, [script, '--demo', `--amount=${amount}`, `--currency=${currency}`], { encoding: 'utf8' });
  if (run.status !== 0) return { status: run.status };
  const { link } = JSON.parse(run.stdout.slice(0, run.stdout.indexOf('\n}\n') + 2));
  const { invoice } = await parseFragment(link.slice(link.indexOf('#')));
  return { status: 0, minorUnits: invoice.fiat.minorUnits, unit: invoice.lineItems[0].unitMinorUnits };
}

test('USD has two decimals', async () => {
  assert.deepEqual(await invoiceFor('12.50', 'USD'), { status: 0, minorUnits: '1250', unit: '1250' });
});

test('JPY has no minor units: 1500 yen is 1500, not 150000', async () => {
  assert.deepEqual(await invoiceFor('1500', 'JPY'), { status: 0, minorUnits: '1500', unit: '1500' });
  assert.equal((await invoiceFor('1500.5', 'JPY')).status, 2, 'a yen fraction is refused, not scaled');
});

test('KWD is read with 2 decimals by the app: a needed third decimal is refused', async () => {
  assert.deepEqual(await invoiceFor('12.340', 'KWD'), { status: 0, minorUnits: '1234', unit: '1234' });
  assert.equal((await invoiceFor('12.345', 'KWD')).status, 2);
});

test('malformed amounts and currencies are refused', async () => {
  for (const [amount, currency] of [['12.5.0', 'USD'], ['-1', 'USD'], ['1e3', 'USD'], ['', 'USD'], ['12.50', 'usd']]) {
    assert.equal((await invoiceFor(amount, currency)).status, 2, `${amount} ${currency}`);
  }
});
