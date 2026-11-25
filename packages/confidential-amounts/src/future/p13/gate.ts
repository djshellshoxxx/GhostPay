/**
 * P13 feature gate and capability descriptors (COMMON section 3). Default off. Settlement operations are refused in
 * every configuration of this phase; only local preparation and review on the cleartext fixture can be enabled, and
 * only with consent bound to the current disclosure digest. Inspection, export and recovery stay available when off.
 */
import { BACKEND_CHAINS } from '../../manifest.js';
import { check, fail, toResult, type ModuleResult } from './errors.js';
import { exactRecord } from './strict.js';
import { assertDigest, networkId, type Digest, type P13ProtocolId } from './asset.js';
import { buildDisclosure, disclosureDigest, classifyRoute, type PublicField } from './disclosure.js';

/** Gate configuration supplied by the composition root. Unknown keys are refused (a typo cannot enable anything). */
export interface P13GateConfig {
  readonly enabled: boolean;
  readonly protocolId?: string;
  readonly allowFixture?: boolean;
  readonly consentDigest?: Digest;
}

/** Off. */
export const P13_GATE_DEFAULT: P13GateConfig = Object.freeze({ enabled: false });

/** Operations the gate decides. */
export type P13Operation =
  | 'inspect'
  | 'export'
  | 'recover'
  | 'prepare'
  | 'review'
  | 'authorize'
  | 'sign'
  | 'submit'
  | 'wrap'
  | 'unwrap'
  | 'decrypt'
  | 'transfer';

const READ_ONLY: readonly P13Operation[] = ['inspect', 'export', 'recover'];
const LOCAL: readonly P13Operation[] = ['prepare', 'review'];
const SETTLEMENT: readonly P13Operation[] = ['authorize', 'sign', 'submit', 'wrap', 'unwrap', 'decrypt', 'transfer'];

/** Outcome of an allowed operation. */
export type GateDecision =
  | { readonly mode: 'read-only' }
  | { readonly mode: 'local'; readonly protocolId: P13ProtocolId; readonly evidence: 'fixture-only' };

function decodeConfig(value: unknown): P13GateConfig {
  const r = exactRecord(value, ['enabled'], ['protocolId', 'allowFixture', 'consentDigest'], 'P13_UNSUPPORTED');
  check(typeof r['enabled'] === 'boolean', 'P13_UNSUPPORTED', 'invalid gate config');
  check(r['protocolId'] === undefined || typeof r['protocolId'] === 'string', 'P13_UNSUPPORTED', 'invalid gate config');
  check(r['allowFixture'] === undefined || typeof r['allowFixture'] === 'boolean', 'P13_UNSUPPORTED', 'invalid gate config');
  return {
    enabled: r['enabled'],
    ...(typeof r['protocolId'] === 'string' ? { protocolId: r['protocolId'] } : {}),
    ...(r['allowFixture'] === true ? { allowFixture: true } : {}),
    ...(r['consentDigest'] !== undefined ? { consentDigest: assertDigest(r['consentDigest']) } : {}),
  };
}

/**
 * Decides whether `op` may run.
 * @param config Untrusted gate configuration.
 * @param chainId Chain of the operation.
 * @returns `P13_SETTLEMENT_DISABLED` for every settlement operation, `P13_DISABLED` while off, `P13_UNSUPPORTED` for
 * unbuilt or unqualified protocols (CT-1 included: manifest code hashes unpinned, mock-only evidence, audit CT-08/CT-10),
 * `P13_CONSENT_REQUIRED` unless consent references the current disclosure digest.
 */
export function decideOperation(op: P13Operation, config: unknown, chainId: number): ModuleResult<GateDecision> {
  return toResult((): GateDecision => {
    const cfg = decodeConfig(config);
    if (READ_ONLY.includes(op)) return { mode: 'read-only' };
    if (SETTLEMENT.includes(op)) fail('P13_SETTLEMENT_DISABLED', 'confidential settlement is disabled in this phase');
    check(LOCAL.includes(op), 'P13_UNSUPPORTED', 'unknown operation');
    check(cfg.enabled, 'P13_DISABLED', 'confidential amounts are off');
    if (cfg.protocolId !== 'ctm-cleartext') fail('P13_UNSUPPORTED', 'protocol not available for preparation');
    check(cfg.allowFixture === true, 'P13_UNSUPPORTED', 'fixture use not allowed');
    check(BACKEND_CHAINS['ctm-cleartext'].includes(chainId), 'P13_NETWORK_REFUSED', 'fixture runs on the local chain only');
    const expected = disclosureDigest(buildDisclosure('ctm-cleartext'));
    check(cfg.consentDigest === expected, 'P13_CONSENT_REQUIRED', 'consent to the current disclosure is required');
    return { mode: 'local', protocolId: 'ctm-cleartext', evidence: 'fixture-only' };
  });
}

/** COMMON `CapabilityDescriptorV1` (assets are injected by the composition root, so the list here is empty). */
export interface CapabilityDescriptorV1 {
  readonly schema: 'ghostpay.capability/v1';
  readonly moduleId: 'P13';
  readonly implementationVersion: string;
  readonly evidence: 'unavailable' | 'fixture-only' | 'testnet' | 'qualified';
  readonly chainsAndAssets: readonly string[];
  readonly requires: readonly string[];
  readonly optionalPorts: readonly string[];
  readonly limits: Readonly<Record<string, number>>;
  readonly reveals: readonly PublicField[];
  readonly protocolId: P13ProtocolId | 'commitment-zk';
}

/** P13 budgets (COMMON section 4; spec "Resource and input constraints"). */
export const P13_LIMITS = Object.freeze({
  maxMetadataBytes: 64 * 1024,
  maxEnvelopeBytes: 1024 * 1024,
  maxBatchRecords: 1000,
  maxApprovedAssets: 8,
  maxNestingDepth: 8,
});

/** Current capability evidence. Nothing is `testnet` or `qualified`. */
export function p13Capabilities(): readonly CapabilityDescriptorV1[] {
  const base = {
    schema: 'ghostpay.capability/v1',
    moduleId: 'P13',
    implementationVersion: '0.1.0-p13-core',
    requires: ['P06'],
    optionalPorts: [],
    limits: P13_LIMITS,
  } as const;
  return [
    {
      ...base,
      protocolId: 'ctm-cleartext',
      evidence: 'fixture-only',
      chainsAndAssets: BACKEND_CHAINS['ctm-cleartext'].map(networkId),
      reveals: classifyRoute('ctm-cleartext').publicFields,
    },
    {
      ...base,
      protocolId: 'ct1-zama',
      evidence: 'unavailable',
      chainsAndAssets: BACKEND_CHAINS['ct1-zama'].map(networkId),
      reveals: classifyRoute('ct1-zama').publicFields,
    },
    { ...base, protocolId: 'commitment-zk', evidence: 'unavailable', chainsAndAssets: [], reveals: [] },
  ];
}

/**
 * P13-A10: P13 defines no fee. A request carrying any additional module fee line is unsupported rather than collected
 * through a revealing transparent transfer. The existing router fee is not a P13 fee.
 */
export function checkFeeRequest(request: { readonly moduleFees?: readonly unknown[] }): ModuleResult<'router-fee-only'> {
  return toResult(() => {
    check(request.moduleFees === undefined || request.moduleFees.length === 0, 'P13_FEE_UNSUPPORTED', 'no P13 fee exists');
    return 'router-fee-only' as const;
  });
}
