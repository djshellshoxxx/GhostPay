import type { MessageKey } from '../../i18n/catalog';

/**
 * User-facing statements about what a Bitcoin scan in this view verifies (spec 12). Keep them exact: they must
 * describe the code in `esplora.ts`, `headers.ts` and `scan.ts` as the view uses them, never more.
 */
export const SCAN_CHECKS: readonly string[] = [
  'The block header hash equals the hash the server reported, and the header meets its own proof-of-work target and the network limit.',
  'Transaction ids are recomputed on this device and must produce the header Merkle root, so inputs and outputs are bound to the header.',
  'Witness data is bound to the header through the coinbase witness commitment (BIP-141), so input keys cannot be swapped.',
  'Block headers from the server are checked on this device starting at the pinned genesis block: each must link to the one before, meet its proof-of-work target, carry the difficulty the network rules require, and have a valid timestamp and version. Among competing branches the one with the most cumulative work is kept. Every scanned block must have the hash this checked chain has at its height, so a block that extends nothing, or sits on a branch with less work, is refused.',
  'Checked headers are saved in this browser and checked again in full when loaded; saved headers that fail any check are discarded and downloaded again. When a chain with more work replaces blocks that were already scanned, the results from those blocks are removed.',
];

export const SCAN_LIMITS: readonly string[] = [
  'This is header-chain validation against the chain the server claims is best, with most-work selection among the headers it sent. It is not SPV and not full validation: no transaction or script is validated beyond the checks above. A server can hide a heavier chain or show you only its own (an eclipse), and proof of work on test networks is cheap, so a server can mine a heavier fork itself.',
  'The scripts and amounts of the outputs being spent come from the server (they live in earlier blocks). A lying server can hide a payment, and with a fork it mined itself (cheap on test networks) it can also invent one. Confirm a payment with a source you trust before relying on it.',
  'Spent status comes from the server.',
  'The server learns your IP address, which block heights you scan and which header ranges you download. It never receives your keys.',
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

/** Catalog identities for render-time copy; the source constants above remain API-compatible. */
export const SCAN_CHECK_KEYS = [
  'btc.verification.check.header',
  'btc.verification.check.transactions',
  'btc.verification.check.witness',
  'btc.verification.check.chain',
  'btc.verification.check.storage'
] as const satisfies readonly MessageKey[];

export const SCAN_LIMIT_KEYS = [
  'btc.verification.limit.validation',
  'btc.verification.limit.prevouts',
  'btc.verification.limit.spent',
  'btc.verification.limit.privacy'
] as const satisfies readonly MessageKey[];

export const SCAN_MODE_KEYS = [
  {
    'mode': 'btc.verification.mode.own.mode',
    'keyLeaves': 'btc.verification.mode.own.keyLeaves',
    'serverLearns': 'btc.verification.mode.own.serverLearns',
    'available': 'btc.verification.mode.own.available'
  },
  {
    'mode': 'btc.verification.mode.other.mode',
    'keyLeaves': 'btc.verification.mode.other.keyLeaves',
    'serverLearns': 'btc.verification.mode.other.serverLearns',
    'available': 'btc.verification.mode.other.available'
  },
  {
    'mode': 'btc.verification.mode.hosted.mode',
    'keyLeaves': 'btc.verification.mode.hosted.keyLeaves',
    'serverLearns': 'btc.verification.mode.hosted.serverLearns',
    'available': 'btc.verification.mode.hosted.available'
  }
] as const satisfies readonly Readonly<Record<keyof ScanMode, MessageKey>>[];

// i18n-use: btc.verification.check.header btc.verification.check.transactions btc.verification.check.witness btc.verification.check.chain btc.verification.check.storage btc.verification.limit.validation btc.verification.limit.prevouts btc.verification.limit.spent btc.verification.limit.privacy btc.verification.mode.own.mode btc.verification.mode.own.keyLeaves btc.verification.mode.own.serverLearns btc.verification.mode.own.available btc.verification.mode.other.mode btc.verification.mode.other.keyLeaves btc.verification.mode.other.serverLearns btc.verification.mode.other.available btc.verification.mode.hosted.mode btc.verification.mode.hosted.keyLeaves btc.verification.mode.hosted.serverLearns btc.verification.mode.hosted.available
