/** Invoice-level Bitcoin payment modes (BPJ spec section 5). `mainnet` is not representable. */
export type BtcMode = 'plain' | 'silent-payment' | 'payjoin-v1' | 'payjoin-v2';

/** One row of the comparison table shown by the invoice creator (data, not UI). */
export interface BtcModeInfo {
  readonly id: BtcMode;
  readonly name: string;
  readonly interactive: 'no' | 'yes, receiver online' | 'yes, async';
  readonly serverDependency: string;
  readonly hides: readonly string[];
  readonly needsPayerWalletSupport: boolean;
  /** Honest limits that MUST accompany the row (spec section 2, N1..N8). */
  readonly limits: readonly string[];
}

const COMMON_LIMITS = [
  'N5: either party can broadcast the original (fully linked) transaction at any time.',
  'N7: network-layer exposure (node or Esplora IP) is unchanged.',
  'N8: testnet, signet and regtest only.',
] as const;

/** Frozen data for the UI. Wording avoids anonymity claims on purpose. */
export const BTC_MODE_INFO: Readonly<Record<BtcMode, BtcModeInfo>> = Object.freeze({
  plain: Object.freeze({
    id: 'plain',
    name: 'Plain address',
    interactive: 'no',
    serverDependency: 'none',
    hides: Object.freeze([]),
    needsPayerWalletSupport: false,
    limits: Object.freeze([...COMMON_LIMITS]),
  }),
  'silent-payment': Object.freeze({
    id: 'silent-payment',
    name: 'Silent payment (BIP-352)',
    interactive: 'no',
    serverDependency: 'scan oracle (receiver side)',
    hides: Object.freeze(['address reuse']),
    needsPayerWalletSupport: true,
    limits: Object.freeze([...COMMON_LIMITS]),
  }),
  'payjoin-v1': Object.freeze({
    id: 'payjoin-v1',
    name: 'PayJoin v1 (BIP-78)',
    interactive: 'yes, receiver online',
    serverDependency: 'receiver HTTP endpoint (onion or tunnel)',
    hides: Object.freeze(['common-input ownership', 'payment amount heuristics']),
    needsPayerWalletSupport: true,
    limits: Object.freeze([
      'N1: no silent-payment property; the payee address is visible to the payer.',
      'N2: not a mixer; the receiver input binds the receiver UTXO history to this transaction.',
      'N3: the payer learns one receiver UTXO per attempt (UTXO probing).',
      ...COMMON_LIMITS,
    ]),
  }),
  'payjoin-v2': Object.freeze({
    id: 'payjoin-v2',
    name: 'PayJoin v2 (BIP-77, draft)',
    interactive: 'yes, async',
    serverDependency: 'directory plus OHTTP relay',
    hides: Object.freeze(['common-input ownership', 'payment amount heuristics']),
    needsPayerWalletSupport: true,
    limits: Object.freeze([
      'N1: no silent-payment property; the payee address is visible to the payer.',
      'N2: not a mixer; the receiver input binds the receiver UTXO history to this transaction.',
      'N3: the payer learns one receiver UTXO per attempt (UTXO probing).',
      'N4: directory and relay see timing and sizes; one operator running both voids OHTTP separation.',
      ...COMMON_LIMITS,
    ]),
  }),
});
