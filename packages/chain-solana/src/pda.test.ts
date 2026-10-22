import { utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { generateStealthKeys } from './keys.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createProgramAddress,
  findProgramAddress,
  findProgramAddressWith,
  getAssociatedTokenAddress,
  MEMO_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from './pda.js';
import { decodeAddress, isOnCurve } from './point.js';
import { seededRng } from './rng.testutil.js';
import { deriveStealthPayment } from './stealth.js';

const code = (c: string): unknown => expect.objectContaining({ code: c });

// External vectors: solana-labs/solana tag v1.18.26, sdk/program/src/pubkey.rs lines 885-925
// (test_create_program_address).
const BPF_UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
const SEED_PUBKEY = 'SeedPubey1111111111111111111111111111111111';

describe('createProgramAddress (external solana-program vectors)', () => {
  it.each([
    ['["", [1]]', [new Uint8Array(0), Uint8Array.of(1)], 'BwqrghZA2htAcqq8dzP1WDAhTXYTYWj7CHxF5j7TDBAe'],
    ['["☉", [0]]', [utf8ToBytes('☉'), Uint8Array.of(0)], '13yWmRpaTR4r5nAktwLqMpRNr28tnVUZw26rTvPSSB19'],
    [
      '["Talking", "Squirrels"]',
      [utf8ToBytes('Talking'), utf8ToBytes('Squirrels')],
      '2fnQrngrQT4SeLcdToJAD96phoEjNL2man2kfRLCASVk',
    ],
    [
      '[SeedPubey..., [1]]',
      [decodeAddress(SEED_PUBKEY), Uint8Array.of(1)],
      '976ymqVnfE32QFe6NfGDctSvVa36LWnvYxhU6G2232YL',
    ],
  ])('%s', (_n, seeds, expected) => {
    expect(createProgramAddress(seeds, BPF_UPGRADEABLE)).toBe(expected);
  });

  it('enforces seed limits like the Rust code (lines 581-592, 845-901)', () => {
    expect(() => createProgramAddress([new Uint8Array(33)], BPF_UPGRADEABLE)).toThrow(code('INVALID_SEEDS'));
    expect(() =>
      createProgramAddress([utf8ToBytes('short_seed'), new Uint8Array(33)], BPF_UPGRADEABLE),
    ).toThrow(code('INVALID_SEEDS'));
    expect(() => createProgramAddress([new Uint8Array(32)], BPF_UPGRADEABLE)).not.toThrow();
    const seeds = (n: number): Uint8Array[] => Array.from({ length: n }, (_, i) => Uint8Array.of(i + 1));
    expect(() => createProgramAddress(seeds(17), BPF_UPGRADEABLE)).toThrow(code('INVALID_SEEDS'));
    expect(() => createProgramAddress(seeds(16), BPF_UPGRADEABLE)).not.toThrow();
    expect(() => findProgramAddress(seeds(16), BPF_UPGRADEABLE)).toThrow(code('INVALID_SEEDS'));
    expect(() => findProgramAddress(seeds(15), BPF_UPGRADEABLE)).not.toThrow();
    expect(() => createProgramAddress('x' as unknown as Uint8Array[], BPF_UPGRADEABLE)).toThrow(
      code('INVALID_SEEDS'),
    );
    expect(() => createProgramAddress([[1] as unknown as Uint8Array], BPF_UPGRADEABLE)).toThrow(
      code('INVALID_SEEDS'),
    );
    expect(() => createProgramAddress([], 'bad')).toThrow(code('INVALID_ADDRESS'));
  });

  it('throws INVALID_SEEDS when the hash lands on the curve', () => {
    // Find seeds whose bump-less hash is on curve (about half of all hashes are).
    for (let i = 0; i < 64; i++) {
      const seeds = [Uint8Array.of(i)];
      try {
        createProgramAddress(seeds, BPF_UPGRADEABLE);
      } catch (e) {
        expect(e).toEqual(code('INVALID_SEEDS'));
        return;
      }
    }
    throw new Error('no on-curve hash found');
  });
});

describe('findProgramAddress', () => {
  it('returns the first off-curve bump from 255 down, consistent with create', () => {
    const seeds = [utf8ToBytes("Lil'"), utf8ToBytes('Bits')];
    const { address, bump } = findProgramAddress(seeds, BPF_UPGRADEABLE);
    expect(createProgramAddress([...seeds, Uint8Array.of(bump)], BPF_UPGRADEABLE)).toBe(address);
    expect(isOnCurve(decodeAddress(address))).toBe(false);
    for (let b = 255; b > bump; b--) {
      expect(() => createProgramAddress([...seeds, Uint8Array.of(b)], BPF_UPGRADEABLE)).toThrow(
        code('INVALID_SEEDS'),
      );
    }
  });

  it('never tries bump 0 (Rust loop runs 255 times)', () => {
    const tried: number[] = [];
    expect(() =>
      findProgramAddressWith([], BPF_UPGRADEABLE, () => {
        tried.push(tried.length);
        return true;
      }),
    ).toThrow(code('NO_VIABLE_BUMP'));
    expect(tried.length).toBe(255);
    let calls = 0;
    const r = findProgramAddressWith([], BPF_UPGRADEABLE, () => ++calls < 3);
    expect(r.bump).toBe(253);
  });
});

describe('associated token address', () => {
  const mint = 'So11111111111111111111111111111111111111112';

  it('is the PDA of [owner, token_program, mint] under the ATA program', () => {
    const keys = generateStealthKeys(seededRng('pda.test'));
    const pay = deriveStealthPayment(keys, seededRng('pda.test.2'));
    const ata = getAssociatedTokenAddress(pay.stealthAddress, mint);
    const manual = findProgramAddress(
      [decodeAddress(pay.stealthAddress), decodeAddress(TOKEN_PROGRAM_ID), decodeAddress(mint)],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    expect(ata).toBe(manual.address);
    const ata22 = getAssociatedTokenAddress(pay.stealthAddress, mint, {
      tokenProgramId: TOKEN_2022_PROGRAM_ID,
    });
    expect(ata22).not.toBe(ata);
  });

  it('rejects an off-curve owner unless allowed', () => {
    const pda = findProgramAddress([utf8ToBytes('x')], MEMO_PROGRAM_ID).address;
    expect(() => getAssociatedTokenAddress(pda, mint)).toThrow(code('INVALID_ADDRESS'));
    expect(getAssociatedTokenAddress(pda, mint, { allowOwnerOffCurve: true })).toMatch(
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    );
  });

  it('program id constants decode to 32 bytes', () => {
    for (const id of [
      TOKEN_PROGRAM_ID,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      MEMO_PROGRAM_ID,
    ]) {
      expect(decodeAddress(id).length).toBe(32);
    }
  });
});
