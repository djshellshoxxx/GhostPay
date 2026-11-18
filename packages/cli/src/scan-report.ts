import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { encodeAbiParameters } from 'viem/utils';
import { ANNOUNCEMENT_TOPIC, MAX_PLAUSIBLE_HEAD, type Hex, type ScanCursor, type ScannedAnnouncement } from '@ghostpay/chain-adapters';
import { canonicalize, parseStrictJson } from '@ghostpay/invoice-schema';
import { CliError, failError } from './io.js';
import { decimal, parsePaymentObservation, record } from './payment-input.js';

const DOMAIN = 'GhostPay/cli-scan-cursor/v1\n';

export interface ScanReport {
  readonly format: 'ghostpay-cli-scan'; readonly version: 1; readonly chainId: number;
  readonly manifestDigest: string; readonly scopeDigest: string; readonly deep: boolean;
  readonly fromBlock: string; readonly toBlock: string;
  readonly cursor: { readonly nextBlock: string; readonly last?: { readonly number: string; readonly hash: Hex } };
  readonly complete: boolean; readonly skipped: number; readonly duplicates: number;
  readonly routerOnlyBlocks: readonly string[]; readonly observations: readonly unknown[]; readonly createdAt: number;
}

export function scanScope(viewKey: Uint8Array, spendingPublic: Uint8Array, chainId: number, manifestDigest: string, deep: boolean): string {
  const viewPublic = secp256k1.getPublicKey(viewKey, true);
  return createHash('sha256').update(DOMAIN).update(canonicalize({ viewPublic: Buffer.from(viewPublic).toString('hex'),
    spendingPublic: Buffer.from(spendingPublic).toString('hex'), chainId, manifestDigest, deep })).digest('hex');
}

function authenticate(report: ScanReport, viewKey: Uint8Array): string {
  const macKey = new Uint8Array(hkdfSync('sha256', viewKey, new Uint8Array(0), new TextEncoder().encode(DOMAIN), 32));
  try { return createHmac('sha256', macKey).update(DOMAIN).update(canonicalize(report)).digest('hex'); }
  finally { macKey.fill(0); }
}

export function serializeScanReport(report: ScanReport, viewKey: Uint8Array): string {
  return `${JSON.stringify({ ...report, authentication: authenticate(report, viewKey) }, null, 2)}\n`;
}

/** Parses without trusting the stored claims; supplying a key also authenticates the entire cursor and report. */
export function parseScanReport(text: string, viewKey?: Uint8Array): ScanReport {
  const r = record(parseStrictJson(text), ['format', 'version', 'chainId', 'manifestDigest', 'scopeDigest', 'deep', 'fromBlock', 'toBlock',
    'cursor', 'complete', 'skipped', 'duplicates', 'routerOnlyBlocks', 'observations', 'createdAt', 'authentication']);
  if (r['format'] !== 'ghostpay-cli-scan' || r['version'] !== 1) throw new CliError('unsupported', 'UNSUPPORTED_VERSION', 'unsupported CLI scan report.');
  if (typeof r['chainId'] !== 'number' || !Number.isSafeInteger(r['chainId']) || r['chainId'] < 1 ||
      typeof r['manifestDigest'] !== 'string' || !/^0x[0-9a-f]{64}$/.test(r['manifestDigest']) ||
      typeof r['scopeDigest'] !== 'string' || !/^[0-9a-f]{64}$/.test(r['scopeDigest']) ||
      typeof r['deep'] !== 'boolean' || typeof r['complete'] !== 'boolean' ||
      typeof r['createdAt'] !== 'number' || !Number.isSafeInteger(r['createdAt']) || r['createdAt'] <= 0 ||
      typeof r['skipped'] !== 'number' || !Number.isSafeInteger(r['skipped']) || r['skipped'] < 0 ||
      typeof r['duplicates'] !== 'number' || !Number.isSafeInteger(r['duplicates']) || r['duplicates'] < 0 ||
      typeof r['authentication'] !== 'string' || !/^[0-9a-f]{64}$/.test(r['authentication']))
    throw failError('INVALID_SCAN_REPORT', 'scan report metadata is invalid.');
  const from = decimal(r['fromBlock'], MAX_PLAUSIBLE_HEAD);
  const to = decimal(r['toBlock'], MAX_PLAUSIBLE_HEAD);
  if (to < from || to - from >= 10_000n) throw failError('INVALID_SCAN_REPORT', 'scan report range is invalid.');
  const cursor = record(r['cursor'], ['nextBlock', 'last'], ['nextBlock']);
  const next = decimal(cursor['nextBlock'], MAX_PLAUSIBLE_HEAD + 1n);
  if (next < from || next > to + 1n || r['complete'] !== (next === to + 1n)) throw failError('INVALID_SCAN_REPORT', 'scan cursor is inconsistent with its range.');
  if (cursor['last'] !== undefined) {
    const last = record(cursor['last'], ['number', 'hash']);
    if (decimal(last['number'], MAX_PLAUSIBLE_HEAD) !== next - 1n || typeof last['hash'] !== 'string' || !/^0x[0-9a-f]{64}$/.test(last['hash']))
      throw failError('INVALID_SCAN_REPORT', 'scan cursor checkpoint is invalid.');
  } else if (next > from) throw failError('INVALID_SCAN_REPORT', 'an advanced scan cursor needs a canonical checkpoint.');
  if (!Array.isArray(r['routerOnlyBlocks']) || r['routerOnlyBlocks'].length > 256 ||
      r['routerOnlyBlocks'].some((v: unknown) => decimal(v, MAX_PLAUSIBLE_HEAD) < from || decimal(v, MAX_PLAUSIBLE_HEAD) >= next) ||
      !Array.isArray(r['observations']) || r['observations'].length > 256) throw failError('INVALID_SCAN_REPORT', 'scan report records exceed their bounds.');
  const identities = new Set<string>();
  for (const input of r['observations']) {
    const observation = parsePaymentObservation(JSON.stringify(input));
    const log = observation.claim.announcement;
    if (observation.chain.chainId !== r['chainId'] || log.blockNumber < from || log.blockNumber >= next || identities.has(log.id))
      throw failError('INVALID_SCAN_REPORT', 'scan report contains duplicate or out-of-scope observations.');
    identities.add(log.id);
  }
  const { authentication, ...payload } = r;
  const report = payload as unknown as ScanReport;
  if (viewKey !== undefined && !timingSafeEqual(Buffer.from(authentication, 'hex'), Buffer.from(authenticate(report, viewKey), 'hex')))
    throw failError('SCAN_AUTHENTICATION_FAILED', 'scan cursor authentication failed; use the original report and viewing key.');
  return report;
}

export function reportCursor(report: ScanReport): ScanCursor {
  return { nextBlock: BigInt(report.cursor.nextBlock), ...(report.cursor.last === undefined ? {} : {
    last: { number: BigInt(report.cursor.last.number), hash: report.cursor.last.hash },
  }) };
}

export function publicObservation(chainId: number, announcer: Hex, a: ScannedAnnouncement): Record<string, unknown> {
  const pad = (address: string): Hex => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
  return { version: 1, family: 'evm', chainId, log: {
    address: announcer, topics: [ANNOUNCEMENT_TOPIC, `0x${a.schemeId.toString(16).padStart(64, '0')}`, pad(a.stealthAddress), pad(a.caller)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [a.ephemeralPublicKey as Hex, a.metadata as Hex]),
    blockNumber: `0x${a.blockNumber.toString(16)}`, blockHash: a.blockHash,
    logIndex: `0x${a.logIndex.toString(16)}`, transactionHash: a.transactionHash,
  } };
}
