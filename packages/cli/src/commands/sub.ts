import { listPeriods, type Cadence, type ScheduleSpec } from '@ghostpay/merchant-billing';
import { noPositionals, parseIntOption, parseTime, requireValue } from '../args.js';
import { usageError } from '../io.js';
import type { Command } from './types.js';

function parseCadence(text: string): Cadence {
  const m = /^(weekly|monthly|custom):([0-9]{1,9})$/.exec(text);
  if (m === null)
    throw usageError('BAD_CADENCE', '--cadence must look like monthly:1, weekly:2 or custom:86400.');
  const n = Number(m[2]);
  return m[1] === 'custom' ? { kind: 'custom', seconds: n } : { kind: m[1] as 'weekly' | 'monthly', every: n };
}

const iso = (t: number): string => new Date(t * 1000).toISOString().replace('.000Z', 'Z');

export const subCommands: readonly Command[] = [
  {
    path: ['sub', 'schedule'],
    summary: 'list billing periods for a subscription schedule',
    usage: 'ghostpay sub schedule --anchor T --cadence monthly:N|weekly:N|custom:SECONDS [--from INDEX] [--count N]\n  T = unix seconds, "now" or YYYY-MM-DDTHH:MM:SSZ. Month-end anchors clamp without drifting.',
    opts: { anchor: 'value', cadence: 'value', from: 'value', count: 'value' },
    handler: (ctx, a) => {
      noPositionals(a);
      const spec: ScheduleSpec = {
        anchor: parseTime(requireValue(a, 'anchor'), 'anchor', ctx.io.nowSeconds),
        cadence: parseCadence(requireValue(a, 'cadence')),
      };
      const count = parseIntOption(a.values.get('count') ?? '6', 'count', 1, 1000);
      const from = parseIntOption(a.values.get('from') ?? '0', 'from', 0, 100_000);
      const periods = listPeriods(spec, from, count).map((p) => ({
        index: p.index,
        start: p.start,
        end: p.end,
        startIso: iso(p.start),
        endIso: iso(p.end),
      }));
      ctx.out(
        { ok: true, anchor: spec.anchor, cadence: spec.cadence, periods },
        periods.map((p) => `#${p.index}  ${p.startIso} -> ${p.endIso}`).join('\n'),
      );
      return Promise.resolve(0);
    },
  },
];
