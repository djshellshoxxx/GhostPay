import { applyPayment, configuration, createLedger, parseAmount, summarize, validateSnapshot, type Installment, type Ledger, type Tolerance } from '@ghostpay/merchant-billing';
import { parseWebhookEvent } from '@ghostpay/merchant-hooks';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { CliError, failError } from '../io.js';
import type { Command } from './types.js';

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || required.some(k => !Object.hasOwn(value, k)) ||
      Object.keys(value).some(k => !required.includes(k) && !optional.includes(k)))
    throw failError('MERCHANT_FORMAT', 'merchant input has missing or unsupported fields.');
  return value as Record<string, unknown>;
}
function amount(value: unknown): bigint {
  if (typeof value !== 'string') throw failError('MERCHANT_AMOUNT', 'amounts must be canonical decimal strings.');
  return parseAmount(value);
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw failError('MERCHANT_INTEGER', 'merchant numeric fields must be nonnegative safe integers.');
  return value;
}
function json(value: unknown): string { return JSON.stringify(value, (_key, v: unknown) => typeof v === 'bigint' ? v.toString() : v, 2); }
async function planInstallments(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const input = object(parseStrictJson(await ctx.read(requireValue(a, 'in'))), ['total', 'depositBps', 'count', 'startAt', 'firstDue', 'intervalSeconds', 'tolerance']);
  const t = object(input['tolerance'], ['underpayAbs', 'underpayBps', 'overpayAbs', 'overpayBps']);
  const tolerance: Tolerance = { underpayAbs: amount(t['underpayAbs']).toString(), underpayBps: integer(t['underpayBps']),
    overpayAbs: amount(t['overpayAbs']).toString(), overpayBps: integer(t['overpayBps']) };
  const ledger = createLedger({ total: amount(input['total']), depositBps: integer(input['depositBps']), count: integer(input['count']),
    startAt: integer(input['startAt']), firstDue: integer(input['firstDue']), intervalSeconds: integer(input['intervalSeconds']), tolerance });
  const text = json(ledger); const wrote = await ctx.writeOut(a, text + '\n');
  ctx.out({ ok: true, paymentVerified: false, ...(wrote ? { out: a.values.get('out') } : { result: JSON.parse(text) as unknown }) },
    wrote ? 'Wrote installment plan. No payment was verified or executed.' : text + '\nPlanning only: no payment was verified or executed.');
  return 0;
}

async function inspectInstallments(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const input = object(parseStrictJson(await ctx.read(requireValue(a, 'in'))), ['total', 'tolerance', 'schedule', 'payments']);
  const total = amount(input['total']); const t = object(input['tolerance'], ['underpay', 'overpay']);
  const underpay = amount(t['underpay']); const overpay = amount(t['overpay']);
  const rawSchedule = input['schedule']; const rawPayments = input['payments'];
  if (total <= 0n || underpay >= total || !Array.isArray(rawSchedule) || rawSchedule.length === 0 || rawSchedule.length > 121 ||
      !Array.isArray(rawPayments) || rawPayments.length > 1000) throw failError('MERCHANT_FORMAT', 'invalid installment ledger bounds.');
  let prior = -1;
  const schedule = rawSchedule.map((value: unknown, index): Installment => {
    const row = object(value, ['index', 'kind', 'amount', 'dueAt']); const dueAt = integer(row['dueAt']); const due = amount(row['amount']);
    const kind = row['kind'];
    if (row['index'] !== index || (kind !== 'deposit' && kind !== 'installment') || (kind === 'deposit' && index !== 0) || due <= 0n || dueAt < prior)
      throw failError('MERCHANT_FORMAT', 'invalid installment schedule.');
    prior = dueAt; return { index, kind, amount: due, dueAt };
  });
  if (schedule.reduce((sum, part) => sum + part.amount, 0n) !== total) throw failError('MERCHANT_AMOUNT', 'installments do not sum to the total.');
  let ledger: Ledger = { total, tolerance: { underpay, overpay }, schedule, payments: [] }; let duplicateObservations = 0;
  for (const value of rawPayments as unknown[]) {
    const row = object(value, ['id', 'amount', 'at']); const at = integer(row['at']);
    if (typeof row['id'] !== 'string' || at > ctx.io.nowSeconds()) throw failError('MERCHANT_PAYMENT', 'invalid or future payment observation.');
    const existing = ledger.payments.find(p => p.id === row['id']);
    if (existing !== undefined && existing.at !== at) throw failError('MERCHANT_PAYMENT', 'conflicting duplicate observation time.');
    const applied = applyPayment(ledger, { id: row['id'], amount: amount(row['amount']), at });
    ledger = applied.ledger; if (applied.duplicate) duplicateObservations++;
  }
  const summary = summarize(ledger, ctx.io.nowSeconds());
  const report = { ok: true, schemaVersion: 1, paymentVerified: false, evidenceSource: 'untrusted-import',
    reportedState: summary.status, totalClaimed: summary.paid.toString(), remaining: summary.remaining.toString(),
    duplicateObservations, observations: ledger.payments.length, installments: JSON.parse(json(summary.installments)) as unknown };
  const wrote = await ctx.writeOut(a, json(report) + '\n');
  ctx.out({ ...report, ...(wrote ? { out: a.values.get('out') } : {}) }, `Installment projection: ${summary.status}. Imported amounts are claims; no payment was independently verified.`);
  return 0;
}

export const merchantCommands: readonly Command[] = [{
  path: ['merchant', 'installments', 'plan'], summary: 'create an exact deposit and installment schedule',
  usage: 'ghostpay merchant installments plan --in SPEC [--out FILE] [--force]\n  SPEC: total (decimal string), depositBps, count, startAt, firstDue, intervalSeconds, tolerance.\n  Example: ghostpay merchant installments plan --in installments.json --json\n  Planning only; never verifies payment or authorizes a transfer.',
  opts: { in: 'value', ...OUT_OPTS }, handler: planInstallments,
}, {
  path: ['merchant', 'installments', 'inspect'], summary: 'validate a ledger and inspect its unverified payment projection',
  usage: 'ghostpay merchant installments inspect --in LEDGER [--out REPORT]\n  Example: ghostpay merchant installments inspect --in installments.json --json\n  Exact duplicate claims are counted once; conflicts and future timestamps fail. Imported payment claims never become verified payments.',
  opts: { in: 'value', ...OUT_OPTS }, handler: inspectInstallments,
}, {
  path: ['merchant', 'webhooks', 'inspect'], summary: 'validate a webhook event and identify its idempotency key',
  usage: 'ghostpay merchant webhooks inspect --in EVENT\n  Example: ghostpay merchant webhooks inspect --in event.json --json\n  A valid event schema is not a valid HMAC, replay check or payment confirmation. Use webhook verify for the exact-byte signature check and the durable receiver for replay protection.',
  opts: { in: 'value' }, handler: async (ctx, a) => {
    noPositionals(a); const raw = parseStrictJson(await ctx.read(requireValue(a, 'in')));
    const event = parseWebhookEvent(JSON.stringify(raw));
    if (event.createdAt > ctx.io.nowSeconds()) throw failError('WEBHOOK_FUTURE', 'webhook event time is in the future.');
    ctx.out({ ok: true, schemaVersion: 1, idempotencyKey: event.id, type: event.type, createdAt: event.createdAt,
      signatureVerified: false, replayChecked: false, paymentVerified: false }, 'Webhook event schema validated. Its event ID is the idempotency key; signature, replay and payment checks remain separate.');
    return 0;
  },
}, {
  path: ['merchant', 'subscriptions', 'validate'], summary: 'validate the durable subscription runner configuration',
  usage: 'ghostpay merchant subscriptions validate --in CONFIG\n  Example: ghostpay merchant subscriptions validate --in subscription.json --json\n  Uses the same validator as examples/subscription-cron/run.mjs. Does not issue, sign or deliver an invoice.',
  opts: { in: 'value' }, handler: async (ctx, a) => {
    noPositionals(a); const raw = parseStrictJson(await ctx.read(requireValue(a, 'in')));
    try {
      const config = configuration(raw);
      ctx.out({ ok: true, schemaVersion: 1, chainId: config.template.chainId, invoiceIssued: false, paymentVerified: false }, 'Subscription configuration is valid. No invoice was issued and no payment was verified.');
      return 0;
    } catch { throw new CliError('config', 'MERCHANT_CONFIG_INVALID', 'subscription configuration is invalid.', 'Use the durable subscription runner configuration schema.'); }
  },
}, {
  path: ['merchant', 'subscriptions', 'inspect'], summary: 'validate and inspect a durable subscription snapshot',
  usage: 'ghostpay merchant subscriptions inspect --in STATE\n  Example: ghostpay merchant subscriptions inspect --in state.json --json\n  Validates invoice signatures, periods, configuration and outbox identity. Paid states are operator acknowledgements, not independent on-chain verification.',
  opts: { in: 'value' }, handler: async (ctx, a) => {
    noPositionals(a); const raw = parseStrictJson(await ctx.read(requireValue(a, 'in')));
    let state;
    try { state = await validateSnapshot(raw); }
    catch { throw failError('MERCHANT_STATE_INVALID', 'subscription snapshot is malformed or inconsistent.'); }
    ctx.out({ ok: true, schemaVersion: 1, status: state.subscription.status, nextPeriod: state.subscription.nextIndex,
      periodCount: state.subscription.periods.length, outboxCount: state.outbox.length,
      manuallyAcknowledgedPeriods: state.subscription.periods.filter(p => p.status === 'paid').length,
      paymentVerified: false, restartSafeFormat: true }, 'Subscription snapshot validated, including committed invoice identities. Paid labels are manual acknowledgements.');
    return 0;
  },
}];
