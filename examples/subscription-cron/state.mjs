import { advance, createSubscription, DEFAULT_DUNNING, periodAt } from '@ghostpay/merchant-billing';
import { canonicalize, parseFragment, validateInvoice } from '@ghostpay/invoice-schema';
import { assertBaseUrl } from '@ghostpay/merchant-hooks';

const same = (a, b) => canonicalize(a) === canonicalize(b);

export const MAX_RECORDS = 1000;
export function keys(v, required, optional = []) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => !required.includes(k) && !optional.includes(k))) throw new Error('invalid persisted object');
}
export function timestamp(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 253402300799) throw new Error('invalid timestamp');
}
export function configuration(v) {
  keys(v, ['subscriptionId', 'baseUrl', 'plan', 'template'], ['_comment']);
  keys(v.plan, ['id', 'name', 'currency', 'amountMinor', 'taxBps', 'schedule']);
  keys(v.plan.schedule, ['anchor', 'cadence']);
  keys(v.plan.schedule.cadence, ['kind', v.plan.schedule.cadence.kind === 'custom' ? 'seconds' : 'every']);
  keys(v.template, ['chainId', 'metaAddress', 'token', 'amountPolicy', 'feePolicy', 'signer', 'quoteSource', 'quoteTtlSeconds', 'maxSlippageBps']);
  if (typeof v.subscriptionId !== 'string' || typeof v.plan.id !== 'string' || typeof v.plan.name !== 'string' || typeof v.plan.currency !== 'string') throw new Error('invalid configuration');
  createSubscription(v.subscriptionId, v.plan, 0);
  assertBaseUrl(v.baseUrl);
  timestamp(v.template.quoteTtlSeconds);
  // Exercise the existing invoice builder/schema even when the real schedule is not yet due.
  // This validation-only invoice is never signed, persisted or delivered. Nonces remain random.
  const validationPlan = {...v.plan, schedule:{...v.plan.schedule,anchor:0}};
  advance(createSubscription(v.subscriptionId,validationPlan,0),0,v.template);
  return { subscriptionId: v.subscriptionId, baseUrl: v.baseUrl, plan: v.plan, template: v.template };
}
export function logicalId(id, index, offset) {
  return offset === undefined ? `${id}:period:${index}:invoice` : `${id}:period:${index}:reminder:${offset}`;
}
export async function validateSnapshot(s, expectedConfig) {
  keys(s, ['version', 'config', 'subscription', 'outbox', 'outboxPath']);
  if (s.version !== 1 || typeof s.outboxPath !== 'string') throw new Error('unsupported state version; legacy state requires operator reconciliation');
  const cfg = configuration(s.config);
  if (expectedConfig && !same(cfg, expectedConfig)) throw new Error('configuration differs from committed state');
  const sub = s.subscription;
  keys(sub, ['id', 'plan', 'status', 'createdAt', 'nextIndex', 'periods'], ['pausedAt', 'cancelAtPeriodEnd', 'canceledAt']);
  if (sub.id !== cfg.subscriptionId || !same(sub.plan, cfg.plan) || !['active', 'paused', 'past_due', 'lapsed', 'canceled'].includes(sub.status)) throw new Error('invalid subscription state');
  timestamp(sub.createdAt);
  for (const k of ['pausedAt', 'cancelAtPeriodEnd', 'canceledAt']) if (sub[k] !== undefined) { timestamp(sub[k]); if (sub[k] < sub.createdAt) throw new Error('state time precedes creation'); }
  if ((sub.status === 'paused') !== (sub.pausedAt !== undefined) && sub.status !== 'canceled') throw new Error('invalid pause state');
  if ((sub.status === 'canceled') !== (sub.canceledAt !== undefined)) throw new Error('invalid cancellation state');
  if (!Number.isSafeInteger(sub.nextIndex) || sub.nextIndex < 0 || sub.nextIndex > 100000 || !Array.isArray(sub.periods) || sub.periods.length > MAX_RECORDS || !Array.isArray(s.outbox) || s.outbox.length > MAX_RECORDS * 4) throw new Error('invalid state bounds');
  const periods = new Map();
  const nonces = new Set();
  let prior = -1;
  for (const p of sub.periods) {
    keys(p, ['index', 'start', 'end', 'amountMinor', 'taxMinor', 'status', 'invoice', 'issuedAt', 'dueAt', 'remindersSent'], ['paidAt']);
    if (!Number.isSafeInteger(p.index) || p.index <= prior || p.index >= sub.nextIndex) throw new Error('invalid period order');
    prior = p.index;
    const per = periodAt(cfg.plan.schedule, p.index);
    if (per.start !== p.start || per.end !== p.end) throw new Error('period schedule mismatch');
    timestamp(p.issuedAt); timestamp(p.dueAt);
    if (p.issuedAt < sub.createdAt || p.dueAt !== Math.max(p.start, p.issuedAt) || !['issued','paid','void'].includes(p.status) || !Number.isSafeInteger(p.remindersSent) || p.remindersSent < 0 || p.remindersSent > DEFAULT_DUNNING.reminderOffsets.length) throw new Error('invalid period state');
    if (p.status === 'paid') { timestamp(p.paidAt); if (p.paidAt < p.issuedAt) throw new Error('payment precedes issuance'); }
    else if (p.paidAt !== undefined) throw new Error('unexpected payment time');
    const inv = validateInvoice(p.invoice);
    if (nonces.has(inv.nonce)) throw new Error('duplicate invoice nonce');
    nonces.add(inv.nonce);
    const tax = BigInt(cfg.plan.amountMinor) * BigInt(cfg.plan.taxBps) / 10000n;
    if (p.amountMinor !== cfg.plan.amountMinor || p.taxMinor !== tax.toString() || inv.fiat.currency !== cfg.plan.currency || inv.fiat.minorUnits !== (BigInt(p.amountMinor)+tax).toString() || inv.expiresAt !== p.dueAt + DEFAULT_DUNNING.graceSeconds + DEFAULT_DUNNING.lapseAfterSeconds) throw new Error('invoice amount or expiry mismatch');
    for (const k of ['chainId','metaAddress','token','amountPolicy','feePolicy','signer']) if (!same(inv[k],cfg.template[k])) throw new Error('invoice configuration mismatch');
    if (inv.quote.timestamp !== p.issuedAt || inv.quote.expiresAt !== p.issuedAt + cfg.template.quoteTtlSeconds || inv.quote.source !== cfg.template.quoteSource || inv.quote.maxSlippageBps !== cfg.template.maxSlippageBps) throw new Error('invoice quote mismatch');
    const date = t => new Date(t * 1000).toISOString().slice(0,10);
    if (!same(inv.lineItems,[{description:`${cfg.plan.name} ${date(p.start)} to ${date(p.end)}`,quantity:'1',unitMinorUnits:p.amountMinor}]) || !same(inv.tax,{rateBps:cfg.plan.taxBps,minorUnits:p.taxMinor})) throw new Error('invoice line item or tax mismatch');
    periods.set(p.index,p);
  }
  const seen = new Set();
  const invoiced = new Set();
  for (const r of s.outbox) {
    const invoice = r.kind === 'invoice';
    keys(r, invoice ? ['kind','eventId','subscriptionId','periodIndex','nonce','expiresAt','link'] : ['kind','eventId','subscriptionId','periodIndex','offsetIndex','dueAt']);
    const p = periods.get(r.periodIndex);
    if (!p || r.subscriptionId !== sub.id || seen.has(r.eventId)) throw new Error('invalid outbox identity');
    seen.add(r.eventId);
    if (invoice) {
      if (r.eventId !== logicalId(sub.id,p.index) || r.nonce !== p.invoice.nonce || r.expiresAt !== p.invoice.expiresAt || typeof r.link !== 'string' || r.link.length > 65536) throw new Error('invalid invoice outbox record');
      const url = new URL(r.link); const base = assertBaseUrl(cfg.baseUrl);
      if (url.origin !== base.origin || url.pathname !== base.pathname || url.search) throw new Error('outbox URL mismatch');
      const parsed = await parseFragment(url.hash, { pinnedSigners: [cfg.template.signer] });
      if (!parsed.verification.signerPinned || !same(parsed.invoice,p.invoice)) throw new Error('outbox signature or invoice mismatch');
      invoiced.add(p.index);
    } else if (r.kind !== 'reminder' || !Number.isSafeInteger(r.offsetIndex) || r.offsetIndex < 0 || r.offsetIndex >= p.remindersSent || r.dueAt !== p.dueAt || r.eventId !== logicalId(sub.id,p.index,r.offsetIndex)) throw new Error('invalid reminder');
  }
  if (invoiced.size !== periods.size) throw new Error('missing committed invoice');
  for (const p of periods.values()) if (p.remindersSent > 0 && !seen.has(logicalId(sub.id,p.index,p.remindersSent-1))) throw new Error('missing committed reminder');
  return s;
}
