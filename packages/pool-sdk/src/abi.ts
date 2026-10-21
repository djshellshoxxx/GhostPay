import { parseAbi } from 'viem';

/**
 * Minimal ABI of `IGhostPayShieldedPool` / `IGhostPayAssociationSetRegistry` as specified in
 * `docs/remote/privacy-specs/shielded-pool.md` 6.1/6.2. The deployed ABI from `packages/pool-contracts`
 * takes precedence; see DEVIATIONS.md for the reconciliation status.
 */
export const poolAbi = parseAbi([
  'struct Withdrawal { address recipient; address relayer; uint256 relayerFee; address feeTo; uint256 deadline; address aspPublisher; bytes announce; }',
  'struct WithdrawProof { uint256[2] pA; uint256[2][2] pB; uint256[2] pC; uint256[9] pubSignals; }',
  'struct RagequitProof { uint256[2] pA; uint256[2][2] pB; uint256[2] pC; uint256[4] pubSignals; }',
  'event Deposited(address indexed depositor, uint256 commitment, uint256 label, uint256 value, uint256 precommitment)',
  'event Withdrawn(address indexed recipient, uint256 value, uint256 relayerFee, uint256 spentNullifier, uint256 newCommitment, address indexed aspPublisher, uint256 aspRoot)',
  'event Ragequit(address indexed depositor, uint256 commitment, uint256 label, uint256 value)',
  'function deposit(uint256 value, uint256 precommitment) payable returns (uint256 commitment, uint256 label)',
  'function withdraw(Withdrawal w, WithdrawProof p)',
  'function ragequit(RagequitProof p)',
  'function ASSET() view returns (address)',
  'function SCOPE() view returns (uint256)',
  'function DENOMINATION() view returns (uint256)',
  'function MAX_DEPOSIT() view returns (uint256)',
  'function MAX_RELAYER_FEE_BPS() view returns (uint256)',
  'function currentRoot() view returns (uint256)',
  'function currentTreeDepth() view returns (uint256)',
  'function currentTreeSize() view returns (uint256)',
  'function isKnownRoot(uint256 root) view returns (bool)',
  'function nullifierSpent(uint256 nullifierHash) view returns (bool)',
  'function depositorOf(uint256 label) view returns (address)',
]);

/** Registry ABI (6.2). */
export const registryAbi = parseAbi([
  'event RootPublished(address indexed publisher, uint256 indexed root, uint64 index, string uri)',
  'function publish(uint256 root, string uri)',
  'function latest(address publisher) view returns (uint256 root, uint64 publishedAt, uint64 index)',
  'function supersededAt(address publisher, uint256 root) view returns (uint64)',
  'function wasPublished(address publisher, uint256 root) view returns (bool)',
]);
