import { beforeAll, describe, expect, it } from 'vitest';
import { encodeFragment, signInvoice, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { buildPaymentLink } from '@ghostpay/merchant-hooks';
import { advance, cancel, createSubscription, markPaid, pause, resume, type Subscription } from './subscription.js';
import { periodAt, type Cadence } from './schedule.js';
import { configuration, keys, logicalId, MAX_RECORDS, timestamp, validateSnapshot, type InvoiceOutboxRecord, type SubscriptionConfiguration, type SubscriptionSnapshot } from './operator-state.js';
import { D, JAN31, OTHER_META, seededRng, TEMPLATE } from './fixtures.testutil.js';

const SIGNING_KEY = new Uint8Array(32); SIGNING_KEY[31] = 7;
const OTHER_KEY = new Uint8Array(32); OTHER_KEY[31] = 8;
function config(cadence: Cadence = { kind: 'monthly', every: 1 }): SubscriptionConfiguration {
  return {
    subscriptionId: 'customer-42', baseUrl: 'https://pay.example/checkout',
    plan: { id: 'monthly-pro', name: 'Pro service', currency: 'USD', amountMinor: '1999', taxBps: 825, schedule: { anchor: JAN31, cadence } },
    template: TEMPLATE,
  };
}

async function snapshot(subscription: Subscription, cfg = config()): Promise<SubscriptionSnapshot> {
  const outbox: SubscriptionSnapshot['outbox'][number][] = [];
  for (const p of subscription.periods) {
    const { url } = await buildPaymentLink(signInvoice(p.invoice, SIGNING_KEY), { baseUrl: cfg.baseUrl });
    outbox.push({ kind: 'invoice', eventId: logicalId(subscription.id, p.index), subscriptionId: subscription.id,
      periodIndex: p.index, nonce: p.invoice.nonce, expiresAt: p.invoice.expiresAt, link: url });
    if (p.remindersSent > 0) outbox.push({ kind: 'reminder', eventId: logicalId(subscription.id, p.index, p.remindersSent - 1),
      subscriptionId: subscription.id, periodIndex: p.index, offsetIndex: p.remindersSent - 1, dueAt: p.dueAt });
  }
  return { version: 1, config: cfg, subscription, outbox, outboxPath: '/private/customer-42.json.outbox.jsonl' };
}

function changed(value: unknown, path: readonly (string | number)[], replacement: unknown): unknown {
  const copy: unknown = structuredClone(value);
  let target = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>;
  target[path[path.length - 1]!] = replacement;
  return copy;
}
function invoiceRow(s: SubscriptionSnapshot): InvoiceOutboxRecord {
  const row = s.outbox[0];
  if (row?.kind !== 'invoice') throw new Error('test fixture needs an invoice');
  return row;
}

let issued: SubscriptionSnapshot;
let reminded: SubscriptionSnapshot;
let paid: SubscriptionSnapshot;
let twoPeriods: SubscriptionSnapshot;
beforeAll(async () => {
  const cfg = config();
  const initial = createSubscription(cfg.subscriptionId, cfg.plan, JAN31);
  const first = advance(initial, JAN31, cfg.template, undefined, seededRng('operator-state')).subscription;
  issued = await snapshot(first);
  reminded = await snapshot(advance(first, JAN31 + 3 * D, cfg.template).subscription);
  const paidSub = markPaid(first, 0, JAN31 + 1);
  paid = await snapshot(paidSub);
  const next = advance(paidSub, periodAt(cfg.plan.schedule, 1).start, cfg.template, undefined, seededRng('next-period')).subscription;
  twoPeriods = await snapshot(next);
});

describe('durable subscription configuration', () => {
  it.each<Cadence>([{ kind: 'monthly', every: 1 }, { kind: 'weekly', every: 2 }, { kind: 'custom', seconds: D }])('accepts existing supported cadence $kind without changing the configuration', cadence => {
    const input = config(cadence);
    expect(configuration({ ...input, _comment: 'operator guidance only' })).toEqual(input);
  });

  it.each([
    [['subscriptionId'], 42], [['plan', 'id'], 42], [['plan', 'name'], 42], [['plan', 'currency'], 42],
    [['subscriptionId'], '../outside'], [['plan', 'name'], 'bad\nname'], [['plan', 'amountMinor'], '0'],
    [['plan', 'schedule', 'cadence'], { kind: 'custom', every: 1 }],
    [['plan', 'schedule', 'cadence'], { kind: 'weekly', every: 0 }],
    [['template', 'quoteTtlSeconds'], -1], [['template', 'chainId'], 0], [['template', 'metaAddress'], '0x' + 'a'.repeat(40)],
    [['baseUrl'], 'http://pay.example/'], [['baseUrl'], 'https://user:password@pay.example/'],
    [['template', 'secretKey'], 'must-never-be-accepted'],
  ] satisfies [readonly string[], unknown][])('refuses malformed configuration at %s', (path, value) => {
    expect(() => configuration(changed(config(), path, value))).toThrow();
  });

  it('rejects absent, array, unknown and incomplete persisted objects at the public boundary', () => {
    for (const input of [null, [], {}, { version: 1 }]) expect(() => configuration(input)).toThrow();
    expect(() => keys({ known: 1, unexpected: true }, ['known'])).toThrow();
    expect(() => keys({ known: 1, optional: true }, ['known'], ['optional'])).not.toThrow();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 253402300800, '1'])('refuses out-of-range persisted time %s', value => {
    expect(() => timestamp(value)).toThrow();
  });
  it('accepts exact supported timestamp endpoints', () => {
    expect(() => timestamp(0)).not.toThrow();
    expect(() => timestamp(253402300799)).not.toThrow();
  });
});

describe('signed subscription snapshots and outbox identity', () => {
  it('round-trips real issued, reminded, manually acknowledged, and multiple-period states', async () => {
    for (const state of [issued, reminded, paid, twoPeriods]) {
      expect(await validateSnapshot(JSON.parse(JSON.stringify(state)) as unknown, config())).toEqual(state);
    }
    expect(reminded.subscription.periods[0]!.remindersSent).toBe(3);
    expect(reminded.outbox[1]).toMatchObject({ kind: 'reminder', offsetIndex: 2 });
  });

  it('preserves supported pause, resume, scheduled cancellation and paused cancellation transitions', async () => {
    const paused = pause(issued.subscription, JAN31 + 1);
    const states = [paused, resume(paused, JAN31 + D), cancel(issued.subscription, JAN31 + 2, { atPeriodEnd: true }),
      cancel(paused, JAN31 + 2, { atPeriodEnd: false }), cancel(paid.subscription, JAN31 + 2, { atPeriodEnd: false })];
    for (const sub of states) await expect(validateSnapshot(await snapshot(sub))).resolves.toMatchObject({ subscription: sub });
  });

  it('accepts an empty newly created state and allows a validation-only outbox path without reading or writing it', async () => {
    const cfg = config();
    const state = await snapshot(createSubscription(cfg.subscriptionId, cfg.plan, JAN31 - D));
    await expect(validateSnapshot({ ...state, outboxPath: '../../ignored-by-pure-validator' })).resolves.toMatchObject({ outbox: [] });
  });

  it('refuses state under another independently supplied configuration', async () => {
    await expect(validateSnapshot(issued, { ...config(), baseUrl: 'https://different.example/checkout' })).rejects.toThrow(/configuration differs/);
  });

  it.each([
    [['version'], 2], [['outboxPath'], null], [['subscription', 'id'], 'another'], [['subscription', 'status'], 'complete'],
    [['subscription', 'plan', 'amountMinor'], '2000'], [['subscription', 'createdAt'], -1],
    [['subscription', 'pausedAt'], JAN31], [['subscription', 'status'], 'paused'], [['subscription', 'status'], 'canceled'],
    [['subscription', 'canceledAt'], JAN31], [['subscription', 'cancelAtPeriodEnd'], JAN31 - 1],
    [['subscription', 'nextIndex'], -1], [['subscription', 'nextIndex'], 100001], [['subscription', 'nextIndex'], 0.5],
    [['subscription', 'periods'], null], [['outbox'], null], [['subscription', 'extra'], true],
  ] satisfies [readonly string[], unknown][])('rejects inconsistent subscription state at %s', async (path, value) => {
    await expect(validateSnapshot(changed(issued, path, value))).rejects.toThrow();
  });

  it('rejects oversized period and outbox arrays before processing their entries', async () => {
    await expect(validateSnapshot({ ...issued, subscription: { ...issued.subscription, periods: new Array<unknown>(MAX_RECORDS + 1).fill(null) } })).rejects.toThrow(/bounds/);
    await expect(validateSnapshot({ ...issued, outbox: new Array<unknown>(MAX_RECORDS * 4 + 1).fill(null) })).rejects.toThrow(/bounds/);
  });

  it.each([
    ['index', -1], ['index', 1], ['index', 0.5], ['start', JAN31 + 1], ['end', JAN31 + 1],
    ['issuedAt', JAN31 - 1], ['dueAt', JAN31 + 1], ['status', 'verified'], ['paidAt', JAN31],
    ['remindersSent', -1], ['remindersSent', 4], ['remindersSent', 0.5], ['amountMinor', '2000'], ['taxMinor', '0'],
  ] satisfies [string, unknown][])('rejects inconsistent period %s', async (field, value) => {
    await expect(validateSnapshot(changed(issued, ['subscription', 'periods', 0, field], value))).rejects.toThrow();
  });

  it('rejects duplicate period indices, reused invoice nonces and time-travelled manual acknowledgements', async () => {
    await expect(validateSnapshot(changed(twoPeriods, ['subscription', 'periods', 1, 'index'], 0))).rejects.toThrow(/order/);
    await expect(validateSnapshot(changed(twoPeriods, ['subscription', 'periods', 1, 'invoice', 'nonce'], issued.subscription.periods[0]!.invoice.nonce))).rejects.toThrow(/duplicate invoice nonce/);
    await expect(validateSnapshot(changed(paid, ['subscription', 'periods', 0, 'paidAt'], JAN31 - 1))).rejects.toThrow(/payment precedes/);
    await expect(validateSnapshot(changed(paid, ['subscription', 'periods', 0, 'paidAt'], undefined))).rejects.toThrow(/timestamp/);
  });

  it.each([
    [['fiat', 'currency'], 'EUR'], [['fiat', 'minorUnits'], '2001'], [['expiresAt'], JAN31 + 10 * D],
    [['chainId'], 1], [['metaAddress'], OTHER_META], [['token'], 'native'], [['amountPolicy'], { mode: 'fixed_token', tokenAmount: '1' }],
    [['feePolicy'], 'seller_pays'], [['signer'], signerPublicKeyHex(OTHER_KEY)],
    [['quote', 'timestamp'], JAN31 + 1], [['quote', 'expiresAt'], JAN31 + 601], [['quote', 'source'], 'other'], [['quote', 'maxSlippageBps'], 51],
    [['lineItems', 0, 'description'], 'Altered service'], [['tax', 'minorUnits'], '0'],
  ] satisfies [readonly (string | number)[], unknown][])('rejects changed invoice business fields at %s', async (path, value) => {
    await expect(validateSnapshot(changed(issued, ['subscription', 'periods', 0, 'invoice', ...path], value))).rejects.toThrow();
  });

  it.each([
    ['subscriptionId', 'other'], ['periodIndex', 3], ['eventId', 'another-event'], ['nonce', 'a'.repeat(32)], ['expiresAt', JAN31], ['link', 42], ['link', 'x'.repeat(65537)], ['kind', 'notification'],
  ] satisfies [string, unknown][])('rejects tampered outbox %s', async (field, value) => {
    await expect(validateSnapshot(changed(issued, ['outbox', 0, field], value))).rejects.toThrow();
  });

  it('requires each invoice and latest reminder commit, but preserves the runner skip-over-reminders behavior', async () => {
    await expect(validateSnapshot({ ...issued, outbox: [] })).rejects.toThrow(/missing committed invoice/);
    await expect(validateSnapshot({ ...issued, outbox: [issued.outbox[0], issued.outbox[0]] })).rejects.toThrow(/outbox identity/);
    await expect(validateSnapshot({ ...reminded, outbox: [reminded.outbox[0]] })).rejects.toThrow(/missing committed reminder/);
    await expect(validateSnapshot(changed(reminded, ['outbox', 1, 'offsetIndex'], -1))).rejects.toThrow(/reminder/);
    await expect(validateSnapshot(changed(reminded, ['outbox', 1, 'offsetIndex'], 3))).rejects.toThrow(/reminder/);
    await expect(validateSnapshot(changed(reminded, ['outbox', 1, 'offsetIndex'], 0.5))).rejects.toThrow(/reminder/);
    await expect(validateSnapshot(changed(reminded, ['outbox', 1, 'dueAt'], JAN31 + 1))).rejects.toThrow(/reminder/);
    await expect(validateSnapshot(changed(reminded, ['outbox', 1, 'eventId'], 'wrong'))).rejects.toThrow(/reminder/);
  });

  it('checks the complete signed invoice instead of only its nonce or supplied signer label', async () => {
    const inv = issued.subscription.periods[0]!.invoice;
    const otherInvoice = { ...inv, nonce: 'e'.repeat(32) };
    const wrongKeyInvoice = { ...inv, signer: signerPublicKeyHex(OTHER_KEY) };
    for (const signed of [signInvoice(otherInvoice, SIGNING_KEY), signInvoice(wrongKeyInvoice, OTHER_KEY)]) {
      const link = config().baseUrl + await encodeFragment(signed);
      await expect(validateSnapshot(changed(issued, ['outbox', 0, 'link'], link))).rejects.toThrow();
    }
    const envelope = JSON.parse(Buffer.from(new URL(invoiceRow(issued).link).hash.slice('#gpi=v1.'.length), 'base64url').toString('utf8')) as Record<string, unknown>;
    const tampered = { ...envelope, sig: '0'.repeat(128) };
    const link = config().baseUrl + '#gpi=v1.' + Buffer.from(JSON.stringify(tampered)).toString('base64url');
    await expect(validateSnapshot(changed(issued, ['outbox', 0, 'link'], link))).rejects.toThrow();
  });

  it.each(['https://other.example/checkout', 'https://pay.example/different', 'http://pay.example/checkout', 'https://pay.example/checkout?leak=1'])('rejects changed delivery URL %s', async base => {
    const fragment = new URL(invoiceRow(issued).link).hash;
    await expect(validateSnapshot(changed(issued, ['outbox', 0, 'link'], base + fragment))).rejects.toThrow();
  });

  it.each(['https://user:password@pay.example/checkout', 'https://pay.example/checkout?'])('rejects payment-link policy violations even when the signed invoice, origin and path match', async base => {
    const fragment = new URL(invoiceRow(issued).link).hash;
    await expect(validateSnapshot(changed(issued, ['outbox', 0, 'link'], base + fragment))).rejects.toThrow();
  });
});
