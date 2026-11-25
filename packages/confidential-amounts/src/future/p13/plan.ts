/**
 * Local preparation and review of a confidential payment plan (spec `ConfidentialPlanV1`). Gate-checked, journaled
 * to the encrypted store before anything else, epoch-guarded, and never signed or sent: authorization is refused by
 * the gate in this phase. The plan digest deliberately excludes amounts: an unkeyed hash of a low-entropy amount
 * could be brute-forced. Amounts are bound to the plan through the authenticated record instead.
 */
import type { Invoice } from '@ghostpay/invoice-schema';
import { check, fail, toResultAsync, unwrap, type ModuleResult } from './errors.js';
import {
  assertApprovedAsset,
  assetDigest,
  chainIdOf,
  decodeConfidentialAsset,
  digestOf,
  type ConfidentialAssetV1,
  type Digest,
} from './asset.js';
import { buildDisclosure, classifyRoute, disclosureDigest, type PublicField } from './disclosure.js';
import { decideOperation } from './gate.js';
import { mapInvoiceAmounts } from './invoice.js';
import { guarded, type EpochSource, type OperationContext } from './lifecycle.js';
import type { ConfidentialRecordV1, RecordAmounts, RecordSummary } from './record.js';
import { summarize } from './record.js';
import type { ConfidentialRecordStore } from './store.js';

/** COMMON `RecordRef`: opaque local reference, never a secret. */
export type RecordRef = string;

/** Spec `ConfidentialPlanV1` plus the bindings consent needs. Contains no amount. */
export interface ConfidentialPlanV1 {
  readonly schema: 'ghostpay.confidential-plan/v1';
  readonly planDigest: Digest;
  readonly asset: ConfidentialAssetV1;
  readonly privateIntentRef: RecordRef;
  readonly publicEffects: readonly PublicField[];
  readonly recoveryRef: RecordRef;
  readonly disclosureDigest: Digest;
  readonly sessionEpoch: number;
  readonly evidence: 'fixture-only';
}

/** Runtime dependencies (injected; nothing ambient). */
export interface PlanDeps {
  readonly store: ConfidentialRecordStore;
  readonly epoch: EpochSource;
  readonly clockMs: () => number;
  /** Cryptographically secure bytes for record ids. */
  readonly rng: (n: number) => Uint8Array;
}

/** Inputs of {@link prepareConfidentialPlan}. */
export interface PrepareInput {
  readonly invoice: Invoice;
  /** Untrusted asset description; decoded and checked against `approved`. */
  readonly asset: unknown;
  readonly approved: readonly ConfidentialAssetV1[];
  /** Untrusted gate configuration. */
  readonly gate: unknown;
  readonly payer: string;
  readonly stealth: string;
  readonly ctx: OperationContext;
}

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const ZERO = `0x${'0'.repeat(40)}`;

function recordIdFrom(rng: (n: number) => Uint8Array): string {
  const b = rng(16);
  check(b instanceof Uint8Array && b.length === 16, 'P13_INTERNAL', 'rng returned wrong length');
  const id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  check(/[1-9a-f]/.test(id), 'P13_INTERNAL', 'rng returned zeros');
  return id;
}

/**
 * Prepares a fixture-only plan for an existing invoice and journals it (state `prepared`).
 * @returns Failed result codes: gate codes, `P13_ASSET_NOT_APPROVED`, invoice codes, `P13_STALE`/`P13_CANCELLED`.
 */
export async function prepareConfidentialPlan(input: PrepareInput, deps: PlanDeps): Promise<ModuleResult<ConfidentialPlanV1>> {
  return toResultAsync(() =>
    guarded(input.ctx, deps.epoch, deps.clockMs, async () => {
      // Gate first: a disabled feature does no further work (the invoice chain is re-checked against the asset below).
      const decision = unwrap(decideOperation('prepare', input.gate, input.invoice.chainId));
      const asset = decodeConfidentialAsset(input.asset);
      check(decision.mode === 'local' && decision.protocolId === asset.protocolId, 'P13_UNSUPPORTED', 'asset protocol not enabled');
      assertApprovedAsset(asset, input.approved);
      check(
        ADDRESS_RE.test(input.payer) && ADDRESS_RE.test(input.stealth) && input.payer !== ZERO && input.stealth !== ZERO &&
          input.payer !== input.stealth,
        'P13_INVALID_ASSET',
        'payer and stealth must be distinct lowercase addresses',
      );
      const nowSec = Math.floor(deps.clockMs() / 1000);
      const mapped = mapInvoiceAmounts(input.invoice, asset, nowSec);
      const recordId = recordIdFrom(deps.rng);
      const disclosure = disclosureDigest(buildDisclosure(asset.protocolId));
      const privateIntentRef = `p13-intent:${recordId}`;
      const recoveryRef = `p13-record:${recordId}`;
      const planDigest = digestOf({
        schema: 'ghostpay.confidential-plan/v1',
        protocolId: asset.protocolId,
        assetDigest: assetDigest(asset),
        invoiceDigest: mapped.invoiceDigest,
        feePolicy: mapped.feePolicy,
        payer: input.payer,
        stealth: input.stealth,
        privateIntentRef,
        disclosureDigest: disclosure,
        sessionEpoch: input.ctx.sessionEpoch,
      });
      const record: ConfidentialRecordV1 = {
        schema: 'ghostpay.confidential-record/v1',
        recordId,
        revision: 1,
        state: 'prepared',
        protocolId: asset.protocolId,
        asset,
        assetDigest: assetDigest(asset),
        invoiceDigest: mapped.invoiceDigest,
        planDigest,
        feePolicy: mapped.feePolicy,
        amounts: mapped.amounts,
        sessionEpoch: input.ctx.sessionEpoch,
        createdAt: nowSec,
        updatedAt: nowSec,
      };
      await deps.store.create(record);
      return {
        schema: 'ghostpay.confidential-plan/v1',
        planDigest,
        asset,
        privateIntentRef,
        publicEffects: classifyRoute(asset.protocolId).publicFields,
        recoveryRef,
        disclosureDigest: disclosure,
        sessionEpoch: input.ctx.sessionEpoch,
        evidence: 'fixture-only',
      } satisfies ConfidentialPlanV1;
    }),
  );
}

/** Local review view: the summary plus the amounts for on-device display only. */
export interface ReviewView {
  readonly summary: RecordSummary;
  readonly amounts: RecordAmounts;
}

/**
 * Marks a prepared plan reviewed (gate `review`) and returns the amounts for local display.
 * The review is bound to the session epoch; a later epoch invalidates it on reload.
 */
export async function reviewPlan(
  recordId: string,
  expectedRevision: number,
  gate: unknown,
  ctx: OperationContext,
  deps: PlanDeps,
): Promise<ModuleResult<ReviewView>> {
  return toResultAsync(() =>
    guarded(ctx, deps.epoch, deps.clockMs, async () => {
      const cur = await deps.store.load(recordId);
      check(cur !== undefined, 'P13_RECORD_INVALID', 'record not found');
      unwrap(decideOperation('review', gate, chainIdOf(cur.asset)));
      check(cur.sessionEpoch === ctx.sessionEpoch, 'P13_STALE', 'plan was prepared in another session');
      const next = await deps.store.update(recordId, expectedRevision, {
        state: 'reviewed',
        updatedAt: Math.max(cur.updatedAt, Math.floor(deps.clockMs() / 1000)),
      });
      return { summary: summarize(next), amounts: next.amounts };
    }),
  );
}

/** Settlement entry point of this phase: always refused by the gate (`P13_SETTLEMENT_DISABLED`). */
export function authorizePlan(gate: unknown, chainId: number): ModuleResult<never> {
  const d = decideOperation('authorize', gate, chainId);
  if (d.ok) return fail('P13_INTERNAL', 'settlement gate must refuse');
  return d;
}

/** Cancels unsent local work (prepared or reviewed). Submitted evidence is never cancelled. */
export async function cancelPlan(
  recordId: string,
  expectedRevision: number,
  ctx: OperationContext,
  deps: PlanDeps,
): Promise<ModuleResult<RecordSummary>> {
  return toResultAsync(() =>
    guarded(ctx, deps.epoch, deps.clockMs, async () => {
      const cur = await deps.store.load(recordId);
      check(cur !== undefined, 'P13_RECORD_INVALID', 'record not found');
      const next = await deps.store.update(recordId, expectedRevision, {
        state: 'cancelled',
        updatedAt: Math.max(cur.updatedAt, Math.floor(deps.clockMs() / 1000)),
      });
      return summarize(next);
    }),
  );
}
