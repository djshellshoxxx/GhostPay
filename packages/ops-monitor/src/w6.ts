import type { RpcClient } from '@ghostpay/chain-adapters';
import { requireConfig } from './errors.js';
import type { Finding, Probe } from './types.js';
import { clientsFor, errTag, mk } from './util.js';

/** Options for {@link createW6Probe}. */
export interface W6Options {
  /** Blocks below the lowest head to compare, avoiding reorg noise (default 6). */
  readonly confirmations?: number;
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; tag: string }> {
  try {
    return { ok: true, v: await p };
  } catch (e) {
    return { ok: false, tag: errTag(e) };
  }
}

/**
 * W6 RPC disagreement: raw `eth_chainId` and the hash of a confirmed block from every client of a chain.
 *
 * @remarks A single provider cannot be cross-checked and yields `warn`; a lying provider yields `page`.
 * @security Subject is the configured announcer of the chain (clients carry no printable identity, so
 * endpoint URLs, which may contain API keys, are never echoed).
 */
export function createW6Probe(opts: W6Options = {}): Probe {
  const depth = BigInt(opts.confirmations ?? 6);
  requireConfig(depth >= 0n && depth <= 1000n, 'confirmations');
  return {
    id: 'W6',
    async run(ctx) {
      const out: Finding[] = [];
      for (const m of ctx.manifests) {
        const who = m.announcer;
        const cs: RpcClient[] = clientsFor(ctx.rpcs, m.chainId);
        if (cs.length < 2) {
          out.push(mk('W6', 'warn', who, 'fewer than two independent providers: cannot cross-check', m.chainId));
          continue;
        }
        const heads = await Promise.all(
          cs.map(async (c) => {
            const id = await settle(c.request('eth_chainId', []));
            const h = await settle(c.blockNumber());
            return { c, id, h };
          }),
        );
        let bad = false;
        const live: { c: RpcClient; head: bigint }[] = [];
        for (const x of heads) {
          if (!x.id.ok || !x.h.ok) {
            bad = true;
            out.push(mk('W6', 'warn', who, `provider unreachable (${x.id.ok ? (x.h.ok ? 'ERROR' : x.h.tag) : x.id.tag})`, m.chainId));
          } else if (x.id.v !== `0x${m.chainId.toString(16)}`) {
            bad = true;
            out.push(mk('W6', 'page', who, `provider reports chain id ${String(x.id.v)}, expected ${String(m.chainId)}`, m.chainId));
          } else {
            live.push({ c: x.c, head: x.h.v });
          }
        }
        if (live.length < 2) {
          if (!bad) out.push(mk('W6', 'warn', who, 'fewer than two usable providers', m.chainId));
          continue;
        }
        const target = live.reduce((a, b) => (b.head < a ? b.head : a), live[0]?.head ?? 0n) - depth;
        const n = target < 0n ? 0n : target;
        const blocks = await Promise.all(live.map((l) => settle(l.c.getBlock(n))));
        const hashes = new Set<string>();
        for (const b of blocks) {
          if (!b.ok || b.v === null) {
            bad = true;
            out.push(mk('W6', 'warn', who, `provider could not return block ${n.toString()}`, m.chainId));
          } else {
            hashes.add(b.v.hash);
          }
        }
        if (hashes.size > 1) {
          bad = true;
          out.push(mk('W6', 'page', who, `providers disagree on the hash of block ${n.toString()}`, m.chainId));
        }
        if (!bad) out.push(mk('W6', 'info', who, `providers agree on block ${n.toString()}`, m.chainId));
      }
      return out;
    },
  };
}
