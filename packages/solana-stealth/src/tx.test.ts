import { describe, expect, it } from 'vitest';
import { base58 } from '@scure/base';
import type { Address } from '@solana/kit';
import { parseAnnouncementMemo } from './announcement.js';
import type { SolanaStealthError } from './errors.js';
import {
  createAtaIdempotent,
  findAssociatedTokenAddress,
  memoInstruction,
  systemTransfer,
  tokenCloseAccount,
  tokenTransferChecked,
} from './instructions.js';
import { deriveStealthKeysFromSeed } from './keys.js';
import { MEMO_PROGRAM, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './programs.js';
import { legacyMessageToJson } from './rpc.mock.testutil.js';
import { secretScalarFromBytes } from './secret.js';
import { checkAnnouncement, deriveSpendKey } from './stealth.js';
import {
  addSignature,
  buildStealthPaymentTx,
  buildStealthSweepTx,
  isFullySigned,
  MAX_TX_BYTES,
  parseSolanaAddress,
  signWithStealthKey,
  toWireBase64,
} from './tx.js';
import { hexToBytes, loadVectors, opensslVerify, seededRng, testWallet, toHex } from './testutil.testutil.js';

const V = loadVectors();
const code = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return (e as SolanaStealthError).code;
  }
  return 'NO_THROW';
};
const keys = deriveStealthKeysFromSeed(new Uint8Array(32).fill(3));
const payer = testWallet('payer');
const sponsor = testWallet('sponsor');
const mint = testWallet('mint').address;
const lifetime = { blockhash: base58.encode(new Uint8Array(32).fill(5)), lastValidBlockHeight: 99n };
const spl = { kind: 'spl', mint, decimals: 6, tokenProgram: TOKEN_PROGRAM } as const;

describe('program ids and instruction encodings', () => {
  it('match the vector file (sourced from @solana-program/* npm packages)', () => {
    expect(V.programs['system']).toBe(SYSTEM_PROGRAM);
    expect(V.programs['token']).toBe(TOKEN_PROGRAM);
    expect(V.programs['memo']).toBe(MEMO_PROGRAM);
  });
  it.each(V.transactions.map((t) => [t['name'], t] as const))('%s message bytes reproduce', async (_n, t) => {
    const c0 = V.cases[0]!;
    const payment = {
      stealthPublicKey: hexToBytes(c0['stealthPublicKey'] as string) as never,
      stealthAddress: c0['stealthAddress'] as string,
      ephemeralPublicKey: hexToBytes(c0['ephemeralPublicKey'] as string) as never,
      viewTag: c0['viewTag'] as number,
    };
    const asset =
      t['mint'] === null
        ? ({ kind: 'native' } as const)
        : ({ kind: 'spl', mint: t['mint'] as string, decimals: 6, tokenProgram: TOKEN_PROGRAM } as const);
    const lt = { blockhash: t['blockhash'] as string, lastValidBlockHeight: 1000n };
    let bytes: Uint8Array;
    if (t['name'] === 'spl-sweep-sponsored-close') {
      const tx = await buildStealthSweepTx({
        stealthAddress: c0['stealthAddress'] as string,
        feePayer: t['feePayer'] as string,
        destination: t['destination'] as string,
        asset,
        amount: BigInt(t['amount'] as string),
        lifetime: lt,
        closeTokenAccount: true,
      });
      bytes = tx.messageBytes;
      const p = secretScalarFromBytes(hexToBytes(c0['spendKey'] as string));
      const signed = signWithStealthKey(tx, p, new Uint8Array(32));
      expect(toHex(signed.transaction.signatures[c0['stealthAddress'] as Address]!)).toBe(t['stealthSignature']);
    } else {
      const built = await buildStealthPaymentTx({
        payer: t['payer'] as string,
        feePayer: t['feePayer'] as string,
        spendPublicKey: payment.stealthPublicKey,
        viewPublicKey: payment.stealthPublicKey,
        asset,
        amount: BigInt(t['amount'] as string),
        lifetime: lt,
        rentExemptMinimum: 890_880n,
        payment,
      });
      bytes = built.tx.messageBytes;
      expect(built.creditedAccount).toBe(t['creditedAccount']);
    }
    expect(toHex(bytes)).toBe(t['messageBytes']);
  });
  it('rejects unknown token programs and bad numbers', async () => {
    const a = payer.address as Address;
    expect(await code(() => createAtaIdempotent(a, a, a, a, SYSTEM_PROGRAM))).toBe('INVALID_ADDRESS');
    expect(await code(() => tokenTransferChecked(TOKEN_PROGRAM, a, a, a, a, 1n, 256))).toBe('INVALID_INPUT');
    expect(await code(() => systemTransfer(a, a, -1n))).toBe('INVALID_AMOUNT');
    expect(await code(() => systemTransfer(a, a, 1n << 64n))).toBe('INVALID_AMOUNT');
    expect(await code(() => tokenCloseAccount(SYSTEM_PROGRAM, a, a, a))).toBe('INVALID_ADDRESS');
    expect(await code(() => findAssociatedTokenAddress(a, a, SYSTEM_PROGRAM))).toBe('INVALID_ADDRESS');
    expect(memoInstruction('x').data).toEqual(Uint8Array.of(0x78));
  });
  it('ATA differs per token program', async () => {
    const a = payer.address as Address;
    expect(await findAssociatedTokenAddress(a, mint as Address, TOKEN_PROGRAM)).not.toBe(
      await findAssociatedTokenAddress(a, mint as Address, TOKEN_2022_PROGRAM),
    );
  });
});

describe('payment -> detect -> sweep, fully signed', () => {
  it('SOL payment signed by payer wallet (OpenSSL) produces wire bytes; recipient detects from memo', async () => {
    const built = await buildStealthPaymentTx({
      payer: payer.address,
      spendPublicKey: keys.spendPublicKey,
      viewPublicKey: keys.viewPublicKey,
      asset: { kind: 'native' },
      amount: 2_000_000n,
      lifetime,
      rentExemptMinimum: 890_880n,
      rng: seededRng('sol'),
    });
    expect(built.tx.requiredSigners).toEqual([payer.address]);
    expect(isFullySigned(built.tx)).toBe(false);
    expect(await code(() => toWireBase64(built.tx))).toBe('INVALID_INPUT');
    const signed = addSignature(built.tx, payer.address as Address, payer.sign(built.tx.messageBytes));
    expect(isFullySigned(signed)).toBe(true);
    expect(toWireBase64(signed).length).toBeGreaterThan(100);
    const json = legacyMessageToJson(signed.messageBytes);
    expect(json.accountKeys).toContain(built.stealthOwner);
    const memoIx = json.instructions.find((i) => json.accountKeys[i.programIdIndex] === MEMO_PROGRAM)!;
    const a = parseAnnouncementMemo(new TextDecoder().decode(base58.decode(memoIx.data)))!;
    const m = checkAnnouncement(keys.viewSecret, keys.spendPublicKey, a.ephemeralPublicKey, a.viewTag)!;
    expect(m.stealthAddress).toBe(built.stealthOwner);
  });

  it('SPL payment with sponsor needs both signatures; sweep signed by stealth key verifies under OpenSSL', async () => {
    const built = await buildStealthPaymentTx({
      payer: payer.address,
      feePayer: sponsor.address,
      spendPublicKey: keys.spendPublicKey,
      viewPublicKey: keys.viewPublicKey,
      asset: spl,
      amount: 10_000n,
      lifetime,
      rng: seededRng('spl'),
    });
    expect(built.tx.requiredSigners).toEqual([sponsor.address, payer.address]);
    let tx = addSignature(built.tx, sponsor.address as Address, sponsor.sign(built.tx.messageBytes));
    expect(isFullySigned(tx)).toBe(false);
    tx = addSignature(tx, payer.address as Address, payer.sign(tx.messageBytes));
    expect(isFullySigned(tx)).toBe(true);
    expect(built.creditedAccount).toBe(
      await findAssociatedTokenAddress(built.stealthOwner, mint as Address, TOKEN_PROGRAM),
    );

    const m = checkAnnouncement(keys.viewSecret, keys.spendPublicKey, built.payment.ephemeralPublicKey, built.payment.viewTag)!;
    const p = deriveSpendKey(keys.spendSecret, m.tweak, built.payment.stealthPublicKey);
    const sweep = await buildStealthSweepTx({
      stealthAddress: built.stealthOwner,
      feePayer: sponsor.address,
      destination: testWallet('cold').address,
      asset: spl,
      amount: 10_000n,
      lifetime,
      closeTokenAccount: true,
      rentDestination: sponsor.address,
    });
    const s1 = signWithStealthKey(sweep, p);
    const sig = s1.transaction.signatures[built.stealthOwner]!;
    expect(opensslVerify(sig, sweep.messageBytes, base58.decode(built.stealthOwner))).toBe(true);
    const s2 = addSignature(s1, sponsor.address as Address, sponsor.sign(sweep.messageBytes));
    expect(toWireBase64(s2).length).toBeLessThanOrEqual(Math.ceil((MAX_TX_BYTES * 4) / 3) + 4);
  });

  it('self-paid SOL sweep (no sponsor) has the stealth address as fee payer', async () => {
    const sweep = await buildStealthSweepTx({
      stealthAddress: payer.address,
      destination: sponsor.address,
      asset: { kind: 'native' },
      amount: 5n,
      lifetime,
    });
    expect(sweep.requiredSigners).toEqual([payer.address]);
  });
});

describe('input validation', () => {
  const base = {
    payer: payer.address,
    spendPublicKey: keys.spendPublicKey,
    viewPublicKey: keys.viewPublicKey,
    asset: { kind: 'native' } as const,
    amount: 1_000_000n,
    lifetime,
    rentExemptMinimum: 890_880n,
  };
  it.each([
    ['bad payer', { payer: 'nope' }, 'INVALID_ADDRESS'],
    ['zero amount', { amount: 0n }, 'INVALID_AMOUNT'],
    ['below rent', { amount: 1n }, 'BELOW_RENT_EXEMPT'],
    ['no rent minimum', { rentExemptMinimum: undefined }, 'INVALID_INPUT'],
    ['bad blockhash', { lifetime: { blockhash: 'xx', lastValidBlockHeight: 1n } }, 'INVALID_INPUT'],
    ['bad height', { lifetime: { blockhash: lifetime.blockhash, lastValidBlockHeight: -1n } }, 'INVALID_INPUT'],
    ['bad memo program', { memoProgram: '0' }, 'INVALID_ADDRESS'],
    ['bad asset kind', { asset: { kind: 'nft' } }, 'INVALID_INPUT'],
    ['bad token program', { asset: { ...spl, tokenProgram: SYSTEM_PROGRAM } }, 'INVALID_ADDRESS'],
    ['bad decimals', { asset: { ...spl, decimals: -1 } }, 'INVALID_INPUT'],
    ['bad mint', { asset: { ...spl, mint: 'abc' } }, 'INVALID_ADDRESS'],
    ['bad payer token account', { asset: spl, payerTokenAccount: 'x' }, 'INVALID_ADDRESS'],
  ])('%s', async (_n, patch, expected) => {
    const input = { ...base, ...patch } as Parameters<typeof buildStealthPaymentTx>[0];
    if ('rentExemptMinimum' in patch && patch.rentExemptMinimum === undefined) {
      delete (input as { rentExemptMinimum?: bigint }).rentExemptMinimum;
    }
    expect(await code(() => buildStealthPaymentTx(input))).toBe(expected);
  });
  it('explicit payer token account and custom memo program are honoured', async () => {
    const b = await buildStealthPaymentTx({
      ...base,
      asset: spl,
      payerTokenAccount: sponsor.address,
      memoProgram: MEMO_PROGRAM,
    });
    expect(legacyMessageToJson(b.tx.messageBytes).accountKeys).toContain(sponsor.address);
  });
  it('sweep validation', async () => {
    const s = { stealthAddress: payer.address, destination: sponsor.address, asset: { kind: 'native' } as const, amount: 1n, lifetime };
    expect(await code(() => buildStealthSweepTx({ ...s, amount: 0n }))).toBe('INVALID_AMOUNT');
    expect(await code(() => buildStealthSweepTx({ ...s, destination: payer.address }))).toBe('INVALID_INPUT');
    expect(await code(() => buildStealthSweepTx({ ...s, closeTokenAccount: true }))).toBe('INVALID_INPUT');
    const noRentDest = await buildStealthSweepTx({ ...s, asset: spl, closeTokenAccount: true });
    expect(noRentDest.requiredSigners).toEqual([payer.address]);
  });
  it('signature checks', async () => {
    const b = await buildStealthPaymentTx(base);
    expect(await code(() => addSignature(b.tx, sponsor.address as Address, sponsor.sign(b.tx.messageBytes)))).toBe('SIGNER_NOT_REQUIRED');
    expect(await code(() => addSignature(b.tx, payer.address as Address, sponsor.sign(b.tx.messageBytes)))).toBe('SIGNATURE_INVALID');
    expect(await code(() => addSignature(b.tx, payer.address as Address, new Uint8Array(10)))).toBe('SIGNATURE_INVALID');
    expect(await code(() => signWithStealthKey(b.tx, keys.spendSecret))).toBe('SIGNER_NOT_REQUIRED');
    expect(await code(() => parseSolanaAddress('0'))).toBe('INVALID_ADDRESS');
  });
});
