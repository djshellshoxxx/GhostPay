#!/usr/bin/env node
// money.mjs must read amounts with the GhostPay app's minor-unit table (apps/web/src/lib/format.ts), or invoices
// are off by 100x. No dependencies.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ZERO_DECIMAL_CURRENCIES, fiatDecimals, toMinorUnits } from './money.mjs';

test('exponents', () => {
  assert.equal(fiatDecimals('USD'), 2);
  assert.equal(fiatDecimals('JPY'), 0);
  assert.equal(fiatDecimals('KWD'), 2, 'the app reads three-decimal currencies with 2');
});

test('conversion never rounds or rescales', () => {
  const cases = [
    ['12.50', 'USD', '1250'],
    ['12.5', 'USD', '1250'],
    ['13', 'USD', '1300'],
    ['0', 'USD', '0'],
    ['1500', 'JPY', '1500'],
    ['1500.00', 'JPY', '1500'],
    ['1500.5', 'JPY', undefined],
    ['12.340', 'KWD', '1234'],
    ['12.345', 'KWD', undefined],
    ['9999999999999999.99', 'USD', '999999999999999999'],
    ['01', 'USD', undefined],
    ['1.', 'USD', undefined],
    ['.5', 'USD', undefined],
    ['1e3', 'USD', undefined],
    ['-1', 'USD', undefined],
    ['1', 'usd', undefined],
    [undefined, 'USD', undefined],
  ];
  for (const [amount, currency, want] of cases) assert.equal(toMinorUnits(amount, currency), want, `${amount} ${currency}`);
});

const appFormat = new URL('../../apps/web/src/lib/format.ts', import.meta.url);
test('table equals the GhostPay app table', { skip: !existsSync(appFormat) && 'apps/web is not present' }, () => {
  const app = readFileSync(appFormat, 'utf8');
  const set = /ZERO_DECIMAL_CURRENCIES = new Set\(\[([^\]]*)\]\)/.exec(app);
  assert.deepEqual([...ZERO_DECIMAL_CURRENCIES], [...(set?.[1] ?? '').matchAll(/'([A-Z]{3})'/g)].map((m) => m[1]));
  assert.match(app, /return ZERO_DECIMAL_CURRENCIES\.has\(currency\) \? 0 : 2;/, 'every other code has 2 decimals');
});
