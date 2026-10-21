import {
  AccountRole,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from '@solana/kit';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { ASSOCIATED_TOKEN_PROGRAM, MEMO_PROGRAM, SYSTEM_PROGRAM, TOKEN_PROGRAMS } from './programs.js';

const U64_MAX = (1n << 64n) - 1n;

function u64le(v: bigint): Uint8Array {
  if (typeof v !== 'bigint' || v < 0n || v > U64_MAX) return fail('INVALID_AMOUNT');
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
  return out;
}

function requireTokenProgram(tokenProgram: Address): void {
  if (!TOKEN_PROGRAMS.includes(tokenProgram)) fail('INVALID_ADDRESS');
}

/**
 * System program `Transfer` (discriminator u32 LE 2, amount u64 LE).
 * Accounts: source (writable, signer), destination (writable).
 */
export function systemTransfer(source: Address, destination: Address, lamports: bigint): Instruction {
  const data = new Uint8Array(12);
  data[0] = 2;
  data.set(u64le(lamports), 4);
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: source, role: AccountRole.WRITABLE_SIGNER },
      { address: destination, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

/**
 * Associated Token Account `CreateIdempotent` (data `[1]`).
 * Accounts: payer (writable, signer), ata (writable), owner, mint, system program, token program.
 * Succeeds as a no-op if the ATA already exists with the right owner/mint.
 */
export function createAtaIdempotent(
  payer: Address,
  ata: Address,
  owner: Address,
  mint: Address,
  tokenProgram: Address,
): Instruction {
  requireTokenProgram(tokenProgram);
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: ata, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: tokenProgram, role: AccountRole.READONLY },
    ],
    data: Uint8Array.of(1),
  };
}

/**
 * SPL Token `TransferChecked` (data `[12, amount u64 LE, decimals u8]`).
 * Accounts: source (writable), mint, destination (writable), authority (signer).
 * `Checked` makes the program reject a wrong mint/decimals pair.
 */
export function tokenTransferChecked(
  tokenProgram: Address,
  source: Address,
  mint: Address,
  destination: Address,
  authority: Address,
  amount: bigint,
  decimals: number,
): Instruction {
  requireTokenProgram(tokenProgram);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return fail('INVALID_INPUT');
  const data = new Uint8Array(10);
  data[0] = 12;
  data.set(u64le(amount), 1);
  data[9] = decimals;
  return {
    programAddress: tokenProgram,
    accounts: [
      { address: source, role: AccountRole.WRITABLE },
      { address: mint, role: AccountRole.READONLY },
      { address: destination, role: AccountRole.WRITABLE },
      { address: authority, role: AccountRole.READONLY_SIGNER },
    ],
    data,
  };
}

/**
 * SPL Token `CloseAccount` (data `[9]`): returns the token account's rent lamports to `destination`.
 * Accounts: account (writable), destination (writable), owner (signer). Balance must be zero.
 */
export function tokenCloseAccount(
  tokenProgram: Address,
  account: Address,
  destination: Address,
  owner: Address,
): Instruction {
  requireTokenProgram(tokenProgram);
  return {
    programAddress: tokenProgram,
    accounts: [
      { address: account, role: AccountRole.WRITABLE },
      { address: destination, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY_SIGNER },
    ],
    data: Uint8Array.of(9),
  };
}

/** SPL Memo with no signer accounts; data is the UTF-8 text. */
export function memoInstruction(text: string, program: Address = MEMO_PROGRAM): Instruction {
  return { programAddress: program, data: utf8ToBytes(text) };
}

/**
 * Associated token account address: PDA of `[owner, tokenProgram, mint]` under the ATA program.
 *
 * @remarks The owner may be any address; for a stealth owner the ATA is a fresh, unlinked account.
 */
export async function findAssociatedTokenAddress(
  owner: Address,
  mint: Address,
  tokenProgram: Address,
): Promise<Address> {
  requireTokenProgram(tokenProgram);
  const enc = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [enc.encode(owner), enc.encode(tokenProgram), enc.encode(mint)],
  });
  return ata;
}
