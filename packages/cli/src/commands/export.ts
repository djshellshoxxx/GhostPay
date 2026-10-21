import { parseStrictJson, validateInvoice } from '@ghostpay/invoice-schema';
import {
  exportCsv,
  exportIif,
  exportJson,
  exportXeroCsv,
  fromSchemaInvoice,
  type ExportInvoice,
  type ExportOptions,
  type RoundingMode,
} from '@ghostpay/merchant-ledger';
import { noPositionals, requireValue } from '../args.js';
import { OUT_OPTS } from '../ctx.js';
import { failError, usageError } from '../io.js';
import type { Command } from './types.js';

const MAX_ROWS = 5000;
const FORMATS = ['csv', 'json', 'xero', 'iif'] as const;
const ROUNDING: readonly string[] = ['half-up', 'half-even', 'down', 'up'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toExport(entry: unknown, n: number): ExportInvoice {
  if (!isRecord(entry)) throw failError('BAD_ROW', `entry ${n} is not an object.`);
  if ('invoice' in entry) {
    const str = (k: string): string | undefined => (typeof entry[k] === 'string' ? entry[k] : undefined);
    return fromSchemaInvoice(validateInvoice(entry['invoice']), str('customer'), str('status'), str('paidMinor'));
  }
  const ok =
    typeof entry['id'] === 'string' &&
    typeof entry['currency'] === 'string' &&
    Number.isSafeInteger(entry['createdAt']) &&
    Number.isSafeInteger(entry['dueAt']) &&
    Number.isSafeInteger(entry['taxRateBps']) &&
    Array.isArray(entry['lineItems']) &&
    (entry['lineItems'] as unknown[]).every(
      (l) => isRecord(l) && typeof l['description'] === 'string' && typeof l['quantity'] === 'string' && typeof l['unitMinor'] === 'string',
    );
  if (!ok)
    throw failError('BAD_ROW', `entry ${n} is missing fields.`, 'Each entry needs id, currency, createdAt, dueAt, taxRateBps and lineItems[{description,quantity,unitMinor}] (money as strings).');
  return entry as unknown as ExportInvoice;
}

export const exportCommands: readonly Command[] = [
  {
    path: ['export'],
    summary: 'export invoices as accounting CSV/JSON/Xero/IIF (formula-safe)',
    usage: 'ghostpay export --in INVOICES.json|- [--format csv|json|xero|iif] [--rounding half-up|half-even|down|up] [--sales-account A] [--tax-account A] [--receivable-account A] [--out F] [--force]\n  INVOICES is a JSON array of ledger entries or {invoice, customer?, status?, paidMinor?} wrappers.',
    opts: {
      in: 'value',
      format: 'value',
      rounding: 'value',
      'sales-account': 'value',
      'tax-account': 'value',
      'receivable-account': 'value',
      ...OUT_OPTS,
    },
    handler: async (ctx, a) => {
      noPositionals(a);
      const format = a.values.get('format') ?? 'csv';
      if (!(FORMATS as readonly string[]).includes(format))
        throw usageError('BAD_FORMAT', `--format must be one of ${FORMATS.join(', ')}.`);
      const rounding = a.values.get('rounding');
      if (rounding !== undefined && !ROUNDING.includes(rounding))
        throw usageError('BAD_ROUNDING', `--rounding must be one of ${ROUNDING.join(', ')}.`);
      const raw = parseStrictJson(await ctx.read(requireValue(a, 'in')));
      if (!Array.isArray(raw)) throw failError('BAD_INPUT', 'input must be a JSON array.');
      if (raw.length > MAX_ROWS) throw failError('TOO_MANY_ROWS', `at most ${MAX_ROWS} entries per export.`);
      const invoices = (raw as unknown[]).map(toExport);
      const opt = (k: string): string | undefined => a.values.get(k);
      const sales = opt('sales-account');
      const tax = opt('tax-account');
      const recv = opt('receivable-account');
      const options: ExportOptions = {
        ...(rounding === undefined ? {} : { rounding: rounding as RoundingMode }),
        ...(sales === undefined ? {} : { salesAccount: sales }),
        ...(tax === undefined ? {} : { taxAccount: tax }),
        ...(recv === undefined ? {} : { receivableAccount: recv }),
      };
      const text =
        format === 'json' ? exportJson(invoices, options) : format === 'xero' ? exportXeroCsv(invoices, options) : format === 'iif' ? exportIif(invoices, options) : exportCsv(invoices, options);
      const wrote = await ctx.writeOut(a, text);
      ctx.out(
        { ok: true, format, count: invoices.length, ...(wrote ? { out: a.values.get('out') } : { data: text }) },
        wrote ? `wrote ${invoices.length} invoices to ${a.values.get('out') as string} (${format})` : text,
      );
      return 0;
    },
  },
];
