import { formatDecimal, parseAmount, parseDecimal, splitByBps, type Share } from '@ghostpay/merchant-billing';
import { noPositionals, parseIntOption } from '../args.js';
import { usageError } from '../io.js';
import type { Command } from './types.js';

function parseShare(text: string): Share {
  const m = /^([A-Za-z0-9_.-]{1,64})=([0-9]{1,5})$/.exec(text);
  if (m === null) throw usageError('BAD_SHARE', '--share must look like alice=7000 (id=basis points).');
  return { id: m[1] as string, bps: Number(m[2]) };
}

export const splitCommands: readonly Command[] = [
  {
    path: ['split', 'compute'],
    summary: 'split an amount by basis points with exact remainders',
    usage: 'ghostpay split compute (--total BASE_UNITS | --amount DECIMAL --decimals N) --share ID=BPS ...\n  Shares must sum to 10000. Results always add up to the total exactly.',
    opts: { total: 'value', amount: 'value', decimals: 'value', share: 'multi' },
    handler: (ctx, a) => {
      noPositionals(a);
      const total = a.values.get('total');
      const amount = a.values.get('amount');
      if ((total === undefined) === (amount === undefined))
        throw usageError('TOTAL_SOURCE', 'give exactly one of --total (base units) or --amount (decimal with --decimals).');
      const dec = a.values.get('decimals');
      const decimals = dec === undefined ? undefined : parseIntOption(dec, 'decimals', 0, 36);
      if (amount !== undefined && decimals === undefined)
        throw usageError('MISSING_OPTION', '--amount needs --decimals.');
      const base = total !== undefined ? parseAmount(total) : parseDecimal(amount, decimals as number);
      const shares = (a.multi.get('share') ?? []).map(parseShare);
      if (shares.length === 0) throw usageError('MISSING_OPTION', 'at least one --share is required.');
      const rows = splitByBps(base, shares).map((r, i) => ({
        id: r.id,
        bps: (shares[i] as Share).bps,
        amount: r.amount.toString(),
        ...(decimals === undefined ? {} : { decimal: formatDecimal(r.amount, decimals) }),
      }));
      ctx.out(
        { ok: true, total: base.toString(), shares: rows },
        [...rows.map((r) => `${r.id.padEnd(16)} ${String(r.bps).padStart(5)} bps  ${r.amount}${r.decimal === undefined ? '' : `  (${r.decimal})`}`), `total            ${base.toString()}`].join('\n'),
      );
      return Promise.resolve(0);
    },
  },
];
