import { ANNOUNCEMENT_TOPIC, type Address, type RpcLog } from '@ghostpay/chain-adapters';
import { buildErc20Metadata, deriveStealthPayment } from '@ghostpay/core-crypto';
import { encodeAbiParameters } from 'viem/utils';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const TOKEN_84532 = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export interface MadeLog {
  readonly log: RpcLog;
  readonly stealthAddress: string;
}

/** An on-chain `Announcement` log for a payment to `metaAddress`, as the RPC would return it. */
export function makeLog(opts: { announcer: Address; metaAddress: string; block: number; index: number; caller: Address; amount?: bigint; wrongTag?: boolean }): MadeLog {
  const p = deriveStealthPayment(opts.metaAddress);
  const tag = opts.wrongTag === true ? (p.viewTag[0]! ^ 0x5a) : p.viewTag;
  const metadata = `0x${hex(buildErc20Metadata(tag, TOKEN_84532, opts.amount ?? 1_000_000n))}` as const;
  const eph = `0x${hex(p.ephemeralPublicKey)}` as const;
  const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  return {
    stealthAddress: p.stealthAddress,
    log: {
      address: opts.announcer,
      topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`, word(p.stealthAddress), word(opts.caller)],
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, metadata]),
      blockNumber: `0x${opts.block.toString(16)}`,
      blockHash: `0x${opts.block.toString(16).padStart(64, '0')}`,
      logIndex: `0x${opts.index.toString(16)}`,
      transactionHash: `0x${(BigInt(opts.block) * 4096n + BigInt(opts.index)).toString(16).padStart(64, '0')}`,
    },
  };
}
