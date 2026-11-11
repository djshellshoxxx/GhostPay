#!/usr/bin/env node
// GhostPay CLI functional-parity check for the core payment lifecycle against REAL local anvil nodes.
// LOCAL/TEST ONLY: public anvil dev accounts (test mnemonic), loopback RPC, no real funds, no public network.
//
// Part A — the shared devnet (scripts/devnet/up.sh, chain 31337, deployments/31337.json):
//   CLI: doctor, backup generate/inspect/verify/create, invoice create(+sign)/inspect/verify/link, receipt
//   verify/inspect/export. The payment itself is a real router transaction built with the web app's libraries
//   (chain-adapters + core-crypto), exactly as scripts/devnet/e2e.mjs does (built under the 84532 alias because
//   chain-adapters has no 31337 entry; router calldata does not contain the chain id).
//   GAP assertions: every live CLI command must FAIL CLOSED on 31337 with exit 5 UNSUPPORTED_CHAIN, because
//     packages/cli/src/payment-context.ts:34-35 (configuredChain -> chain-adapters findChain) and
//     packages/cli/src/payment-input.ts:53-54 (observation chain) only know chain-adapters' fixed table, and even
//     with a chain entry chain-adapters verifyDeployment (src/verify.ts:189-193) requires the canonical ERC-5564
//     announcer 0x5564..., which DeployDevnet.s.sol does not deploy (it deploys the reference announcer at a fresh
//     address). If any gap assertion starts passing, the gap was closed: update this script.
// Part B — a private script-owned anvil reporting chain 84532 (see cli-devnet/alias-chain.mjs): the UNMODIFIED CLI
//   runs its whole live lifecycle: chain deployment inspect/verify, diagnostics rpc, scan plan/run/inspect,
//   payment inspect/verify/status, receipt create/verify, reconcile create/register/propose/confirm/record,
//   history list/inspect — with negative cases (tampered invoice, wrong amount, unrelated tx hash, wrong-chain RPC,
//   pending finality, missing/mismatched trust pin, insecure-HTTP refusal, unreachable RPC).
//
// Usage: node scripts/beta/cli-devnet.e2e.mjs [--skip-alias]
//   Needs: scripts/devnet/up.sh running, `npm run build:libs` (CLI at packages/cli/dist/bin.js), anvil for Part B.
//   Env: DEVNET_STATE (default scripts/devnet/.state/devnet.json), CLI_E2E_KEEP=1 keeps the private work dirs.
// Exit 0 only if every check passes. Only transactions this run produced (and their block ranges) are asserted.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseEther } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { deriveStealthPayment, encodeMetaAddress, generateKeySet, unsafeRevealSecret, zeroize } from '@ghostpay/core-crypto';
import { invoiceDigest, signerPublicKeyHex, signReceipt } from '@ghostpay/invoice-schema';
import { buildPaymentTx, findChain, loadDeployment, manifestDigest, routerSplit } from '@ghostpay/chain-adapters';
import { CLI, EXIT, MNEMONIC, ROOT, check, cli, privateDir, readJson, removeDir, results, secretEnv, summary, writePrivate } from './cli-devnet/lib.mjs';
import { startAliasChain } from './cli-devnet/alias-chain.mjs';

const SKIP_ALIAS = process.argv.includes('--skip-alias');
const hex = (u8) => Buffer.from(u8).toString('hex');
const lc = (s) => s.toLowerCase();

/* ------------------------------------------------------------------ shared helpers ------------------------------------------------------------------ */

/** Seller keys generated with the GUI's primitives; secrets only go to 0600 files in a private directory. */
function makeSeller(dir, tag) {
  const keys = generateKeySet();
  const signing = randomBytes(32);
  const files = {
    spend: writePrivate(join(dir, `${tag}-spend.hex`), hex(unsafeRevealSecret(keys.spendingSecret))),
    view: writePrivate(join(dir, `${tag}-view.hex`), hex(unsafeRevealSecret(keys.viewingSecret))),
    sign: writePrivate(join(dir, `${tag}-sign.hex`), hex(signing)),
    spendPub: join(dir, `${tag}-spend.pub`),
  };
  writeFileSync(files.spendPub, hex(keys.spendingPublicKey));
  const seller = { meta: encodeMetaAddress(keys), signer: signerPublicKeyHex(signing), files, signing: new Uint8Array(signing) };
  zeroize(keys.spendingSecret, keys.viewingSecret);
  signing.fill(0);
  return seller;
}

function invoiceSpec(chainId, meta, gross, now) {
  return {
    chainId, metaAddress: meta, fiat: { currency: 'USD', minorUnits: '2500' }, token: 'native',
    amountPolicy: { mode: 'fixed_token', tokenAmount: gross.toString() },
    quote: { source: 'devnet:fixed', timestamp: now, expiresAt: now + 600, maxSlippageBps: 50 },
    expiresAt: now + 3600, lineItems: [{ description: 'cli devnet item', quantity: '1', unitMinorUnits: '2500' }],
    tax: { rateBps: 0, minorUnits: '0' }, feePolicy: 'seller_pays', memo: 'cli devnet e2e',
  };
}

async function rawRpc(rpc, method, params) {
  const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

/** Raw canonical JSON-RPC announcement log of a payment tx, reduced to the observation's allowed log fields. */
async function announcementLog(rpc, txHash, announcer) {
  const rc = await rawRpc(rpc, 'eth_getTransactionReceipt', [txHash]);
  const logs = rc.logs.filter((l) => lc(l.address) === lc(announcer));
  assert.equal(logs.length, 1, 'payment must emit exactly one announcement');
  const l = logs[0];
  return { address: l.address, topics: l.topics, data: l.data, blockNumber: l.blockNumber, blockHash: l.blockHash,
    transactionHash: l.transactionHash, logIndex: l.logIndex, removed: false };
}

/** Pays a signed invoice through the router with the web app's transaction builder; returns stealth + tx data. */
async function payInvoice({ pub, wallet, deployment, buildChainId, meta, gross, now }) {
  const base = findChain(buildChainId);
  const payment = deriveStealthPayment(meta);
  const built = buildPaymentTx({ chain: base, deployment: { ...deployment, chainId: buildChainId }, invoice: { chainId: buildChainId, token: 'native' },
    payment, grossAmount: gross, deadline: BigInt(now + 3000) });
  const before = await pub.getBalance({ address: payment.stealthAddress });
  const hash = await wallet.sendTransaction({ to: built.tx.to, data: built.tx.data, value: built.tx.value });
  const rc = await pub.waitForTransactionReceipt({ hash });
  assert.equal(rc.status, 'success', 'payment reverted');
  const split = routerSplit(gross);
  assert.equal((await pub.getBalance({ address: payment.stealthAddress })) - before, split.net, 'stealth address received != router net');
  return { hash, block: rc.blockNumber, stealth: lc(payment.stealthAddress), split };
}

/* ------------------------------------------------------------------ Part A: shared 31337 devnet ------------------------------------------------------------------ */

async function partA() {
  console.log('== Part A: CLI on the shared devnet (chain 31337)');
  const state = readJson(process.env.DEVNET_STATE ?? resolve(ROOT, 'scripts/devnet/.state/devnet.json'));
  const manifestPath = resolve(ROOT, 'deployments/31337.json');
  const manifest = loadDeployment(readFileSync(manifestPath, 'utf8'), 31337);
  const RPC = state.rpcUrl;
  const chain = defineChain({ id: 31337, name: 'devnet', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 25 });
  // Account 9 is not used by scripts/devnet/e2e.mjs (0-7), so concurrent lib runs do not race this payer's nonce.
  const payer = createWalletClient({ account: mnemonicToAccount(MNEMONIC, { addressIndex: 9 }), chain, transport: http(RPC) });
  check('A preflight devnet', () => assert.ok(true), `rpc=${RPC}`);
  assert.equal(await pub.getChainId(), 31337, 'devnet is not chain 31337');
  assert.ok((await pub.getCode({ address: manifest.router }))?.length > 2, 'router not deployed (run scripts/devnet/up.sh)');

  const dir = privateDir('a');
  try {
    const pass = secretEnv({ GP_PASS: `devnet-pass-${hex(randomBytes(12))}`, GP_PASS_WRONG: `wrong-pass-${hex(randomBytes(12))}` });
    const rpcEnv = { GP_RPC: RPC };

    cli('A doctor', ['doctor']);
    // backup generate: passphrase from a named env var and from stdin; never argv.
    const gen = cli('A backup generate (env passphrase)', ['backup', 'generate', '--passphrase-env', 'GP_PASS', '--out', join(dir, 'generated.json')], { env: pass }).out;
    check('A backup generate reports public keys only', () => {
      assert.equal(gen.generated, true); assert.equal(gen.format, 'seller-keystore'); assert.equal(gen.recordCount, 3);
      assert.match(JSON.stringify(gen), /st:eth:0x/);
      assert.ok(!/secret|spendingKey"|viewingKey"/i.test(Object.keys(gen).join(',')));
    });
    cli('A backup generate (stdin passphrase)', ['backup', 'generate', '--passphrase-stdin', '--out', join(dir, 'generated-2.json')], { stdin: `${pass.GP_PASS}\n` });
    cli('A backup generate refuses existing output', ['backup', 'generate', '--passphrase-env', 'GP_PASS', '--out', join(dir, 'generated.json')], { env: pass, expect: EXIT.io });
    const insp = cli('A backup inspect', ['backup', 'inspect', '--in', join(dir, 'generated.json')]).out;
    check('A backup inspect unauthenticated', () => { assert.equal(insp.authenticated, false); assert.equal(insp.format, 'seller-keystore'); });
    const ver = cli('A backup verify', ['backup', 'verify', '--in', join(dir, 'generated.json'), '--passphrase-env', 'GP_PASS'], { env: pass }).out;
    check('A backup verify authenticated', () => assert.equal(ver.authenticated, true));
    cli('A backup verify wrong passphrase', ['backup', 'verify', '--in', join(dir, 'generated.json'), '--passphrase-env', 'GP_PASS_WRONG'], { env: pass, expect: EXIT.fail });

    // Lifecycle seller (keys we hold so the signing key can sign invoices): wrap them with backup create.
    const seller = makeSeller(dir, 'seller');
    cli('A backup create', ['backup', 'create', '--spending-key-file', seller.files.spend, '--viewing-key-file', seller.files.view,
      '--signing-key-file', seller.files.sign, '--passphrase-env', 'GP_PASS', '--out', join(dir, 'seller.json')], { env: pass });

    const now = Math.floor(Date.now() / 1000);
    const gross = parseEther('0.02');
    const split = routerSplit(gross);
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(invoiceSpec(31337, seller.meta, gross, now)));
    writeFileSync(join(dir, 'spec-signer.json'), JSON.stringify({ ...invoiceSpec(31337, seller.meta, gross, now), signer: seller.signer }));
    cli('A invoice create (unsigned, explicit signer)', ['invoice', 'create', '--in', join(dir, 'spec-signer.json'), '--out', join(dir, 'unsigned.json')]);
    cli('A invoice sign', ['invoice', 'sign', '--in', join(dir, 'unsigned.json'), '--key-file', seller.files.sign, '--out', join(dir, 'invoice-2step.json')]);
    cli('A invoice create --key-file (signed)', ['invoice', 'create', '--in', join(dir, 'spec.json'), '--key-file', seller.files.sign, '--out', join(dir, 'invoice.json')]);
    const signedFile = readJson(join(dir, 'invoice.json'));
    const invoice = signedFile.invoice;
    check('A invoice signer derived from key', () => assert.equal(invoice.signer, seller.signer));
    const ii = cli('A invoice inspect', ['invoice', 'inspect', '--in', join(dir, 'invoice.json')]).out;
    check('A invoice inspect fields', () => assert.equal(ii.ok, true), JSON.stringify({ paymentVerified: ii.paymentVerified ?? null }));
    const iv = cli('A invoice verify (pin + expectations)', ['invoice', 'verify', '--in', join(dir, 'invoice.json'), '--pin', seller.signer,
      '--expected-chain', '31337', '--expected-asset', 'native', '--expected-amount', gross.toString(), '--expected-recipient', seller.meta]).out;
    check('A invoice verify reports 31337 unsupported for payment', () => {
      assert.equal(iv.ok, true); assert.equal(iv.signatureValid ?? iv.signature?.valid ?? true, true);
      assert.equal(iv.supportedForPayment, false); assert.equal(iv.chainKnown, false);
    }, 'chainKnown=false: chain-adapters has no 31337 entry');
    cli('A invoice verify 2-step signed', ['invoice', 'verify', '--in', join(dir, 'invoice-2step.json'), '--pin', seller.signer]);
    // Negative: tampered invoice (amount raised after signing), wrong pin, wrong expected amount.
    writeFileSync(join(dir, 'tampered.json'), JSON.stringify({ ...signedFile, invoice: { ...invoice, amountPolicy: { ...invoice.amountPolicy, tokenAmount: (gross + 1n).toString() } } }));
    cli('A NEG invoice verify tampered', ['invoice', 'verify', '--in', join(dir, 'tampered.json')], { expect: EXIT.fail });
    cli('A NEG invoice verify wrong pin', ['invoice', 'verify', '--in', join(dir, 'invoice.json'), '--pin', makeSeller(dir, 'other').signer], { expect: EXIT.fail });
    cli('A NEG invoice verify wrong expected amount', ['invoice', 'verify', '--in', join(dir, 'invoice.json'), '--expected-amount', (gross + 1n).toString()],
      { expect: EXIT.fail, code: 'INVOICE_EXPECTATION_MISMATCH' });
    cli('A invoice link (passphrase)', ['invoice', 'link', '--in', join(dir, 'invoice.json'), '--base', 'https://pay.example.org/',
      '--passphrase-env', 'GP_PASS', '--out', join(dir, 'link.txt')], { env: pass });
    cli('A invoice verify link', ['invoice', 'verify', '--in', join(dir, 'link.txt'), '--passphrase-env', 'GP_PASS', '--pin', seller.signer], { env: pass });

    // Real payment on 31337 (CLI never broadcasts by design).
    const paid = await payInvoice({ pub, wallet: payer, deployment: manifest, buildChainId: 84532, meta: invoice.metaAddress, gross, now });
    check('A devnet payment (router, native)', () => assert.equal(paid.split.net, split.net), `tx=${paid.hash} block=${paid.block} net=${split.net}`);
    const log = await announcementLog(RPC, paid.hash, manifest.announcer);
    const observation = { version: 1, family: 'evm', chainId: 31337, log, expected: { recipient: paid.stealth, asset: 'native', amount: split.net.toString() } };
    writeFileSync(join(dir, 'observation.json'), JSON.stringify(observation));
    const digest = manifestDigest(manifest);

    // GAP: every live command fails closed on 31337 (UNSUPPORTED_CHAIN, exit 5). See header for file:line.
    const live = ['--online', '--rpc-env', 'GP_RPC', '--allow-insecure-localhost'];
    const gap = (label, args) => cli(`A GAP ${label}`, args, { env: rpcEnv, expect: EXIT.unsupported, code: 'UNSUPPORTED_CHAIN' });
    gap('chain deployment inspect 31337', ['chain', 'deployment', 'inspect', '--chain', '31337', '--in', manifestPath, '--manifest-digest', digest]);
    gap('chain deployment verify 31337', ['chain', 'deployment', 'verify', '--chain', '31337', '--manifest', manifestPath, '--manifest-digest', digest, ...live]);
    gap('diagnostics rpc 31337', ['diagnostics', 'rpc', '--chain', '31337', ...live]);
    gap('chain assets 31337', ['chain', 'assets', '--chain', '31337']);
    gap('scan plan 31337', ['scan', 'plan', '--chain', '31337', '--from-block', String(paid.block), '--to-block', String(paid.block)]);
    gap('scan run 31337', ['scan', 'run', '--chain', '31337', '--from-block', String(paid.block), '--to-block', String(paid.block), '--manifest', manifestPath,
      '--manifest-digest', digest, ...live, '--view-key-file', seller.files.view, '--spend-public-file', seller.files.spendPub, '--out', join(dir, 'scan.json')]);
    gap('payment inspect 31337', ['payment', 'inspect', '--in', join(dir, 'observation.json')]);
    gap('payment verify 31337', ['payment', 'verify', '--in', join(dir, 'observation.json'), '--manifest', manifestPath, '--manifest-digest', digest, ...live]);
    gap('payment status 31337', ['payment', 'status', '--in', join(dir, 'observation.json'), '--manifest', manifestPath, '--manifest-digest', digest, ...live]);
    gap('receipt create 31337', ['receipt', 'create', '--invoice', join(dir, 'invoice.json'), '--observation', join(dir, 'observation.json'), '--keystore', join(dir, 'seller.json'),
      '--passphrase-env', 'GP_PASS', '--manifest', manifestPath, '--manifest-digest', digest, ...live, '--approve', '--out', join(dir, 'receipt-live.json')]);
    cli('A GAP reconcile create 31337', ['reconcile', 'create', '--chain', '31337', '--keystore', join(dir, 'seller.json'), '--passphrase-env', 'GP_PASS',
      '--out', join(dir, 'history-0.json')], { env: pass, expect: EXIT.unsupported, code: 'UNSUPPORTED_CHAIN' });
    // Wrong-chain RPC: an enabled testnet id pointed at the 31337 node is refused as a configuration/trust failure.
    cli('A NEG diagnostics rpc wrong chain (84532 id -> 31337 node)', ['diagnostics', 'rpc', '--chain', '84532', ...live], { env: rpcEnv, expect: EXIT.config, code: 'CHAIN_MISMATCH' });

    // Offline receipt for the devnet payment, signed with the same library function the web app/CLI receipt create use.
    const receipt = signReceipt({ invoiceDigest: `0x${hex(invoiceDigest(invoice))}`, chainId: 31337, txHash: paid.hash, stealthAddress: paid.stealth,
      asset: 'native', amountMinorUnits: split.net.toString(), issuedAt: Math.floor(Date.now() / 1000) }, seller.signing);
    writeFileSync(join(dir, 'receipt.json'), JSON.stringify(receipt));
    const rv = cli('A receipt verify (invoice-bound, expected tx)', ['receipt', 'verify', '--in', join(dir, 'receipt.json'), '--invoice', join(dir, 'invoice.json'),
      '--expected-tx', paid.hash, '--expected-chain', '31337', '--expected-recipient', paid.stealth]).out;
    check('A receipt verify keeps payment unverified', () => { assert.equal(rv.ok, true); assert.equal(rv.paymentVerified, false); assert.equal(rv.recipientOwnershipVerified, false); });
    cli('A receipt inspect', ['receipt', 'inspect', '--in', join(dir, 'receipt.json')]);
    cli('A receipt export', ['receipt', 'export', '--in', join(dir, 'receipt.json'), '--out', join(dir, 'receipt-export.json')]);
    writeFileSync(join(dir, 'receipt-tampered.json'), JSON.stringify({ ...receipt, amountMinorUnits: (split.net + 1n).toString() }));
    cli('A NEG receipt verify tampered amount', ['receipt', 'verify', '--in', join(dir, 'receipt-tampered.json')], { expect: EXIT.fail });
    const unrelated = await payer.sendTransaction({ to: mnemonicToAccount(MNEMONIC, { addressIndex: 8 }).address, value: 1n });
    await pub.waitForTransactionReceipt({ hash: unrelated });
    cli('A NEG receipt verify unrelated tx hash', ['receipt', 'verify', '--in', join(dir, 'receipt.json'), '--expected-tx', unrelated], { expect: EXIT.fail });
    cli('A NEG receipt verify wrong amount claim', ['receipt', 'verify', '--in', join(dir, 'receipt.json'), '--expected-amount', (split.net + 1n).toString()], { expect: EXIT.fail });
    seller.signing.fill(0);
  } finally { removeDir(dir); }
}

/* ------------------------------------------------------------------ Part B: private alias chain ------------------------------------------------------------------ */

async function partB() {
  console.log('\n== Part B: unmodified CLI live lifecycle on a private anvil reporting chain 84532 (alias; see cli-devnet/alias-chain.mjs)');
  const alias = await startAliasChain(84532);
  const dir = privateDir('b');
  try {
    const { pub, chainId } = alias;
    const C = String(chainId);
    const manifestPath = join(dir, `${C}.json`);
    writeFileSync(manifestPath, alias.manifestText);
    const D = alias.digest;
    const env = secretEnv({ GP_PASS: `alias-pass-${hex(randomBytes(12))}`, GP_RPC: alias.rpc, GP_DEAD: 'http://127.0.0.1:9' });
    const live = ['--online', '--rpc-env', 'GP_RPC', '--allow-insecure-localhost'];
    const trust = ['--manifest', manifestPath, '--manifest-digest', D];
    check('B alias chain up', () => assert.ok(true), `rpc=${alias.rpc} router=${alias.manifest.router} announcer=canonical`);

    const di = cli('B chain deployment inspect', ['chain', 'deployment', 'inspect', '--chain', C, '--in', manifestPath, '--manifest-digest', D]).out;
    check('B deployment inspect digest = independently computed digest', () => assert.equal(lc(JSON.stringify(di)).includes(lc(D)), true));
    const dv = cli('B chain deployment verify', ['chain', 'deployment', 'verify', '--chain', C, ...trust, ...live], { env }).out;
    check('B deployment verify ok', () => assert.equal(dv.ok, true));
    const wrongDigest = `0x${'11'.repeat(32)}`;
    cli('B NEG deployment verify wrong digest', ['chain', 'deployment', 'verify', '--chain', C, '--manifest', manifestPath, '--manifest-digest', wrongDigest, ...live],
      { env, expect: EXIT.config, code: 'MANIFEST_PIN_MISMATCH' });
    cli('B NEG deployment verify no trust pin', ['chain', 'deployment', 'verify', '--chain', C, '--manifest', manifestPath, ...live],
      { env, expect: EXIT.config, code: 'MANIFEST_TRUST_REQUIRED' });
    cli('B NEG deployment verify without --online', ['chain', 'deployment', 'verify', '--chain', C, ...trust, '--rpc-env', 'GP_RPC', '--allow-insecure-localhost'],
      { env, expect: EXIT.usage, code: 'ONLINE_REQUIRED' });
    cli('B NEG http RPC without --allow-insecure-localhost', ['diagnostics', 'rpc', '--chain', C, '--online', '--rpc-env', 'GP_RPC'], { env, expect: EXIT.config, code: 'RPC_URL_REJECTED' });
    const dr = cli('B diagnostics rpc', ['diagnostics', 'rpc', '--chain', C, ...live], { env }).out;
    check('B diagnostics rpc keeps provider untrusted', () => { assert.equal(dr.ok, true); assert.equal(dr.providerTrustEstablished, false); });
    cli('B NEG diagnostics rpc wrong chain (11155111 id -> 84532 node)', ['diagnostics', 'rpc', '--chain', '11155111', ...live], { env, expect: EXIT.config, code: 'CHAIN_MISMATCH' });
    cli('B NEG diagnostics rpc unreachable', ['diagnostics', 'rpc', '--chain', C, '--online', '--rpc-env', 'GP_DEAD', '--allow-insecure-localhost'], { env, expect: EXIT.network });

    const seller = makeSeller(dir, 'seller');
    cli('B backup create', ['backup', 'create', '--spending-key-file', seller.files.spend, '--viewing-key-file', seller.files.view,
      '--signing-key-file', seller.files.sign, '--passphrase-env', 'GP_PASS', '--out', join(dir, 'seller.json')], { env });
    const now = Number((await pub.getBlock()).timestamp);
    const gross = parseEther('0.05');
    const split = routerSplit(gross);
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(invoiceSpec(chainId, seller.meta, gross, Math.floor(Date.now() / 1000))));
    cli('B invoice create (signed)', ['invoice', 'create', '--in', join(dir, 'spec.json'), '--key-file', seller.files.sign, '--out', join(dir, 'invoice.json')]);
    const iv = cli('B invoice verify', ['invoice', 'verify', '--in', join(dir, 'invoice.json'), '--pin', seller.signer, '--expected-chain', C, '--expected-asset', 'native',
      '--expected-amount', gross.toString()]).out;
    check('B invoice supported for payment on enabled testnet', () => { assert.equal(iv.supportedForPayment, true); assert.equal(iv.deploymentVerified, false); });
    const signedFile = readJson(join(dir, 'invoice.json'));
    const invoice = signedFile.invoice;
    writeFileSync(join(dir, 'tampered.json'), JSON.stringify({ ...signedFile, invoice: { ...invoice, metaAddress: makeSeller(dir, 'evil').meta } }));
    cli('B NEG invoice verify tampered recipient', ['invoice', 'verify', '--in', join(dir, 'tampered.json')], { expect: EXIT.fail });

    const fromBlock = (await pub.getBlockNumber()) + 1n;
    const paid = await payInvoice({ pub, wallet: alias.wallet(2), deployment: alias.manifest, buildChainId: chainId, meta: invoice.metaAddress, gross, now });
    check('B alias payment (router, native)', () => assert.ok(paid.block >= fromBlock), `tx=${paid.hash} block=${paid.block}`);
    const toBlock = paid.block;

    const sp = cli('B scan plan', ['scan', 'plan', '--chain', C, '--from-block', String(fromBlock), '--to-block', String(toBlock)]).out;
    check('B scan plan offline', () => { assert.equal(sp.networkUsed, false); assert.equal(sp.blocks, (toBlock - fromBlock + 1n).toString()); });
    const scanArgs = ['scan', 'run', '--chain', C, '--from-block', String(fromBlock), '--to-block', String(toBlock), ...trust, ...live,
      '--view-key-file', seller.files.view, '--spend-public-file', seller.files.spendPub];
    const sr = cli('B scan run', [...scanArgs, '--out', join(dir, 'scan.json')], { env }).out;
    check('B scan run finds exactly this payment', () => { assert.equal(sr.matches, 1); assert.equal(sr.complete, true); assert.equal(sr.paymentVerified, false); });
    const si = cli('B scan inspect (authenticated)', ['scan', 'inspect', '--in', join(dir, 'scan.json'), '--view-key-file', seller.files.view]).out;
    check('B scan inspect', () => { assert.equal(si.authenticationVerified, true); assert.equal(si.observations, 1); });
    cli('B NEG scan run resume of complete range', [...scanArgs, '--resume', join(dir, 'scan.json'), '--out', join(dir, 'scan-2.json')], { env, expect: EXIT.usage, code: 'SCAN_COMPLETE' });
    const other = makeSeller(dir, 'other');
    const so = cli('B scan run with another seller key finds nothing', ['scan', 'run', '--chain', C, '--from-block', String(fromBlock), '--to-block', String(toBlock), ...trust, ...live,
      '--view-key-file', other.files.view, '--spend-public-file', other.files.spendPub, '--out', join(dir, 'scan-other.json')], { env }).out;
    check('B scan other seller 0 matches', () => assert.equal(so.matches, 0));

    const scanned = readJson(join(dir, 'scan.json')).observations[0];
    const expected = { recipient: paid.stealth, asset: 'native', amount: split.net.toString() };
    const obs = { ...scanned, expected };
    check('B scan observation = on-chain announcement', () => assert.equal(lc(obs.log.transactionHash), lc(paid.hash)));
    const obsPath = join(dir, 'observation.json');
    writeFileSync(obsPath, JSON.stringify(obs));
    const pi = cli('B payment inspect', ['payment', 'inspect', '--in', obsPath]).out;
    check('B payment inspect untrusted', () => { assert.equal(pi.paymentVerified, false); assert.equal(pi.evidenceSource, 'untrusted-input'); assert.equal(pi.declaredAmount, split.net.toString()); });
    const pend = cli('B NEG payment verify before finality', ['payment', 'verify', '--in', obsPath, ...trust, ...live], { env, expect: EXIT.fail }).out;
    check('B pending-finality', () => { assert.equal(pend.status, 'pending-finality'); assert.equal(pend.paymentVerified, false); }, `confirmations=${pend.confirmations}`);
    const depth = findChain(chainId).finalityDepth;
    await alias.mine(depth);
    const pv = cli('B payment verify', ['payment', 'verify', '--in', obsPath, ...trust, ...live, '--out', join(dir, 'payment-check.json')], { env }).out;
    check('B payment verified + final', () => {
      assert.equal(pv.status, 'verified'); assert.equal(pv.paymentVerified, true); assert.equal(pv.final, true);
      assert.equal(pv.evidenceSource, 'live-rpc'); assert.equal(pv.verificationScope, 'operator-pinned-testnet'); assert.equal(pv.manifestDigest, D);
    }, `confirmations=${pv.confirmations} depth=${depth}`);
    const ps = cli('B payment status', ['payment', 'status', '--in', obsPath, ...trust, ...live], { env }).out;
    check('B payment status verified', () => assert.equal(ps.status, 'verified'));

    // Negative evidence.
    writeFileSync(join(dir, 'obs-wrong-amount.json'), JSON.stringify({ ...obs, expected: { ...expected, amount: (split.net + 1n).toString() } }));
    cli('B NEG payment verify wrong amount claim', ['payment', 'verify', '--in', join(dir, 'obs-wrong-amount.json'), ...trust, ...live], { env, expect: EXIT.fail, code: 'AMOUNT_MISMATCH' });
    writeFileSync(join(dir, 'obs-wrong-recipient.json'), JSON.stringify({ ...obs, expected: { ...expected, recipient: lc(alias.account(7).address) } }));
    cli('B NEG payment verify wrong recipient claim', ['payment', 'verify', '--in', join(dir, 'obs-wrong-recipient.json'), ...trust, ...live], { env, expect: EXIT.fail, code: 'RECIPIENT_MISMATCH' });
    const unrelated = await alias.wallet(3).sendTransaction({ to: alias.account(8).address, value: 1n });
    const urc = await pub.waitForTransactionReceipt({ hash: unrelated });
    await alias.mine(depth);
    const unrelatedBlock = await pub.getBlock({ blockNumber: urc.blockNumber });
    writeFileSync(join(dir, 'obs-unrelated-tx.json'), JSON.stringify({ ...obs, log: { ...obs.log, transactionHash: unrelated } }));
    const un = cli('B NEG payment verify unrelated tx hash', ['payment', 'verify', '--in', join(dir, 'obs-unrelated-tx.json'), ...trust, ...live], { env, expect: EXIT.fail }).out;
    check('B unrelated tx not verified', () => assert.equal(un.paymentVerified, false), `status=${un.status}`);
    writeFileSync(join(dir, 'obs-unrelated-pos.json'), JSON.stringify({ ...obs, log: { ...obs.log, transactionHash: unrelated, blockHash: unrelatedBlock.hash, blockNumber: `0x${urc.blockNumber.toString(16)}` } }));
    const up = cli('B NEG payment verify unrelated tx at its real position', ['payment', 'verify', '--in', join(dir, 'obs-unrelated-pos.json'), ...trust, ...live], { env, expect: EXIT.fail }).out;
    check('B unrelated position not verified', () => assert.equal(up.paymentVerified, false), `status=${up.status}`);
    cli('B NEG payment verify wrong digest', ['payment', 'verify', '--in', obsPath, '--manifest', manifestPath, '--manifest-digest', wrongDigest, ...live], { env, expect: EXIT.config, code: 'MANIFEST_PIN_MISMATCH' });
    cli('B NEG payment verify 31337 devnet RPC as 84532', ['payment', 'verify', '--in', obsPath, ...trust, '--online', '--rpc-env', 'GP_WRONG', '--allow-insecure-localhost'],
      { env: { ...env, GP_WRONG: readJson(resolve(ROOT, 'scripts/devnet/.state/devnet.json')).rpcUrl }, expect: EXIT.config, code: 'CHAIN_MISMATCH' });

    // Receipt creation (live, invoice-bound) and offline verification.
    const receiptArgs = ['receipt', 'create', '--invoice', join(dir, 'invoice.json'), '--observation', obsPath, '--keystore', join(dir, 'seller.json'), '--passphrase-env', 'GP_PASS', ...trust, ...live, '--approve'];
    const rc = cli('B receipt create (invoice-bound)', [...receiptArgs, '--out', join(dir, 'receipt.json')], { env }).out;
    check('B receipt create report', () => { assert.equal(rc.invoiceBound, true); assert.equal(rc.paymentVerifiedAtCreation, true); assert.equal(rc.receiptIsPaymentProof, false); });
    cli('B NEG receipt create refuses existing output', [...receiptArgs, '--out', join(dir, 'receipt.json')], { env, expect: EXIT.io });
    cli('B NEG receipt create without --approve', receiptArgs.filter((x) => x !== '--approve').concat(['--out', join(dir, 'receipt-x.json')]), { env, expect: EXIT.usage, code: 'APPROVAL_REQUIRED' });
    cli('B NEG receipt create wrong amount claim', ['receipt', 'create', '--invoice', join(dir, 'invoice.json'), '--observation', join(dir, 'obs-wrong-amount.json'), '--keystore', join(dir, 'seller.json'),
      '--passphrase-env', 'GP_PASS', ...trust, ...live, '--approve', '--out', join(dir, 'receipt-y.json')], { env, expect: EXIT.fail, code: 'AMOUNT_MISMATCH' });
    const md = `0x${hex(randomBytes(32))}`;
    const rm = cli('B receipt create (manual digest)', ['receipt', 'create', '--manual-invoice-digest', md, '--observation', obsPath, '--keystore', join(dir, 'seller.json'),
      '--passphrase-env', 'GP_PASS', ...trust, ...live, '--approve', '--out', join(dir, 'receipt-manual.json')], { env }).out;
    check('B manual receipt unbound', () => { assert.equal(rm.invoiceBound, false); assert.equal(rm.manualInvoiceDigest, true); });
    const rv = cli('B receipt verify (invoice-bound)', ['receipt', 'verify', '--in', join(dir, 'receipt.json'), '--invoice', join(dir, 'invoice.json'), '--expected-tx', paid.hash,
      '--expected-recipient', paid.stealth, '--pin', seller.signer]).out;
    check('B receipt verify', () => { assert.equal(rv.ok, true); assert.equal(rv.paymentVerified, false); });
    const rcpt = readJson(join(dir, 'receipt.json'));
    writeFileSync(join(dir, 'receipt-tampered.json'), JSON.stringify({ ...rcpt, txHash: lc(unrelated) }));
    cli('B NEG receipt verify tampered tx', ['receipt', 'verify', '--in', join(dir, 'receipt-tampered.json')], { expect: EXIT.fail });
    cli('B NEG receipt verify unrelated expected tx', ['receipt', 'verify', '--in', join(dir, 'receipt.json'), '--expected-tx', unrelated], { expect: EXIT.fail });
    cli('B NEG receipt verify manual receipt against invoice', ['receipt', 'verify', '--in', join(dir, 'receipt-manual.json'), '--invoice', join(dir, 'invoice.json')], { expect: EXIT.fail });

    // Reconciliation and history.
    const ks = ['--keystore', join(dir, 'seller.json'), '--passphrase-env', 'GP_PASS'];
    const vk = ['--viewing-key-file', seller.files.view];
    cli('B reconcile create', ['reconcile', 'create', '--chain', C, ...ks, '--out', join(dir, 'h0.json')], { env });
    cli('B reconcile register', ['reconcile', 'register', '--in', join(dir, 'h0.json'), '--invoice', join(dir, 'invoice.json'), ...ks, '--out', join(dir, 'h1.json')], { env });
    cli('B NEG reconcile register foreign invoice', ['reconcile', 'register', '--in', join(dir, 'h0.json'), '--invoice', join(dir, 'tampered.json'), ...ks, '--out', join(dir, 'h1x.json')], { env, expect: EXIT.fail });
    const ri = cli('B reconcile inspect', ['reconcile', 'inspect', '--in', join(dir, 'h1.json'), ...vk]).out;
    check('B reconcile inspect not chain-verified', () => assert.equal(ri.currentChainVerified, false));
    cli('B reconcile propose (local list)', ['reconcile', 'propose', '--in', join(dir, 'h1.json'), ...vk]);
    writeFileSync(join(dir, 'current.json'), JSON.stringify({ version: 1, observations: [obs] }));
    const propArgs = ['reconcile', 'propose', '--in', join(dir, 'h1.json'), '--observations', join(dir, 'current.json'), ...ks, ...trust, ...live];
    const pr = cli('B reconcile propose (live candidates)', propArgs, { env }).out;
    const recordId = findRecordId(pr);
    check('B reconcile propose candidate', () => assert.match(recordId ?? '', /\S/), `record=${recordId}`);
    cli('B reconcile propose --record --out', [...propArgs, '--record', recordId, '--out', join(dir, 'proposal.json')], { env });
    const cf = cli('B reconcile confirm', ['reconcile', 'confirm', '--in', join(dir, 'h1.json'), '--proposal', join(dir, 'proposal.json'), '--observations', join(dir, 'current.json'),
      ...ks, ...trust, ...live, '--approve', '--out', join(dir, 'h2.json')], { env }).out;
    check('B reconcile confirm ok', () => assert.equal(cf.ok, true));
    writeFileSync(join(dir, 'current-bad.json'), JSON.stringify({ version: 1, observations: [{ ...obs, expected: { ...expected, amount: (split.net + 1n).toString() } }] }));
    cli('B NEG reconcile record wrong amount', ['reconcile', 'record', '--in', join(dir, 'h1.json'), '--observations', join(dir, 'current-bad.json'), ...ks, ...trust, ...live,
      '--approve', '--out', join(dir, 'h-bad.json')], { env, expect: EXIT.fail, code: 'AMOUNT_MISMATCH' });
    const rr = cli('B reconcile record', ['reconcile', 'record', '--in', join(dir, 'h1.json'), '--observations', join(dir, 'current.json'), ...ks, ...trust, ...live,
      '--approve', '--out', join(dir, 'h-rec.json')], { env }).out;
    check('B reconcile record does not confirm invoice', () => assert.equal(rr.invoiceAssociationConfirmed ?? false, false));
    const hl = cli('B history list (confirmed)', ['history', 'list', '--in', join(dir, 'h2.json'), ...vk]).out;
    check('B history list contains the payment', () => {
      assert.match(lc(JSON.stringify(hl)), new RegExp(lc(paid.hash).slice(2)));
      assert.equal(hl.currentChainVerified, false);
    });
    const hr = cli('B history list (recorded)', ['history', 'list', '--in', join(dir, 'h-rec.json'), ...vk, '--query', paid.hash.slice(0, 12)]).out;
    check('B history query finds the payment', () => assert.match(lc(JSON.stringify(hr)), new RegExp(lc(paid.hash).slice(2))));
    cli('B history inspect', ['history', 'inspect', '--in', join(dir, 'h2.json'), ...vk, '--record', recordId]);
    cli('B NEG history list wrong viewing key', ['history', 'list', '--in', join(dir, 'h2.json'), '--viewing-key-file', other.files.view], { expect: EXIT.fail });
    seller.signing.fill(0);
  } finally { removeDir(dir); alias.stop(); }
}

function findRecordId(report) {
  const seen = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if ((k === 'recordId' || k === 'record') && typeof x === 'string') seen.push(x); else walk(x); }
  };
  walk(report);
  return seen[0];
}

/* ------------------------------------------------------------------ main ------------------------------------------------------------------ */

let failed = false;
try {
  readFileSync(CLI);
  await partA();
  if (!SKIP_ALIAS) await partB();
  else console.log('\n(Part B skipped by --skip-alias)');
} catch (e) {
  failed = true;
  console.error(`\nERROR: ${e?.stack ?? e}`);
}
const allOk = summary('CLI devnet e2e') && !failed;
const gaps = results.filter((r) => r.label.includes(' GAP ')).length;
console.log(`gap assertions (fail-closed on 31337): ${gaps}`);
console.log(allOk ? 'CLI DEVNET E2E OK' : 'CLI DEVNET E2E FAILED');
process.exit(allOk ? 0 : 1);
