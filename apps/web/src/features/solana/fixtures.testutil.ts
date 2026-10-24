import { base58 } from '@scure/base';
import {
  deriveStealthPayment,
  encodeAnnouncementMemo,
  MEMO_PROGRAM,
  type StealthPayment,
} from '@ghostpay/solana-stealth';
import { DEVNET_GENESIS, TESTNET_GENESIS, solNetwork, type SolNetworkId } from './network';
import { walletFromSeedHex, type SolWallet } from './wallet';

export const SEED_A = 'a1'.repeat(32);
export const PAYER = base58.encode(new Uint8Array(32).fill(7));
export const DEST = base58.encode(new Uint8Array(32).fill(9));
export const SIG = 'SigOfTheFundingTransaction1111111111111111111111111111111111111111111';
export const FUNDED_SLOT = 500;
export const TIP_SLOT = 600;

export function walletA(id: SolNetworkId = 'localnet'): SolWallet {
  return walletFromSeedHex(SEED_A, solNetwork(id));
}

export interface MockChain {
  readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>;
  /** Methods seen, in order. */
  readonly calls: string[];
  /** Raw wire transactions given to sendTransaction. */
  readonly broadcasts: string[];
  readonly payment: StealthPayment;
  genesis: string;
  balance: bigint;
  failMethod: string | undefined;
  /** When set, `getSlot` waits for this promise (stale-async tests). */
  gate: Promise<void> | undefined;
}

/** In-memory Solana JSON-RPC double holding one funded stealth payment for `wallet`. */
export function mockChain(id: SolNetworkId, wallet: SolWallet): MockChain {
  const payment = deriveStealthPayment(wallet.keys.spendPublicKey, wallet.keys.viewPublicKey);
  const memo = encodeAnnouncementMemo(payment.ephemeralPublicKey, payment.viewTag);
  const chain: MockChain = {
    calls: [],
    broadcasts: [],
    payment,
    genesis: id === 'devnet' ? DEVNET_GENESIS : id === 'testnet' ? TESTNET_GENESIS : '9'.repeat(43),
    balance: 2_000_000n,
    failMethod: undefined,
    gate: undefined,
    fetchFn: async (_url, init) => {
      const body = JSON.parse(init.body as string) as { id: number; method: string; params: unknown[] };
      chain.calls.push(body.method);
      if (body.method === chain.failMethod) return new Response('boom', { status: 500 });
      const ok = (result: unknown): Response =>
        new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200 });
      switch (body.method) {
        case 'getGenesisHash':
          return ok(chain.genesis);
        case 'getSlot':
          if (chain.gate !== undefined) await chain.gate;
          return ok(TIP_SLOT);
        case 'getSignaturesForAddress':
          return ok([{ signature: SIG, slot: FUNDED_SLOT, err: null }]);
        case 'getTransaction':
          return ok({
            slot: FUNDED_SLOT,
            transaction: {
              signatures: [SIG],
              message: {
                accountKeys: [PAYER, payment.stealthAddress, MEMO_PROGRAM],
                instructions: [{ programIdIndex: 2, accounts: [], data: base58.encode(new TextEncoder().encode(memo)) }],
              },
            },
            meta: {
              err: null,
              preBalances: [5_000_000_000, 0, 1],
              postBalances: [4_997_000_000, 2_000_000, 1],
              preTokenBalances: [],
              postTokenBalances: [],
            },
          });
        case 'getBalance':
          return ok({ context: { slot: TIP_SLOT }, value: Number(chain.balance) });
        case 'getLatestBlockhash':
          return ok({
            context: { slot: TIP_SLOT },
            value: { blockhash: base58.encode(new Uint8Array(32).fill(5)), lastValidBlockHeight: 1000 },
          });
        case 'sendTransaction': {
          const wire = String(body.params[0]);
          chain.broadcasts.push(wire);
          const bytes = Uint8Array.from(atob(wire), (c) => c.charCodeAt(0));
          return ok(base58.encode(bytes.subarray(1, 65)));
        }
        default:
          return new Response('unexpected', { status: 404 });
      }
    },
  };
  return chain;
}
