/** Disposable offline fixture only. No wallet keys, invoice keys, chain calls or funds. */
import { randomBytes } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { policyHash, serializeProposalExchange, signProposal } from '../../packages/merchant-multisig/dist/index.js';

export function approvalFixture(now = 1_767_225_600) {
  const keys = [randomBytes(32), randomBytes(32)];
  try {
    const policy = {
      accountId: 'offline-demo', chainId: '8453', version: 0,
      signers: keys.map((key, i) => ({ publicKey: bytesToHex(secp256k1.getPublicKey(key)), controller: `demo-${i}` })),
      threshold: 2, timelocks: { payout: 60, refund: 60, config: 120 },
    };
    const proposal = {
      kind: 'payout', accountId: policy.accountId, chainId: policy.chainId, policyHash: policyHash(policy),
      nonce: '0', createdAt: now, expiresAt: now + 3600,
      asset: 'fixture-only', to: 'fixture-only-no-wallet', amount: '100',
    };
    const exchange = serializeProposalExchange(policy, { proposal, approvals: keys.map(key => signProposal(proposal, key)) });
    return { policy, proposal, exchange, now };
  } finally { keys.forEach(key => key.fill(0)); }
}
