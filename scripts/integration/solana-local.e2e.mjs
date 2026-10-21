#!/usr/bin/env node
// Solana stealth payments against a REAL local solana-test-validator (no mocks). Throwaway keys only.
// Flow: airdrop to a fee payer -> create an SPL mint locally and mint tokens to the payer -> send SOL and the SPL
// token to two fresh one-time stealth addresses (packages/solana-stealth) -> scan announcements with the view key
// -> sweep both to a destination with the derived one-time spend keys -> assert balances on chain.
//
// Usage: node scripts/integration/solana-local.e2e.mjs        (needs `npm run build -w @ghostpay/solana-stealth`)
// Env:   SOLANA_RPC_URL (default http://127.0.0.1:8899)
// Exit:  0 all PASS, 1 any FAIL. Output: one `PASS|FAIL <step>` line per step.
//
// Note: createHttpRpc from the library refuses plain-http hosts other than localhost/127.0.0.1 (a deliberate safety
// rule). Inside docker compose the validator is `http://solana:8899`, so the library client is created for
// 127.0.0.1 and given a fetch that forwards the request to SOLANA_RPC_URL. Everything else is unchanged.
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import {
  AccountRole, appendTransactionMessageInstructions, blockhash as toBlockhash, compileTransaction,
  createTransactionMessage, generateKeyPair, getAddressFromPublicKey, pipe, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash, signBytes,
} from '@solana/kit';
import {
  TOKEN_PROGRAM, SYSTEM_PROGRAM, addSignature, buildStealthPaymentTx, buildStealthSweepTx, createAtaIdempotent,
  createHttpRpc, decodeMetaAddress, deriveSpendKey, encodeMetaAddress, fetchAnnouncements, findAssociatedTokenAddress,
  generateStealthKeys, getLatestBlockhash, getMinimumBalanceForRentExemption, scanAnnouncements, signWithStealthKey,
  toWireBase64,
} from '@ghostpay/solana-stealth';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899';
const LAMPORTS_PER_SOL = 1_000_000_000n;
const DECIMALS = 6;

// ---- plumbing ---------------------------------------------------------------------------------------------------
const libRpc = createHttpRpc({ url: 'http://127.0.0.1:8899', fetch: (_url, init) => fetch(RPC_URL, init), timeoutMs: 30_000 });

/** Raw JSON-RPC with the server's error message kept (the library client reduces errors to a fixed code). */
async function raw(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${String(res.status)}`);
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}${body.error.data?.logs ? ` | ${body.error.data.logs.slice(-3).join(' / ')}` : ''}`);
  return body.result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(label, fn, { timeoutMs = 90_000, everyMs = 500 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(everyMs);
  }
}

async function confirm(signature, level) {
  await waitUntil(`${level} ${signature.slice(0, 8)}`, async () => {
    const { value } = await raw('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    const s = value[0];
    if (s?.err) throw new Error(`transaction ${signature.slice(0, 8)} failed: ${JSON.stringify(s.err)}`);
    if (s == null) return false;
    return level === 'confirmed' ? s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized' : s.confirmationStatus === 'finalized';
  });
}

async function send(solTx, level = 'confirmed') {
  const sig = await raw('sendTransaction', [toWireBase64(solTx), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  await confirm(sig, level);
  return sig;
}

/** Fee-payer / payer / mint keypair as { address, privateKey }. */
async function newSigner() {
  const kp = await generateKeyPair();
  return { address: await getAddressFromPublicKey(kp.publicKey), privateKey: kp.privateKey };
}
async function cosign(solTx, signer) {
  return addSignature(solTx, signer.address, await signBytes(signer.privateKey, solTx.messageBytes));
}

/** Compiles a legacy transaction in the library's SolanaTx shape (used for the setup transactions). */
function compileSetup(feePayer, lifetime, ixs) {
  const msg = pipe(
    createTransactionMessage({ version: 'legacy' }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: toBlockhash(lifetime.blockhash), lastValidBlockHeight: lifetime.lastValidBlockHeight }, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const transaction = compileTransaction(msg);
  return { transaction, messageBytes: new Uint8Array(transaction.messageBytes), requiredSigners: Object.keys(transaction.signatures) };
}

const u64le = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return b; };
const cat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));
const balance = async (addr) => BigInt((await raw('getBalance', [addr, { commitment: 'confirmed' }])).value);
const tokenBalance = async (ata) => {
  try {
    return BigInt((await raw('getTokenAccountBalance', [ata, { commitment: 'confirmed' }])).value.amount);
  } catch {
    return null; // account does not exist
  }
};
const accountExists = async (addr) => (await raw('getAccountInfo', [addr, { commitment: 'confirmed', encoding: 'base64' }])).value !== null;

// ---- step runner ------------------------------------------------------------------------------------------------
let steps = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    steps += 1;
    console.log(`PASS ${name}${detail ? ` | ${detail}` : ''} (${String(Date.now() - t0)} ms)`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`RESULT solana: FAIL after ${String(steps)} passed step(s)`);
    process.exit(1);
  }
}

// ---- test ---------------------------------------------------------------------------------------------------------
const s = {}; // shared state between steps

await step('validator reachable and healthy', async () => {
  await waitUntil('getHealth', async () => (await raw('getHealth').catch(() => null)) === 'ok', { timeoutMs: 60_000, everyMs: 1000 });
  const ver = await raw('getVersion');
  return `solana-core ${ver['solana-core']}`;
});

await step('airdrop to fee payer', async () => {
  s.payer = await newSigner();
  const sig = await raw('requestAirdrop', [s.payer.address, Number(20n * LAMPORTS_PER_SOL)]);
  await confirm(sig, 'confirmed');
  const bal = await balance(s.payer.address);
  assert.equal(bal, 20n * LAMPORTS_PER_SOL, 'airdrop balance');
  return `${s.payer.address.slice(0, 8)}... ${String(bal)} lamports`;
});

await step('create SPL mint and mint tokens to payer', async () => {
  s.mint = await newSigner();
  s.tokenSupply = 5_000_000n; // 5.000000 tokens
  const lifetime = await getLatestBlockhash(libRpc, 'confirmed');
  const mintRent = await getMinimumBalanceForRentExemption(libRpc, 82);
  s.payerAta = await findAssociatedTokenAddress(s.payer.address, s.mint.address, TOKEN_PROGRAM);
  const ixs = [
    // System CreateAccount(lamports, space = 82, owner = Token program)
    { programAddress: SYSTEM_PROGRAM,
      accounts: [{ address: s.payer.address, role: AccountRole.WRITABLE_SIGNER }, { address: s.mint.address, role: AccountRole.WRITABLE_SIGNER }],
      data: cat(Uint8Array.of(0, 0, 0, 0), u64le(mintRent), u64le(82n), base58.decode(TOKEN_PROGRAM)) },
    // Token InitializeMint2(decimals, mint authority = payer, no freeze authority)
    { programAddress: TOKEN_PROGRAM, accounts: [{ address: s.mint.address, role: AccountRole.WRITABLE }],
      data: cat(Uint8Array.of(20, DECIMALS), base58.decode(s.payer.address), Uint8Array.of(0)) },
    createAtaIdempotent(s.payer.address, s.payerAta, s.payer.address, s.mint.address, TOKEN_PROGRAM),
    // Token MintTo(amount)
    { programAddress: TOKEN_PROGRAM,
      accounts: [{ address: s.mint.address, role: AccountRole.WRITABLE }, { address: s.payerAta, role: AccountRole.WRITABLE }, { address: s.payer.address, role: AccountRole.READONLY_SIGNER }],
      data: cat(Uint8Array.of(7), u64le(s.tokenSupply)) },
  ];
  let tx = compileSetup(s.payer.address, lifetime, ixs);
  tx = await cosign(await cosign(tx, s.payer), s.mint);
  await send(tx);
  assert.equal(await tokenBalance(s.payerAta), s.tokenSupply, 'payer token balance');
  return `mint ${s.mint.address.slice(0, 8)}... supply ${String(s.tokenSupply)}`;
});

await step('recipient stealth keys and meta-address round-trip', async () => {
  s.keys = generateStealthKeys();
  const meta = encodeMetaAddress('localnet', s.keys.spendPublicKey, s.keys.viewPublicKey);
  const dec = decodeMetaAddress(meta, 'localnet');
  assert.deepEqual([...dec.spendPublicKey], [...s.keys.spendPublicKey]);
  assert.deepEqual([...dec.viewPublicKey], [...s.keys.viewPublicKey]);
  assert.throws(() => decodeMetaAddress(meta, 'mainnet'), 'cluster mismatch must be rejected');
  s.meta = dec;
  return meta.slice(0, 20) + '...';
});

await step('send SOL to a stealth address', async () => {
  s.fromSlot = BigInt(await raw('getSlot', [{ commitment: 'confirmed' }]));
  s.solAmount = 2n * LAMPORTS_PER_SOL;
  const built = await buildStealthPaymentTx({
    payer: s.payer.address, spendPublicKey: s.meta.spendPublicKey, viewPublicKey: s.meta.viewPublicKey,
    asset: { kind: 'native' }, amount: s.solAmount, lifetime: await getLatestBlockhash(libRpc, 'confirmed'),
    rentExemptMinimum: await getMinimumBalanceForRentExemption(libRpc, 0),
  });
  s.solPay = built;
  await send(await cosign(built.tx, s.payer), 'finalized'); // scanning reads finalized data
  assert.equal(await balance(built.stealthOwner), s.solAmount, 'stealth SOL balance');
  return `stealth ${built.stealthOwner.slice(0, 8)}... +${String(s.solAmount)} lamports`;
});

await step('send SPL token to a stealth address', async () => {
  s.tokAmount = 1_250_000n;
  const built = await buildStealthPaymentTx({
    payer: s.payer.address, spendPublicKey: s.meta.spendPublicKey, viewPublicKey: s.meta.viewPublicKey,
    asset: { kind: 'spl', mint: s.mint.address, decimals: DECIMALS, tokenProgram: TOKEN_PROGRAM },
    amount: s.tokAmount, lifetime: await getLatestBlockhash(libRpc, 'confirmed'),
  });
  s.tokPay = built;
  await send(await cosign(built.tx, s.payer), 'finalized');
  assert.equal(await tokenBalance(built.creditedAccount), s.tokAmount, 'stealth ATA balance');
  assert.equal(await tokenBalance(s.payerAta), s.tokenSupply - s.tokAmount, 'payer token balance after send');
  assert.notEqual(built.stealthOwner, s.solPay.stealthOwner, 'each payment must use a fresh stealth address');
  return `stealth ${built.stealthOwner.slice(0, 8)}... +${String(s.tokAmount)} units`;
});

await step('scan announcements with the view key', async () => {
  const records = fetchAnnouncements(libRpc, { fromSlot: s.fromSlot });
  const found = [];
  for await (const d of scanAnnouncements(records, s.keys.viewSecret, s.keys.spendPublicKey)) found.push(d);
  assert.equal(found.length, 2, `expected 2 detected payments, got ${String(found.length)}`);
  s.solDet = found.find((d) => d.stealthAddress === s.solPay.stealthOwner);
  s.tokDet = found.find((d) => d.stealthAddress === s.tokPay.stealthOwner);
  assert.ok(s.solDet && s.tokDet, 'both stealth addresses detected');
  assert.equal(s.solDet.lamportsReceived, s.solAmount, 'detected lamports');
  assert.equal(s.tokDet.tokenReceipts.length, 1);
  assert.equal(s.tokDet.tokenReceipts[0].mint, s.mint.address);
  assert.equal(s.tokDet.tokenReceipts[0].amount, s.tokAmount, 'detected token amount');
  assert.equal(s.tokDet.tokenReceipts[0].tokenAccount, s.tokPay.creditedAccount);
  return `${String(found.length)} payments`;
});

await step('a different recipient detects nothing', async () => {
  const other = generateStealthKeys();
  const found = [];
  for await (const d of scanAnnouncements(fetchAnnouncements(libRpc, { fromSlot: s.fromSlot }), other.viewSecret, other.spendPublicKey)) found.push(d);
  assert.equal(found.length, 0);
});

await step('sweep SOL out of the stealth address (sponsored fee)', async () => {
  s.dest = await newSigner();
  const spendKey = deriveSpendKey(s.keys.spendSecret, s.solDet.tweak, base58.decode(s.solDet.stealthAddress));
  let tx = await buildStealthSweepTx({
    stealthAddress: s.solDet.stealthAddress, feePayer: s.payer.address, destination: s.dest.address,
    asset: { kind: 'native' }, amount: s.solDet.lamportsReceived, lifetime: await getLatestBlockhash(libRpc, 'confirmed'),
  });
  tx = await cosign(signWithStealthKey(tx, spendKey), s.payer);
  await send(tx);
  assert.equal(await balance(s.dest.address), s.solAmount, 'destination SOL balance');
  assert.equal(await balance(s.solDet.stealthAddress), 0n, 'stealth address emptied');
  return `dest +${String(s.solAmount)} lamports`;
});

await step('sweep SPL token out of the stealth address and close its ATA', async () => {
  const spendKey = deriveSpendKey(s.keys.spendSecret, s.tokDet.tweak, base58.decode(s.tokDet.stealthAddress));
  let tx = await buildStealthSweepTx({
    stealthAddress: s.tokDet.stealthAddress, feePayer: s.payer.address, destination: s.dest.address,
    asset: { kind: 'spl', mint: s.mint.address, decimals: DECIMALS, tokenProgram: TOKEN_PROGRAM },
    amount: s.tokDet.tokenReceipts[0].amount, closeTokenAccount: true, rentDestination: s.payer.address,
    lifetime: await getLatestBlockhash(libRpc, 'confirmed'),
  });
  tx = await cosign(signWithStealthKey(tx, spendKey), s.payer);
  await send(tx);
  const destAta = await findAssociatedTokenAddress(s.dest.address, s.mint.address, TOKEN_PROGRAM);
  assert.equal(await tokenBalance(destAta), s.tokAmount, 'destination token balance');
  assert.equal(await accountExists(s.tokPay.creditedAccount), false, 'stealth ATA closed');
  assert.equal(await balance(s.tokDet.stealthAddress), 0n, 'stealth owner never held SOL');
  return `dest +${String(s.tokAmount)} units, stealth ATA closed`;
});

console.log(`RESULT solana: PASS (${String(steps)} steps)`);
