import { findFeed, type QualifiedFeed } from '@ghostpay/chain-adapters';

export const qualifiedFeed: QualifiedFeed = {
  ...findFeed(11155111, 'ETH', 'USD')!, heartbeatSec: 3600, decimals: 8,
  qualification: {
    blockNumber: 1, blockHash: `0x${'ab'.repeat(32)}`,
    reference: { address: '0x7777777777777777777777777777777777777777', decimals: 8, maxAgeSec: 300 },
  },
};
