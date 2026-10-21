import {
  address as toAddress,
  appendTransactionMessageInstructions,
  blockhash as toBlockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type SignatureBytes,
  type Transaction,
} from '@solana/kit';
import { base58 } from '@scure/base';
import { equalBytes } from '@noble/curves/utils.js';
import { encodeAnnouncementMemo } from './announcement.js';
import { publicFromSecret, signWithScalar, verifySignature, type RandomSource } from './ed25519.js';
import { fail } from './errors.js';
import {
  createAtaIdempotent,
  findAssociatedTokenAddress,
  memoInstruction,
  systemTransfer,
  tokenCloseAccount,
  tokenTransferChecked,
} from './instructions.js';
import { MEMO_PROGRAM, TOKEN_PROGRAMS } from './programs.js';
import type { SecretScalar } from './secret.js';
import { deriveStealthPayment, type StealthPayment } from './stealth.js';

/** Recent blockhash lifetime (from `getLatestBlockhash`). */
export interface BlockhashLifetime {
  readonly blockhash: string;
  readonly lastValidBlockHeight: bigint;
}

/** Native SOL or an SPL token. */
export type SolanaAsset =
  | { readonly kind: 'native' }
  | {
      readonly kind: 'spl';
      readonly mint: string;
      readonly decimals: number;
      /** Token program owning the mint (classic Token or Token-2022 without extensions). */
      readonly tokenProgram: string;
    };

/** A compiled (possibly partially signed) transaction plus the signers it still needs. */
export interface SolanaTx {
  readonly transaction: Transaction;
  /** Exact bytes every signer signs. */
  readonly messageBytes: Uint8Array;
  /** All required signers, fee payer first. */
  readonly requiredSigners: readonly Address[];
}

/** Hard cap on legacy transaction wire size (Solana packet data limit, 1232 bytes). */
export const MAX_TX_BYTES = 1232;

/** Parses a base58 Solana address strictly (32 bytes). */
export function parseSolanaAddress(input: string): Address {
  try {
    return toAddress(input);
  } catch {
    return fail('INVALID_ADDRESS');
  }
}

function parseAsset(
  asset: SolanaAsset,
): { kind: 'native' } | { kind: 'spl'; mint: Address; decimals: number; tokenProgram: Address } {
  if (asset.kind === 'native') return { kind: 'native' };
  if (asset.kind !== 'spl') return fail('INVALID_INPUT');
  const tokenProgram = parseSolanaAddress(asset.tokenProgram);
  if (!TOKEN_PROGRAMS.includes(tokenProgram)) return fail('INVALID_ADDRESS');
  if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) {
    return fail('INVALID_INPUT');
  }
  return { kind: 'spl', mint: parseSolanaAddress(asset.mint), decimals: asset.decimals, tokenProgram };
}

function compile(feePayer: Address, lifetime: BlockhashLifetime, ixs: Instruction[]): SolanaTx {
  let bh;
  try {
    bh = toBlockhash(lifetime.blockhash);
  } catch {
    return fail('INVALID_INPUT');
  }
  if (typeof lifetime.lastValidBlockHeight !== 'bigint' || lifetime.lastValidBlockHeight < 0n) {
    return fail('INVALID_INPUT');
  }
  const msg = pipe(
    createTransactionMessage({ version: 'legacy' }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: bh, lastValidBlockHeight: lifetime.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const transaction = compileTransaction(msg) as Transaction;
  const messageBytes = new Uint8Array(transaction.messageBytes);
  const requiredSigners = Object.keys(transaction.signatures) as Address[];
  // signatures (1 compact-u16 byte + 64 each) + message must fit one packet.
  if (1 + requiredSigners.length * 64 + messageBytes.length > MAX_TX_BYTES) return fail('INVALID_INPUT');
  return { transaction, messageBytes, requiredSigners };
}

/**
 * Attaches a signature produced elsewhere (payer wallet, sponsor) after verifying it.
 *
 * @param tx Transaction.
 * @param signer Required signer address.
 * @param signature 64 bytes.
 * @returns New transaction object (input unchanged).
 * @throws {SolanaStealthError} `SIGNER_NOT_REQUIRED`, `SIGNATURE_INVALID`.
 */
export function addSignature(tx: SolanaTx, signer: Address, signature: Uint8Array): SolanaTx {
  if (!tx.requiredSigners.includes(signer)) return fail('SIGNER_NOT_REQUIRED');
  if (signature.length !== 64 || !verifySignature(signature, tx.messageBytes, base58.decode(signer))) {
    return fail('SIGNATURE_INVALID');
  }
  const signatures = { ...tx.transaction.signatures, [signer]: signature as SignatureBytes };
  return { ...tx, transaction: { ...tx.transaction, signatures } };
}

/**
 * Signs as the stealth owner with the one-time spend scalar.
 *
 * @param tx Transaction listing `p*G` as a required signer.
 * @param spendKey `p` from `deriveSpendKey`.
 * @param aux Optional 32-byte nonce randomness (tests); default fresh CSPRNG.
 * @returns New, partially or fully signed transaction.
 * @throws {SolanaStealthError} `SIGNER_NOT_REQUIRED` when `p*G` is not a signer.
 */
export function signWithStealthKey(tx: SolanaTx, spendKey: SecretScalar, aux?: Uint8Array): SolanaTx {
  const signer = base58.encode(publicFromSecret(spendKey)) as Address;
  if (!tx.requiredSigners.includes(signer)) return fail('SIGNER_NOT_REQUIRED');
  return addSignature(tx, signer, signWithScalar(spendKey, tx.messageBytes, aux));
}

/** True when every required signer has a signature. */
export function isFullySigned(tx: SolanaTx): boolean {
  return tx.requiredSigners.every((s) => tx.transaction.signatures[s] != null);
}

/**
 * Base64 wire encoding for `sendTransaction` (this package never sends).
 * @throws {SolanaStealthError} `INVALID_INPUT` when a signature is missing.
 */
export function toWireBase64(tx: SolanaTx): string {
  if (!isFullySigned(tx)) return fail('INVALID_INPUT');
  return getBase64EncodedWireTransaction(tx.transaction);
}

/** Inputs of {@link buildStealthPaymentTx}. */
export interface StealthPaymentTxInput {
  /** Payer wallet (signs the transfer). */
  readonly payer: string;
  /** Optional sponsor paying fees and ATA rent; defaults to `payer`. */
  readonly feePayer?: string;
  readonly spendPublicKey: Uint8Array;
  readonly viewPublicKey: Uint8Array;
  readonly asset: SolanaAsset;
  /** Base units (lamports or token units). */
  readonly amount: bigint;
  readonly lifetime: BlockhashLifetime;
  /** Native only: rent-exempt minimum for a 0-data account (`getMinimumBalanceForRentExemption(0)`). */
  readonly rentExemptMinimum?: bigint;
  /** SPL only: payer's source token account; defaults to the payer's ATA. */
  readonly payerTokenAccount?: string;
  readonly memoProgram?: string;
  /** Pre-derived payment (tests / vectors); default derives a fresh one. */
  readonly payment?: StealthPayment;
  readonly rng?: RandomSource;
}

/** Output of {@link buildStealthPaymentTx}. */
export interface BuiltStealthPayment {
  readonly tx: SolanaTx;
  readonly payment: StealthPayment;
  /** Owner of the received funds: the stealth address. */
  readonly stealthOwner: Address;
  /** Account credited: stealth address (SOL) or its ATA (SPL). */
  readonly creditedAccount: Address;
  readonly memo: string;
}

/**
 * Builds an unsigned stealth payment: transfer to a fresh one-time address plus a memo announcement.
 *
 * @remarks SOL: `Transfer(payer -> P)`; the amount must be >= the rent-exempt minimum or the
 * runtime rejects it. SPL: `CreateIdempotent(feePayer, ATA(P))` then `TransferChecked` to it;
 * the ATA rent (paid by `feePayer`) is visible on chain. Signatures: fee payer, payer.
 * @param input See {@link StealthPaymentTxInput}.
 * @returns Unsigned transaction and derived payment.
 * @throws {SolanaStealthError} `INVALID_ADDRESS`, `INVALID_AMOUNT`, `BELOW_RENT_EXEMPT`, `INVALID_POINT`.
 */
export async function buildStealthPaymentTx(input: StealthPaymentTxInput): Promise<BuiltStealthPayment> {
  const payer = parseSolanaAddress(input.payer);
  const feePayer = input.feePayer === undefined ? payer : parseSolanaAddress(input.feePayer);
  const asset = parseAsset(input.asset);
  if (typeof input.amount !== 'bigint' || input.amount <= 0n) return fail('INVALID_AMOUNT');
  const payment = input.payment ?? deriveStealthPayment(input.spendPublicKey, input.viewPublicKey, input.rng);
  const stealthOwner = toAddress(payment.stealthAddress);
  const memo = encodeAnnouncementMemo(payment.ephemeralPublicKey, payment.viewTag);
  const memoProgram = input.memoProgram === undefined ? MEMO_PROGRAM : parseSolanaAddress(input.memoProgram);
  const ixs: Instruction[] = [];
  let creditedAccount: Address;
  if (asset.kind === 'native') {
    if (input.rentExemptMinimum === undefined || input.rentExemptMinimum < 0n) {
      return fail('INVALID_INPUT');
    }
    if (input.amount < input.rentExemptMinimum) return fail('BELOW_RENT_EXEMPT');
    ixs.push(systemTransfer(payer, stealthOwner, input.amount));
    creditedAccount = stealthOwner;
  } else {
    const source =
      input.payerTokenAccount === undefined
        ? await findAssociatedTokenAddress(payer, asset.mint, asset.tokenProgram)
        : parseSolanaAddress(input.payerTokenAccount);
    creditedAccount = await findAssociatedTokenAddress(stealthOwner, asset.mint, asset.tokenProgram);
    ixs.push(
      createAtaIdempotent(feePayer, creditedAccount, stealthOwner, asset.mint, asset.tokenProgram),
      tokenTransferChecked(
        asset.tokenProgram,
        source,
        asset.mint,
        creditedAccount,
        payer,
        input.amount,
        asset.decimals,
      ),
    );
  }
  ixs.push(memoInstruction(memo, memoProgram));
  return { tx: compile(feePayer, input.lifetime, ixs), payment, stealthOwner, creditedAccount, memo };
}

/** Inputs of {@link buildStealthSweepTx}. */
export interface StealthSweepTxInput {
  /** Stealth address `P` (owner of the funds). */
  readonly stealthAddress: string;
  /** Sponsor paying fees; defaults to `P` itself (then SOL fees come out of the stealth balance). */
  readonly feePayer?: string;
  /** Final owner address receiving the funds. */
  readonly destination: string;
  readonly asset: SolanaAsset;
  readonly amount: bigint;
  readonly lifetime: BlockhashLifetime;
  /** SPL only: close the emptied stealth ATA and send its rent here (default: fee payer). */
  readonly closeTokenAccount?: boolean;
  readonly rentDestination?: string;
}

/**
 * Builds an unsigned sweep out of a stealth address. Sign with {@link signWithStealthKey}
 * (and the sponsor, if any).
 *
 * @remarks SPL: creates the destination ATA idempotently (fee payer funds rent), moves `amount`,
 * and optionally closes the stealth ATA. Closing sends rent lamports to `rentDestination`: pick
 * the sponsor, not the final destination, to avoid an extra on-chain link.
 * @throws {SolanaStealthError} `INVALID_ADDRESS`, `INVALID_AMOUNT`, `INVALID_INPUT`.
 */
export async function buildStealthSweepTx(input: StealthSweepTxInput): Promise<SolanaTx> {
  const owner = parseSolanaAddress(input.stealthAddress);
  const feePayer = input.feePayer === undefined ? owner : parseSolanaAddress(input.feePayer);
  const destination = parseSolanaAddress(input.destination);
  const asset = parseAsset(input.asset);
  if (typeof input.amount !== 'bigint' || input.amount <= 0n) return fail('INVALID_AMOUNT');
  if (equalBytes(base58.decode(owner), base58.decode(destination))) return fail('INVALID_INPUT');
  const ixs: Instruction[] = [];
  if (asset.kind === 'native') {
    if (input.closeTokenAccount === true) return fail('INVALID_INPUT');
    ixs.push(systemTransfer(owner, destination, input.amount));
  } else {
    const source = await findAssociatedTokenAddress(owner, asset.mint, asset.tokenProgram);
    const destAta = await findAssociatedTokenAddress(destination, asset.mint, asset.tokenProgram);
    ixs.push(
      createAtaIdempotent(feePayer, destAta, destination, asset.mint, asset.tokenProgram),
      tokenTransferChecked(
        asset.tokenProgram,
        source,
        asset.mint,
        destAta,
        owner,
        input.amount,
        asset.decimals,
      ),
    );
    if (input.closeTokenAccount === true) {
      const rentTo =
        input.rentDestination === undefined ? feePayer : parseSolanaAddress(input.rentDestination);
      ixs.push(tokenCloseAccount(asset.tokenProgram, source, rentTo, owner));
    }
  }
  return compile(feePayer, input.lifetime, ixs);
}
