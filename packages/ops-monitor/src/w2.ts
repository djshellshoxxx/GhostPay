import type { Address } from '@ghostpay/chain-adapters';
import type { Finding, Probe } from './types.js';
import { clientsFor, errTag, ethCall, mk, padAddress, selector, wordToBigint } from './util.js';

/** Options for {@link createW2Probe}. */
export interface W2Options {
  /** Allowlisted tokens per chain id (configured addresses). */
  readonly tokensByChain: Readonly<Record<number, readonly Address[]>>;
}

/**
 * W2 fee recipient health: token `isBlacklisted(recipient)` / `paused()` where exposed, plus a zero-value
 * native `eth_call` to the recipient (a recipient that reverts on plain sends bricks the native router path, M-01).
 *
 * @remarks A token that does not expose a getter makes `eth_call` fail; once the endpoint proved reachable
 * that is read as "not exposed" and skipped.
 * @security Read-only. Findings are keyed by configured token or recipient addresses.
 */
export function createW2Probe(opts: W2Options): Probe {
  return {
    id: 'W2',
    async run(ctx) {
      const out: Finding[] = [];
      for (const m of ctx.manifests) {
        const [rpc] = clientsFor(ctx.rpcs, m.chainId);
        const who = m.feeRecipient;
        if (rpc === undefined) {
          out.push(mk('W2', 'warn', who, 'no RPC client configured for this chain', m.chainId));
          continue;
        }
        try {
          await rpc.blockNumber();
        } catch (e) {
          out.push(mk('W2', 'warn', who, `endpoint unreachable (${errTag(e)})`, m.chainId));
          continue;
        }
        let bad = 0;
        for (const token of opts.tokensByChain[m.chainId] ?? []) {
          const flags: [string, string][] = [
            ['isBlacklisted', `${selector('isBlacklisted(address)')}${padAddress(who)}`],
            ['paused', selector('paused()')],
          ];
          for (const [name, data] of flags) {
            let word: string;
            try {
              word = await ethCall(rpc, token, data);
            } catch {
              continue; // getter not exposed by this token
            }
            if (wordToBigint(word) === 1n) {
              bad++;
              out.push(mk('W2', 'page', token, `${name}() is true for the fee recipient path`, m.chainId));
            }
          }
        }
        try {
          await rpc.request('eth_call', [{ to: who, value: '0x0' }, 'latest']);
        } catch (e) {
          bad++;
          out.push(mk('W2', 'page', who, `zero-value native send to the fee recipient fails (${errTag(e)})`, m.chainId));
        }
        if (bad === 0) out.push(mk('W2', 'info', who, 'fee recipient accepts native and allowlisted tokens', m.chainId));
      }
      return out;
    },
  };
}
