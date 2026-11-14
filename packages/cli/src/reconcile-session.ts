import { checkAnnouncement, decodeMetaAddress, secretScalarFromBytes, zeroize, type MetaAddressKeys } from '@ghostpay/core-crypto';
import { checkpointKeyId, type KeystoreSecrets, type ReconciliationRecord, type ReconciliationVaultHandle } from '@ghostpay/ux-vault/portable';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { MAX_PLAUSIBLE_HEAD } from '@ghostpay/chain-adapters';
import { noPositionals, requireValue, type Parsed } from './args.js';
import type { Ctx } from './ctx.js';
import { CliError, failError, usageError } from './io.js';
import { readPassphrase } from './secrets.js';
import { keystoreApi, openReconciliation, openReconciliationWithKey, readBackup, reconciliationApi, sha256Text, type BackupInput } from './backup-data.js';
import { chainBoundary, verifiedContext, type VerifiedContext } from './payment-context.js';
import { parsePaymentObservation, record } from './payment-input.js';
import { verifyObservation } from './commands/payment.js';

export const MAX_CURRENT_OBSERVATIONS = 64;
export interface SellerCredentials {
  readonly secrets: KeystoreSecrets;
  readonly publicKeys: MetaAddressKeys;
  readonly sellerKeyId: string;
  readonly metaAddress: string;
  readonly signer: string;
  close(): void;
}
export async function loadSeller(ctx: Ctx, a: Parsed, expectedText?: string): Promise<SellerCredentials> {
  const backup = await readBackup(ctx, a, 'keystore');
  if (backup.format !== 'seller-keystore') throw usageError('SELLER_KEYSTORE_REQUIRED', '--keystore must name an encrypted seller-key backup.');
  if (expectedText !== undefined && backup.text !== expectedText) throw failError('STALE_CONTEXT', 'the encrypted seller keystore changed after its review snapshot.');
  const secrets = await keystoreApi.decryptKeystore(backup.text, await readPassphrase(ctx, a));
  const publicKeys = decodeMetaAddress(backup.envelope.meta.metaAddress);
  const sellerKeyId = checkpointKeyId(Buffer.from(publicKeys.spendingPublicKey).toString('hex'), Buffer.from(publicKeys.viewingPublicKey).toString('hex'));
  return { secrets, publicKeys, sellerKeyId, metaAddress: backup.envelope.meta.metaAddress, signer: backup.envelope.meta.signer,
    close: () => zeroize(secrets.spendingKey, secrets.viewingKey, secrets.signingKey) };
}
export interface OperatorVault {
  readonly input: Extract<BackupInput, { format: 'reconciliation' }>;
  readonly vault: ReconciliationVaultHandle;
  readonly seller?: SellerCredentials;
  close(): void;
}
export async function operatorVault(ctx: Ctx, a: Parsed, needSeller = false): Promise<OperatorVault> {
  const input = await readBackup(ctx, a);
  if (input.format !== 'reconciliation') throw new CliError('unsupported', 'RECONCILIATION_FORMAT_REQUIRED', 'this operation requires an encrypted reconciliation file.');
  if (needSeller || a.values.has('keystore')) {
    const seller = await loadSeller(ctx, a);
    try {
      if (seller.sellerKeyId !== input.scope.sellerKeyId) throw failError('SELLER_SCOPE_MISMATCH', 'the authenticated seller keys do not own this reconciliation scope.');
      const { vault } = await openReconciliationWithKey(input, seller.secrets.viewingKey.slice(), false);
      return { input, vault, seller, close: () => { vault.lock(); seller.close(); } };
    } catch (error) { seller.close(); throw error; }
  }
  const { vault } = await openReconciliation(ctx, a, input, false);
  return { input, vault, close: () => vault.lock() };
}

export async function unchangedInput(ctx: Ctx, a: Parsed, input: OperatorVault['input']): Promise<void> {
  const bytes = await ctx.readBytes(requireValue(a, 'in'));
  if (Buffer.from(bytes).toString('hex') !== Buffer.from(input.bytes).toString('hex'))
    throw failError('STALE_CONTEXT', 'the encrypted source changed during this operation; create a new proposal.');
}
export function immutableOutput(a: Parsed): void {
  noPositionals(a);
  requireValue(a, 'out');
  if (a.flags.has('force')) throw usageError('OVERWRITE_REFUSED', 'reconciliation writes require a new output path.');
}

export interface CurrentObservations {
  readonly records: readonly ReconciliationRecord[];
  readonly context: VerifiedContext;
  readonly observationText: string;
  readonly sha256: string;
  readonly manifestDigest: string;
  readonly finalityDepth: number;
}
/** A single bounded RPC session is shared by every observation in the review context. */
export async function currentObservations(ctx: Ctx, a: Parsed, operator: OperatorVault): Promise<CurrentObservations> {
  const seller = operator.seller;
  if (seller === undefined) throw usageError('SELLER_KEYSTORE_REQUIRED', 'live reconciliation requires the encrypted seller keystore.');
  const path = requireValue(a, 'observations');
  if (path === '-') throw usageError('REPEATABLE_CONTEXT_REQUIRED', 'observations must be a file so its bytes can be checked again before publication.');
  const observationText = await ctx.read(path);
  const input = record(parseStrictJson(observationText), ['version', 'observations']);
  const list = input['observations'];
  if (input['version'] !== 1 || !Array.isArray(list) || list.length < 1 || list.length > MAX_CURRENT_OBSERVATIONS)
    throw failError('OBSERVATION_LIMIT', 'current context must contain 1–64 raw payment observations.');
  const parsed = list.map(value => parsePaymentObservation(JSON.stringify(value)));
  if (parsed.some(value => value.chain.chainId !== operator.input.scope.chainId)) throw failError('CHAIN_MISMATCH', 'all current observations must match the encrypted seller/chain scope.');
  const context = await chainBoundary(() => verifiedContext(ctx, a, parsed[0]!.chain));
  const records: ReconciliationRecord[] = [];
  const ids = new Set<string>();
  const evidence = new Set<string>();
  const viewing = secretScalarFromBytes(seller.secrets.viewingKey);
  try {
    for (const item of list) {
      const result = await verifyObservation(ctx, a, JSON.stringify(item), context);
      if (result.output.networkFailure)
        throw new CliError('network', 'RPC_FAILURE', 'current payment evidence could not be verified because a configured provider failed.');
      if (!result.output.paymentVerified || result.verification.evidenceId === undefined)
        throw failError('CURRENT_EVIDENCE_REQUIRED', 'every supplied observation must have final, current canonical payment evidence.');
      const claim = result.observation.claim;
      const match = checkAnnouncement(claim.announcement, viewing, seller.publicKeys.spendingPublicKey, { ignoreViewTag: true });
      if (!match.matches) throw failError('SELLER_RECIPIENT_MISMATCH', 'a current observation does not belong to the authenticated seller keys.');
      const recordValue = reconciliationApi.recordFromVerifiedMatch({ chainId: result.observation.chain.chainId, ...claim, tagMatches: match.tagMatches !== false, receipt: 'verified' }, seller.sellerKeyId, undefined, ctx.io.nowSeconds() * 1000);
      // Duplicates are the same log (record id) or the same payment evidence (evidence id). Two router payments that
      // share a one-time address and ephemeral key are distinct payments (F1, 2026-11-11): a front-runner can copy
      // (S, E) from a pending payment, so rejecting the pair would let a 1-wei copy block the genuine payment.
      if (ids.has(recordValue.id) || evidence.has(result.verification.evidenceId))
        throw failError('DUPLICATE_OBSERVATION', 'the current context repeats an observation or consumes the same payment evidence twice.');
      ids.add(recordValue.id); evidence.add(result.verification.evidenceId);
      records.push(recordValue);
    }
    return { records, context, observationText, sha256: sha256Text(observationText), manifestDigest: context.manifestDigest, finalityDepth: parsed[0]!.chain.finalityDepth };
  } finally { zeroize(viewing); }
}

/** Revalidate known blocks and finality immediately before local confirmation/output. */
export async function freshCanonicalContext(current: {
  readonly context: Pick<VerifiedContext, 'client' | 'secondary'>;
  readonly records: readonly Pick<ReconciliationRecord, 'blockNumber' | 'blockHash'>[];
  readonly finalityDepth: number;
}): Promise<void> {
  await chainBoundary(async () => {
    const seen = new Map<string, string>();
    for (const item of current.records) {
      const previous = seen.get(item.blockNumber);
      if (previous !== undefined && previous !== item.blockHash)
        throw failError('STALE_CANONICAL_CONTEXT', 'the review contains conflicting block hashes at one height; regenerate it from a consistent canonical context.');
      seen.set(item.blockNumber, item.blockHash);
    }
    const clients = [current.context.client, ...(current.context.secondary === undefined ? [] : [current.context.secondary])];
    for (const client of clients) {
      const head = await client.blockNumber();
      if (head > MAX_PLAUSIBLE_HEAD) throw failError('STALE_CANONICAL_CONTEXT', 'the provider reported an implausible chain head.');
      for (const [number, hash] of seen) {
        const block = await client.getBlock(BigInt(number));
        const depth = current.finalityDepth;
        if (block?.hash.toLowerCase() !== hash || head < BigInt(number) || head - BigInt(number) + 1n < BigInt(depth))
          throw failError('STALE_CANONICAL_CONTEXT', 'the provider changed canonical history or no longer has sufficient finality.');
      }
    }
  });
}
export async function unchangedObservations(ctx: Ctx, a: Parsed, current: CurrentObservations): Promise<void> {
  if (await ctx.read(requireValue(a, 'observations')) !== current.observationText)
    throw failError('STALE_CONTEXT', 'the current observation file changed during review.');
}
