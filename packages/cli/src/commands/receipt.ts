import { bindReceiptToInvoice, checkExpiry, invoiceDigest, parseVerifiedReceipt, receiptJson, signReceipt, SignedReceiptError, type Invoice, type ReceiptInvoiceBinding, type SignedReceipt } from '@ghostpay/invoice-schema';
import { grossForNet, routerSplit } from '@ghostpay/chain-adapters';
import { checkAnnouncement, secretScalarFromBytes, zeroize } from '@ghostpay/core-crypto';
import { noPositionals, requireValue, type Parsed } from '../args.js';
import { OUT_OPTS, type Ctx } from '../ctx.js';
import { CliError, failError, usageError } from '../io.js';
import { toHex } from '../hex.js';
import { readPassphrase, secretOpts } from '../secrets.js';
import { chainBoundary, MANIFEST_OPTS, ONLINE_OPTS, verifiedContext } from '../payment-context.js';
import { assertExpectedPayment, parsePaymentObservation } from '../payment-input.js';
import { withBackupErrors } from '../backup-data.js';
import { freshCanonicalContext, loadSeller } from '../reconcile-session.js';
import { PASSPHRASE_OPTS, parseInvoiceInput, readInvoiceInput } from './invoice.js';
import { verifyObservation } from './payment.js';
import type { Command } from './types.js';

const MEANING = 'A valid seller signature proves control of the signing key and integrity of signed fields. It does not independently prove payment or real-world seller identity.';
const RETENTION = 'Preserve the original digital receipt file whenever possible. A QR code is a representation of that serialized data.';

function fixedNetAmount(invoice: Invoice): string | undefined {
  if (invoice.amountPolicy.mode !== 'fixed_token') return undefined;
  const wanted = BigInt(invoice.amountPolicy.tokenAmount);
  return routerSplit(invoice.feePolicy === 'payer_pays' ? grossForNet(wanted) : wanted).net.toString();
}

/** Mirror the GUI's invoice-bound signing path, using fresh canonical RPC evidence instead of a cached scan. */
async function create(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  requireValue(a, 'out');
  if (!a.flags.has('approve')) throw usageError('APPROVAL_REQUIRED', 'receipt signing requires explicit --approve after reviewing the invoice and observation.');
  if (!a.flags.has('online')) throw usageError('ONLINE_REQUIRED', 'receipt creation requires fresh read-only RPC verification with --online.');
  const paths = ['invoice', 'observation', 'keystore'].map(option => requireValue(a, option));
  if (paths.includes('-')) throw usageError('REPEATABLE_CONTEXT_REQUIRED', 'receipt creation needs invoice, observation and keystore files so their exact contents can be checked again before signing.');
  return withBackupErrors(async () => {
    const sources: string[] = [];
    for (const path of paths) sources.push(await ctx.read(path));
    const passphrase = await readPassphrase(ctx, a, 'invoice-passphrase', false);
    const parsed = await parseInvoiceInput(sources[0]!, { allowInsecureLocalhost: a.flags.has('allow-insecure-localhost'), ...(passphrase === undefined ? {} : { passphrase }) });
    const invoice = parsed.invoice;
    if (!parsed.signatureValid) throw failError('INVALID_INVOICE_SIGNATURE', 'receipt creation requires a valid signed invoice.');
    const currentTime = (): number => {
      const now = ctx.io.nowSeconds();
      if (!Number.isSafeInteger(now) || now <= 0) throw failError('CLOCK_INVALID', 'receipt creation requires a valid current Unix timestamp.');
      if (checkExpiry(invoice, now).invoiceExpired) throw failError('INVOICE_EXPIRED', 'the signed invoice expired; no receipt was created.');
      return now;
    };
    currentTime();
    const expectedAmount = fixedNetAmount(invoice);
    if (expectedAmount === undefined) throw new CliError('unsupported', 'FIXED_INVOICE_REQUIRED', 'invoice-bound receipt creation requires an exact fixed-token amount.');
    const observation = await chainBoundary(() => parsePaymentObservation(sources[1]!));
    assertExpectedPayment(observation);
    if (invoice.chainId !== observation.chain.chainId) throw failError('INVOICE_CHAIN_MISMATCH', 'invoice and observation use different chains.');
    const metadata = observation.claim.metadata;
    if (metadata === undefined) throw failError('CURRENT_EVIDENCE_REQUIRED', 'receipt creation requires complete router payment metadata.');
    const asset = metadata.kind === 'native' ? 'native' : metadata.token.toLowerCase();
    if (invoice.token !== asset || expectedAmount !== metadata.netAmount.toString())
      throw failError('INVOICE_PAYMENT_MISMATCH', 'observed asset or exact seller-net amount differs from the signed invoice.');
    const seller = await loadSeller(ctx, a, sources[2]);
    try {
      if (invoice.signer !== seller.signer || invoice.metaAddress !== seller.metaAddress)
        throw failError('INVOICE_SCOPE_MISMATCH', 'the invoice signer or recipient keys differ from the authenticated seller keystore.');
      const viewing = secretScalarFromBytes(seller.secrets.viewingKey);
      try {
        // The view tag is a scanning hint. Full recipient derivation is required even for deep-scan matches.
        const owned = checkAnnouncement(observation.claim.announcement, viewing, seller.publicKeys.spendingPublicKey, { ignoreViewTag: true });
        if (!owned.matches || owned.stealthAddress.toLowerCase() !== observation.claim.stealthAddress.toLowerCase())
          throw failError('SELLER_RECIPIENT_MISMATCH', 'the payment recipient is not owned by the authenticated seller keys.');
      } finally { zeroize(viewing); }
      const context = await chainBoundary(() => verifiedContext(ctx, a, observation.chain));
      const verified = await verifyObservation(ctx, a, sources[1]!, context);
      if (verified.output.networkFailure)
        throw new CliError('network', 'RPC_FAILURE', 'current payment evidence could not be verified because a configured provider failed.');
      if (!verified.output.paymentVerified || verified.verification.evidenceId === undefined)
        throw failError('CURRENT_EVIDENCE_REQUIRED', 'receipt creation requires a current canonical direct payment with sufficient finality.');
      const claim = verified.observation.claim;
      const binding: ReceiptInvoiceBinding = {
        invoiceDigest: `0x${toHex(invoiceDigest(invoice))}`, chainId: invoice.chainId, asset,
        amountMinorUnits: expectedAmount, invoiceSignerPublicKey: invoice.signer, invoiceSignatureValid: true,
        txHash: claim.announcement.transactionHash!, stealthAddress: claim.stealthAddress.toLowerCase(),
      };
      for (const [index, path] of paths.entries()) {
        if (await ctx.read(path) !== sources[index]) throw failError('STALE_CONTEXT', 'invoice, observation or seller keystore changed during review; no receipt was created.');
      }
      currentTime();
      await freshCanonicalContext({ context, finalityDepth: observation.chain.finalityDepth,
        records: [{ blockNumber: claim.announcement.blockNumber.toString(), blockHash: claim.announcement.blockHash }] });
      const receipt = signReceipt({ invoiceDigest: binding.invoiceDigest, chainId: binding.chainId,
        txHash: binding.txHash!, stealthAddress: binding.stealthAddress!, asset, amountMinorUnits: expectedAmount,
        issuedAt: currentTime() }, seller.secrets.signingKey);
      bindReceiptToInvoice(receipt, binding);
      await ctx.writeOut(a, `${receiptJson(receipt)}\n`);
      ctx.out({ ok: true, created: true, signatureValid: true, invoiceBound: true, currentChainVerified: true,
        paymentVerifiedAtCreation: true, recipientOwnershipVerified: true, receiptIsPaymentProof: false,
        verificationScope: 'operator-pinned-testnet', providerTrustEstablished: false,
        manifestDigest: context.manifestDigest, out: a.values.get('out'), originalFileRecommended: true,
        meaning: MEANING, retention: RETENTION },
      `Created an invoice-bound seller receipt after current canonical payment, finality and recipient-ownership checks.\nVerification is relative to the operator-pinned testnet deployment and configured providers.\n${MEANING}\n${RETENTION}`);
      return 0;
    } finally { seller.close(); }
  });
}

export async function readReceipt(ctx: Ctx, path: string): Promise<SignedReceipt> {
  const text = await ctx.read(path);
  try { return parseVerifiedReceipt(text); }
  catch { throw failError('INVALID_RECEIPT', 'receipt is malformed, oversized, unsupported or has an invalid signature.'); }
}

async function inspect(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const receipt = await readReceipt(ctx, requireValue(a, 'in'));
  ctx.out({ ok: true, receipt, signatureValid: true, paymentVerified: false, originalFileRecommended: true, meaning: MEANING, retention: RETENTION },
    `${receiptJson(receipt)}\n${MEANING}\n${RETENTION}`);
  return 0;
}

async function verify(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const receipt = await readReceipt(ctx, requireValue(a, 'in'));
  const pin = a.values.get('pin');
  if (pin !== undefined && !/^(?:02|03)[0-9a-f]{64}$/.test(pin)) throw usageError('BAD_PIN', 'pin must be a canonical compressed public key.');
  if (pin !== undefined && pin !== receipt.signerPublicKey) throw failError('RECEIPT_SIGNER_MISMATCH', 'receipt signer differs from the explicitly supplied key.');
  const recipient = a.values.get('expected-recipient');
  const txHash = a.values.get('expected-tx');
  const asset = a.values.get('expected-asset');
  const chain = a.values.get('expected-chain');
  const expectedAmount = a.values.get('expected-amount');
  if ((recipient !== undefined && !/^0x[0-9a-f]{40}$/.test(recipient)) ||
      (txHash !== undefined && !/^0x[0-9a-f]{64}$/.test(txHash)) ||
      (asset !== undefined && asset !== 'native' && !/^0x[0-9a-f]{40}$/.test(asset)) ||
      (chain !== undefined && (!/^[1-9][0-9]{0,15}$/.test(chain) || !Number.isSafeInteger(Number(chain)))) ||
      (expectedAmount !== undefined && (!/^[1-9][0-9]{0,77}$/.test(expectedAmount) || BigInt(expectedAmount) >= 1n << 256n)))
    throw usageError('BAD_EXPECTATION', 'expected receipt facts must use canonical chain, asset, address, hash and base-unit amount formats.');
  if ((recipient !== undefined && recipient !== receipt.stealthAddress) || (txHash !== undefined && txHash !== receipt.txHash) ||
      (asset !== undefined && asset !== receipt.asset) || (chain !== undefined && Number(chain) !== receipt.chainId) ||
      (expectedAmount !== undefined && expectedAmount !== receipt.amountMinorUnits))
    throw failError('RECEIPT_EXPECTATION_MISMATCH', 'receipt does not match the supplied expected payment facts.');
  const invoicePath = a.values.get('invoice');
  let invoiceBound = false;
  let signerMatch: string | undefined;
  if (invoicePath !== undefined) {
    const input = await readInvoiceInput(ctx, a, invoicePath);
    if (!input.signatureValid) throw failError('INVALID_INVOICE_SIGNATURE', 'invoice binding requires a valid signed invoice.');
    const invoice = input.invoice;
    const amount = fixedNetAmount(invoice) ?? expectedAmount;
    if (amount === undefined) throw usageError('EXPECTED_AMOUNT_REQUIRED', 'a fiat-quote invoice needs independently supplied seller-net token base units via --expected-amount.');
    try {
      const bound = bindReceiptToInvoice(receipt, {
        invoiceDigest: `0x${toHex(invoiceDigest(invoice))}`, chainId: invoice.chainId,
        asset: invoice.token, amountMinorUnits: amount, invoiceSignerPublicKey: invoice.signer,
        invoiceSignatureValid: input.signatureValid,
        ...(pin === undefined ? {} : { trustedSignerPublicKey: pin }),
        ...(recipient === undefined ? {} : { stealthAddress: recipient }),
        ...(txHash === undefined ? {} : { txHash }),
      });
      signerMatch = bound.signerMatch;
      invoiceBound = true;
    } catch (error) {
      if (error instanceof SignedReceiptError)
        throw failError(error.code.startsWith('RECEIPT_') ? error.code : `RECEIPT_${error.code}`, 'receipt does not match the signed invoice and expected payment facts.');
      throw error;
    }
  } else if (Object.keys(PASSPHRASE_OPTS).some((key) => a.values.has(key) || a.flags.has(key))) {
    throw usageError('PASSPHRASE_UNEXPECTED', 'receipt passphrase options apply only to the invoice supplied with --invoice.');
  }
  ctx.out({ ok: true, signatureValid: true, invoiceBound, signerPinned: pin !== undefined,
    ...(signerMatch === undefined ? {} : { signerMatch }), recipientMatched: recipient !== undefined,
    recipientOwnershipVerified: false, transactionMatched: txHash !== undefined,
    paymentVerified: false, originalFileRecommended: true, receipt, meaning: MEANING, retention: RETENTION },
    `Receipt signature: valid\nInvoice binding: ${invoiceBound ? 'signed fields match' : 'not checked'}\nRecipient ownership and on-chain payment: not independently verified\n${MEANING}\n${RETENTION}`);
  return 0;
}

async function exportReceipt(ctx: Ctx, a: Parsed): Promise<number> {
  noPositionals(a);
  const receipt = await readReceipt(ctx, requireValue(a, 'in'));
  const text = receiptJson(receipt);
  const wrote = await ctx.writeOut(a, `${text}\n`);
  ctx.note(RETENTION);
  ctx.out({ ok: true, paymentVerified: false, originalFileRecommended: true, ...(wrote ? { out: a.values.get('out') } : { receipt }), retention: RETENTION }, wrote ? 'Exported original signed receipt.' : text);
  return 0;
}

export const receiptCommands: readonly Command[] = [
  { path: ['receipt', 'create'], summary: 'sign an invoice-bound receipt after live canonical payment and seller-ownership verification',
    usage: 'ghostpay receipt create --invoice SIGNED_INVOICE --observation PAYMENT.json --keystore SELLER.json (--passphrase-file P | --passphrase-env NAME | --passphrase-stdin) --manifest DEPLOYMENT.json (--manifest-digest HASH | --release-key PUBLIC_KEY) --online (--rpc-file P | --rpc-env NAME) --approve --out NEW_RECEIPT.json [--secondary-rpc-file P | --secondary-rpc-env NAME] [--invoice-passphrase-file P | --invoice-passphrase-env NAME | --invoice-passphrase-stdin] [--allow-insecure-localhost]\n  Example: ghostpay receipt create --invoice invoice.json --observation payment.json --keystore seller.json --passphrase-env SELLER_PASSPHRASE --manifest deployment.json --manifest-digest 0xDIGEST --online --rpc-env RPC_ENDPOINT --approve --out receipt.json\n  Requires an unexpired signed fixed-token invoice, matching authenticated seller keys, an owned direct payment, exact seller-net amount and fresh canonical finality. Invoice/observation/keystore inputs must be repeatable files. Existing output files are never replaced. A signed receipt is a seller attestation, not independent payment proof or real-world identity.',
    opts: { invoice: 'value', observation: 'value', keystore: 'value', out: 'value', approve: 'flag',
      ...secretOpts('passphrase'), ...secretOpts('invoice-passphrase'), ...MANIFEST_OPTS, ...ONLINE_OPTS }, handler: create },
  { path: ['receipt', 'inspect'], summary: 'inspect a validated signed seller receipt',
    usage: 'ghostpay receipt inspect --in RECEIPT.json|-\n  Example: ghostpay receipt inspect --in receipt.json --json\n  Valid signatures attest to key control; they do not independently establish payment.',
    opts: { in: 'value' }, handler: inspect },
  { path: ['receipt', 'verify'], summary: 'verify a seller receipt signature without asserting payment',
    usage: 'ghostpay receipt verify --in RECEIPT.json|- [--invoice SIGNED_INVOICE.json|LINK_FILE] [--pin PUBLIC_KEY] [--expected-chain ID] [--expected-asset ASSET] [--expected-amount SELLER_NET_BASE_UNITS] [--expected-recipient ADDRESS] [--expected-tx HASH] [--passphrase-file P | --passphrase-env NAME | --passphrase-stdin] [--allow-insecure-localhost]\n  Example: ghostpay receipt verify --in receipt.json --invoice invoice.json --json\n  Fixed-token invoice binding uses the existing router fee math. Fiat quotes require an independently supplied seller-net amount. Signature and field consistency do not prove recipient ownership or on-chain payment.',
    opts: { in: 'value', invoice: 'value', pin: 'value', 'expected-chain': 'value', 'expected-asset': 'value', 'expected-amount': 'value', 'expected-recipient': 'value', 'expected-tx': 'value', 'allow-insecure-localhost': 'flag', ...PASSPHRASE_OPTS }, handler: verify },
  { path: ['receipt', 'export'], summary: 'export deterministic signed receipt JSON',
    usage: 'ghostpay receipt export --in RECEIPT.json|- [--out FILE] [--force]\n  Example: ghostpay receipt export --in receipt.json --out saved-receipt.json\n  Preserve the original digital receipt file rather than relying only on QR representations.',
    opts: { in: 'value', ...OUT_OPTS }, handler: exportReceipt },
];
