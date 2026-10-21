import { requireConfig } from './errors.js';
import type { Finding, Probe } from './types.js';
import { clientsFor, errTag, mk, topicOf } from './util.js';

/** Options for {@link createW5Probe}. */
export interface W5Options {
  /** GhostPay scheme ids (default 0x47500001 and 0x47500002). */
  readonly schemeIds?: readonly bigint[];
  /** Blocks to look back, 1..5000 (default 300). */
  readonly windowBlocks?: number;
  /** Normal GhostPay announcements per block (> 0). */
  readonly baselinePerBlock: number;
  /** Rate/baseline for `warn` (default 3) and `page` (default 10). */
  readonly warnFactor?: number;
  readonly pageFactor?: number;
  /** Router `FeeCollected` per announcement below this while elevated escalates to `page` (default 0.2). */
  readonly minFeeShare?: number;
}

const ANNOUNCEMENT = topicOf('Announcement(uint256,address,address,bytes,bytes)');
const FEE_COLLECTED = topicOf('FeeCollected(address,uint256)');

const word = (n: bigint): `0x${string}` => `0x${n.toString(16).padStart(64, '0')}`;

/**
 * W5 announcement spam: GhostPay-scheme announcements per block on the canonical announcer against a
 * baseline, with the share backed by router `FeeCollected` events (spam pays no fee).
 *
 * @security Counts logs only; never reads or stores `stealthAddress`, keys or metadata, so no user data
 * can reach a finding. Subject is the configured announcer.
 */
export function createW5Probe(opts: W5Options): Probe {
  const schemes = opts.schemeIds ?? [0x47500001n, 0x47500002n];
  const window = opts.windowBlocks ?? 300;
  const warnF = opts.warnFactor ?? 3;
  const pageF = opts.pageFactor ?? 10;
  const minShare = opts.minFeeShare ?? 0.2;
  requireConfig(opts.baselinePerBlock > 0 && Number.isFinite(opts.baselinePerBlock), 'baselinePerBlock');
  requireConfig(Number.isInteger(window) && window >= 1 && window <= 5000, 'windowBlocks');
  requireConfig(warnF > 0 && pageF >= warnF, 'factors');
  requireConfig(schemes.length > 0, 'schemeIds');
  return {
    id: 'W5',
    async run(ctx) {
      const out: Finding[] = [];
      for (const m of ctx.manifests) {
        const [rpc] = clientsFor(ctx.rpcs, m.chainId);
        if (rpc === undefined) {
          out.push(mk('W5', 'warn', m.announcer, 'no RPC client configured for this chain', m.chainId));
          continue;
        }
        try {
          const head = await rpc.blockNumber();
          const from = head >= BigInt(window) ? head - BigInt(window) + 1n : 0n;
          const blocks = Number(head - from + 1n);
          let count = 0;
          for (const s of schemes) {
            const logs = await rpc.getLogs({ address: m.announcer, topics: [ANNOUNCEMENT, word(s)], fromBlock: from, toBlock: head });
            count += logs.length;
          }
          const fees = (await rpc.getLogs({ address: m.router, topics: [FEE_COLLECTED], fromBlock: from, toBlock: head })).length;
          const ratio = count / blocks / opts.baselinePerBlock;
          const share = count === 0 ? 1 : fees / count;
          const info = `${String(count)} announcements in ${String(blocks)} blocks (${ratio.toFixed(2)}x baseline), fee-backed share ${share.toFixed(2)}`;
          if (ratio >= pageF || (ratio >= warnF && share < minShare)) out.push(mk('W5', 'page', m.announcer, info, m.chainId));
          else if (ratio >= warnF) out.push(mk('W5', 'warn', m.announcer, info, m.chainId));
          else out.push(mk('W5', 'info', m.announcer, info, m.chainId));
        } catch (e) {
          out.push(mk('W5', 'warn', m.announcer, `log query failed (${errTag(e)})`, m.chainId));
        }
      }
      return out;
    },
  };
}
