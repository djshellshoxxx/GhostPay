/** User-selectable pool methods (spec section 1). */
export type SpOption = 'SP-EXIT' | 'SP-PAY' | 'SP-RQ';

/** Ids of the limits that every option MUST list under `doesNotHide` (spec section 2). */
export const LIMIT_IDS = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'] as const;
/** One limit id. */
export type LimitId = (typeof LIMIT_IDS)[number];

/** Plain-language limits, normative UI copy (SP-UI-2). Wording rules: SP-UI-3. */
export const LIMIT_COPY: Readonly<Record<LimitId, string>> = Object.freeze({
  N1: 'Crowd: the set of possible sources is only the deposits in this GhostPay test pool for this token. On a testnet with few users that is effectively no privacy.',
  N2: 'Your deposit into the pool is public: the pool address, value and your depositing address are visible on-chain.',
  N3: 'Amount and timing: withdrawing about the value you deposited soon after can be matched by anyone watching.',
  N4: 'Fingerprint: a router payment followed by a pool deposit from the same address marks a GhostPay seller exit. Pool, registry and relayer addresses are public labels.',
  N5: 'Relayer and network: the relayer sees the recipient, value, fee, proof and your network address; your RPC provider sees which addresses you query.',
  N6: 'Association set: a publisher can exclude anyone, lag behind, or be wrong. Choosing a publisher is disclosed on-chain.',
  N7: 'Ragequit and reuse: ragequit is public. Withdrawing to an address linked to you, or combining several destinations, re-links them.',
  N8: 'Soundness: this test pool uses an insecure development setup. A circuit bug or leaked setup secret allows forged proofs and draining the pool.',
  N9: 'Testnet only: mainnet use is refused by the contracts and the client.',
});

/** Fixed line shown before signing. */
export const TEST_POOL_LINE = 'Test pool: the set of possible sources is only other testnet users.';

/** Static description of one option for the UI. */
export interface SpOptionInfo {
  readonly option: SpOption;
  /** Facts the method makes harder to read from the public chain data (mechanism, not a guarantee). */
  readonly hides: readonly string[];
  /** Limit ids, always all of {@link LIMIT_IDS}. */
  readonly doesNotHide: readonly LimitId[];
  readonly whoSees: Readonly<Record<string, readonly string[]>>;
  readonly needsRelayer: boolean;
  readonly needsProver: boolean;
  readonly testnetOnly: true;
}

const ALL: readonly LimitId[] = LIMIT_IDS;

/** Option table (SP-GEN-3: `hides` never claims the deposit, depositor, network address or a set size). */
export const SP_OPTION_INFO: Readonly<Record<SpOption, SpOptionInfo>> = Object.freeze({
  'SP-EXIT': {
    option: 'SP-EXIT',
    hides: ['which-pool-deposit-funded-the-withdrawal-destination'],
    doesNotHide: ALL,
    whoSees: {
      public: ['stealth-address-to-pool', 'pool-to-destination', 'values', 'timing'],
      relayer: ['destination', 'value', 'fee', 'proof', 'network-address', 'timing'],
      rpc: ['queried-addresses', 'network-address'],
    },
    needsRelayer: false,
    needsProver: true,
    testnetOnly: true,
  },
  'SP-PAY': {
    option: 'SP-PAY',
    hides: ['payer-address-in-the-announcement', 'which-pool-deposit-funded-the-payment'],
    doesNotHide: ALL,
    whoSees: {
      public: ['pool-to-stealth-address', 'announcement-caller-is-pool', 'values', 'timing'],
      seller: ['stealth-address', 'value'],
      relayer: ['stealth-address', 'value', 'fee', 'proof', 'network-address', 'timing'],
    },
    needsRelayer: false,
    needsProver: true,
    testnetOnly: true,
  },
  'SP-RQ': {
    option: 'SP-RQ',
    hides: [],
    doesNotHide: ALL,
    whoSees: { public: ['depositor', 'value', 'timing'] },
    needsRelayer: false,
    needsProver: true,
    testnetOnly: true,
  },
});

/** Strings that must never appear in user-facing copy (SP-UI-3). */
export const BANNED_COPY = /anonym|untraceab|unlinkab|\bmix(er|ing)?\b/i;
