import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  buildTrxTransfer,
  deriveTronStealth,
  tronAddressFromHex,
  tronAddressToHex,
  type TronStealthPayment,
} from '@ghostpay/tron-adapter';
import { tronNetwork, type TronNetworkId } from './network';
import { backupHex, walletFromBackupHex, type TronWallet } from './wallet';

/** 64 bytes: spending scalar then viewing scalar (valid secp256k1 scalars). */
export const BACKUP_A = `${'11'.repeat(32)}${'22'.repeat(32)}`;
export const PAYER = tronAddressFromHex(`41${'07'.repeat(20)}`);
export const DEST = tronAddressFromHex(`41${'09'.repeat(20)}`);
export const FUNDED_BLOCK = 500;
export const TIP_BLOCK = 600;
const hash = (n: number): string => n.toString(16).padStart(64, '0');

export function walletA(id: TronNetworkId = 'local'): TronWallet {
  return walletFromBackupHex(BACKUP_A, tronNetwork(id));
}

export { backupHex };

export interface MockTron {
  readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>;
  /** Paths seen, in order. */
  readonly calls: string[];
  /** Hex bodies given to /wallet/broadcasthex. */
  readonly broadcasts: string[];
  readonly payment: TronStealthPayment;
  genesis: string;
  balanceSun: number;
  destActive: boolean;
  failPath: string | undefined;
  /** When set, `getnowblock` waits for this promise (stale-async tests). */
  gate: Promise<void> | undefined;
}

/** In-memory TRON node double holding one funded stealth payment for `wallet`. */
export function mockTron(wallet: TronWallet): MockTron {
  const payment = deriveTronStealth(wallet.metaAddress);
  const built = buildTrxTransfer({
    owner: PAYER,
    to: payment.stealthAddress,
    amountSun: 5_000_000n,
    refBlock: { number: 400n, blockId: hash(400) },
    timestampMs: 1_700_000_000_000n,
    memo: payment.memo,
  });
  const tx = {
    txID: built.txID,
    raw_data: {
      data: bytesToHex(payment.memo),
      contract: [
        {
          type: 'TransferContract',
          parameter: {
            value: {
              owner_address: tronAddressToHex(PAYER),
              to_address: tronAddressToHex(payment.stealthAddress),
              amount: 5_000_000,
            },
          },
        },
      ],
    },
    raw_data_hex: built.rawDataHex,
    ret: [{ contractRet: 'SUCCESS' }],
  };
  const block = (n: number, transactions: unknown[]): unknown => ({
    blockID: hash(n),
    block_header: { raw_data: { number: n } },
    transactions,
  });
  const chain: MockTron = {
    calls: [],
    broadcasts: [],
    payment,
    genesis: hash(0),
    balanceSun: 5_000_000,
    destActive: true,
    failPath: undefined,
    gate: undefined,
    fetchFn: async (url, init) => {
      const path = new URL(url).pathname;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      chain.calls.push(path);
      if (path === chain.failPath) return new Response('boom', { status: 500 });
      const ok = (v: unknown): Response => new Response(JSON.stringify(v), { status: 200 });
      switch (path) {
        case '/wallet/getblockbylimitnext': {
          const start = body['startNum'] as number;
          const end = body['endNum'] as number;
          const all = [
            { n: 0, b: block(0, []) },
            { n: FUNDED_BLOCK, b: block(FUNDED_BLOCK, [tx]) },
          ];
          const list = all.filter((x) => x.n >= start && x.n < end).map((x) => x.b);
          if (start === 0 && end === 1) {
            return ok({ block: [{ ...(block(0, []) as object), blockID: chain.genesis }] });
          }
          return ok({ block: list });
        }
        case '/wallet/getnowblock':
          if (chain.gate !== undefined) await chain.gate;
          return ok(block(TIP_BLOCK, []));
        case '/wallet/gettransactionbyid':
          return ok(body['value'] === built.txID ? tx : {});
        case '/wallet/getaccount': {
          const addr = body['address'];
          if (addr === payment.stealthAddress) return ok({ address: addr, balance: chain.balanceSun });
          if (addr === DEST && chain.destActive) return ok({ address: addr, balance: 1 });
          return ok({});
        }
        case '/wallet/getchainparameters':
          return ok({ chainParameter: [{ key: 'getEnergyFee', value: 420 }, { key: 'getTransactionFee', value: 1000 }] });
        case '/wallet/broadcasthex': {
          const hex = body['transaction'] as string;
          chain.broadcasts.push(hex);
          const bytes = hexToBytes(hex);
          let i = 1;
          let len = 0;
          for (let shift = 0; ; shift += 7) {
            const b = bytes[i++] as number;
            len |= (b & 0x7f) << shift;
            if ((b & 0x80) === 0) break;
          }
          return ok({ result: true, txid: bytesToHex(sha256(bytes.subarray(i, i + len))) });
        }
        default:
          return new Response('unexpected', { status: 404 });
      }
    },
  };
  return chain;
}
