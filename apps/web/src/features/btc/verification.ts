/**
 * User-facing statements about what a Bitcoin scan in this view verifies (spec 12). Keep them exact: they must
 * describe the code in `esplora.ts`, never more.
 */
export const SCAN_CHECKS: readonly string[] = [
  'The block header hash equals the hash the server reported, and the header meets its own proof-of-work target and the network limit.',
  'Transaction ids are recomputed on this device and must produce the header Merkle root, so inputs and outputs are bound to the header.',
  'Witness data is bound to the header through the coinbase witness commitment (BIP-141), so input keys cannot be swapped.',
  'Consecutive blocks in the scanned range must link by previous-block hash. Only a scan that starts at block 0 or 1 is linked to the pinned genesis block; otherwise the first block scanned is not anchored to the genesis block or to any checkpoint.',
];

export const SCAN_LIMITS: readonly string[] = [
  'This is not full SPV and not best-chain validation. Difficulty retargeting, chain work and most-work fork choice exist in the library but are not used here, because no trusted checkpoint is pinned for these networks. A server can still serve a self-consistent low-work fork, and proof of work on test networks is cheap.',
  'The scripts and amounts of the outputs being spent come from the server (they live in earlier blocks). A lying server can hide a payment, and it can also invent one: nothing here checks that the scanned blocks are on the most-work chain, so it can serve a block it mined itself, which is cheap on test networks. Confirm a payment with a source you trust before relying on it.',
  'Spent status comes from the server.',
  'The server learns your IP address and which block heights you scan. It never receives your keys.',
];

export interface ScanMode {
  readonly mode: string;
  readonly keyLeaves: string;
  readonly serverLearns: string;
  readonly available: string;
}

/** Spec 12 disclosure table, as it applies to this view. */
export const SCAN_MODES: readonly ScanMode[] = [
  {
    mode: 'A. Your own server (an Esplora instance you run)',
    keyLeaves: 'No',
    serverLearns: 'Nothing beyond your own machine',
    available: 'Yes: enter your server URL',
  },
  {
    mode: 'B. Someone else\'s block server',
    keyLeaves: 'No',
    serverLearns: 'Your IP address, the block range, and that you scan',
    available: 'Yes: enter its URL',
  },
  {
    mode: 'C. Hosted scanning service',
    keyLeaves: 'Yes (scan key)',
    serverLearns: 'Every payment you receive',
    available: 'No: not implemented',
  },
];
