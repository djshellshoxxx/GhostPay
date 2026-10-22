import { addressOfSecret, buildSweepTypedData, sweepDigest, type Address } from '@ghostpay/chain-adapters';
import { recoverAddress } from 'viem/utils';
import type { SweepSubmission } from './types.js';

export { addressOfSecret };

/** Recovers the signer of a submitted sweep (what the real contract does). */
export async function recoverSweepSigner(body: SweepSubmission, relayer: Address): Promise<Address> {
  const o = body.order;
  const td = buildSweepTypedData(body.chainId, relayer, {
    token: o.token, owner: o.owner, destination: o.destination, feeTo: o.feeTo,
    amount: BigInt(o.amount), fee: BigInt(o.fee), deadline: BigInt(o.deadline), nonce: BigInt(o.nonce),
  });
  return recoverAddress({ hash: sweepDigest(td), signature: body.signature });
}
