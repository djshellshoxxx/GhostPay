import { noPositionals, parseIntOption, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { CliError, failError } from '../io.js';
import { secretOpts } from '../secrets.js';
import { openReconciliation, readBackup, reconciliationApi, withBackupErrors } from '../backup-data.js';
import type { Command } from './types.js';

export async function historyState(ctx: Ctx, a: Parsed) {
  const input = await readBackup(ctx, a);
  if (input.format !== 'reconciliation') throw new CliError('unsupported', 'HISTORY_FORMAT_UNSUPPORTED', 'transaction history requires an encrypted reconciliation file.');
  return withBackupErrors(async () => {
    const { vault } = await openReconciliation(ctx, a, input, false);
    try { return { input, state: await vault.readState() }; }
    finally { vault.lock(); }
  });
}
async function list(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const limit = parseIntOption(a.values.get('limit') ?? '50', 'limit', 1, 2000);
  const offset = parseIntOption(a.values.get('offset') ?? '0', 'offset', 0, 2000);
  const { state } = await historyState(ctx, a);
  const matched = reconciliationApi.searchReconciliationRecords(state.records, a.values.get('query') ?? '');
  const records = matched.slice(offset, offset + limit);
  const result = { ok: true, currentChainVerified: false, evidenceMeaning: 'historical-local-observations', total: state.records.length, matched: matched.length, offset, records, readOnly: state.readOnly };
  if (a.values.has('out')) await ctx.writeOut(a, JSON.stringify(result, null, 2) + '\n');
  ctx.out(result, `${matched.length} historical observations; showing ${records.length}. Current-chain settlement has not been reverified.\n${records.map(r => `${r.transactionHash} ${r.asset} ${r.amountMinorUnits} ${r.evidenceStatus} ${r.provenance}`).join('\n')}`);
  return 0;
}
async function inspect(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const id = requireValue(a, 'record');
  const { state } = await historyState(ctx, a);
  const record = state.records.find(r => r.id === id);
  if (record === undefined) throw failError('RECORD_NOT_FOUND', 'no matching historical observation exists in this scope.');
  ctx.out({ ok: true, currentChainVerified: false, record }, `Historical observation: ${record.transactionHash}\nStatus when stored: ${record.evidenceStatus}\nProvenance: ${record.provenance}\nThe stored reference does not independently prove current-chain settlement.`);
  return 0;
}
export const historyCommands: readonly Command[] = [
  { path: ['history', 'list'], summary: 'list authenticated local transaction history without promoting its trust', usage: 'ghostpay history list --in RECONCILIATION_JSON --viewing-key-file KEY [--query TEXT] [--limit 50] [--offset 0] [--out REPORT] [--json]\n  Reverify historical records with payment verify before treating them as current-chain evidence.\n  Example: ghostpay history list --in history.json --viewing-key-file view.hex --json', opts: { in: 'value', ...secretOpts('viewing-key'), query: 'value', limit: 'value', offset: 'value', ...OUT_OPTS }, handler: list },
  { path: ['history', 'inspect'], summary: 'inspect the exact canonical references of a historical observation', usage: 'ghostpay history inspect --in RECONCILIATION_JSON --viewing-key-file KEY --record RECORD_ID [--json]\n  Example: ghostpay history inspect --in history.json --viewing-key-file view.hex --record ID --json', opts: { in: 'value', ...secretOpts('viewing-key'), record: 'value' }, handler: inspect },
];
