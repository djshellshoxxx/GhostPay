import { describe, expect, it } from 'vitest';
import { BtcFamilyError } from './errors.js';
import {
  ALL_INPUT_TYPES,
  assertFundsAllowed,
  BITCOIN_CASH_MAINNET,
  BITCOIN_MAINNET,
  BITCOIN_TESTNET,
  BUILTIN_CHAINS,
  defineChainParams,
  DOGECOIN_MAINNET,
  findChainByHrp,
  findChainById,
  LITECOIN_MAINNET,
  LITECOIN_TESTNET,
  type ChainParams,
} from './params.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof BtcFamilyError ? e.code : 'OTHER';
  }
  return undefined;
}

const base: ChainParams = {
  id: 'x-main',
  name: 'X',
  spHrp: 'xsp',
  coinType: 7,
  eligibleInputTypes: ['p2wpkh'],
  segwit: true,
  status: 'research-only',
  network: 'testnet',
  experimental: false,
  notes: 'n',
};

describe('built-in chain params', () => {
  it('has the documented HRPs, coin types and statuses', () => {
    expect(BUILTIN_CHAINS.map((c) => [c.id, c.spHrp, c.coinType, c.status, c.experimental])).toEqual([
      ['btc-mainnet', 'sp', 0, 'verified-feasible', false],
      ['btc-testnet', 'tsp', 1, 'verified-feasible', false],
      ['ltc-mainnet', 'ltcsp', 2, 'research-only', true],
      ['ltc-testnet', 'tltcsp', 1, 'research-only', true],
      ['doge-mainnet', 'dogesp', 3, 'research-only', true],
      ['bch-mainnet', 'bchsp', 145, 'research-only', true],
    ]);
  });

  it('HRPs and ids are unique', () => {
    expect(new Set(BUILTIN_CHAINS.map((c) => c.spHrp)).size).toBe(BUILTIN_CHAINS.length);
    expect(new Set(BUILTIN_CHAINS.map((c) => c.id)).size).toBe(BUILTIN_CHAINS.length);
  });

  it('input eligibility per chain', () => {
    expect(BITCOIN_MAINNET.eligibleInputTypes).toEqual(ALL_INPUT_TYPES);
    expect(BITCOIN_TESTNET.eligibleInputTypes).toEqual(ALL_INPUT_TYPES);
    expect(LITECOIN_MAINNET.eligibleInputTypes).not.toContain('p2tr');
    expect(LITECOIN_TESTNET.eligibleInputTypes).toContain('p2wpkh');
    expect(DOGECOIN_MAINNET.eligibleInputTypes).toEqual(['p2pkh']);
    expect(BITCOIN_CASH_MAINNET.eligibleInputTypes).toEqual(['p2pkh']);
    expect(DOGECOIN_MAINNET.segwit).toBe(false);
    expect(BITCOIN_CASH_MAINNET.segwit).toBe(false);
  });

  it('every experimental chain says so in its notes and is research-only', () => {
    for (const c of BUILTIN_CHAINS.filter((x) => x.experimental)) {
      expect(c.notes).toMatch(/experimental, not standardised/);
      expect(c.status).toBe('research-only');
    }
  });

  it('are frozen', () => {
    expect(Object.isFrozen(BITCOIN_MAINNET)).toBe(true);
    expect(Object.isFrozen(BITCOIN_MAINNET.eligibleInputTypes)).toBe(true);
  });

  it('lookups', () => {
    expect(findChainByHrp('ltcsp')?.id).toBe('ltc-mainnet');
    expect(findChainByHrp('nope')).toBeUndefined();
    expect(findChainById('doge-mainnet')?.spHrp).toBe('dogesp');
    expect(findChainById('nope', [])).toBeUndefined();
  });
});

describe('defineChainParams', () => {
  it('accepts a valid custom chain', () => {
    expect(defineChainParams(base).spHrp).toBe('xsp');
  });

  it('rejects bad fields', () => {
    const bad: Partial<ChainParams>[] = [
      { id: '' },
      { name: '' },
      { spHrp: '' },
      { spHrp: 'UPPER' },
      { spHrp: 'has space' },
      { spHrp: 'a'.repeat(21) },
      { coinType: -1 },
      { coinType: 1.5 },
      { coinType: 0x80000000 },
      { eligibleInputTypes: [] },
      { eligibleInputTypes: ['p2wpkh', 'p2wpkh'] },
      { eligibleInputTypes: ['p2wsh' as never] },
      { segwit: false, eligibleInputTypes: ['p2wpkh'] },
      { segwit: false, eligibleInputTypes: ['p2tr'] },
      { segwit: false, eligibleInputTypes: ['p2sh-p2wpkh'] },
      { network: 'signet' as never },
      { status: 'maybe' as never },
      { experimental: true, notes: 'no flag text' },
      { experimental: true, status: 'verified-feasible', notes: 'experimental' },
    ];
    for (const b of bad) expect(code(() => defineChainParams({ ...base, ...b }))).toBe('INVALID_PARAMS');
  });

  it('accepts a SegWit-less p2pkh-only chain and an experimental chain with the note', () => {
    expect(defineChainParams({ ...base, segwit: false, eligibleInputTypes: ['p2pkh'] }).segwit).toBe(false);
    expect(defineChainParams({ ...base, experimental: true, notes: 'experimental' }).experimental).toBe(true);
  });

  it('does not alias the caller input', () => {
    const types: ChainParams['eligibleInputTypes'] = ['p2pkh'];
    const p = defineChainParams({ ...base, segwit: false, eligibleInputTypes: types });
    expect(p.eligibleInputTypes).not.toBe(types);
  });
});

describe('assertFundsAllowed', () => {
  it('refuses experimental mainnet chains only', () => {
    for (const c of [LITECOIN_MAINNET, DOGECOIN_MAINNET, BITCOIN_CASH_MAINNET]) {
      expect(code(() => assertFundsAllowed(c))).toBe('EXPERIMENTAL_CHAIN');
    }
    for (const c of [BITCOIN_MAINNET, BITCOIN_TESTNET, LITECOIN_TESTNET]) {
      expect(code(() => assertFundsAllowed(c))).toBeUndefined();
    }
  });
});
