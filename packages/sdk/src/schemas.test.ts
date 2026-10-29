import { readFileSync } from 'node:fs';
import type { NewInvoice } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import { buildInvoice } from './builder.js';
import { SdkInvoiceError } from './errors.js';
import { NOW, input, testRng } from './fixtures.testutil.js';
import { invoiceJsonSchema, schemaFiles, webhookEventJsonSchema, WEBHOOK_EVENT_TYPES } from './schemas.js';

type S = { [k: string]: unknown };
/** Minimal validator for the JSON Schema subset used by our schemas. */
function valid(schema: S, v: unknown): boolean {
  if ('const' in schema) return v === schema['const'];
  if (Array.isArray(schema['enum'])) return schema['enum'].includes(v);
  if (Array.isArray(schema['oneOf'])) return (schema['oneOf'] as S[]).filter((s) => valid(s, v)).length === 1;
  switch (schema['type']) {
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v) && (schema['minimum'] === undefined || v >= (schema['minimum'] as number)) && (schema['maximum'] === undefined || v <= (schema['maximum'] as number));
    case 'string':
      return (
        typeof v === 'string' &&
        (schema['pattern'] === undefined || new RegExp(schema['pattern'] as string).test(v)) &&
        (schema['minLength'] === undefined || v.length >= (schema['minLength'] as number)) &&
        (schema['maxLength'] === undefined || v.length <= (schema['maxLength'] as number))
      );
    case 'array':
      return Array.isArray(v) && (schema['maxItems'] === undefined || v.length <= (schema['maxItems'] as number)) && v.every((x) => valid(schema['items'] as S, x));
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
      const o = v as S;
      const props = schema['properties'] as { [k: string]: S };
      if (!(schema['required'] as string[]).every((k) => k in o)) return false;
      return Object.entries(o).every(([k, x]) => (k in props ? valid(props[k] as S, x) : schema['additionalProperties'] !== false));
    }
    default:
      return false;
  }
}

/** Schema path of the `SdkInvoiceError` that `fn` throws. */
function invoicePath(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof SdkInvoiceError) return e.path;
    throw e;
  }
  return 'did not throw';
}

describe('JSON Schemas', () => {
  it('emitted files match source objects exactly (drift guard)', () => {
    for (const [name, schema] of Object.entries(schemaFiles)) {
      const onDisk = readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8');
      expect(onDisk).toBe(JSON.stringify(schema, null, 2) + '\n');
    }
    expect(Object.keys(schemaFiles).sort()).toEqual(['invoice.v1.schema.json', 'webhook-event.v1.schema.json']);
  });
  it('a real invoice validates; with and without memo; fixed_token', () => {
    const s = invoiceJsonSchema;
    const inv = buildInvoice(input(), testRng());
    expect(valid(s, inv)).toBe(true);
    const { memo: _m, ...noMemo } = inv;
    void _m;
    expect(valid(s, noMemo)).toBe(true);
    expect(valid(s, buildInvoice(input({ amountPolicy: { mode: 'fixed_token', tokenAmount: '1000000' }, token: `0x${'a'.repeat(40)}` }), testRng()))).toBe(true);
  });
  it('adversarial invoices fail', () => {
    const s = invoiceJsonSchema;
    const inv = buildInvoice(input(), testRng()) as unknown as S;
    const bad: S[] = [
      { ...inv, extra: 1 },
      { ...inv, v: 2 },
      { ...inv, chainId: 0 },
      { ...inv, chainId: 1.5 },
      { ...inv, nonce: 'AB'.repeat(16) },
      { ...inv, fiat: { currency: 'usd', minorUnits: '1' } },
      { ...inv, fiat: { currency: 'USD', minorUnits: 12 } },
      { ...inv, fiat: { currency: 'USD', minorUnits: '01' } },
      { ...inv, token: '0xABC' },
      { ...inv, amountPolicy: { mode: 'fixed_token' } },
      { ...inv, amountPolicy: { mode: 'fiat_quote', tokenAmount: '1' } },
      { ...inv, feePolicy: 'nobody' },
      { ...inv, signer: `04${'1'.repeat(64)}` },
      { ...inv, lineItems: new Array(51).fill({ description: 'x', quantity: '1', unitMinorUnits: '1' }) },
      { ...inv, lineItems: [{ description: '', quantity: '1', unitMinorUnits: '1' }] },
      { ...inv, lineItems: [{ description: 'x', quantity: '0', unitMinorUnits: '1' }] },
      { ...inv, tax: { rateBps: 10001, minorUnits: '0' } },
      { ...inv, memo: 'm'.repeat(1001) },
    ];
    for (const b of bad) expect(valid(s, b)).toBe(false);
    const { signer: _s, ...missing } = inv;
    void _s;
    expect(valid(s, missing)).toBe(false);
    expect(valid(s, 'string')).toBe(false);
    expect(valid(s, null)).toBe(false);
    expect(valid(s, [])).toBe(false);
  });
  it('invoice and quote times stop where validateInvoice stops them: 9999-12-31T23:59:59Z (B2-R1)', () => {
    const s = invoiceJsonSchema;
    const cap = 253_402_300_799;
    const quote = { source: 'chainlink:eth-usd', timestamp: cap, expiresAt: cap, maxSlippageBps: 50 };
    const atCap = input({ quote, expiresAt: cap });
    const inv = buildInvoice(atCap, testRng());
    expect(valid(s, inv)).toBe(true);
    for (const t of [cap + 1, Number.MAX_SAFE_INTEGER]) {
      const over: [string, Partial<NewInvoice>][] = [
        ['expiresAt', { expiresAt: t }],
        ['quote.timestamp', { quote: { ...quote, timestamp: t } }],
        ['quote.expiresAt', { quote: { ...quote, expiresAt: t } }],
      ];
      for (const [path, patch] of over) {
        expect(valid(s, { ...inv, ...patch })).toBe(false);
        expect(invoicePath(() => buildInvoice({ ...atCap, ...patch }))).toBe(path);
      }
    }
    // A webhook createdAt feeds no Date here, and merchant-hooks' parseWebhookEvent takes any safe integer.
    const event = { id: 'evt_0123456789', type: 'invoice.paid', createdAt: Number.MAX_SAFE_INTEGER, data: { invoiceId: 'ab'.repeat(16), currency: 'USD', amountMinor: '1' } };
    expect(valid(webhookEventJsonSchema, event)).toBe(true);
  });
  it('webhook events: every type validates; negatives fail', () => {
    const s = webhookEventJsonSchema;
    const base = { id: 'evt_0123456789', type: 'invoice.paid', createdAt: NOW, data: { invoiceId: 'ab'.repeat(16), currency: 'USD', amountMinor: '12345' } };
    for (const t of WEBHOOK_EVENT_TYPES) expect(valid(s, { ...base, type: t })).toBe(true);
    expect(valid(s, { ...base, data: { ...base.data, paymentId: 'pay_1' } })).toBe(true);
    const bad: unknown[] = [
      { ...base, type: 'invoice.refunded' },
      { ...base, extra: 1 },
      { ...base, id: 'short' },
      { ...base, createdAt: -1 },
      { ...base, createdAt: 1.5 },
      { ...base, data: { ...base.data, amountMinor: 12345 } },
      { ...base, data: { ...base.data, amountMinor: '1.5' } },
      { ...base, data: { ...base.data, amountMinor: '-1' } },
      { ...base, data: { ...base.data, extra: 1 } },
      { ...base, data: { ...base.data, invoiceId: 'xyz' } },
      { ...base, data: { currency: 'USD', amountMinor: '1' } },
    ];
    for (const b of bad) expect(valid(s, b)).toBe(false);
  });
  it('schemas are plain JSON (no undefined / functions) and carry draft 2020-12', () => {
    for (const s of Object.values(schemaFiles)) {
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      expect(s['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });
});

describe('OpenAPI template', () => {
  const yaml = readFileSync(new URL('../../../docs/remote/usability/openapi/ghostpay-merchant-api.yaml', import.meta.url), 'utf8');
  it('is 3.1 and documents every route the client calls', () => {
    expect(yaml.startsWith('openapi: 3.1.0')).toBe(true);
    for (const route of ['/v1/health:', '/v1/invoices:', '/v1/invoices/{nonce}:', '/v1/invoices/{nonce}/payments:']) expect(yaml).toContain(`  ${route}`);
    for (const t of WEBHOOK_EVENT_TYPES) expect(yaml).toContain(t);
    expect(yaml).toMatch(/self-hosted/i);
    expect(yaml).not.toMatch(/\bfloat\b|format: double/);
  });
});
