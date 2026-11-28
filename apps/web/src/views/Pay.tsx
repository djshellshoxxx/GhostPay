import { FRAGMENT_PREFIX, MAX_DECODED_BYTES, invoiceDigest, openFragment, type OpenFragmentResult, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BuiltPayment, Hex } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { TransactionStatusLine } from '../components/TransactionStatusLine';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { useWalletDisclosure } from '../components/WalletDisclosure';
import { DestinationReuseNotice } from '../components/DestinationReuseNotice';
import { watchDestinationWallet } from '../lib/destinationWalletScope';
import { checkDestinationReuse, type DestinationNotice } from '../lib/destinationReuse';
import { CameraImporter } from '../components/CameraImporter';
import { browserOnline, useBrowserOnline } from '../lib/browserOnline';
import { PaymentRequestFileInput } from '../components/PaymentRequestFileInput';
import { WalletAttempts } from '../components/WalletAttempts';
import { FeeDisclosure, useManifest } from '../components/Disclosure';
import { ManifestBanner } from '../components/ManifestBanner';
import { clearFragment, extractFragment } from '../lib/fragment';
import { safeText, payeeFingerprint } from '../lib/displayText';
import { formatCountdown, formatFiat, formatUnits, formatUnix, shortHex } from '../lib/format';
import { UserFacingError, displayMessage, captureUserMessage, type DisplayMessage, type MessageDescriptor } from '../lib/errors';
import { DelayScheduler, randomDelayMs, type ScheduleSnapshot } from '../lib/jitter';
import {
  createPayContext,
  applyBufferPolicy,
  bufferOffered,
  decodeForDisplay,
  quoteBuffer,
  assertInvoiceStillPayable,
  assertPreparedBufferFresh,
  reviewInvoice,
  trustView,
  type BufferQuote,
  type SweepSimulation,
  type PayContext,
} from '../lib/pay';
import { MANIFEST_READBACK_KEYS, NO_SECONDARY, openSecondaryReadback, verifyManifestForFlow } from '../lib/manifest';
import { browserStorage, loadScanPrivacy, privatePathForbidsDirect } from '../lib/scanPrivacy';
// i18n-use: manifest.readback.mismatch manifest.readback.rpcUnreadable manifest.readback.secondRpc manifest.readback.disagree
import { PaymentProofQr } from '../components/PaymentRequestQr';
import { PrintBillButton } from '../components/PrintableBill';
import { PermitRejectedError, PostBroadcastError, buildReceipt, classifyPayerPermit, grantApproval, planApproval, preparePayment, revokeApproval, sendPayment, type ApprovalPlan, type Runtime, type SubmitResult } from '../lib/payExec';
import { TransactionOutcomeError, approvedPaymentOutcome, type TransactionOutcome } from '../lib/transactionOutcome';
import { DUPLICATE_ATTEMPT_MESSAGE, readAttempts, withAttemptJournal, type AttemptStorage } from '../lib/duplicateAttemptJournal';
import type { MessageKey } from '../i18n/catalog';
import { useServices } from '../lib/services';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageValues, Part } from '../i18n/message';
import type { Translator } from '../i18n/translator';
import { connectWallet, paymentAttemptKey, walletWarnings, type WalletInfo, type WalletSession } from '../lib/wallet';
import { useApp } from '../state';
import { notifyEmbedDone } from '../lib/embedHost';
import { captureSessionVersionGuard } from '../lib/session';
import { scopeWalletRpc, useWalletPrivacy, type WalletPrivacyScope } from '../lib/useWalletPrivacy';
import { classifyQrText } from '../lib/qrClassify';
import { bindReceiptToInvoice, MAX_RECEIPT_JSON_BYTES, parseVerifiedReceipt, type BoundReceipt } from '../lib/receipts';

type TagMap = Readonly<Record<string, (children: ReactNode) => ReactNode>>;

/** Rich catalog text ({#tag}..{/tag}) without Trans, so Pay still renders in isolated English-only tests. */
function renderParts(parts: readonly Part[], tags: TagMap): ReactNode[] {
  return parts.map((p, i) => {
    if (typeof p === 'string') return p;
    const inner = renderParts(p.children, tags);
    const wrap = Object.prototype.hasOwnProperty.call(tags, p.tag) ? tags[p.tag] : undefined;
    return <Fragment key={i}>{wrap === undefined ? inner : wrap(inner)}</Fragment>;
  });
}

const monoTag = (name: string): TagMap => ({ [name]: (c) => <Mono>{c}</Mono> });

type Phase = 'input' | 'review' | 'waiting' | 'ready' | 'prepared' | 'busy' | 'submitted' | 'done';

/** QR links are interpreted locally, never followed. Restrict the URL wrapper before the canonical invoice parser. */
/** Fixed select code for the wrong-family hint; `undefined` when the text is not a recognised GhostPay QR family. */
function otherQrFamily(text: string): string | undefined {
  const c = classifyQrText(text);
  switch (c.family) {
    case 'settings': return 'settings';
    case 'seller-pairing': return 'sellerPairing';
    case 'public-meta': return 'publicMeta';
    case 'encrypted-keystore': return 'keystore';
    case 'seller-receipt': return 'receipt';
    case 'payment-proof': return 'proof';
    case 'multipart-fragment': return 'multipart';
    case 'evm-request': case 'bitcoin-request': case 'solana-request': case 'tron-request': return 'chainRequest';
    default: return undefined;
  }
}

function invoiceQrFragment(text: string, baseUrl: string): string | undefined {
  const encodedLimit = Math.ceil(MAX_DECODED_BYTES * 4 / 3);
  if (text.length > encodedLimit + 512 || /[^\x21-\x7e]/.test(text)) return undefined;
  if (!text.startsWith(FRAGMENT_PREFIX)) {
    const match = /^https:\/\/([a-z0-9.-]+)(\/[^?#]{0,511})(#gpi=v1\.[A-Za-z0-9_-]+)$/.exec(text);
    let base: URL;
    try { base = new URL(baseUrl); } catch { return undefined; }
    if (match === null || base.protocol !== 'https:' || base.port !== '' || match[1] !== base.hostname || match[2] !== base.pathname) return undefined;
    // Match this deployment's actual path, including dotted files/nested deployments, without normalizing traversal.
    // Refuse encoded separators and nested escapes too; scanned URLs are never navigated or fetched.
    if (match[2].split('/').some((segment) => {
      try {
        const decoded = decodeURIComponent(segment);
        // eslint-disable-next-line no-control-regex
        return decoded === '.' || decoded === '..' || /[/%\\\x00-\x1f\x7f]/.test(decoded);
      } catch { return true; }
    })) return undefined;
  }
  const fragment = extractFragment(text);
  if (fragment === undefined || !/^#gpi=v1\.[A-Za-z0-9_-]+$/.test(fragment) || fragment.length > FRAGMENT_PREFIX.length + encodedLimit) return undefined;
  return fragment;
}
// i18n-use: requestFile.summary requestFile.rejected requestFile.reviewAria requestFile.reviewHeading requestFile.open
interface InvoiceQrPreview {
  readonly source: 'qr' | 'file';
  readonly fragment: string;
  readonly result: OpenFragmentResult;
  readonly revision: number;
  readonly scope: object;
  readonly assertSession: () => void;
}

const SUPPORTED_INVOICE_ERROR: MessageDescriptor = { key: 'pay.error.supportedInvoice' };

function paymentAttemptRecorded(invoice: ParsedInvoice['invoice'], storage?: AttemptStorage): boolean {
  const key = paymentAttemptKey(invoice.chainId, bytesToHex(invoiceDigest(invoice)));
  return readAttempts(storage).some((attempt) => attempt.key === key);
}

async function assertNoPaymentAttempt(invoice: ParsedInvoice['invoice']): Promise<void> {
  const recorded = await withAttemptJournal((storage) => paymentAttemptRecorded(invoice, storage));
  if (recorded) throw new UserFacingError({ key: DUPLICATE_ATTEMPT_MESSAGE });
}

/** Refusal reasons whose own text says "Nothing was sent"; restated without that claim after an earlier request. */
const RETRY_REFUSAL_DETAIL: Readonly<Partial<Record<MessageKey, MessageKey>>> = {
  [DUPLICATE_ATTEMPT_MESSAGE]: DUPLICATE_ATTEMPT_MESSAGE,
  'error.pay.thisInvoiceHasExpiredNothingWasSent': 'transaction.detail.invoiceExpired',
  'error.pay.theSellerSPriceQuoteHasExpiredNothingWasSent': 'transaction.detail.quoteExpired',
  'error.pay.theGasBufferQuoteExpiredBeforeSendingNothingWasSent': 'transaction.detail.bufferExpired',
};

/**
 * A retry was refused before its own wallet request, but an earlier payment request for this invoice may have been
 * broadcast. Keep the unknown-outcome warning; never pass on refusal text that says nothing was sent.
 */
function refusedAfterEarlierRequest(error: unknown): MessageDescriptor {
  const key = error instanceof UserFacingError ? error.translation?.key : undefined;
  const detail = (key === undefined ? undefined : RETRY_REFUSAL_DETAIL[key]) ?? 'transaction.detail.reviewWallet';
  return { key: 'transaction.walletUnknown', values: { diagnostic: { key: detail } } };
}

/** The checkout's own offline refusal, thrown before a wallet is asked for anything. */
function isOfflineRefusal(error: unknown): boolean {
  return error instanceof UserFacingError && error.translation?.key === 'pay.offlineCheck';
}

function supportsInvoice(invoice: ParsedInvoice['invoice'], supportedOnly: boolean): boolean {
  return !supportedOnly || (invoice.v === 1 && invoice.amountPolicy.mode === 'fixed_token');
}

/** A private checkout is erased when its view is revoked or replaced: nothing of that invoice may be kept after it. */
function privateCheckout(parsed: ParsedInvoice): boolean {
  return parsed.encrypted || parsed.passphraseProtected;
}

export function Pay({ supportedOnly = false }: { readonly supportedOnly?: boolean } = {}): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const trParts = i18n?.parts ?? SOURCE_TRANSLATOR.parts;
  const rich = (id: Parameters<Translator['parts']>[0], values: MessageValues, tags: TagMap): ReactNode => renderParts(trParts(id, values), tags);
  const app = useApp();
  // Checkout reads the chain through the configured RPC. Without a connection nothing is verified or sent (#591).
  const online = useBrowserOnline();
  // Every wallet request from checkout (connect, network switch, permit, send) is shown and approved first.
  const walletDisclosure = useWalletDisclosure();
  const latestT = useRef(t); latestT.current = t;
  const announce = (message: MessageDescriptor): void => { if (mounted.current) app.announce(displayMessage(message, latestT.current)); };
  const services = useServices();
  const [parsed, setParsed] = useState<ParsedInvoice | undefined>(undefined);
  const [rejected, setRejected] = useState<DisplayMessage | undefined>(undefined);
  const [paste, setPaste] = useState('');
  const [invoiceQrPreview, setInvoiceQrPreview] = useState<InvoiceQrPreview | undefined>();
  const [invoiceQrError, setInvoiceQrError] = useState<{ readonly source: 'qr' | 'file'; readonly message: DisplayMessage } | undefined>();
  const [invoiceQrReset, setInvoiceQrReset] = useState(0);
  const [invoiceCameraReset, setInvoiceCameraReset] = useState(0);
  const [invoiceFileEpoch, setInvoiceFileEpoch] = useState(0);
  const invoiceQrRevision = useRef(0);
  const mounted = useRef(true);
  const invoiceQrDisclosure = useRef<HTMLDetailsElement | null>(null);
  const invoiceQrObserver = useRef<MutationObserver | undefined>(undefined);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [invoicePassphrase, setInvoicePassphrase] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [phase, setPhase] = useState<Phase>('input');
  const [useDelay, setUseDelay] = useState(false);
  const [useBuffer, setUseBuffer] = useState(false);
  const [bufferQuote, setBufferQuote] = useState<BufferQuote | undefined>(undefined);
  // Spec 04: after a signed permit was refused, the next (user-pressed) Prepare uses a one-time approval.
  const [permitDeclined, setPermitDeclined] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleSnapshot | undefined>(undefined);
  const [ctx, setCtx] = useState<PayContext | undefined>(undefined);
  const [ctxError, setCtxError] = useState<DisplayMessage | undefined>(undefined);
  const [wallets, setWallets] = useState<readonly WalletInfo[] | undefined>(undefined);
  const [wallet, setWallet] = useState<WalletSession | undefined>(undefined);
  const [built, setBuilt] = useState<BuiltPayment | undefined>(undefined);
  const [destinationReviews] = useState(() => ({ current: new WeakMap<BuiltPayment, {
    session: typeof app.session; notice: DestinationNotice;
  }>() }));
  const reviewWallet = useRef<WalletSession | undefined>(undefined);
  const [walletChanged, setWalletChanged] = useState(false);
  useLayoutEffect(() => {
    reviewWallet.current = wallet;
    setWalletChanged(false);
    if (wallet === undefined) return;
    const stop = watchDestinationWallet(wallet.wallet.provider, () => {
      if (reviewWallet.current !== wallet) return;
      reviewWallet.current = undefined;
      setWalletChanged(true);
    });
    return () => { reviewWallet.current = undefined; stop(); };
  }, [wallet]);
  const [builtFor, setBuiltFor] = useState<ParsedInvoice['invoice'] | undefined>(undefined);
  const [builtForContext, setBuiltForContext] = useState<PayContext | undefined>(undefined);
  const [resultForContext, setResultForContext] = useState<PayContext | undefined>(undefined);
  const [status, setStatus] = useState<DisplayMessage>('');
  const [error, setError] = useState<DisplayMessage | undefined>(undefined);
  const [result, setResult] = useState<SubmitResult | undefined>(undefined);
  const [boundReceipt, setBoundReceipt] = useState<BoundReceipt | undefined>(undefined);
  const [receiptTrustedKey, setReceiptTrustedKey] = useState('');
  const [receiptError, setReceiptError] = useState<DisplayMessage | undefined>(undefined);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptConsent, setReceiptConsent] = useState(false);
  const receiptBusyRef = useRef(false);
  const receiptImportRevision = useRef(0);
  // Remounts the uncontrolled receipt file input, so a file picked for one wallet is not kept for the next.
  const [receiptFileGeneration, setReceiptFileGeneration] = useState(0);
  const [approval, setApproval] = useState<ApprovalPlan | undefined>(undefined);
  const [approvalHash, setApprovalHash] = useState<string | undefined>(undefined);
  const [paymentMayHaveBeenSent, setPaymentMayHaveBeenSent] = useState(false);
  const [granted, setGranted] = useState<bigint | undefined>(undefined);
  /** Set once the wallet broadcast but verification failed: terminal, Send is never offered again. */
  const [broadcast, setBroadcast] = useState<string | undefined>(undefined);
  const [broadcastKind, setBroadcastKind] = useState<'approval' | 'payment'>('payment');
  // A public reconnect reason can outlive a cleared private invoice without retaining its contents or an outcome claim.
  const [showWalletChangeNotice, setShowWalletChangeNotice] = useState(false);
  // WEB-APP-02: once a payment request may have reached a wallet, revoking the view must not reopen Prepare/Send for the
  // same open public invoice. Both holders keep only that invoice (never a private one, which revocation erases); its
  // hash, account and outcome stay behind the journal.
  const [requestedInvoice, setRequestedInvoice] = useState<ParsedInvoice['invoice'] | undefined>(undefined);
  const walletRequestedFor = useRef<ParsedInvoice['invoice'] | undefined>(undefined);
  // The terminal invoice again, set with `requestedInvoice`, so events and retained callbacks see it before a render. It
  // takes no further chain check, review, delay or wallet connection, across connection losses too.
  const terminalFor = useRef<ParsedInvoice['invoice'] | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const scheduler = useRef<DelayScheduler | undefined>(undefined);
  const flowRevision = useRef(0);
  // Counts connection losses: wallet work that has not reached the wallet never continues across one.
  const connectionLosses = useRef(0);
  // That count when the current context was verified on the chain.
  const contextLosses = useRef(0);

  const fragment = app.fragment;
  // A wallet request (approval or payment) was made for this invoice, or one is in flight: expiry or newly saved settings
  // may stop new preparation, but must not clear what the submitted state, hash, receipt and proof are shown from.
  const handedOff = result !== undefined || broadcast !== undefined || paymentMayHaveBeenSent || granted !== undefined || approvalHash !== undefined;
  const keepContext = handedOff || phase === 'busy' || phase === 'done' || phase === 'submitted';
  // The wallet was asked to approve or pay for the open invoice. Opening it again would offer that anew and drop what
  // the wallet answered, whatever has been cleared since. Holds no invoice contents.
  const walletAsked = useRef(false);
  // New pins (saved here or by another tab) open the invoice again, which resets checkout, so they wait while either
  // holds.
  const heldPins = useRef(app.settings.pinnedSigners);
  if (!keepContext && !walletAsked.current) heldPins.current = app.settings.pinnedSigners;
  const pinned = heldPins.current;
  const invoiceQrScope = useMemo(() => ({ fragment, pinned, session: app.session, reset: invoiceQrReset, supportedOnly }), [fragment, pinned, app.session, invoiceQrReset, supportedOnly]);
  const currentInvoiceQrScope = useRef(invoiceQrScope); currentInvoiceQrScope.current = invoiceQrScope;
  const invalidateInvoiceQr = useCallback((): void => {
    invoiceQrRevision.current += 1;
    setInvoiceQrPreview(undefined);
    setInvoiceQrError(undefined);
  }, []);
  const resetInvoiceQr = useCallback((): void => { invalidateInvoiceQr(); setInvoiceQrReset((value) => value + 1); }, [invalidateInvoiceQr]);
  // A newer QR input replaces any staged file preview, so the file reader's own status must not outlive it.
  const invalidateFromCamera = useCallback((): void => { invalidateInvoiceQr(); setInvoiceFileEpoch((value) => value + 1); }, [invalidateInvoiceQr]);
  const beginInvoiceFile = (): (() => boolean) => {
    invalidateInvoiceQr();
    // Choosing a file supersedes a running camera or QR parser without remounting this file reader.
    setInvoiceCameraReset((value) => value + 1);
    const revision = invoiceQrRevision.current;
    return () => invoiceQrRevision.current === revision;
  };
  const disclosureClosed = (records: readonly MutationRecord[]): boolean => records.some((record) => record.attributeName === 'open' && record.oldValue !== null);
  const invoiceQrIsOpen = (): boolean => {
    // Native toggle events can coalesce. Consume queued close records before a callback or confirmation can act.
    if (disclosureClosed(invoiceQrObserver.current?.takeRecords() ?? [])) { resetInvoiceQr(); return false; }
    return invoiceQrDisclosure.current?.open === true;
  };
  useEffect(() => {
    const disclosure = invoiceQrDisclosure.current;
    if (disclosure === null) return;
    const observer = new MutationObserver((records) => { if (disclosureClosed(records)) resetInvoiceQr(); });
    invoiceQrObserver.current = observer;
    observer.observe(disclosure, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });
    return () => { observer.disconnect(); if (invoiceQrObserver.current === observer) invoiceQrObserver.current = undefined; };
  }, [parsed, resetInvoiceQr]);
  useEffect(() => { invalidateInvoiceQr(); }, [invoiceQrScope, invalidateInvoiceQr]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invoiceQrRevision.current += 1; };
  }, []);

  const importInvoiceQr = async (text: string, signal: AbortSignal, source: 'qr' | 'file' = 'qr'): Promise<boolean> => {
    const revision = invoiceQrRevision.current;
    const scope = invoiceQrScope;
    const assertSession = captureSessionVersionGuard();
    const current = (): boolean => {
      if (!invoiceQrIsOpen() || signal.aborted || !mounted.current || invoiceQrRevision.current !== revision || currentInvoiceQrScope.current !== scope) return false;
      try { assertSession(); return true; } catch { return false; }
    };
    if (!current()) return false;
    const candidate = invoiceQrFragment(text, services.baseUrl());
    if (candidate === undefined) {
      // Name another GhostPay QR family so the user can take it to the right screen; never act on it here.
      const other = otherQrFamily(text);
      setInvoiceQrError({ source, message: other === undefined ? { key: 'pay.error.invoiceQrLink' } : { key: 'pay.error.invoiceQrOtherFamily', values: { family: other } } });
      return false;
    }
    try {
      const result = await openFragment(candidate, { pinnedSigners: pinned });
      if (!current()) return false;
      if (result.status === 'ok' && !supportsInvoice(result.parsed.invoice, supportedOnly)) throw new UserFacingError(SUPPORTED_INVOICE_ERROR);
      setInvoiceQrPreview({ source, fragment: candidate, result, revision, scope, assertSession });
      return true;
    } catch (error) {
      if (current()) setInvoiceQrError({ source, message: captureUserMessage(error) });
      return false;
    }
  };
  const openInvoiceQr = (): void => {
    const preview = invoiceQrPreview;
    if (!invoiceQrIsOpen() || preview === undefined || preview.revision !== invoiceQrRevision.current || preview.scope !== currentInvoiceQrScope.current) return;
    try { preview.assertSession(); } catch { resetInvoiceQr(); return; }
    // Same explicit opening path as the paste form, including the passphrase prompt and full payment review.
    app.setFragment(preview.fragment);
    setPaste('');
    resetInvoiceQr();
  };

  // Parse whenever a fragment is present. Nothing is logged or sent anywhere.
  useEffect(() => {
    let live = true;
    flowRevision.current += 1;
    const revision = flowRevision.current;
    const sessionGuard = captureSessionVersionGuard();
    const current = (): boolean => {
      if (!live || flowRevision.current !== revision || latest.current.fragment !== fragment || latest.current.supportedOnly !== supportedOnly) return false;
      try { sessionGuard(); return true; } catch { cancelInvoiceOpening(fragment, revision); return false; }
    };
    receiptImportRevision.current += 1;
    receiptBusyRef.current = false;
    setReceiptBusy(false);
    setReceiptConsent(false);
    setBoundReceipt(undefined);
    setReceiptError(undefined);
    setReceiptTrustedKey('');
    setCtx(undefined);
    setCtxError(undefined);
    setBuilt(undefined);
    setBuiltFor(undefined);
    setBuiltForContext(undefined);
    setResultForContext(undefined);
    setResult(undefined);
    setPaymentMayHaveBeenSent(false);
    setBroadcast(undefined);
    setBroadcastKind('payment');
    setApproval(undefined);
    setGranted(undefined);
    setApprovalHash(undefined);
    setPermitDeclined(false);
    // A replaced invoice takes its request markers with it.
    walletAsked.current = false;
    walletRequestedFor.current = undefined;
    terminalFor.current = undefined;
    setRequestedInvoice(undefined);
    // The gas buffer is an opt-in for one invoice; its quote is for that invoice's policy and clock.
    setUseBuffer(false);
    setBufferQuote(undefined);
    setWallet(undefined);
    setStatus('');
    setError(undefined);
    if (fragment !== undefined) setShowWalletChangeNotice(false);
    setPhase('input');
    setParsed(undefined);
    setUnlocking(false);
    scheduler.current?.cancel();
    if (fragment === undefined) {
      setParsed(undefined);
      setNeedsPassphrase(false);
      setInvoicePassphrase('');
      setPhase('input');
      return;
    }
    openFragment(fragment, { pinnedSigners: pinned }).then(
      (result) => {
        if (!current()) return;
        if (result.status === 'needsPassphrase') {
          setNeedsPassphrase(true);
          setRejected(undefined);
          setPhase('input');
          return;
        }
        const p = result.parsed;
        setNeedsPassphrase(false);
        if (!supportsInvoice(p.invoice, supportedOnly)) {
          setInvoicePassphrase('');
          setRejected(SUPPORTED_INVOICE_ERROR);
          setPhase('input');
          return;
        }
        setRejected(undefined);
        setParsed(p);
        setPhase('review');
      },
      (e: unknown) => {
        if (!current()) return;
        setParsed(undefined);
        setRejected(captureUserMessage(e));
        setPhase('input');
      },
    );
    return () => {
      live = false;
    };
  }, [fragment, pinned, supportedOnly]);

  const manifest = useManifest(parsed?.invoice.chainId);
  const nowSeconds = Math.floor(services.nowMs() / 1000);
  const review = useMemo(
    () => (parsed === undefined || manifest === undefined ? undefined : reviewInvoice(parsed, nowSeconds, manifest)),
    // `tick` re-evaluates expiry while the page is open.
    [parsed, manifest, tick],
  );
  const chainId = parsed?.invoice.chainId;

  // Build the payment request (amounts) as soon as the review has no blockers. The review is recomputed from the
  // latest invoice/manifest/clock every time (also when a delay ends), never from a stale closure.
  const latest = useRef({ parsed, manifest, receiptTrustedKey, ctx, built, builtFor, builtForContext, result, resultForContext, fragment, wallet, settings: app.settings, session: app.session, receiptConsent, supportedOnly, keepContext, handedOff });
  latest.current = { parsed, manifest, receiptTrustedKey, ctx, built, builtFor, builtForContext, result, resultForContext, fragment, wallet, settings: app.settings, session: app.session, receiptConsent, supportedOnly, keepContext, handedOff };
  // A disconnected route cannot observe the wallet. Drop the private reopening capability when leaving checkout.
  useEffect(() => () => {
    const checkout = latest.current;
    if (checkout.wallet === undefined || checkout.fragment === undefined ||
        !(checkout.parsed?.encrypted === true || checkout.parsed?.passphraseProtected === true)) return;
    if (window.location.hash === checkout.fragment) clearFragment(window.location, window.history);
    app.setFragment(undefined);
  }, [app.setFragment]);
  const walletPrivacy = useWalletPrivacy(wallet, (cause) => {
    // Only the payment counts. An unverified approval alone leaves the invoice payable (the journal refuses its repeat).
    if (parsed !== undefined && !privateCheckout(parsed) && (phase === 'done' || (phase === 'submitted' && broadcastKind === 'payment') ||
        paymentMayHaveBeenSent || walletRequestedFor.current === parsed.invoice)) {
      terminalFor.current = parsed.invoice;
      setRequestedInvoice(parsed.invoice);
    }
    flowRevision.current++;
    scheduler.current?.cancel();
    setWallet(undefined);
    setWallets(undefined);
    setStatus('');
    setError(undefined);
    setShowWalletChangeNotice(cause === 'wallet');
    app.announce('');
    setSchedule(undefined);
    // Outcomes are retained at the wallet/journal boundary even when a hash arrives after this view is revoked.
    setResult(undefined);
    setResultForContext(undefined);
    setBroadcast(undefined);
    setPaymentMayHaveBeenSent(false);
    setBuilt(undefined);
    setBuiltFor(undefined);
    setBuiltForContext(undefined);
    setApproval(undefined);
    setGranted(undefined);
    setApprovalHash(undefined);
    setBufferQuote(undefined);
    setUseBuffer(false);
    setPermitDeclined(false);
    receiptImportRevision.current++;
    receiptBusyRef.current = false;
    setReceiptBusy(false);
    setReceiptConsent(false);
    setReceiptTrustedKey('');
    setBoundReceipt(undefined);
    setReceiptError(undefined);
    // A newly revealed checkout must not inherit the previous wallet's receipt file (#569, account separation).
    setReceiptFileGeneration((generation) => generation + 1);
    invalidateInvoiceQr(); // Keep the explicitly preserved QR text area; revoke its parsed preview and work.
    setPaste('');
    if (parsed?.encrypted === true || parsed?.passphraseProtected === true) {
      setParsed(undefined);
      setCtx(undefined);
      setInvoicePassphrase('');
      if (window.location.hash === fragment) clearFragment(window.location, window.history);
      app.setFragment(undefined);
      setCtxError(undefined);
      setPhase('input');
    } else {
      const open = latest.current.parsed;
      const reopenable = open !== undefined && terminalFor.current !== open.invoice;
      if (reopenable && latest.current.ctx === undefined) {
        // Nothing to prepare from (the connection dropped first, for example): back to the review, keeping its error and
        // explicit chain check. Nothing resumes by itself.
        setPhase('review');
      } else if (reopenable && !latest.current.handedOff && (!browserOnline() || connectionLosses.current !== contextLosses.current)) {
        // The context was kept only for work in flight when the connection dropped. That work ends here, and the context
        // is not reused.
        returnToReview();
      } else {
        setCtxError(undefined);
        setPhase(open === undefined ? 'input' : 'ready');
      }
    }
  });
  // One proof per completed result: rebuilding it on the periodic re-render changed its bytes, which closed the enlarged QR.
  const proofReceipt = useMemo(() => result === undefined || ctx === undefined || built === undefined
    ? undefined : buildReceipt(ctx, built, result, new Date(services.nowMs())), [ctx, built, result]);
  const receiptScope = useMemo(() => ({ ctx, session: app.session }), [ctx, app.session]);
  // #287 item 4: buildReceipt creates fresh display timestamps; proof-preview retention follows the original completed
  // payment and scope instead, so an ordinary rerender cannot restart its age.
  const proofSource = useMemo(() => ({ result, resultForContext, ctx, built, session: app.session, fragment }), [result, resultForContext, ctx, built, app.session, fragment]);
  const viewMatches = (scope?: WalletPrivacyScope): boolean => {
    if (!mounted.current) return false;
    // Completion is also a protected presentation boundary, including expiry before a timer/restoration event runs.
    try { scope?.assertCurrent(); } catch { return false; }
    return latest.current.wallet === wallet && latest.current.session === app.session && latest.current.supportedOnly === supportedOnly;
  };
  // An operation asks the wallet for nothing more once settings were saved while it ran; the outcome of what was asked is
  // still shown. A later Send of a handed-off checkout reads the contracts back through the saved RPC first.
  const assertSameSettings = (): void => {
    if (latest.current.settings !== app.settings) throw new UserFacingError({ key: 'pay.error.reviewChanged' });
  };
  const cancelInvoiceOpening = (expectedFragment: string | undefined, revision: number): void => {
    if (!mounted.current || flowRevision.current !== revision || latest.current.fragment !== expectedFragment) return;
    flowRevision.current += 1;
    app.setFragment(undefined);
    setParsed(undefined);
    setNeedsPassphrase(false);
    setInvoicePassphrase('');
    setUnlocking(false);
    setPhase('input');
    setRejected({ key: 'pay.error.sellerKeysChanged' });
  };

  const assertCurrentInvoice = (revision: number, invoice: ParsedInvoice['invoice']): void => {
    if (!supportsInvoice(invoice, latest.current.supportedOnly)) throw new UserFacingError(SUPPORTED_INVOICE_ERROR);
    if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice || latest.current.ctx?.review.invoice !== invoice) {
      throw new Error('The invoice changed. Review it again before continuing.');
    }
  };
  // A newer check or a connection loss supersedes an in-flight chain verification.
  const reviewRequest = useRef(0);
  const refreshContext = useCallback(async (): Promise<PayContext | undefined> => {
    const request = ++reviewRequest.current;
    const { parsed: p, manifest: m } = latest.current;
    if (p === undefined || m === undefined || !supportsInvoice(p.invoice, latest.current.supportedOnly)) {
      setCtx(undefined);
      return undefined;
    }
    // A terminal invoice gets no further checkout check, from an effect or a retained callback.
    if (terminalFor.current === p.invoice) return undefined;
    // Fail closed while offline: the invoice stays readable, but no payment context exists without chain evidence.
    if (!browserOnline()) {
      if (!latest.current.keepContext) setCtx(undefined);
      setCtxError({ key: 'pay.offlineCheck' });
      return undefined;
    }
    const revision = flowRevision.current;
    const current = (): boolean => mounted.current && reviewRequest.current === request && browserOnline() && flowRevision.current === revision && latest.current.parsed === p && latest.current.manifest === m && supportsInvoice(p.invoice, latest.current.supportedOnly);
    const now = Math.floor(services.nowMs() / 1000);
    const fresh = reviewInvoice(p, now, m);
    if (fresh.blockers.length > 0) {
      // The blocker is still shown, and every send path rechecks validity before asking the wallet.
      if (!latest.current.keepContext) setCtx(undefined);
      setTick((n) => n + 1);
      return undefined;
    }
    try {
      const rpc = await app.getRpc(p.invoice.chainId);
      if (!current()) return undefined;
      // WEB-APP-01: read the manifest back from the chain before any payment is built from it; a configured second
      // RPC must agree (L2-I4) and an unusable one blocks instead of falling back to one provider. It is not opened
      // without a primary (nothing to cross-check) nor behind a required private path (never contacted directly, as in Scan).
      const secondary = rpc === undefined || privatePathForbidsDirect(loadScanPrivacy(browserStorage()))
        ? NO_SECONDARY
        : await openSecondaryReadback(() => app.getSecondaryRpc(p.invoice.chainId));
      if (!current()) return undefined;
      const checked = await verifyManifestForFlow(m, rpc, secondary, { sleep: services.sleep });
      if (!current()) return undefined;
      if (checked.status !== 'loaded') {
        setCtx(undefined);
        setCtxError(checked.status === 'invalid'
          ? (checked.cause === undefined ? checked.reason : { key: MANIFEST_READBACK_KEYS[checked.cause] })
          : { key: 'pay.error.noManifest' });
        return undefined;
      }
      const c = await createPayContext(fresh, rpc, { nowSeconds: now });
      if (!current()) return undefined;
      contextLosses.current = connectionLosses.current;
      setCtx(c);
      setCtxError(undefined);
      return c;
    } catch (e) {
      if (!current()) return undefined;
      setCtx(undefined);
      setCtxError(captureUserMessage(e));
      return undefined;
    }
  }, [app, services]);
  const captureConnection = (): { readonly lost: () => boolean; readonly assert: () => void } => {
    const losses = connectionLosses.current;
    const lost = (): boolean => !browserOnline() || connectionLosses.current !== losses;
    return { lost, assert: () => { if (lost()) throw new UserFacingError({ key: 'pay.offlineCheck' }); } };
  };
  /** Back to the review, so only an explicit chain check restarts a payment nothing was asked of the wallet for. */
  const returnToReview = (): void => {
    setBuilt(undefined);
    setBuiltFor(undefined);
    setBuiltForContext(undefined);
    setCtx(undefined);
    setCtxError({ key: 'pay.offlineCheck' });
    setPhase('review');
  };
  // Losing the connection cancels an open review, a pending delay and a prepared payment that no wallet has seen.
  // Reconnecting never re-verifies or resumes by itself: the payer retries the chain check explicitly.
  useEffect(() => {
    const disconnect = (): void => {
      connectionLosses.current++;
      reviewRequest.current++;
      const open = latest.current.parsed;
      // Neither a handed-off payment nor a terminal invoice is reopened by a connection change.
      if (latest.current.keepContext || (open !== undefined && terminalFor.current === open.invoice)) return;
      scheduler.current?.cancel();
      setCtxError({ key: 'pay.offlineCheck' });
      setCtx(undefined);
      setBuilt(undefined);
      setBuiltFor(undefined);
      setBuiltForContext(undefined);
      if (latest.current.parsed !== undefined) setPhase('review');
    };
    window.addEventListener('offline', disconnect);
    return () => { window.removeEventListener('offline', disconnect); };
  }, []);
  const refreshRef = useRef(refreshContext);
  refreshRef.current = refreshContext;
  const reviewKey = review === undefined ? '' : review.blockers.join('|');

  // The saved settings this checkout was reviewed under. Another tab can save others while this page is open.
  const reviewedSettings = useRef(app.settings);
  const refreshDeferred = useRef(false);
  useEffect(() => {
    // A running or handed-off payment keeps the context it was reviewed with.
    if (reviewedSettings.current !== app.settings && latest.current.keepContext && latest.current.ctx !== undefined) {
      refreshDeferred.current = true;
      return;
    }
    void refreshContext();
  }, [refreshContext, parsed, manifest, reviewKey]);
  // Newly saved settings: nothing prepared under the old ones stays, and checkout goes back to the review, which offers
  // the chain check again should it fail now. While a wallet request is out, or its outcome is shown, this waits; it runs
  // once an operation ends without one. A requested invoice that is closed to further payment stays as it is.
  useEffect(() => {
    if (reviewedSettings.current === app.settings || keepContext) return;
    reviewedSettings.current = app.settings;
    const terminal = parsed !== undefined && terminalFor.current === parsed.invoice;
    if (!terminal && (phase === 'waiting' || phase === 'ready' || phase === 'prepared')) {
      if (phase === 'waiting') scheduler.current?.cancel();
      setBuilt(undefined);
      setBuiltFor(undefined);
      setBuiltForContext(undefined);
      setApproval(undefined);
      setPhase('review');
      setError((current) => current ?? { key: 'pay.error.reviewChanged' });
    }
    if (refreshDeferred.current) {
      refreshDeferred.current = false;
      void refreshRef.current();
    }
  }, [app.settings, keepContext]);
  // An operation that was in flight at expiry and ended without any wallet request releases the context afterwards.
  const blocked = review !== undefined && review.blockers.length > 0;
  useEffect(() => {
    if (blocked && !keepContext) setCtx(undefined);
  }, [blocked, keepContext]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((n) => n + 1);
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setBoundReceipt(undefined);
  }, [ctx, built, result]);

  useEffect(() => {
    const onVis = (): void => {
      scheduler.current?.check();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      scheduler.current?.cancel();
      flowRevision.current += 1;
      receiptImportRevision.current += 1;
    };
  }, []);

  const token = review?.token;
  const isErc20 = parsed !== undefined && parsed.invoice.token !== 'native';

  const refreshBuffer = useCallback(async (sweep?: SweepSimulation): Promise<BufferQuote | undefined> => {
    if (chainId === undefined) return undefined;
    const revision = flowRevision.current;
    const invoice = latest.current.parsed?.invoice;
    const rpc = await app.getRpc(chainId);
    if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return undefined;
    if (rpc === undefined) {
      setError({ key: 'error.pay.aGasBufferNeedsAnRPCForThisChainTo' });
      return undefined;
    }
    try {
      if (invoice === undefined) return undefined;
      // ADR-0023: a v2 invoice's seller policy bounds (or declines) the buffer before it is shown or built.
      const q = applyBufferPolicy(await quoteBuffer(rpc, Math.floor(services.nowMs() / 1000), sweep), invoice);
      if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return undefined;
      setBufferQuote(q);
      return q;
    } catch (e) {
      if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return undefined;
      setError(captureUserMessage(e));
      return undefined;
    }
  }, [chainId, app, services]);

  const onPasteSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    resetInvoiceQr();
    const f = extractFragment(paste);
    if (f === undefined) {
      setRejected({ key: 'pay.error.invoiceLink' });
      return;
    }
    setRejected(undefined);
    app.setFragment(f);
    setPaste('');
  };

  const onUnlock = (e: React.FormEvent): void => {
    e.preventDefault();
    if (fragment === undefined || invoicePassphrase === '') return;
    const revision = ++flowRevision.current;
    const sessionGuard = captureSessionVersionGuard();
    const fragmentAtStart = fragment;
    const current = (): boolean => {
      if (!mounted.current || flowRevision.current !== revision || latest.current.fragment !== fragmentAtStart || latest.current.supportedOnly !== supportedOnly) return false;
      try { sessionGuard(); return true; } catch { cancelInvoiceOpening(fragmentAtStart, revision); return false; }
    };
    setUnlocking(true);
    setRejected(undefined);
    void openFragment(fragment, { pinnedSigners: pinned, passphrase: invoicePassphrase }).then(
      (result) => {
        if (!current()) return;
        if (result.status !== 'ok') throw new Error('passphrase');
        if (!supportsInvoice(result.parsed.invoice, latest.current.supportedOnly)) {
          setParsed(undefined);
          setCtx(undefined);
          setNeedsPassphrase(false);
          setInvoicePassphrase('');
          setRejected(SUPPORTED_INVOICE_ERROR);
          setPhase('input');
          return;
        }
        setParsed(result.parsed);
        setNeedsPassphrase(false);
        setInvoicePassphrase('');
        setRejected(undefined);
        setPhase('review');
      },
      (e: unknown) => {
        if (!current()) return;
        setRejected(captureUserMessage(e));
      },
    ).finally(() => { if (flowRevision.current === revision) setUnlocking(false); });
  };

  const importReceiptText = (readText: () => Promise<string>, byteLength?: number, signal?: AbortSignal): Promise<boolean> => {
    if (receiptBusyRef.current || signal?.aborted === true) return Promise.resolve(false);
    if (!latest.current.receiptConsent) {
      setReceiptError({ key: 'pay.error.receiptConsent' });
      return Promise.resolve(false);
    }
    const invoiceAtStart = parsed;
    const contextAtStart = ctx;
    const fragmentAtStart = fragment;
    const flowAtStart = flowRevision.current;
    if (latest.current.fragment !== fragmentAtStart || flowRevision.current !== flowAtStart) return Promise.resolve(false);
    if (invoiceAtStart === undefined || contextAtStart === undefined) return Promise.resolve(false);
    if (contextAtStart.review.invoice !== invoiceAtStart.invoice) {
      setReceiptError({ key: 'pay.error.receiptUpdating' });
      return Promise.resolve(false);
    }
    const trustedKeyAtStart = receiptTrustedKey;
    const importRevision = ++receiptImportRevision.current;
    receiptBusyRef.current = true;
    setReceiptBusy(true);
    setBoundReceipt(undefined);
    setReceiptError(undefined);
    return (async () => {
      try {
        if (byteLength !== undefined && byteLength > MAX_RECEIPT_JSON_BYTES) throw new UserFacingError({ key: 'pay.error.receiptTooLarge' });
        const text = await readText();
        if (text.length > MAX_RECEIPT_JSON_BYTES || new TextEncoder().encode(text).byteLength > MAX_RECEIPT_JSON_BYTES) {
          throw new UserFacingError({ key: 'pay.error.receiptTooLarge' });
        }
        if (signal?.aborted === true || !latest.current.receiptConsent) return false;
        const receipt = parseVerifiedReceipt(text);
        const current = latest.current;
        if (receiptImportRevision.current !== importRevision || flowRevision.current !== flowAtStart || current.fragment !== fragmentAtStart || current.parsed !== invoiceAtStart) return false;
        if (current.ctx?.review.invoice !== invoiceAtStart.invoice) throw new UserFacingError({ key: 'pay.error.receiptUpdating' });
        const binding = bindReceiptToInvoice(receipt, {
          invoiceDigest: `0x${bytesToHex(invoiceDigest(invoiceAtStart.invoice))}`,
          chainId: invoiceAtStart.invoice.chainId,
          asset: invoiceAtStart.invoice.token,
          amountMinorUnits: current.ctx.request.netAmount.toString(),
          invoiceSignerPublicKey: invoiceAtStart.invoice.signer,
          invoiceSignatureValid: invoiceAtStart.verification.signatureValid,
          ...(trustedKeyAtStart.trim() === '' ? {} : { trustedSignerPublicKey: trustedKeyAtStart }),
          ...(current.result === undefined || current.resultForContext !== current.ctx ? {} : { txHash: current.result.hash }),
          ...(current.built === undefined || current.builtFor !== invoiceAtStart.invoice || current.builtForContext !== current.ctx ? {} : { stealthAddress: current.built.preview.stealth }),
        });
        if (receiptImportRevision.current !== importRevision || flowRevision.current !== flowAtStart || latest.current.fragment !== fragmentAtStart || latest.current.parsed !== invoiceAtStart || latest.current.receiptTrustedKey !== trustedKeyAtStart) return false;
        if (!latest.current.receiptConsent) return false;
        setBoundReceipt(binding);
        return true;
      } catch (err) {
        if (receiptImportRevision.current === importRevision && flowRevision.current === flowAtStart && latest.current.fragment === fragmentAtStart && latest.current.parsed === invoiceAtStart && latest.current.receiptTrustedKey === trustedKeyAtStart) setReceiptError(captureUserMessage(err));
        return false;
      } finally {
        if (receiptImportRevision.current === importRevision) {
          receiptBusyRef.current = false;
          setReceiptBusy(false);
        }
      }
    })();
  };

  const onImportReceipt = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const fileInput = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
    const file = fileInput?.files?.[0];
    if (file === undefined) return;
    // Snapshot before clearing so same-file retries work and a late import cannot clear a newer selection.
    if (fileInput !== null) fileInput.value = '';
    void importReceiptText(() => file.text(), file.size);
  };

  const startWaiting = (): void => {
    if (parsed === undefined) return;
    const revision = flowRevision.current;
    const invoice = parsed.invoice;
    setError(undefined);
    try {
      const { delayMinSec, delayMaxSec } = app.settings;
      const ms = randomDelayMs(delayMinSec * 1000, delayMaxSec * 1000);
      const s = new DelayScheduler(ms, parsed.invoice.expiresAt, {
        monotonicNow: () => performance.now(),
        wallNowSeconds: () => Math.floor(services.nowMs() / 1000),
        setInterval: (fn, every) => setInterval(fn, every),
        clearInterval: (h) => {
          clearInterval(h as ReturnType<typeof setInterval>);
        },
      });
      scheduler.current?.cancel();
      scheduler.current = s;
      setSchedule(s.snapshot());
      setPhase('waiting');
      announce({ key: 'pay.announce.scheduled' });
      let handled = false;
      s.subscribe((snap) => {
        if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return;
        setSchedule(snap);
        if (handled || snap.status === 'waiting') return;
        handled = true;
        if (snap.status === 'ready') {
          void (async () => {
            // Revalidate expiry, quote, chain support and amounts at the due time before anything else happens.
            const c = await refreshRef.current();
            if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return;
            if (c === undefined) {
              setPhase('review');
              setError({ key: 'pay.error.reviewChanged' });
              return;
            }
            setPhase('ready');
            announce({ key: 'pay.announce.delayDone' });
          })();
        } else if (snap.status === 'expired') {
          setPhase('review');
          setError({ key: 'pay.error.expiredWaiting' });
        } else if (snap.status === 'cancelled') {
          setPhase('review');
          announce({ key: 'pay.announce.cancelled' });
        }
      });
    } catch (e) {
      setError(captureUserMessage(e));
    }
  };

  const onContinue = (): void => {
    const revision = flowRevision.current;
    const invoice = parsed?.invoice;
    if (invoice !== undefined && terminalFor.current === invoice) return;
    setError(undefined);
    if (useDelay) startWaiting();
    else {
      void (async () => {
        const c = await refreshRef.current();
        if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return;
        if (c === undefined) {
          setError({ key: 'pay.error.reviewChanged' });
          return;
        }
        setPhase('ready');
      })();
    }
  };

  const onFindWallets = (): void => {
    const revision = flowRevision.current;
    void services.discoverWallets().then((found) => {
      if (flowRevision.current === revision) setWallets(found);
    }, () => {
      if (flowRevision.current === revision) setWallets([]);
    });
  };
  useEffect(() => {
    if (phase === 'ready' && wallets === undefined && (parsed === undefined || requestedInvoice !== parsed.invoice)) onFindWallets();
  }, [phase, wallets, parsed, requestedInvoice]);

  const runtime = useCallback(async (): Promise<Runtime> => {
    const privacyScope = walletPrivacy.capture();
    const rpc = chainId === undefined ? undefined : await app.getRpc(chainId);
    privacyScope.assertCurrent();
    return { rpc: rpc === undefined ? undefined : scopeWalletRpc(rpc, privacyScope), nowSeconds: () => Math.floor(services.nowMs() / 1000), sleep: services.sleep };
  }, [app, chainId, services, walletPrivacy.capture]);

  const onConnect = (w: WalletInfo): void => {
    if (chainId === undefined || (parsed !== undefined && terminalFor.current === parsed.invoice)) return;
    const revision = flowRevision.current;
    let privacyScope;
    try { privacyScope = walletPrivacy.begin(); } catch { return; }
    const invoice = parsed?.invoice;
    setError(undefined);
    setShowWalletChangeNotice(false);
    setStatus({ key: 'pay.status.walletWaiting' });
    const connection = captureConnection();
    // A changed invoice, flow or session ends an open review and the connection; the handlers below then stay silent.
    // A connection loss also ends it, before the wallet is asked, and says so.
    const stillOurs = (): void => {
      privacyScope.assertCurrent();
      if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) throw new UserFacingError({ key: 'wallet.disclosure.cancelled' });
    };
    const connectionCurrent = (): void => {
      stillOurs();
      connection.assert();
    };
    connectWallet(w, chainId, connectionCurrent, privacyScope.signal, { disclosure: walletDisclosure }).then(
      (s) => {
        try { stillOurs(); } catch { return; }
        if (connection.lost()) {
          setStatus('');
          setError({ key: 'pay.offlineCheck' });
          return;
        }
        // A hard reload does not run React cleanup; remove a connected private invoice's URL capability now.
        if ((parsed?.encrypted === true || parsed?.passphraseProtected === true) && window.location.hash === fragment) {
          clearFragment(window.location, window.history);
        }
        setWallet(s);
        setStatus('');
        announce({ key: 'pay.announce.connected' });
      },
      (e: unknown) => {
        try { stillOurs(); } catch { return; }
        setStatus('');
        setError(captureUserMessage(e));
      },
    );
  };

  const onPrepare = (): void => {
    if (wallet === undefined || ctx === undefined || parsed === undefined || ctx.review.invoice !== parsed.invoice) return;
    if (requestedInvoice === parsed.invoice) return;
    const revision = flowRevision.current;
    let privacyScope;
    try { privacyScope = walletPrivacy.capture(); } catch { return; }
    const sessionGuard = privacyScope.assertCurrent;
    const invoice = parsed.invoice;
    const isCurrent = (): boolean => viewMatches(privacyScope) && flowRevision.current === revision && latest.current.parsed?.invoice === invoice && latest.current.ctx?.review.invoice === invoice;
    const connection = captureConnection();
    const guard = (): void => {
      connection.assert();
      sessionGuard();
      assertCurrentInvoice(revision, invoice);
      assertSameSettings();
      if (!viewMatches()) throw new Error('The wallet or session changed. Review again before continuing.');
    };
    const scopedStatus = (message: string, outcome?: TransactionOutcome): void => { if (isCurrent()) setStatus(outcome?.message ?? message); };
    setError(undefined);
    setPhase('busy');
    void (async () => {
      try {
        const rt = await runtime();
        guard();
        let buffer: BufferQuote | undefined;
        // Never carry an opt-in into an invoice whose seller policy declines a buffer (ADR-0023).
        if (useBuffer && isErc20 && bufferOffered(invoice)) {
          const bt = ctx.review.token;
          // Spec 13: re-estimate at confirm with a token-specific transfer simulation from the payer's account.
          buffer = await refreshBuffer(bt === undefined || bt.address === 'native' ? undefined : { token: bt.address, from: wallet.account, amount: ctx.request.netAmount });
          guard();
          if (buffer === undefined) throw new Error('buffer');
        }
        const tk = ctx.review.token;
        let permit = tk?.config?.permit === true && buffer === undefined && !permitDeclined;
        if (permit) {
          const state = await classifyPayerPermit(ctx, wallet, rt);
          guard();
          permit = state === 'ok_to_permit';
          if (state === 'unsupported_token') scopedStatus('', { phase: 'unsupported', message: { key: 'pay.status.permitUnsupported' } });
        }
        let plan: ApprovalPlan | undefined;
        if (isErc20 && !permit && tk?.address !== undefined && tk.address !== 'native') {
          plan = await planApproval(ctx, wallet, tk.address, rt);
          guard();
        }
        if (permit) {
          await assertNoPaymentAttempt(invoice);
          guard();
        }
        const b = await preparePayment(wallet, ctx, { usePermit: permit, ...(buffer === undefined ? {} : { buffer }) }, rt, scopedStatus, guard);
        guard();
        setApproval(plan);
        setGranted(undefined);
        setApprovalHash(undefined);
        if (!mounted.current) return;
        // Advisory only: nothing here may throw into the payment flow.
        let notice: DestinationNotice | undefined;
        try {
          notice = reviewWallet.current !== wallet ? undefined : checkDestinationReuse(
            { kind: 'invoice', payer: wallet.account, invoiceDigest: bytesToHex(invoiceDigest(invoice)) },
            wallet.chainId, b.preview.stealth, true,
          );
        } catch { notice = 'unavailable'; }
        if (notice !== undefined) destinationReviews.current.set(b, { session: app.session, notice });
        setBuilt(b);
        setBuiltFor(invoice);
        setBuiltForContext(ctx);
        setStatus('');
        setPhase('prepared');
        announce({ key: 'pay.announce.prepared' });
      } catch (e) {
        if (!isCurrent()) return;
        setStatus('');
        // Nothing was sent by preparing: after a connection loss the chain is checked again before another try.
        if (connection.lost() && !handedOff) { returnToReview(); return; }
        if (e instanceof PermitRejectedError) setPermitDeclined(true);
        if (!(e instanceof Error && e.message === 'buffer')) setError(captureUserMessage(e));
        setPhase('ready');
      }
    })();
  };

  const onSend = (): void => {
    if (wallet === undefined || ctx === undefined || built === undefined || parsed === undefined || ctx.review.invoice !== parsed.invoice || builtFor !== parsed.invoice || builtForContext !== ctx) return;
    const revision = flowRevision.current;
    let privacyScope;
    try { privacyScope = walletPrivacy.capture(); } catch { return; }
    const sessionGuard = privacyScope.assertCurrent;
    const invoice = parsed.invoice;
    const isCurrent = (): boolean => viewMatches(privacyScope) && flowRevision.current === revision && latest.current.parsed?.invoice === invoice && latest.current.ctx === ctx && latest.current.built === built && latest.current.builtFor === invoice && latest.current.builtForContext === ctx;
    const connection = captureConnection();
    const guard = (): void => {
      connection.assert();
      sessionGuard();
      assertCurrentInvoice(revision, invoice);
      assertSameSettings();
      if (!viewMatches()) throw new Error('The wallet or session changed. Review again before continuing.');
      if (latest.current.built !== built || latest.current.builtFor !== invoice || latest.current.builtForContext !== ctx) throw new Error('The prepared payment changed. Review it again before continuing.');
    };
    const scopedStatus = (message: string, outcome?: TransactionOutcome): void => { if (isCurrent()) setStatus(outcome?.message ?? message); };
    setError(undefined);
    setPhase('busy');
    let actualAllowance = granted;
    let approvalBroadcastHash = approvalHash;
    let paymentWalletRequested = paymentMayHaveBeenSent;
    // Set only by this attempt's own wallet hand-off: its errors already describe their (unknown) outcome.
    let requestedThisAttempt = false;
    // The same for this attempt's approval request, which may end without a hash.
    let approvalRequested = false;
    void (async () => {
      let stage: 'approval' | 'payment' = approval?.required === true && granted === undefined ? 'approval' : 'payment';
      try {
        const rt = await runtime();
        guard();
        // Final validity gate before any wallet request (the initial approval included), rechecked after wallet awaits.
        // Not part of `guard`: after a broadcast approval the allowance is kept and only the payment is refused.
        const preSignGuard = (): void => {
          guard();
          assertInvoiceStillPayable(ctx.review.invoice, rt.nowSeconds());
          assertPreparedBufferFresh(built, rt.nowSeconds());
        };
        preSignGuard();
        // A handed-off checkout keeps its context when other settings are saved. Before the wallet is asked again, the
        // contracts are read back through the RPC saved now; without one, or on a failed check, nothing is asked.
        if (reviewedSettings.current !== app.settings) {
          const checked = manifest === undefined ? undefined : await verifyManifestForFlow(manifest, rt.rpc);
          if (checked?.status !== 'loaded') throw new UserFacingError(checked?.status === 'invalid' ? checked.reason : { key: 'pay.error.noManifest' });
          preSignGuard();
        }
        if (approval?.required === true && actualAllowance === undefined) {
          await assertNoPaymentAttempt(invoice);
          preSignGuard();
          actualAllowance = await grantApproval(wallet, ctx, approval, rt, scopedStatus, preSignGuard, (hash) => {
            approvalBroadcastHash = hash;
            if (isCurrent()) setApprovalHash(hash);
          }, () => {
            approvalRequested = true;
            walletAsked.current = true;
          });
          // Preserve the confirmed allowance before checking whether this flow is still current.
          if (isCurrent()) setGranted(actualAllowance);
          guard();
        }
        stage = 'payment';
        const res = await sendPayment(wallet, ctx, built, rt, scopedStatus, guard, () => {
          paymentWalletRequested = true;
          requestedThisAttempt = true;
          walletAsked.current = true;
          // Synchronous: a wallet event in the same tick must still see that this public invoice reached the wallet.
          if (!privateCheckout(parsed)) walletRequestedFor.current = invoice;
          if (isCurrent()) setPaymentMayHaveBeenSent(true);
        });
        if (!isCurrent()) return;
        setResult(res);
        setResultForContext(ctx);
        setPhase('done');
        setStatus('');
        // Delivery to an embedding page cannot reverse a returned submission or re-enable the send controls.
        try { notifyEmbedDone({ status: 'submitted', chainId: ctx.review.invoice.chainId, txHash: res.hash }); }
        catch { /* The exact hash and verification result remain visible and available for export here. */ }
        announce({ key: 'pay.announce.submitted' });
      } catch (e) {
        if (!isCurrent()) return;
        setStatus('');
        if (e instanceof PostBroadcastError) {
          // A broadcast that failed follow-up checks must never be offered again as though nothing was sent.
          setBroadcast(e.hash);
          setBroadcastKind(stage);
          setError(captureUserMessage(e));
          setPhase('submitted');
          announce({ key: stage === 'approval' ? 'pay.announce.approvalUnverified' : 'pay.announce.paymentUnverified' });
          return;
        }
        let earlierRequest = paymentWalletRequested;
        try { earlierRequest ||= paymentAttemptRecorded(invoice); } catch { /* The original storage error is shown below. */ }
        // Refused, or failed across a connection loss, before this payer's wallet was asked for anything: the chain is
        // checked again before another try.
        if ((isOfflineRefusal(e) || connection.lost()) && !approvalRequested && !earlierRequest && actualAllowance === undefined && approvalBroadcastHash === undefined) {
          returnToReview();
          return;
        }
        if (actualAllowance !== undefined) {
          const outcome = approvedPaymentOutcome(e, earlierRequest, approvalBroadcastHash as Hex | undefined);
          setError(outcome.message);
          announce({ key: earlierRequest ? 'transaction.approved.announceUnknown' : 'transaction.approved.announceNotSent' });
        } else if (earlierRequest && !requestedThisAttempt && !(e instanceof TransactionOutcomeError)) {
          setError(refusedAfterEarlierRequest(e));
        } else {
          setError(captureUserMessage(e));
        }
        setPhase('prepared');
      }
    })();
  };

  const onRevoke = (): void => {
    if (wallet === undefined || ctx === undefined || approval === undefined || parsed === undefined || ctx.review.invoice !== parsed.invoice) return;
    const revision = flowRevision.current;
    let privacyScope;
    try { privacyScope = walletPrivacy.capture(); } catch { return; }
    const sessionGuard = privacyScope.assertCurrent;
    const invoice = parsed.invoice;
    const isCurrent = (): boolean => viewMatches(privacyScope) && flowRevision.current === revision && latest.current.parsed?.invoice === invoice && latest.current.ctx?.review.invoice === invoice;
    const scopedStatus = (message: string, outcome?: TransactionOutcome): void => { if (isCurrent()) setStatus(outcome?.message ?? message); };
    const connection = captureConnection();
    setError(undefined);
    setPhase('busy');
    void (async () => {
      try {
        const rt = await runtime();
        if (!isCurrent()) return;
        // Runs before the wallet is asked, so a connection loss during the review refuses the revocation.
        await revokeApproval(wallet, ctx, approval, rt, scopedStatus, () => {
          connection.assert();
          sessionGuard();
          assertSameSettings();
          if (!isCurrent()) throw new Error('The invoice changed. Review it again before continuing.');
        });
        if (!isCurrent()) return;
        setGranted(undefined);
        setApprovalHash(undefined);
        setApproval({ ...approval, have: 0n, required: true });
        announce({ key: 'pay.announce.revoked' });
      } catch (e) {
        if (!isCurrent()) return;
        setError(captureUserMessage(e));
      } finally {
        if (isCurrent()) {
          setStatus('');
          setPhase('prepared');
        }
      }
    })();
  };

  const forget = (): void => {
    resetInvoiceQr();
    setShowWalletChangeNotice(false);
    setRequestedInvoice(undefined);
    walletRequestedFor.current = undefined;
    terminalFor.current = undefined;
    flowRevision.current += 1;
    receiptImportRevision.current += 1;
    scheduler.current?.cancel();
    app.setFragment(undefined);
    setParsed(undefined);
    setBuilt(undefined);
    setBuiltFor(undefined);
    setBuiltForContext(undefined);
    setResultForContext(undefined);
    setWallet(undefined);
    setResult(undefined);
    setPaymentMayHaveBeenSent(false);
    setBroadcast(undefined);
    setBroadcastKind('payment');
    setApproval(undefined);
    setGranted(undefined);
    setApprovalHash(undefined);
    setUseBuffer(false);
    setBufferQuote(undefined);
    setPhase('input');
  };

  const destinationReview = built === undefined ? undefined : destinationReviews.current.get(built);

  /* ------------------------------- rendering ------------------------------- */

  const walletChangeNotice = showWalletChangeNotice && <Notice kind="error">{t('error.wallet.theWalletAccountNetworkOrProviderChangedReconnectAndReview')}</Notice>;
  const buildRejection = parsed !== undefined && !supportsInvoice(parsed.invoice, supportedOnly) ? SUPPORTED_INVOICE_ERROR : undefined;
  const inputRejection = buildRejection ?? rejected;
  if (parsed === undefined || review === undefined || buildRejection !== undefined) {
    return (
      <section aria-labelledby="pay-h">
        <h2 id="pay-h">{t('pay.title.input')}</h2>
        <WalletAttempts wallet={wallet} getRpc={app.getRpc} />
        {walletChangeNotice}
        {inputRejection !== undefined && <Notice kind="error" title={t('pay.rejected.title')}>{displayMessage(inputRejection, t)}{` ${inputRejection === SUPPORTED_INVOICE_ERROR ? t('pay.rejected.controlsUnavailable') : t('pay.rejected.nothingSent')}`}</Notice>}
        {fragment !== undefined && inputRejection === undefined && <p role="status">{t('pay.reading')}</p>}
        {needsPassphrase && (
          <form onSubmit={onUnlock} className="stack">
            <Notice kind="warn" title={t('pay.passphrase.title')}>
              {t('pay.passphrase.body')}
            </Notice>
            <Field label={t('pay.passphrase.label')}>
              {(id, describedBy) => <input aria-describedby={describedBy} id={id} type="password" autoComplete="off" value={invoicePassphrase} onChange={(e) => { setInvoicePassphrase(e.target.value); }} />}
            </Field>
            <button type="submit" className="btn btn-primary" disabled={unlocking || invoicePassphrase === ''}>{unlocking ? t('pay.passphrase.opening') : t('pay.passphrase.open')}</button>
          </form>
        )}
        <details ref={invoiceQrDisclosure} onToggle={(event) => { if (!event.currentTarget.open) invalidateInvoiceQr(); }}>
          <summary>{t('requestFile.summary')}</summary>
          <p>{t('pay.scan.intro')}</p>
          <PaymentRequestFileInput key={invoiceQrReset} scopeKey={invoiceQrScope} supersededEpoch={invoiceFileEpoch} onInputChange={(reason) => (reason === 'select' ? beginInvoiceFile() : invalidateInvoiceQr())} onText={(text, signal) => importInvoiceQr(text, signal, 'file')} />
          <CameraImporter key={`${invoiceQrReset}:${invoiceCameraReset}`} multipart label={t('pay.scan.importLabel')} scopeKey={invoiceQrScope} onInputChange={invalidateFromCamera} onText={importInvoiceQr} />
          <button type="button" className="btn" onClick={resetInvoiceQr}>{t('requestFile.clear')}</button>
          {invoiceQrError !== undefined && <Notice kind="error" title={t(invoiceQrError.source === 'file' ? 'requestFile.rejected' : 'pay.scan.rejected')}>{displayMessage(invoiceQrError.message, t)}</Notice>}
          {invoiceQrPreview !== undefined && (
            <section aria-label={t(invoiceQrPreview.source === 'file' ? 'requestFile.reviewAria' : 'pay.scan.reviewAria')}>
              <h3>{t(invoiceQrPreview.source === 'file' ? 'requestFile.reviewHeading' : 'pay.scan.reviewHeading')}</h3>
              {invoiceQrPreview.result.status === 'needsPassphrase'
                ? <p>{t('pay.scan.needsPassphrase')}</p>
                : <p>{invoiceQrPreview.result.parsed.verification.signatureValid ? t('pay.scan.chainValid', { chain: String(invoiceQrPreview.result.parsed.invoice.chainId) }) : t('pay.scan.chainInvalid', { chain: String(invoiceQrPreview.result.parsed.invoice.chainId) })}</p>}
              <p>{t('pay.scan.openNote')}</p>
              <button type="button" className="btn" onClick={openInvoiceQr}>{t(invoiceQrPreview.source === 'file' ? 'requestFile.open' : 'pay.scan.open')}</button>
            </section>
          )}
        </details>
        <form onSubmit={onPasteSubmit} className="stack">
          <div className="field">
            <label htmlFor="paste">{needsPassphrase ? t('pay.paste.labelAlt') : t('pay.paste.label')}</label>
            <textarea id="paste" dir="ltr" rows={3} value={paste} onChange={(e) => { setPaste(e.target.value); }} spellCheck={false} />
            <p className="hint">{t('pay.paste.hintLocal')}</p>
            <p className="hint">
              {t('pay.paste.hintHistory')}
            </p>
          </div>
          <button type="submit" className="btn btn-primary">{t('pay.read')}</button>
        </form>
      </section>
    );
  }

  const inv = parsed.invoice;
  // Pins only label the signer, never block. An invoice held open (see heldPins) is not opened again for newer pins, so
  // its label follows the pins saved now.
  const signer = trustView(parsed, app.settings.pinnedSigners);
  // A blocked invoice (expired, say) gets no chain check that would replace the offline notice once the browser is back.
  const staleOffline = online && review.blockers.length > 0 && typeof ctxError === 'object' && ctxError.key === 'pay.offlineCheck';
  const warnings = walletWarnings(wallets ?? [], t);
  const ready = phase === 'ready' || phase === 'prepared' || phase === 'busy' || phase === 'submitted' || phase === 'done';
  const alreadyRequested = requestedInvoice === parsed.invoice;
  const decimals = token?.decimals ?? 18;
  const symbol = token?.symbol ?? '';
  // L2-F4: a fixed token amount is what the payer pays; the fiat total is then only the seller's unchecked statement.
  // B2-R3: a token off the allowlist has no known decimals or symbol, so its amount stays in base units, with its address.
  const fixedAmount = inv.amountPolicy.mode !== 'fixed_token'
    ? undefined
    : token === undefined
      ? t('pay.fixed.unknownToken', { amount: inv.amountPolicy.tokenAmount, token: inv.token })
      : `${formatUnits(BigInt(inv.amountPolicy.tokenAmount), token.decimals)} ${token.symbol}`;

  return (
    <section aria-labelledby="pay-h">
      <h2 id="pay-h">{t('pay.title.review')}</h2>
      <WalletAttempts wallet={wallet} getRpc={app.getRpc} />
      {walletChangeNotice}

      <Notice kind={signer.kind === 'invalid-signature' ? 'error' : signer.kind === 'trusted-seller' ? 'ok' : 'warn'} title={t('pay.signature')}>
        {displayMessage(signer.message, t)}
      </Notice>
      {review.blockers.filter((b) => b !== review.trust.text).length > 0 && (
        <Notice kind="error" title={t('pay.cannotProceed')}>
          <ul>
            {review.blockerMessages.filter((b) => b.key !== review.trust.message.key).map((b) => (
              <li key={b.key}>{displayMessage(b, t)}</li>
            ))}
          </ul>
        </Notice>
      )}
      {ctxError !== undefined && !staleOffline && (
        <Notice kind="error">
          {displayMessage(ctxError, t)}{' '}
          {online && phase === 'review' && review.blockers.length === 0 &&
            <button type="button" className="btn" onClick={() => { void refreshContext(); }}>{t('pay.retryCheck')}</button>}
        </Notice>
      )}
      {review.warnings.length > 0 && (
        <Notice kind="warn" title={t('pay.checkAmount')}>
          {review.warningMessages.map((w) => <p key={w.key}>{displayMessage(w, t)}</p>)}
        </Notice>
      )}

      <dl className="details">
        <dt>{t('pay.chain')}</dt>
        <dd>{review.chain?.name ?? t('pay.chain.unknown', { chain: String(inv.chainId) })}</dd>
        <dt>{t('pay.token')}</dt>
        <dd>
          {symbol} {inv.token === 'native' ? t('pay.token.nativeNote') : <Mono>{inv.token}</Mono>}
        </dd>
        <dt>{t('pay.invoiceTotal')}</dt>
        <dd>{fixedAmount === undefined ? formatFiat(BigInt(inv.fiat.minorUnits), inv.fiat.currency) : <><strong>{fixedAmount}</strong>{` ${t('pay.fixedTokenAmount')}`}</>}</dd>
        {fixedAmount !== undefined && (
          <>
            <dt>{t('pay.fiatStated')}</dt>
            <dd>{formatFiat(BigInt(inv.fiat.minorUnits), inv.fiat.currency)}{` ${t('pay.fiatNotChecked')}`}</dd>
          </>
        )}
        <dt>{t('pay.pricing')}</dt>
        <dd>
          {fixedAmount !== undefined
            ? t('pay.pricing.fixed', { amount: fixedAmount })
            : t('pay.pricing.quote', { source: inv.quote.source, taken: formatUnix(inv.quote.timestamp), until: formatUnix(inv.quote.expiresAt), slippage: String(inv.quote.maxSlippageBps / 100) })}
        </dd>
        <dt>{t('pay.feePayer')}</dt>
        <dd>{inv.feePolicy === 'payer_pays' ? t('pay.feePayer.payer') : t('pay.feePayer.seller')}</dd>
        <dt>{t('pay.expires')}</dt>
        <dd>{formatUnix(inv.expiresAt)}</dd>
        <dt>{t('pay.sellerMeta')}</dt>
        <dd><Mono>{shortHex(inv.metaAddress, 18, 8)}</Mono></dd>
        <dt>{t('pay.sellerFingerprint')}</dt>
        <dd><Mono>{payeeFingerprint(inv.metaAddress)}</Mono>{` ${t('pay.sellerFingerprintNote')}`}</dd>
        <dt>{t('pay.privatePart')}</dt>
        <dd>{parsed.passphraseProtected ? t('pay.privatePart.passphrase') : parsed.encrypted ? t('pay.privatePart.key') : t('pay.privatePart.plain')}</dd>
      </dl>

      {inv.lineItems.length > 0 && (
        <div className="table-wrap" role="region" aria-label={t('pay.lineItems')} tabIndex={0}>
          <table>
            <caption>{t('pay.lineItems')}</caption>
            <thead>
              <tr><th scope="col">{t('pay.col.description')}</th><th scope="col">{t('pay.col.qty')}</th><th scope="col">{t('pay.col.unit')}</th></tr>
            </thead>
            <tbody>
              {inv.lineItems.map((li, i) => (
                <tr key={i}>
                  <td className="wrap">{safeText(li.description).text}</td>
                  <td>{li.quantity}</td>
                  <td>{formatFiat(BigInt(li.unitMinorUnits), inv.fiat.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{t('pay.tax', { rate: String(inv.tax.rateBps / 100), amount: formatFiat(BigInt(inv.tax.minorUnits), inv.fiat.currency) })}</p>
        </div>
      )}
      {inv.memo !== undefined && (
        <p className="wrap">
          <strong>{t('pay.memo.label')}</strong> {safeText(inv.memo).text}{safeText(inv.memo).flagged ? ` ${t('pay.memo.flagged')}` : ''}
        </p>
      )}

      <PrintBillButton
        invoice={inv}
        link={fragment === undefined || fragment === '' ? undefined : `${services.baseUrl()}${fragment}`}
        passphraseProtected={parsed.passphraseProtected}
        chainName={review.chain?.name ?? t('pay.chain.unknown', { chain: String(inv.chainId) })}
        tokenLabel={inv.token === 'native' ? (symbol === '' ? t('pay.nativeCoinTitle') : symbol) : symbol === '' ? inv.token : symbol}
        fixedAmount={fixedAmount}
      />

      {ctx !== undefined && (
        <dl className="details amounts">
          <dt>{t('pay.gross')}</dt>
          <dd>{formatUnits(ctx.request.grossAmount, decimals)} {symbol}</dd>
          <dt>{t('pay.checkoutFee')}</dt>
          <dd>{formatUnits(ctx.request.feeAmount, decimals)} {symbol}</dd>
          <dt>{t('pay.netReceives')}</dt>
          <dd>{formatUnits(ctx.request.netAmount, decimals)} {symbol}</dd>
          <dt>{t('pay.router')}</dt>
          <dd><Mono>{ctx.manifest.router}</Mono></dd>
          <dt>{t('pay.feeRecipient')}</dt>
          <dd><Mono>{ctx.manifest.feeRecipient}</Mono></dd>
          <dt>{t('pay.destination')}</dt>
          <dd>{t('pay.destinationNote')}</dd>
        </dl>
      )}
      {ctx !== undefined && (
        <section className="panel" aria-labelledby="seller-receipt-h">
          <h3 id="seller-receipt-h">{t('pay.receipt.heading')}</h3>
          <p className="hint">
            {t('pay.receipt.intro')}
          </p>
          <p className="hint">{t('pay.receipt.privacy')}</p>
          <label><input type="checkbox" checked={receiptConsent} onChange={(event) => {
            setReceiptConsent(event.target.checked);
            receiptImportRevision.current += 1;
            receiptBusyRef.current = false;
            setReceiptBusy(false);
            setBoundReceipt(undefined);
            setReceiptError(undefined);
          }} /> {t('pay.receipt.consent')}</label>
          <form className="stack" onSubmit={onImportReceipt}>
            <Field label={t('pay.receipt.fileLabel')} help={{ label: t('help.about', { control: t('pay.receipt.fileLabel') }), text: t('help.receiptFile') }}>
              {(id, describedBy) => <input key={receiptFileGeneration} aria-describedby={describedBy} id={id} type="file" accept="application/json,.json" />}
            </Field>
            <Field label={t('pay.receipt.keyLabel')} hint={t('pay.receipt.keyHint')}>
              {(id, describedBy) => <input aria-describedby={describedBy} id={id} className="mono" type="text" autoComplete="off" spellCheck={false} value={receiptTrustedKey} onChange={(event) => { setReceiptTrustedKey(event.target.value); setBoundReceipt(undefined); setReceiptError(undefined); }} placeholder="02… or 03…" />}
            </Field>
            <button type="submit" className="btn" disabled={receiptBusy || ctx === undefined}>{receiptBusy ? t('pay.receipt.checking') : t('pay.receipt.check')}</button>
          </form>
          <CameraImporter
            key={fragment ?? ''}
            label={t('pay.receipt.scanLabel')}
            active={receiptConsent && ctx !== undefined}
            scopeKey={receiptScope}
            onInputChange={() => {
              receiptImportRevision.current += 1;
              receiptBusyRef.current = false;
              setReceiptBusy(false);
              setBoundReceipt(undefined);
              setReceiptError(undefined);
            }}
            onText={(text, signal) => importReceiptText(() => Promise.resolve(text), undefined, signal)}
          />
          {receiptError !== undefined && <Notice kind="error" title={t('pay.receipt.rejected')}>{displayMessage(receiptError, t)}</Notice>}
          {boundReceipt !== undefined && (
            <Notice kind="ok" title={t('pay.receipt.matches')}>
              {boundReceipt.signerMatch === 'invoice-signing-key' ? t('pay.receipt.matchInvoiceKey') : t('pay.receipt.matchTrustedKey')}
            </Notice>
          )}
        </section>
      )}
      <ManifestBanner manifest={manifest} />
      <FeeDisclosure manifest={manifest} chainName={review.chain?.name} />
      <Notice kind="info" title={t('pay.public.title')}>
        {t('pay.public.body')}
      </Notice>

      {phase === 'review' && (
        <fieldset className="options">
          <legend>{t('pay.options')}</legend>
          <div className="check">
            <input id="delay" type="checkbox" checked={useDelay} onChange={(e) => { setUseDelay(e.target.checked); }} />
            <label htmlFor="delay">
              {t('pay.delay.label', { min: String(Math.round(app.settings.delayMinSec / 60)), max: String(Math.round(app.settings.delayMaxSec / 60)) })}
            </label>
          </div>
          <p className="hint">{t('pay.delay.hint')}</p>
          {isErc20 && parsed !== undefined && !bufferOffered(parsed.invoice) && (
            <p className="hint">{t('pay.buffer.notAccepted')}</p>
          )}
          {isErc20 && parsed !== undefined && bufferOffered(parsed.invoice) && (
            <>
              <div className="check">
                <input
                  id="buf"
                  type="checkbox"
                  checked={useBuffer}
                  onChange={(e) => {
                    setUseBuffer(e.target.checked);
                    setBufferQuote(undefined);
                    if (e.target.checked) void refreshBuffer();
                  }}
                />
                <label htmlFor="buf">{t('pay.buffer.label')}</label>
              </div>
              {useBuffer && (
                <Notice kind="warn" title={t('pay.buffer.title')}>
                  {bufferQuote === undefined ? t('pay.buffer.estimating') : t('pay.buffer.estimate', { amount: formatUnits(bufferQuote.bufferWei, 18), native: review.chain?.nativeSymbol ?? t('pay.nativeCoin'), symbol, gas: String(bufferQuote.gasLimit), source: bufferQuote.gasSource === 'simulated' ? 'simulated' : 'default', fee: String(bufferQuote.maxFeePerGas), raised: bufferQuote.raisedToSellerMinimum === true ? 'yes' : 'no' })}
                </Notice>
              )}
            </>
          )}
        </fieldset>
      )}

      {phase === 'waiting' && schedule !== undefined && (
        <div className="panel" role="status">
          <p>
            <strong>{t('pay.waiting.notice')}</strong>
          </p>
          <p>{t('pay.waiting.left', { time: formatCountdown(schedule.remainingMs) })}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => { scheduler.current?.sendNow(); }}>{t('pay.sendNow')}</button>
            <button type="button" className="btn btn-danger" onClick={() => { scheduler.current?.cancel(); }}>{t('pay.cancel')}</button>
          </div>
        </div>
      )}

      {alreadyRequested && <Notice kind="warn" title={t('pay.alreadyRequested.title')}>{t('pay.alreadyRequested.body')}</Notice>}

      {ready && phase !== 'done' && phase !== 'submitted' && !alreadyRequested && (
        <div className="panel">
          <h3>{t('pay.wallet')}</h3>
          {wallet === undefined ? (
            <>
              {wallets === undefined && <p>{t('pay.lookingWallets')}</p>}
              {wallets?.length === 0 && <Notice kind="warn">{t('pay.noWallet')}</Notice>}
              <ul className="plain-list">
                {wallets?.map((w) => (
                  <li key={w.id}>
                    <button type="button" className="btn" disabled={!online} onClick={() => { onConnect(w); }}>
                      {w.icon !== undefined && <img src={w.icon} alt="" width={20} height={20} />} {t('pay.connect', { name: w.name })}
                      {w.rdns !== undefined && <span className="hint"> ({w.rdns})</span>}
                    </button>
                    {warnings.get(w.id)?.map((message) => (
                      <p key={message} className="hint" role="note">⚠ {message}</p>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {rich('pay.connected', { wallet: wallet.wallet.name, account: wallet.account, chain: String(wallet.chainId) }, monoTag('account'))}
            </p>
          )}
          {wallet !== undefined && built === undefined && (
            <button type="button" className="btn btn-primary" onClick={onPrepare} disabled={!online || phase === 'busy' || ctx === undefined}>
              {t('pay.prepare')}
            </button>
          )}
        </div>
      )}

      {built !== undefined && builtFor === parsed.invoice && builtForContext === ctx && phase !== 'done' && phase !== 'submitted' && ctx !== undefined && (
        <FinalPreview notice={walletChanged ? 'wallet-changed' : destinationReview?.session === app.session ? destinationReview?.notice : undefined} built={built} ctx={ctx} onSend={onSend} busy={!online || phase === 'busy'} approval={approval} granted={granted} approvalHash={approvalHash} onRevoke={onRevoke} />
      )}

      {status !== '' && <TransactionStatusLine status={status} />}
      {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}

      {phase === 'submitted' && broadcast !== undefined && (
        <div className="panel">
          <h3>{broadcastKind === 'approval' ? t('pay.sent.approvalTitle') : t('pay.sent.paymentTitle')}</h3>
          <p>{rich('pay.sent.body', { kind: broadcastKind, hash: broadcast }, monoTag('hash'))}</p>
          <div className="actions">
            <CopyButton text={broadcast} label={t('pay.copyHash')} />
          </div>
        </div>
      )}

      {phase === 'done' && result !== undefined && ctx !== undefined && built !== undefined && (
        <div className="panel">
          <h3>{t('pay.done.heading')}</h3>
          <p>{rich('pay.done.hash', { hash: result.hash }, monoTag('hash'))}</p>
          <p>
            {result.verification === 'verified' && t('pay.verify.verified')}
            {result.verification === 'not-visible-yet' && t('pay.verify.notVisible')}
            {result.verification === 'unverified' && t('pay.verify.unverified')}
            {result.verification === 'no-rpc' && t('pay.verify.noRpc')}
          </p>
          <p>
            {result.receipt === undefined
              ? t('pay.status.pending')
              : result.verification !== 'verified'
                ? t('pay.status.unverified', { block: result.receipt.blockNumber.toString() })
                : result.receipt.status === 'success'
                  ? t('pay.status.included', { block: result.receipt.blockNumber.toString() })
                  : t('pay.status.reverted')}
          </p>
          <div className="actions">
            <CopyButton text={result.hash} label={t('pay.copyHash')} />
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm(t('pay.receipt.download.confirm'))) {
                  downloadText('ghostpay-receipt.json', JSON.stringify(proofReceipt, null, 2), 'application/json');
                }
              }}
            >
              {t('pay.receipt.download')}
            </button>
          </div>
          {proofReceipt !== undefined && <PaymentProofQr receipt={proofReceipt} sourceIdentity={proofSource} />}
        </div>
      )}

      <div className="actions">
        {phase === 'review' && (
          <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!online || review.blockers.length > 0 || ctx === undefined}>
            {useDelay ? t('pay.startDelay') : t('pay.continue')}
          </button>
        )}
        {phase !== 'done' && phase !== 'submitted' && (
          <button type="button" className="btn" onClick={forget}>{t('pay.forget')}</button>
        )}
        {!app.settings.autoClearFragment && (
          <button type="button" className="btn" onClick={() => { clearFragment(location, history); }}>
            {t('pay.removeLink')}
          </button>
        )}
      </div>
    </section>
  );
}

function FinalPreview(props: {
  readonly notice: DestinationNotice | 'wallet-changed' | undefined;
  readonly built: BuiltPayment;
  readonly ctx: PayContext;
  readonly onSend: () => void;
  readonly busy: boolean;
  readonly approval: ApprovalPlan | undefined;
  readonly approvalHash: string | undefined;
  readonly granted: bigint | undefined;
  readonly onRevoke: () => void;
}): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const trParts = i18n?.parts ?? SOURCE_TRANSLATOR.parts;
  const { built, ctx } = props;
  const p = built.preview;
  const decoded = decodeForDisplay(built, ctx.chain.chainId);
  const tk = ctx.review.token;
  const dec = tk?.decimals ?? 18;
  const sym = tk?.symbol ?? '';
  return (
    <div className="panel" aria-labelledby="final-h">
      <h3 id="final-h">{t('pay.final.heading')}</h3>
      <p>{t('pay.final.intro')}</p>
      <DestinationReuseNotice notice={props.notice} />
      <dl className="details">
        <dt>{t('pay.final.method')}</dt>
        <dd>{decoded.method}</dd>
        <dt>{t('pay.final.contract')}</dt>
        <dd><Mono>{built.tx.to}</Mono></dd>
        <dt>{t('pay.final.destination')}</dt>
        <dd><Mono>{decoded.stealth}</Mono></dd>
        <dt>{t('pay.final.gross')}</dt>
        <dd>{formatUnits(decoded.gross, dec)} {sym}</dd>
        <dt>{t('pay.final.fee')}</dt>
        <dd>{t('pay.final.feeLine', { amount: formatUnits(decoded.fee, dec), symbol: sym, recipient: ctx.manifest.feeRecipient })}</dd>
        <dt>{t('pay.final.net')}</dt>
        <dd>{t('pay.final.netLine', { amount: formatUnits(decoded.net, dec), symbol: sym, min: formatUnits(decoded.minNet, dec) })}</dd>
        <dt>{t('pay.final.native')}</dt>
        <dd>{formatUnits(built.tx.value, 18)} {ctx.chain.nativeSymbol}{p.method === 'payERC20WithBuffer' ? ` ${t('pay.final.bufferNote')}` : ''}</dd>
        <dt>{t('pay.final.deadline')}</dt>
        <dd>{formatUnix(Number(p.deadline))}</dd>
      </dl>
      {props.approval !== undefined && (
        <div className="notice notice-warn" role="note">
          <strong className="notice-title">{props.granted !== undefined ? t('pay.approval.confirmedTitle') : props.approval.required ? t('pay.approval.neededTitle') : t('pay.approval.presentTitle')}</strong>
          <dl className="details">
            <dt>{t('pay.approval.spender')}</dt>
            <dd><Mono>{props.approval.spender}</Mono></dd>
            <dt>{t('pay.approval.before')}</dt>
            <dd>{formatUnits(props.approval.have, dec)} {sym}</dd>
            <dt>{props.approval.required ? t('pay.approval.exact') : t('pay.approval.needed')}</dt>
            <dd>{formatUnits(props.approval.need, dec)} {sym}</dd>
          </dl>
          {props.granted !== undefined ? (
            <p>{props.approvalHash === undefined ? t('pay.approval.confirmed') : renderParts(trParts('pay.approval.confirmedHash', { hash: props.approvalHash }), monoTag('hash'))}</p>
          ) : props.approval.required ? (
            <p>{t('pay.approval.explain')}</p>
          ) : (
            <p>{t('pay.approval.enough')}</p>
          )}
          {props.granted !== undefined && props.granted > props.approval.need && (
            <div>
              <p role="alert">{t('pay.approval.excessAlert')}</p>
              <p>{renderParts(trParts('pay.approval.excess', { granted: formatUnits(props.granted, dec), symbol: sym, need: formatUnits(props.approval.need, dec) }), { b: (c) => <strong>{c}</strong> })}</p>
            </div>
          )}
          {props.granted !== undefined && (
            <p>{t('pay.approval.now', { granted: formatUnits(props.granted, dec), symbol: sym })} <button type="button" className="btn" onClick={props.onRevoke} disabled={props.busy}>{t('pay.approval.revoke')}</button></p>
          )}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={props.onSend} disabled={props.busy}>
        {props.approval?.required === true && props.granted === undefined ? t('pay.final.sendApprove') : t('pay.final.send')}
      </button>
    </div>
  );
}

// i18n-use: error.pay.aGasBufferNeedsAnRPCForThisChainTo help.about help.receiptFile pay.announce.approvalUnverified pay.announce.cancelled pay.announce.connected pay.announce.delayDone pay.announce.paymentUnverified pay.announce.prepared pay.announce.previous pay.announce.revoked pay.announce.scheduled pay.announce.submitted pay.approval.before pay.approval.confirmed pay.approval.confirmedHash pay.approval.confirmedTitle pay.approval.enough pay.approval.exact pay.approval.excess pay.approval.explain pay.approval.needed pay.approval.neededTitle pay.approval.now pay.approval.presentTitle pay.approval.revoke pay.approval.spender pay.buffer.estimate pay.buffer.estimating pay.buffer.label pay.buffer.notAccepted pay.buffer.title pay.cancel pay.cannotProceed pay.chain pay.chain.unknown pay.checkAmount pay.checkoutFee pay.col.description pay.col.qty pay.col.unit pay.connect pay.connected pay.continue pay.copyHash pay.delay.hint pay.delay.label pay.destination pay.destinationNote pay.done.hash pay.done.heading pay.error.expiredWaiting pay.error.invoiceLink pay.error.invoiceQrLink pay.error.invoiceQrOtherFamily pay.error.noManifest pay.error.receiptConsent pay.error.receiptTooLarge pay.error.receiptUpdating pay.error.reviewChanged pay.error.sellerKeysChanged pay.error.supportedInvoice pay.expires pay.feePayer pay.feePayer.payer pay.feePayer.seller pay.feeRecipient pay.fiatNotChecked pay.fiatStated pay.final.bufferNote pay.final.contract pay.final.deadline pay.final.destination pay.final.fee pay.final.feeLine pay.final.gross pay.final.heading pay.final.intro pay.final.method pay.final.native pay.final.net pay.final.netLine pay.final.send pay.final.sendApprove pay.fixed.unknownToken pay.fixedTokenAmount pay.forget pay.gross pay.invoiceTotal pay.lineItems pay.lookingWallets pay.memo.flagged pay.memo.label pay.nativeCoin pay.nativeCoinTitle pay.netReceives pay.noWallet pay.options pay.passphrase.body pay.passphrase.label pay.passphrase.open pay.passphrase.opening pay.passphrase.title pay.paste.hintHistory pay.paste.hintLocal pay.paste.label pay.paste.labelAlt pay.prepare pay.previous.body pay.previous.title pay.pricing pay.pricing.fixed pay.pricing.quote pay.privatePart pay.privatePart.key pay.privatePart.passphrase pay.privatePart.plain pay.public.body pay.public.title pay.read pay.reading pay.receipt.check pay.receipt.checking pay.receipt.consent pay.receipt.download pay.receipt.download.confirm pay.receipt.fileLabel pay.receipt.heading pay.receipt.intro pay.receipt.keyHint pay.receipt.keyLabel pay.receipt.matchInvoiceKey pay.receipt.matchTrustedKey pay.receipt.matches pay.receipt.privacy pay.receipt.rejected pay.receipt.scanLabel pay.rejected.controlsUnavailable pay.rejected.nothingSent pay.rejected.title pay.removeLink pay.router pay.scan.chainInvalid pay.scan.chainValid pay.scan.importLabel pay.scan.intro pay.scan.needsPassphrase pay.scan.open pay.scan.openNote pay.scan.rejected pay.scan.reviewAria pay.scan.reviewHeading pay.sellerFingerprint pay.sellerFingerprintNote pay.sellerMeta pay.sendNow pay.sent.approvalTitle pay.sent.body pay.sent.paymentTitle pay.signature pay.startDelay pay.status.included pay.status.pending pay.status.permitUnsupported pay.status.reverted pay.status.unverified pay.status.walletWaiting pay.tax pay.title.input pay.title.review pay.token pay.token.nativeNote pay.verify.noRpc pay.verify.notVisible pay.verify.unverified pay.verify.verified pay.waiting.left pay.waiting.notice pay.wallet transaction.approved.announceNotSent transaction.approved.announceUnknown
