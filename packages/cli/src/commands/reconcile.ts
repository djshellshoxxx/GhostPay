import { parseStrictJson, parseVerifiedReceipt, validateInvoice, verifyInvoiceSignature } from '@ghostpay/invoice-schema';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import type { Ctx } from '../ctx.js';
import { failError, usageError } from '../io.js';
import { secretOpts } from '../secrets.js';
import { MemoryReconciliationStore, readBackup, reconciliationApi, sha256Text, withBackupErrors } from '../backup-data.js';
import { configuredChain, MANIFEST_OPTS, ONLINE_OPTS } from '../payment-context.js';
import { record } from '../payment-input.js';
import { currentObservations, freshCanonicalContext, immutableOutput, loadSeller, operatorVault, unchangedInput, unchangedObservations } from '../reconcile-session.js';
import { historyState } from './history.js';
import type { Command } from './types.js';

const CREDENTIALS = { keystore: 'value', ...secretOpts('passphrase'), ...secretOpts('viewing-key') } as const;
const OUTPUT = { out: 'value' } as const;
const LIVE = { observations: 'value', ...MANIFEST_OPTS, ...ONLINE_OPTS } as const;
const PROPOSAL_TTL_SECONDS = 300;
interface ProposalFile {
  readonly version: 1;
  readonly kind: 'ghostpay-reconciliation-proposal';
  readonly stateSha256: string;
  readonly observationsSha256: string;
  readonly manifestDigest: string;
  readonly providerFingerprint: string;
  readonly secondaryRequired: boolean;
  readonly recordId: string;
  readonly invoiceDigest: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}
const proposalKeys = ['version', 'kind', 'stateSha256', 'observationsSha256', 'manifestDigest', 'providerFingerprint', 'secondaryRequired', 'recordId', 'invoiceDigest', 'createdAt', 'expiresAt'];
function parseProposal(text: string, now: number): ProposalFile {
  const p = record(parseStrictJson(text), proposalKeys);
  if (p['version'] !== 1 || p['kind'] !== 'ghostpay-reconciliation-proposal' ||
      typeof p['stateSha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(p['stateSha256']) ||
      typeof p['observationsSha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(p['observationsSha256']) ||
      typeof p['manifestDigest'] !== 'string' || !/^0x[0-9a-f]{64}$/.test(p['manifestDigest']) ||
      typeof p['providerFingerprint'] !== 'string' || !/^[0-9a-f]{64}$/.test(p['providerFingerprint']) ||
      typeof p['secondaryRequired'] !== 'boolean' ||
      typeof p['recordId'] !== 'string' || p['recordId'].length > 400 ||
      typeof p['invoiceDigest'] !== 'string' || !/^0x[0-9a-f]{64}$/.test(p['invoiceDigest']) ||
      !Number.isSafeInteger(p['createdAt']) || !Number.isSafeInteger(p['expiresAt']) ||
      (p['createdAt'] as number) > now || (p['expiresAt'] as number) <= now ||
      (p['expiresAt'] as number) - (p['createdAt'] as number) !== PROPOSAL_TTL_SECONDS)
    throw failError('STALE_PROPOSAL', 'proposal is invalid, expired or from a future clock; generate it again.');
  return p as unknown as ProposalFile;
}
async function inspect(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const { state } = await historyState(ctx, a);
  const conflicts = new Map<string, string[]>();
  for (const r of state.records) {
    const group = `${r.transactionHash}:${r.stealthAddress}`;
    conflicts.set(group, [...(conflicts.get(group) ?? []), r.id]);
  }
  const competing = [...conflicts.values()].filter(ids => ids.length > 1);
  ctx.out({ ok: true, currentChainVerified: false, records: state.records.length, invoices: state.invoices.length, receipts: state.receipts.length, readOnly: state.readOnly, imported: state.records.filter(r => r.provenance === 'imported-history').length, invalidated: state.records.filter(r => r.evidenceStatus === 'invalidated-after-reorg').length, competingObservations: competing }, `${state.records.length} local observations, ${state.invoices.length} registered invoices, ${state.receipts.length} signed receipts. Current-chain evidence has not been verified.`);
  return 0;
}
async function create(ctx: Ctx, a: Parsed): Promise<number> {
  immutableOutput(a);
  return withBackupErrors(async () => {
    const chain = configuredChain(a, true);
    const seller = await loadSeller(ctx, a);
    const vault = new reconciliationApi.ReconciliationVault(new MemoryReconciliationStore(), { sellerKeyId: seller.sellerKeyId, chainId: chain.chainId }, () => undefined, () => ctx.io.nowSeconds() * 1000);
    try {
      await vault.unlock(seller.secrets.viewingKey.slice());
      await ctx.writeOut(a, await vault.exportEncrypted());
      ctx.out({ ok: true, chainId: chain.chainId, recordCount: 0, currentChainVerified: false, out: a.values.get('out') }, 'Created an empty encrypted reconciliation file in the authenticated seller/chain scope.');
      return 0;
    } finally { vault.lock(); seller.close(); }
  });
}
async function register(ctx: Ctx, a: Parsed): Promise<number> {
  immutableOutput(a);
  return withBackupErrors(async () => {
    const op = await operatorVault(ctx, a, true);
    try {
      const signedRaw = record(parseStrictJson(await ctx.read(requireValue(a, 'invoice'))), ['invoice', 'signature']);
      const invoice = validateInvoice(signedRaw['invoice']);
      if (typeof signedRaw['signature'] !== 'string' || !verifyInvoiceSignature({ invoice, signature: signedRaw['signature'] }))
        throw failError('INVOICE_SIGNATURE_INVALID', 'only an invoice with a valid seller signature can be registered.');
      if (invoice.signer !== op.seller!.signer || invoice.metaAddress !== op.seller!.metaAddress || invoice.chainId !== op.input.scope.chainId)
        throw failError('INVOICE_SCOPE_MISMATCH', 'invoice signer, recipient keys or chain do not match this authenticated seller scope.');
      const registration = reconciliationApi.registrationFromInvoice(invoice, ctx.io.nowSeconds() * 1000);
      await op.vault.registerInvoice(registration);
      await unchangedInput(ctx, a, op.input);
      await ctx.writeOut(a, await op.vault.exportEncrypted());
      ctx.out({ ok: true, invoiceDigest: registration.invoiceDigest, invoiceCount: (await op.vault.readState()).invoices.length, currentChainVerified: false, parentSha256: sha256Text(op.input.text), out: a.values.get('out') }, 'Registered the signed invoice for local matching in a new encrypted state file. Registration is not evidence of payment.');
      return 0;
    } finally { op.close(); }
  });
}
async function propose(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  return withBackupErrors(async () => {
    const live = a.values.has('observations');
    const op = await operatorVault(ctx, a, live);
    try {
      const current = live ? await currentObservations(ctx, a, op) : undefined;
      if (current !== undefined) for (const r of current.records) await op.vault.save(r);
      const proposals = await op.vault.proposals(current?.records ?? []);
      const requested = a.values.get('record');
      if (a.values.has('out')) {
        if (requested === undefined || current === undefined) throw usageError('REVIEW_CONTEXT_REQUIRED', 'exporting a confirmable proposal requires --record and fresh --observations with --online.');
        const selected = proposals.get(requested);
        if (selected?.kind !== 'exact') throw failError('NO_EXACT_PROPOSAL', 'the selected payment has no unique exact invoice match in the full current context.');
        const now = ctx.io.nowSeconds();
        const file: ProposalFile = { version: 1, kind: 'ghostpay-reconciliation-proposal', stateSha256: sha256Text(op.input.text), observationsSha256: current.sha256, manifestDigest: current.manifestDigest, providerFingerprint: current.context.providerFingerprint, secondaryRequired: current.context.secondary !== undefined, recordId: requested, invoiceDigest: selected.invoice.invoiceDigest, createdAt: now, expiresAt: now + PROPOSAL_TTL_SECONDS };
        await freshCanonicalContext(current); await unchangedInput(ctx, a, op.input); await unchangedObservations(ctx, a, current);
        await ctx.writeOut(a, JSON.stringify(file, null, 2) + '\n');
        ctx.out({ ok: true, proposal: file, confirmed: false, paymentVerifiedAtReview: true, verificationScope: 'operator-pinned-testnet', out: a.values.get('out') }, 'Wrote an unconfirmed proposal bound to the exact encrypted state and raw observations. Review it, then explicitly run reconcile confirm.');
      } else {
        const visible = [...proposals].filter(([id]) => requested === undefined || id === requested).map(([recordId, proposal]) => ({ recordId, ...proposal }));
        if (current !== undefined) await freshCanonicalContext(current);
        ctx.out({ ok: true, confirmed: false, currentChainVerified: current !== undefined, proposals: visible }, `${visible.length} local proposals. No association was confirmed and no state was written.`);
      }
      return 0;
    } finally { op.close(); }
  });
}
async function confirm(ctx: Ctx, a: Parsed): Promise<number> {
  immutableOutput(a);
  if (!a.flags.has('approve')) throw usageError('APPROVAL_REQUIRED', 'confirmation requires explicit --approve after reviewing the proposal file.');
  if (a.values.get('in') === '-') throw usageError('REPEATABLE_CONTEXT_REQUIRED', 'confirmation needs a state file so its exact bytes can be rechecked.');
  return withBackupErrors(async () => {
    const proposal = parseProposal(await ctx.read(requireValue(a, 'proposal')), ctx.io.nowSeconds());
    const op = await operatorVault(ctx, a, true);
    try {
      if (proposal.stateSha256 !== sha256Text(op.input.text)) throw failError('STALE_PROPOSAL', 'the encrypted state changed after this proposal was generated.');
      const current = await currentObservations(ctx, a, op);
      if (proposal.observationsSha256 !== current.sha256) throw failError('STALE_PROPOSAL', 'the current observation context differs from the reviewed proposal.');
      if (proposal.manifestDigest !== current.manifestDigest || proposal.providerFingerprint !== current.context.providerFingerprint || proposal.secondaryRequired !== (current.context.secondary !== undefined))
        throw failError('STALE_PROPOSAL', 'the deployment or provider configuration differs from the reviewed proposal; generate it again.');
      const selected = current.records.find(r => r.id === proposal.recordId);
      if (selected === undefined) throw failError('CURRENT_EVIDENCE_REQUIRED', 'the selected observation was not freshly verified in this context.');
      await freshCanonicalContext(current);
      for (const r of current.records) await op.vault.save(r);
      await op.vault.confirmProposal(selected, proposal.invoiceDigest, { current: current.records });
      const encrypted = await op.vault.exportEncrypted();
      await unchangedInput(ctx, a, op.input); await unchangedObservations(ctx, a, current); await freshCanonicalContext(current);
      parseProposal(JSON.stringify(proposal), ctx.io.nowSeconds());
      await ctx.writeOut(a, encrypted);
      ctx.out({ ok: true, association: 'seller-confirmed', recordId: selected.id, invoiceDigest: proposal.invoiceDigest, currentChainVerified: true, verifiedAt: ctx.io.nowSeconds(), verificationScope: 'operator-pinned-testnet', manifestDigest: current.manifestDigest, parentSha256: proposal.stateSha256, out: a.values.get('out') }, 'Confirmed the reviewed local invoice association after fresh seller-ownership, canonical payment and finality checks. Wrote a new encrypted state file. This is an operator-pinned testnet result.');
      return 0;
    } finally { op.close(); }
  });
}
async function importBackup(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  if (!a.flags.has('dry-run')) { immutableOutput(a); if (!a.flags.has('approve')) throw usageError('APPROVAL_REQUIRED', 'import requires --approve or --dry-run.'); }
  return withBackupErrors(async () => {
    const op = await operatorVault(ctx, a);
    try {
      const incoming = await readBackup(ctx, a, 'backup');
      if (incoming.format !== 'reconciliation') throw usageError('RECONCILIATION_FORMAT_REQUIRED', 'only encrypted reconciliation backups can merge into this state.');
      const preview = await op.vault.previewImport(incoming.text);
      if (!a.flags.has('dry-run')) {
        await op.vault.activateImport(preview);
        await unchangedInput(ctx, a, op.input);
        await ctx.writeOut(a, await op.vault.exportEncrypted());
      }
      ctx.out({ ok: true, dryRun: a.flags.has('dry-run'), ...preview, currentChainVerified: false, provenance: 'imported-history', ...(!a.flags.has('dry-run') ? { out: a.values.get('out') } : {}) }, 'Validated encrypted history import. Imported observations retain historical provenance and reorg invalidations; duplicate identities retain the existing record.');
      return 0;
    } finally { op.close(); }
  });
}
async function archiveReceipt(ctx: Ctx, a: Parsed): Promise<number> {
  immutableOutput(a);
  return withBackupErrors(async () => {
    const op = await operatorVault(ctx, a, true);
    try {
      const receipt = parseVerifiedReceipt(await ctx.read(requireValue(a, 'receipt')));
      if (receipt.signerPublicKey !== op.seller!.signer) throw failError('RECEIPT_SIGNER_MISMATCH', 'the signed receipt does not belong to this authenticated seller signer.');
      await op.vault.archiveReceipt(receipt, ctx.io.nowSeconds() * 1000);
      await unchangedInput(ctx, a, op.input);
      await ctx.writeOut(a, await op.vault.exportEncrypted());
      ctx.out({ ok: true, receiptCount: (await op.vault.readState()).receipts.length, currentChainVerified: false, out: a.values.get('out') }, 'Archived a seller-signed receipt. Its signature proves signed-field integrity and key control, not independent payment or real-world identity.');
      return 0;
    } finally { op.close(); }
  });
}
async function exportReceipts(ctx: Ctx, a: Parsed): Promise<number> {
  immutableOutput(a);
  return withBackupErrors(async () => {
    const op = await operatorVault(ctx, a);
    try {
      await ctx.writeOut(a, await op.vault.exportReceipts());
      ctx.out({ ok: true, receiptCount: (await op.vault.readState()).receipts.length, currentChainVerified: false, out: a.values.get('out') }, 'Exported original digital receipts. Preserve these files; QR codes only represent serialized receipt data. A seller signature is not independent payment proof.');
      return 0;
    } finally { op.close(); }
  });
}
export const reconcileCommands: readonly Command[] = [
  { path: ['reconcile', 'inspect'], summary: 'inspect local reconciliation counts, conflicts and invalidations', usage: 'ghostpay reconcile inspect --in history.json --viewing-key-file view.hex [--json]\n  Example: ghostpay reconcile inspect --in history.json --viewing-key-file view.hex --json', opts: { in: 'value', ...secretOpts('viewing-key') }, handler: inspect },
  { path: ['reconcile', 'create'], summary: 'create an encrypted seller-scoped local reconciliation file', usage: 'ghostpay reconcile create --chain ID --keystore seller.json --passphrase-file pass.txt --out history.json\n  Example: ghostpay reconcile create --chain 11155111 --keystore seller.json --passphrase-file pass.txt --out history.json', opts: { chain: 'value', ...CREDENTIALS, ...OUTPUT }, handler: create },
  { path: ['reconcile', 'register'], summary: 'register a signed fixed-amount invoice in the seller scope', usage: 'ghostpay reconcile register --in history.json --invoice invoice.json --keystore seller.json --passphrase-file pass.txt --out next.json\n  Example: ghostpay reconcile register --in history.json --invoice invoice.json --keystore seller.json --passphrase-file pass.txt --out next.json', opts: { in: 'value', invoice: 'value', ...CREDENTIALS, ...OUTPUT }, handler: register },
  { path: ['reconcile', 'propose'], summary: 'list local proposals or export one bound to freshly verified observations', usage: 'ghostpay reconcile propose --in history.json --viewing-key-file view.hex [--json]\n  Confirmable export: add --keystore seller.json --passphrase-file pass.txt --observations current.json --online --rpc-file rpc.txt --manifest deployment.json --manifest-digest 0xHASH --record ID --out proposal.json\n  Current input: {"version":1,"observations":[payment-observation,...]} (1–64). The shared RPC budget applies to the whole context. Proposals expire after five minutes and never confirm payment by themselves.', opts: { in: 'value', record: 'value', ...CREDENTIALS, ...LIVE, ...OUTPUT }, handler: propose },
  { path: ['reconcile', 'confirm'], summary: 'explicitly confirm a reviewed proposal after live canonical revalidation', usage: 'ghostpay reconcile confirm --in history.json --proposal proposal.json --observations current.json --keystore seller.json --passphrase-file pass.txt --manifest deployment.json --manifest-digest 0xHASH --online --rpc-file rpc.txt --approve --out next.json\n  Rechecks exact source bytes, all supplied current observations, seller ownership, duplicate evidence, matching context, block hashes and finality. Writes a new encrypted file; no fund movement.\n  Example: use the same files and provider options as reconcile propose, then add --proposal proposal.json --approve --out next.json', opts: { in: 'value', proposal: 'value', approve: 'flag', ...CREDENTIALS, ...LIVE, ...OUTPUT }, handler: confirm },
  { path: ['reconcile', 'import'], summary: 'merge encrypted historical backup without upgrading its payment trust', usage: 'ghostpay reconcile import --in history.json --backup archive.json --viewing-key-file view.hex (--dry-run | --approve --out merged.json)\n  Example: ghostpay reconcile import --in history.json --backup archive.json --viewing-key-file view.hex --dry-run --json', opts: { in: 'value', backup: 'value', ...CREDENTIALS, approve: 'flag', 'dry-run': 'flag', ...OUTPUT }, handler: importBackup },
  { path: ['reconcile', 'archive-receipt'], summary: 'archive a valid receipt from this seller without treating it as payment proof', usage: 'ghostpay reconcile archive-receipt --in history.json --receipt receipt.json --keystore seller.json --passphrase-file pass.txt --out next.json\n  Example: ghostpay reconcile archive-receipt --in history.json --receipt receipt.json --keystore seller.json --passphrase-file pass.txt --out next.json', opts: { in: 'value', receipt: 'value', ...CREDENTIALS, ...OUTPUT }, handler: archiveReceipt },
  { path: ['reconcile', 'export-receipts'], summary: 'export archived signed digital receipts after verifying their signatures', usage: 'ghostpay reconcile export-receipts --in history.json --viewing-key-file view.hex --out receipts.json\n  Preserve the original digital receipts; QR codes only represent these serialized files.\n  Example: ghostpay reconcile export-receipts --in history.json --viewing-key-file view.hex --out receipts.json', opts: { in: 'value', ...CREDENTIALS, ...OUTPUT }, handler: exportReceipts },
];
