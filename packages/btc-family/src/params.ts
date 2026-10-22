import { fail } from './errors.js';

/** Input script types BIP-352 allows for shared-secret derivation. */
export type InputType = 'p2tr' | 'p2wpkh' | 'p2sh-p2wpkh' | 'p2pkh';

/** All input types, in BIP-352 order. */
export const ALL_INPUT_TYPES: readonly InputType[] = ['p2tr', 'p2wpkh', 'p2sh-p2wpkh', 'p2pkh'];

/** Verification state of a chain's parameters. */
export type ChainStatus = 'verified-feasible' | 'research-only';

/** Pluggable per-chain parameters of the BIP-352 engine. */
export interface ChainParams {
  /** Stable id, used as adapter `chainId`, for example `btc-mainnet`, `ltc-testnet`. */
  readonly id: string;
  readonly name: string;
  /** Bech32m human-readable part of the silent payment address (lowercase). */
  readonly spHrp: string;
  /** BIP-44 / SLIP-44 coin type (used for the BIP-352 key paths). */
  readonly coinType: number;
  /** Input types whose keys feed the shared secret on this chain. */
  readonly eligibleInputTypes: readonly InputType[];
  /** True when the chain has SegWit (BIP-141) on its live network. */
  readonly segwit: boolean;
  readonly status: ChainStatus;
  /** Mainnet (real value) or a test network. */
  readonly network: 'mainnet' | 'testnet';
  /**
   * True when `spHrp` is NOT a standardised, registered HRP. Experimental mainnet params are
   * refused for any funds-handling operation (sender outputs, payment requests).
   */
  readonly experimental: boolean;
  /** Human-readable provenance and caveats. */
  readonly notes: string;
}

const HRP_RE = /^[a-z0-9]{1,20}$/;
const SEGWIT_ONLY: readonly InputType[] = ['p2tr', 'p2wpkh', 'p2sh-p2wpkh'];

/**
 * Validates and freezes a {@link ChainParams} (copy).
 *
 * @remarks Rules: non-empty id/name; HRP is 1-20 chars of `[a-z0-9]`; coin type is an integer in
 * [0, 2^31-1]; input types are unique members of {@link ALL_INPUT_TYPES}, non-empty; a chain
 * without SegWit cannot list `p2tr`, `p2wpkh` or `p2sh-p2wpkh`; an experimental chain must say so
 * in `notes`; `verified-feasible` is refused for experimental params.
 *
 * @param p Candidate parameters.
 * @returns A frozen copy.
 * @throws {BtcFamilyError} `INVALID_PARAMS`.
 * @security Public configuration only.
 */
export function defineChainParams(p: ChainParams): ChainParams {
  if (p.id.length === 0 || p.name.length === 0) return fail('INVALID_PARAMS');
  if (!HRP_RE.test(p.spHrp)) return fail('INVALID_PARAMS');
  if (!Number.isInteger(p.coinType) || p.coinType < 0 || p.coinType > 0x7fffffff)
    return fail('INVALID_PARAMS');
  if (p.eligibleInputTypes.length === 0) return fail('INVALID_PARAMS');
  const seen = new Set<InputType>();
  for (const t of p.eligibleInputTypes) {
    if (!ALL_INPUT_TYPES.includes(t) || seen.has(t)) return fail('INVALID_PARAMS');
    if (!p.segwit && SEGWIT_ONLY.includes(t)) return fail('INVALID_PARAMS');
    seen.add(t);
  }
  if (p.network !== 'mainnet' && p.network !== 'testnet') return fail('INVALID_PARAMS');
  if (p.status !== 'verified-feasible' && p.status !== 'research-only') return fail('INVALID_PARAMS');
  if (p.experimental && (p.status === 'verified-feasible' || !/experimental/i.test(p.notes))) {
    return fail('INVALID_PARAMS');
  }
  return Object.freeze({ ...p, eligibleInputTypes: Object.freeze([...p.eligibleInputTypes]) });
}

/**
 * Throws `EXPERIMENTAL_CHAIN` when the params are experimental AND for mainnet.
 *
 * @security Guard against moving real funds with a made-up address format.
 */
export function assertFundsAllowed(params: ChainParams): void {
  if (params.experimental && params.network === 'mainnet') fail('EXPERIMENTAL_CHAIN');
}

const NOTE_EXPERIMENTAL =
  'experimental, not standardised: no registered silent payment HRP exists for this chain.';

/** Bitcoin mainnet. HRP `sp` from BIP-352; `bc` segwit HRP confirmed in bitcoin/bitcoin chainparams. */
export const BITCOIN_MAINNET: ChainParams = defineChainParams({
  id: 'btc-mainnet',
  name: 'Bitcoin',
  spHrp: 'sp',
  coinType: 0,
  eligibleInputTypes: ['p2tr', 'p2wpkh', 'p2sh-p2wpkh', 'p2pkh'],
  segwit: true,
  status: 'verified-feasible',
  network: 'mainnet',
  experimental: false,
  notes:
    'BIP-352 reference chain. HRP and input rules from BIP-352; validated against the official test vectors.',
});

/** Bitcoin testnet3/testnet4/signet/regtest (all share HRP `tsp`; segwit HRPs differ: tb, bcrt). */
export const BITCOIN_TESTNET: ChainParams = defineChainParams({
  id: 'btc-testnet',
  name: 'Bitcoin testnet / signet / testnet4 / regtest',
  spHrp: 'tsp',
  coinType: 1,
  eligibleInputTypes: ['p2tr', 'p2wpkh', 'p2sh-p2wpkh', 'p2pkh'],
  segwit: true,
  status: 'verified-feasible',
  network: 'testnet',
  experimental: false,
  notes:
    'BIP-352 HRP `tsp` covers every Bitcoin test network; coin type 1 per SLIP-44 "Testnet (all coins)".',
});

/**
 * Litecoin mainnet. Experimental HRP. Consensus facts verified in litecoin-project/litecoin
 * chainparams.cpp: SegWit active, bech32 HRP `ltc`, coin type 2 (SLIP-44). Taproot has a BIP9
 * deployment in that file but its mainnet ACTIVATION was not verified, so `p2tr` is not listed
 * and silent payment OUTPUTS (P2TR) may not be spendable on mainnet.
 */
export const LITECOIN_MAINNET: ChainParams = defineChainParams({
  id: 'ltc-mainnet',
  name: 'Litecoin',
  spHrp: 'ltcsp',
  coinType: 2,
  eligibleInputTypes: ['p2wpkh', 'p2sh-p2wpkh', 'p2pkh'],
  segwit: true,
  status: 'research-only',
  network: 'mainnet',
  experimental: true,
  notes: `${NOTE_EXPERIMENTAL} Taproot mainnet activation not verified; p2tr inputs excluded.`,
});

/** Litecoin testnet (segwit HRP `tltc`, taproot always-active only on regtest; see mainnet note). */
export const LITECOIN_TESTNET: ChainParams = defineChainParams({
  id: 'ltc-testnet',
  name: 'Litecoin testnet',
  spHrp: 'tltcsp',
  coinType: 1,
  eligibleInputTypes: ['p2wpkh', 'p2sh-p2wpkh', 'p2pkh'],
  segwit: true,
  status: 'research-only',
  network: 'testnet',
  experimental: true,
  notes: `${NOTE_EXPERIMENTAL} Taproot testnet activation not verified; p2tr inputs excluded.`,
});

/**
 * Dogecoin mainnet. dogecoin/dogecoin chainparams.cpp defines the SegWit deployment with
 * `nTimeout = 0` ("Disabled") and has no bech32 HRP and no Taproot: only P2PKH inputs are
 * usable and P2TR outputs cannot exist, so silent payments are not deployable.
 */
export const DOGECOIN_MAINNET: ChainParams = defineChainParams({
  id: 'doge-mainnet',
  name: 'Dogecoin',
  spHrp: 'dogesp',
  coinType: 3,
  eligibleInputTypes: ['p2pkh'],
  segwit: false,
  status: 'research-only',
  network: 'mainnet',
  experimental: true,
  notes: `${NOTE_EXPERIMENTAL} No SegWit/Taproot on Dogecoin: P2TR outputs cannot be created.`,
});

/**
 * Bitcoin Cash mainnet. bitcoin-cash-node uses CashAddr (`bitcoincash`) and has no SegWit and no
 * Taproot: only P2PKH inputs are usable and P2TR outputs cannot exist.
 */
export const BITCOIN_CASH_MAINNET: ChainParams = defineChainParams({
  id: 'bch-mainnet',
  name: 'Bitcoin Cash',
  spHrp: 'bchsp',
  coinType: 145,
  eligibleInputTypes: ['p2pkh'],
  segwit: false,
  status: 'research-only',
  network: 'mainnet',
  experimental: true,
  notes: `${NOTE_EXPERIMENTAL} No SegWit/Taproot on Bitcoin Cash: P2TR outputs cannot be created.`,
});

/** All built-in chain parameters. */
export const BUILTIN_CHAINS: readonly ChainParams[] = Object.freeze([
  BITCOIN_MAINNET,
  BITCOIN_TESTNET,
  LITECOIN_MAINNET,
  LITECOIN_TESTNET,
  DOGECOIN_MAINNET,
  BITCOIN_CASH_MAINNET,
]);

/** Finds a built-in (or supplied) chain by its silent payment HRP. */
export function findChainByHrp(
  hrp: string,
  chains: readonly ChainParams[] = BUILTIN_CHAINS,
): ChainParams | undefined {
  return chains.find((c) => c.spHrp === hrp);
}

/** Finds a built-in (or supplied) chain by id. */
export function findChainById(
  id: string,
  chains: readonly ChainParams[] = BUILTIN_CHAINS,
): ChainParams | undefined {
  return chains.find((c) => c.id === id);
}
