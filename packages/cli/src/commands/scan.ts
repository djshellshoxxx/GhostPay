import { checkAnnouncementDeep, compareProviders, dedupeClaims, fetchAnnouncements, MAX_PLAUSIBLE_HEAD, type ClaimedPayment, type ScanCursor } from '@ghostpay/chain-adapters';
import { checkAnnouncement, parseCompressedPoint, parseMetadata, secretScalarFromBytes } from '@ghostpay/core-crypto';
import { noPositionals, parseIntOption, requireValue, type Parsed } from '../args.js';
import { chainBoundary, configuredChain, MANIFEST_OPTS, manifestTrust, ONLINE_OPTS, readManifest, verifiedContext } from '../payment-context.js';
import { decimal } from '../payment-input.js';
import { CliError, failError, MAX_INPUT_CHARS, usageError } from '../io.js';
import { readSecret, secretOpts } from '../secrets.js';
import { fromHex } from '../hex.js';
import { parseScanReport, publicObservation, reportCursor, scanScope, serializeScanReport, type ScanReport } from '../scan-report.js';
import type { Command } from './types.js';

const RANGE_OPTS = { chain: 'value', 'from-block': 'value', 'to-block': 'value', 'max-logs': 'value' } as const;

function range(a: Parsed): { from: bigint; to: bigint; maxLogs: number } {
  const from = decimal(requireValue(a, 'from-block'), MAX_PLAUSIBLE_HEAD);
  const to = decimal(requireValue(a, 'to-block'), MAX_PLAUSIBLE_HEAD);
  if (to < from || to - from >= 10_000n) throw usageError('SCAN_RANGE', 'scan range must contain 1 to 10000 blocks in ascending order.');
  return { from, to, maxLogs: parseIntOption(a.values.get('max-logs') ?? '128', 'max-logs', 1, 256) };
}

export const scanCommands: readonly Command[] = [{
  path: ['scan', 'plan'], summary: 'preview a bounded EVM scan range and public query budgets offline',
  usage: 'ghostpay scan plan --chain CHAIN_ID --from-block N --to-block N [--max-logs 128] [--json]\n  Example: ghostpay scan plan --chain 11155111 --from-block 100 --to-block 199 --json\n  At most 10000 blocks, 50 log requests and 256 accepted logs per page. No keys or network are used.',
  opts: RANGE_OPTS,
  handler: async (ctx, a) => chainBoundary(() => {
    noPositionals(a);
    const chain = configuredChain(a, true);
    const r = range(a);
    ctx.out({ ok: true, schemaVersion: 1, chainId: `eip155:${chain.chainId}`, fromBlock: r.from.toString(), toBlock: r.to.toString(),
      blocks: (r.to - r.from + 1n).toString(), maxLogRequests: 50, maxLogs: r.maxLogs,
      networkUsed: false, paymentVerified: false, cursorAdvancesOnlyAfterCanonicalCheck: true },
    `Scan plan: ${r.from} through ${r.to}, at most 50 log queries and ${r.maxLogs} accepted logs. No network or keys used.`);
    return 0;
  }),
}, {
  path: ['scan', 'run'], summary: 'scan one bounded EVM page with local viewing keys and authenticated resume state',
  usage: 'ghostpay scan run --chain CHAIN_ID --from-block N --to-block N --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt --view-key-file view.key --spend-public-file spend.pub --out new-scan.json [--resume prior-scan.json] [--deep] [--max-logs 128] [--json]\n  Example: ghostpay scan run --chain 11155111 --from-block 100 --to-block 199 --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-file rpc.txt --view-key-file view.key --spend-public-file spend.pub --out scan.json\n  Use --rpc-env NAME and --secondary-rpc-env NAME instead of the corresponding endpoint files on Windows. Outputs only counts to the terminal. The new private report contains unverified observations and an authenticated cursor; never overwrite prior reports. Viewing keys stay local. A match is not payment evidence. Add expected recipient/asset/amount from the original request before payment verify.',
  opts: { ...RANGE_OPTS, ...MANIFEST_OPTS, ...ONLINE_OPTS, ...secretOpts('view-key'), 'spend-public-file': 'value', out: 'value', resume: 'value', deep: 'flag' },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    requireValue(a, 'out');
    const chain = configuredChain(a, true);
    const r = range(a);
    const rawKey = (await readSecret(ctx, a, 'view-key', { label: 'viewing key', minBytes: 32, maxBytes: 32 }, true))!;
    let viewing: ReturnType<typeof secretScalarFromBytes> | undefined;
    try {
      viewing = secretScalarFromBytes(rawKey);
      const publicBytes = fromHex(await ctx.read(requireValue(a, 'spend-public-file')));
      if (publicBytes === undefined) throw failError('INVALID_INPUT', 'spending public key must be compressed secp256k1 hex.');
      const spendingPublic = parseCompressedPoint(publicBytes);
      const manifest = await readManifest(ctx, requireValue(a, 'manifest'), chain.chainId);
      const trust = manifestTrust(manifest, a, true);
      const deep = a.flags.has('deep');
      const scopeDigest = scanScope(rawKey, spendingPublic, chain.chainId, trust.digest, deep);
      let cursor: ScanCursor = { nextBlock: r.from };
      const resume = a.values.get('resume');
      if (resume !== undefined) {
        const saved = parseScanReport(await ctx.secret(resume), rawKey);
        if (saved.scopeDigest !== scopeDigest || saved.chainId !== chain.chainId || saved.manifestDigest !== trust.digest || saved.deep !== deep ||
            saved.fromBlock !== r.from.toString() || saved.toBlock !== r.to.toString())
          throw failError('SCAN_SCOPE_MISMATCH', 'resume report belongs to a different key, deployment, mode or range.');
        if (saved.complete) throw usageError('SCAN_COMPLETE', 'this scan range is complete; start a new explicit range.');
        cursor = reportCursor(saved);
      }
      const session = await verifiedContext(ctx, a, chain);
      if (session.manifestDigest !== trust.digest) throw failError('MANIFEST_CHANGED', 'manifest changed while the scan was prepared.');
      if (cursor.last !== undefined) {
        const last = await session.client.getBlock(cursor.last.number);
        if (last === null) throw new CliError('network', 'RPC_FAILURE', 'resume checkpoint is unavailable; cursor was not advanced.');
        if (last.hash !== cursor.last.hash) throw failError('REORG_DETECTED', 'resume checkpoint is no longer canonical; discard affected observations and start a fresh explicit range.');
        if (session.secondary !== undefined && (await session.secondary.getBlock(cursor.last.number))?.hash !== cursor.last.hash)
          throw failError('PROVIDER_DISAGREEMENT', 'secondary provider cannot corroborate the resume checkpoint.');
      }
      const fetched = await fetchAnnouncements({ chain, client: session.client, announcer: manifest.announcer, router: manifest.router,
        cursor, toBlock: r.to, maxRequests: 50, maxLogs: r.maxLogs });
      if (fetched.reorg !== undefined) throw failError('REORG_DETECTED', 'chain reorganized during scan; no new cursor or observations were saved.');
      const through = fetched.cursor.nextBlock - 1n;
      if (session.secondary !== undefined && through >= cursor.nextBlock) {
        const compared = await compareProviders({ chain, secondary: session.secondary, announcer: manifest.announcer, router: manifest.router,
          fromBlock: cursor.nextBlock, toBlock: through, primaryAnnouncements: fetched.announcements, primarySkipped: fetched.skipped,
          ...(fetched.cursor.last === undefined ? {} : { primaryBlockHash: fetched.cursor.last.hash }),
          ...(fetched.routerOnlyBlocks === undefined ? {} : { primaryRouterOnlyBlocks: fetched.routerOnlyBlocks }) });
        if (compared.discrepancies.length > 0) throw failError('PROVIDER_DISAGREEMENT', 'providers disagree about the scanned range; cursor was not advanced.');
      }
      const matches: ClaimedPayment[] = [];
      for (const announcement of fetched.announcements) {
        const viaRouter = announcement.caller.toLowerCase() === manifest.router.toLowerCase();
        const found = deep && viaRouter ? checkAnnouncementDeep(announcement, viewing, spendingPublic) : checkAnnouncement(announcement, viewing, spendingPublic);
        if (!found.matches) continue;
        if (announcement.transactionHash === undefined) throw failError('INCOMPLETE_OBSERVATION', 'matching announcement has no transaction reference; cursor was not saved.');
        let metadata: ClaimedPayment['metadata'];
        try { metadata = parseMetadata(announcement.metadata); } catch { metadata = undefined; }
        matches.push({ stealthAddress: announcement.stealthAddress, announcement, metadata, viaRouter });
      }
      const unique = dedupeClaims(matches);
      if (fetched.cursor.last !== undefined) {
        const checkpoint = fetched.cursor.last;
        if ((await session.client.getBlock(checkpoint.number))?.hash !== checkpoint.hash ||
            (session.secondary !== undefined && (await session.secondary.getBlock(checkpoint.number))?.hash !== checkpoint.hash))
          throw failError('REORG_DETECTED', 'scan checkpoint changed before publication; cursor was not saved.');
      }
      const report: ScanReport = { format: 'ghostpay-cli-scan', version: 1, chainId: chain.chainId, manifestDigest: trust.digest, scopeDigest, deep,
        fromBlock: r.from.toString(), toBlock: r.to.toString(), cursor: { nextBlock: fetched.cursor.nextBlock.toString(),
          ...(fetched.cursor.last === undefined ? {} : { last: { number: fetched.cursor.last.number.toString(), hash: fetched.cursor.last.hash } }) },
        complete: fetched.cursor.nextBlock > r.to, skipped: fetched.skipped, duplicates: unique.duplicates,
        routerOnlyBlocks: (fetched.routerOnlyBlocks ?? []).map((block) => block.toString()),
        observations: unique.items.map((claim) => publicObservation(chain.chainId, manifest.announcer, claim.announcement)), createdAt: ctx.io.nowSeconds() };
      const serialized = serializeScanReport(report, rawKey);
      if (serialized.length > MAX_INPUT_CHARS) throw failError('SCAN_OUTPUT_TOO_LARGE', 'scan report exceeds the portable size limit; retry with a smaller page.');
      await ctx.writeOut(a, serialized);
      ctx.out({ ok: true, schemaVersion: 1, complete: report.complete, matches: unique.items.length, skipped: report.skipped,
        duplicates: report.duplicates, routerOnlyBlocks: report.routerOnlyBlocks.length, paymentVerified: false, out: a.values.get('out') },
      `Scan page saved privately: ${unique.items.length} matching announcements; ${report.complete ? 'range complete' : 'resume required'}. Payment remains unverified.`);
      return 0;
    } finally { rawKey.fill(0); viewing?.fill(0); }
  }),
}, {
  path: ['scan', 'inspect'], summary: 'inspect a private scan report without trusting its observations as payments',
  usage: 'ghostpay scan inspect --in scan.json [--view-key-file view.key] [--json]\n  Example: ghostpay scan inspect --in scan.json --json\n  Without a viewing key this checks structure only. With --view-key-file, --view-key-stdin or --view-key-env NAME it also authenticates the saved cursor. No network or payment verification occurs.',
  opts: { in: 'value', ...secretOpts('view-key') },
  handler: async (ctx, a) => chainBoundary(async () => {
    noPositionals(a);
    const key = await readSecret(ctx, a, 'view-key', { label: 'viewing key', minBytes: 32, maxBytes: 32 }, false);
    try {
      const report = parseScanReport(await ctx.secret(requireValue(a, 'in')), key);
      ctx.out({ ok: true, schemaVersion: 1, chainId: `eip155:${report.chainId}`, complete: report.complete,
        observations: report.observations.length, skipped: report.skipped, duplicates: report.duplicates,
        authenticationVerified: key !== undefined, paymentVerified: false, networkUsed: false },
      `Scan report structure valid; ${report.observations.length} unverified observations. Cursor authentication: ${key === undefined ? 'not checked' : 'valid'}. No payment verification performed.`);
      return 0;
    } finally { key?.fill(0); }
  }),
}];
