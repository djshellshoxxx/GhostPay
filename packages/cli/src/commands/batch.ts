import {
  BillingError,
  confirmBatch,
  parseDecimal,
  previewBatch,
  formatDecimal,
  type BatchPreview,
  type ImportOptions,
} from '@ghostpay/merchant-billing';
import { noPositionals, parseIntOption, requireValue, type Parsed } from '../args.js';
import type { Ctx } from '../ctx.js';
import { usageError } from '../io.js';
import type { Command } from './types.js';

const ASSET_RE = /^(?:native|0x[0-9a-f]{40})$/;

const SHARED = {
  csv: 'value',
  'chain-id': 'value',
  asset: 'value',
  decimals: 'value',
  min: 'value',
  'per-recipient-max': 'value',
  'max-recipients': 'value',
  'max-total': 'value',
  duplicates: 'value',
  'allow-lowercase': 'flag',
} as const;

function options(a: Parsed): ImportOptions {
  const asset = requireValue(a, 'asset');
  if (!ASSET_RE.test(asset)) throw usageError('BAD_ASSET', '--asset must be "native" or a lowercase 0x token address.');
  const decimals = parseIntOption(requireValue(a, 'decimals'), 'decimals', 0, 36);
  const dup = a.values.get('duplicates') ?? 'reject';
  if (dup !== 'reject' && dup !== 'merge') throw usageError('BAD_DUPLICATES', '--duplicates must be reject or merge.');
  const money = (name: string): bigint => {
    try {
      return parseDecimal(requireValue(a, name), decimals);
    } catch (e) {
      if (e instanceof BillingError) throw usageError('BAD_AMOUNT', `--${name} must be a plain decimal with at most ${decimals} places.`);
      throw e;
    }
  };
  return {
    chainId: parseIntOption(requireValue(a, 'chain-id'), 'chain-id', 1, Number.MAX_SAFE_INTEGER),
    token: asset,
    decimals,
    duplicates: dup,
    allowLowercaseAddress: a.flags.has('allow-lowercase'),
    limits: {
      minAmount: money('min'),
      perRecipientMax: money('per-recipient-max'),
      maxRecipients: parseIntOption(requireValue(a, 'max-recipients'), 'max-recipients', 1, 10_000),
      maxTotal: money('max-total'),
    },
  };
}

async function load(ctx: Ctx, a: Parsed): Promise<{ preview: BatchPreview } | { code: number }> {
  noPositionals(a);
  const opts = options(a);
  const result = previewBatch(await ctx.read(requireValue(a, 'csv')), opts);
  if (result.ok) return { preview: result };
  ctx.out(
    { ok: false, issues: result.issues },
    ['CSV rejected:', ...result.issues.map((i) => `  row ${i.row}  ${i.field}: ${i.code}`)].join('\n'),
  );
  return { code: 1 };
}

function table(p: BatchPreview): string {
  return p.items
    .map((i, n) => `${String(n + 1).padStart(4)}  ${i.destination}  ${formatDecimal(i.amount, p.decimals)}  ${i.label}`)
    .join('\n');
}

export const batchCommands: readonly Command[] = [
  {
    path: ['batch', 'preview'],
    summary: 'validate a payout CSV and show every row plus a preview hash',
    usage: 'ghostpay batch preview --csv F|- --chain-id N --asset native|0xTOKEN --decimals N --min D --per-recipient-max D --max-recipients N --max-total D [--duplicates reject|merge] [--allow-lowercase]\n  CSV header: destination,amount,label. Nothing is paid or created.',
    opts: SHARED,
    handler: async (ctx, a) => {
      const r = await load(ctx, a);
      if ('code' in r) return r.code;
      const p = r.preview;
      ctx.out(
        {
          ok: true,
          chainId: p.chainId,
          asset: p.token,
          decimals: p.decimals,
          count: p.items.length,
          merged: p.merged,
          total: p.total.toString(),
          previewHash: p.previewHash,
          items: p.items.map((i) => ({ destination: i.destination, kind: i.kind, amount: i.amount.toString(), label: i.label })),
        },
        `${table(p)}\n\n${p.items.length} payouts, total ${formatDecimal(p.total, p.decimals)} (${p.total.toString()} base units)\npreview hash: ${p.previewHash}\nReview every row, then run \`batch confirm\` with the same options and --hash.`,
      );
      return 0;
    },
  },
  {
    path: ['batch', 'confirm'],
    summary: 'confirm a reviewed payout CSV by its preview hash',
    usage: 'ghostpay batch confirm <same options as preview> --hash PREVIEW_HASH\n  Fails if the file or options changed since the preview. Creates no payment; it prints the confirmed plan id.',
    opts: { ...SHARED, hash: 'value' },
    handler: async (ctx, a) => {
      const hash = requireValue(a, 'hash');
      const r = await load(ctx, a);
      if ('code' in r) return r.code;
      try {
        const plan = confirmBatch(r.preview, hash);
        ctx.out(
          { ok: true, planId: plan.planId, count: plan.items.length, total: plan.total.toString() },
          `confirmed plan ${plan.planId}: ${plan.items.length} payouts, ${formatDecimal(plan.total, r.preview.decimals)} total.\nNo payment was created; hand this plan to your payout tooling.`,
        );
        return 0;
      } catch (e) {
        if (e instanceof BillingError) {
          ctx.out(
            { ok: false, reason: 'confirmation-mismatch' },
            'NOT confirmed: the hash does not match this file and these options. Re-run `batch preview` and review again.',
          );
          return 1;
        }
        throw e;
      }
    },
  },
];
