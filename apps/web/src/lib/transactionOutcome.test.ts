import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_CATALOG } from '../i18n/catalog';
import * as languages from '../i18n/languages';
import { SECURITY_KEYS } from '../i18n/securityKeys';
import { createTranslator } from '../i18n/translator';
import { MockWallet } from '../test/mockWallet';
import { fakeManifest } from '../test/fakeManifest';
import { NOW, makeParsed } from '../test/invoiceFixtures';
import { UserFacingError, captureUserMessage, displayMessage } from './errors';
import { permitStateDescriptor, reviewInvoice } from './pay';
import { PostBroadcastError, submitTx } from './payExec';
import { clearSession } from './session';
import { SubmissionMismatchError, WalletSubmissionUnknownError, connectWallet, sendViaWallet, type WalletInfo } from './wallet';
import { TRANSACTION_PHASE_KEYS, WalletRequestRejectedError, approvedPaymentOutcome, referencedBroadcastOutcome, type TransactionOutcome } from './transactionOutcome';

const HASH = `0x${'9'.repeat(64)}` as const;
const TO = '0x1111111111111111111111111111111111111111';
const EN = { locale: 'en', messages: SOURCE_CATALOG.messages };
const walletInfo = (provider: WalletInfo['provider']): WalletInfo => ({ id: 'test', name: 'Test', kind: 'injected', provider });

afterEach(() => { vi.restoreAllMocks(); clearSession(); });

describe('transaction outcomes retain meaning and exact references across locale changes', () => {
  it('has distinct, security-classified messages for all twelve presentation phases', () => {
    expect(Object.keys(TRANSACTION_PHASE_KEYS)).toHaveLength(12);
    expect(new Set(Object.values(TRANSACTION_PHASE_KEYS)).size).toBe(12);
    for (const key of Object.values(TRANSACTION_PHASE_KEYS)) expect(SECURITY_KEYS.has(key), key).toBe(true);
    expect(displayMessage({ key: TRANSACTION_PHASE_KEYS['broadcast-unknown'] })).not.toMatch(/nothing was sent|no payment was sent/i);
  });

  it('rerenders nested post-broadcast diagnostics without translating the hash or retaining a private cause', () => {
    const source = new PostBroadcastError(HASH, new SubmissionMismatchError('call data').translation!, new Error('private RPC credential'));
    const captured = captureUserMessage(source);
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const reviewed = createTranslator('es', [{ locale: 'es', messages: {
      'transaction.postBroadcast': 'Enviado {hash}; {detail} No repetir.',
      'transaction.submissionMismatch': 'Diferencia: {field}.',
      'transaction.field.data': 'datos de llamada',
    } }, EN]);
    expect(displayMessage(captured)).toContain('differs from the preview (call data)');
    expect(displayMessage(captured, reviewed.t)).toBe(`Enviado ${HASH}; Diferencia: datos de llamada. No repetir.`);
    expect(source.message).toContain('already sent this transaction');
    expect(source.outcome).toMatchObject({ phase: 'verification-incomplete', hash: HASH });
    expect(JSON.stringify(captured)).not.toContain('credential');
  });

  it('retains explicit wallet rejection code after a confirmed approval without discarding the approval reference', () => {
    const result = approvedPaymentOutcome(new WalletRequestRejectedError(), true, HASH);
    expect(result).toMatchObject({ approvalHash: HASH, code: 4001 });
    expect(displayMessage(result.message)).toContain('rejected the payment request');
    expect(displayMessage(result.message)).toContain('4001');
    expect(displayMessage(result.message)).toContain('earlier approval was not cancelled');
  });

  it('keeps non-EVM references separate from EVM hashes through unknown and mismatched broadcasts', () => {
    for (const phase of ['broadcast-unknown', 'verification-incomplete', 'pending-confirmation'] as const) {
      const reference = 'SolanaBase58SignatureOrBitcoinTxid';
      const result = referencedBroadcastOutcome(phase, reference);
      expect(result).toMatchObject({ phase, reference });
      expect(result.hash).toBeUndefined();
      expect(displayMessage(result.message)).toContain(reference);
      expect(displayMessage(result.message)).not.toMatch(/nothing was sent|confirmed successfully/i);
    }
  });

  it('keeps approval identity separate and never turns an unknown payment into a not-sent claim', () => {
    const failure = new WalletSubmissionUnknownError(-32001);
    const result = approvedPaymentOutcome(failure, true, HASH);
    expect(result).toMatchObject({ phase: 'broadcast-unknown', approvalHash: HASH, code: -32001 });
    expect(result.hash).toBeUndefined();
    expect(displayMessage(result.message)).toContain('unknown outcome');
    expect(displayMessage(result.message)).toContain('-32001');
    expect(displayMessage(result.message)).not.toMatch(/nothing was sent|no payment was sent/i);
    const later = approvedPaymentOutcome(new UserFacingError({ key: 'error.pay.theGasBufferQuoteExpiredBeforeSendingNothingWasSent' }), true, HASH);
    expect(displayMessage(later.message)).toContain('gas buffer quote expired');
    expect(displayMessage(later.message)).not.toMatch(/nothing was sent|no payment was sent/i);
  });

  it('uses a context-specific refusal before a payment request without string manipulation', () => {
    const expired = new UserFacingError({ key: 'error.pay.thisInvoiceHasExpiredNothingWasSent' });
    const result = approvedPaymentOutcome(expired, false, HASH);
    expect(result.phase).toBe('prepared');
    expect(displayMessage(result.message)).toContain('but no payment was sent');
    expect(displayMessage(result.message)).not.toContain('Nothing was sent');
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const translated = createTranslator('es', [{ locale: 'es', messages: {
      'transaction.approved.paymentNotSent': 'Aprobación{reference}; pago no enviado. {detail}',
      'transaction.detail.invoiceExpired': 'Factura caducada.',
    } }, EN]);
    expect(displayMessage(result.message, translated.t)).toBe(`Aprobación (${HASH}); pago no enviado. Factura caducada.`);
  });

  it('preserves sanitized RPC codes after a real wallet handoff and drops provider text', async () => {
    const base = new MockWallet();
    const provider: WalletInfo['provider'] = { request: async (args) => {
      const result = await base.request(args);
      if (args.method === 'eth_sendTransaction') throw Object.assign(new Error('private seed and RPC credential'), { code: -32000 });
      return result;
    } };
    const session = await connectWallet(walletInfo(provider), 84532);
    const error: unknown = await sendViaWallet(session, { to: TO, data: '0x', value: 1n }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSubmissionUnknownError);
    expect(error).toMatchObject({ rpcCode: -32000, outcome: { phase: 'broadcast-unknown', code: -32000 } });
    const displayed = displayMessage(captureUserMessage(error));
    expect(displayed).not.toMatch(/private seed|credential|nothing was sent/i);
    expect(base.calls.filter((entry) => entry.method === 'eth_sendTransaction')).toHaveLength(1);
  });

  it('retains the exact explicit-rejection code while keeping its translated diagnostic safe', async () => {
    const wallet = new MockWallet({ rejectSend: true });
    const session = await connectWallet(walletInfo(wallet), 84532);
    const error: unknown = await sendViaWallet(session, { to: TO, data: '0x', value: 1n }).catch((e: unknown) => e);
    expect(error).toMatchObject({ rpcCode: 4001 });
    expect(displayMessage(captureUserMessage(error))).toContain('rejected the request');
  });

  it('preserves a broadcast hash even when journal persistence and its notification callback both fail', async () => {
    const wallet = new MockWallet();
    const session = await connectWallet(walletInfo(wallet), 84532);
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => memory.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        if (wallet.sent !== undefined) throw new Error('storage quota');
        memory.set(key, value);
      },
    };
    const error: unknown = await submitTx(session, { to: TO, data: '0x', value: 1n }, { rpc: undefined, nowSeconds: () => NOW }, () => undefined,
      undefined, () => { throw new Error('notification failed'); }, { kind: 'transaction', storage }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PostBroadcastError);
    expect(error).toMatchObject({ hash: HASH, outcome: { hash: HASH, phase: 'verification-incomplete' } });
    expect(displayMessage(captureUserMessage(error))).not.toMatch(/nothing was sent|notification failed/i);
    expect(wallet.calls.filter((entry) => entry.method === 'eth_sendTransaction')).toHaveLength(1);
  });

  it('reports structured statuses while preserving the legacy string callback and no-RPC limitation', async () => {
    const wallet = new MockWallet();
    const session = await connectWallet(walletInfo(wallet), 84532);
    const statuses: TransactionOutcome[] = [];
    const text: string[] = [];
    const result = await submitTx(session, { to: TO, data: '0x', value: 3n }, { rpc: undefined, nowSeconds: () => NOW }, (message, outcome) => {
      text.push(message); if (outcome !== undefined) statuses.push(outcome);
    });
    expect(statuses.map((outcome) => outcome.phase)).toEqual(['awaiting-authorization', 'verification-incomplete']);
    expect(statuses[1]?.hash).toBe(result.hash);
    expect(text.join(' ')).toContain('could not independently verify');
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const tr = createTranslator('es', [{ locale: 'es', messages: { 'transaction.status.noRpc': 'Enviado sin verificación RPC.' } }, EN]);
    expect(displayMessage(statuses[1]!.message, tr.t)).toBe('Enviado sin verificación RPC.');
    expect(wallet.calls.filter((entry) => entry.method === 'eth_sendTransaction')).toHaveLength(1);
  });

  it('renders review copy and permit outcomes with a current reviewed locale without mutating signed invoices', async () => {
    const { parsed } = await makeParsed();
    const original = JSON.stringify(parsed.invoice);
    const review = reviewInvoice(parsed, NOW + 100_000, { status: 'loaded', manifest: fakeManifest(84532) });
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const tr = createTranslator('es', [{ locale: 'es', messages: {
      'pay.review.unpinnedSignature': 'Firma de la clave {key}; sin identidad verificada.',
      'pay.review.invoiceExpired': 'Factura caducada.',
      'pay.permit.nonceConsumed': 'Permiso utilizado; no reintentar automáticamente.',
    } }, EN]);
    expect(displayMessage(review.trust.message, tr.t)).toContain(parsed.invoice.signer);
    expect(review.blockerMessages.map((m) => displayMessage(m, tr.t))).toContain('Factura caducada.');
    expect(displayMessage(permitStateDescriptor('nonce_consumed'), tr.t)).toBe('Permiso utilizado; no reintentar automáticamente.');
    expect(JSON.stringify(parsed.invoice)).toBe(original);
  });

  it('never promotes unreviewed payment translations even when their catalogs contain every new key', () => {
    const tr = createTranslator('ar', [{ locale: 'ar', messages: {
      'transaction.approved.paymentUnknown': 'DRAFT CLAIM THAT NOTHING WAS SENT',
      'transaction.detail.reviewWallet': 'DRAFT DETAIL',
    } }, EN]);
    expect(displayMessage(approvedPaymentOutcome(undefined, true, HASH).message, tr.t)).toContain('payment was not confirmed');
    expect(displayMessage(approvedPaymentOutcome(undefined, true, HASH).message, tr.t)).not.toContain('DRAFT');
  });
});
