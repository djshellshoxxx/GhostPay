import { FRAGMENT_PREFIX, MAX_DECODED_BYTES, invoiceDigest, openFragment, type OpenFragmentResult, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BuiltPayment } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { CameraImporter } from '../components/CameraImporter';
import { WalletAttempts } from '../components/WalletAttempts';
import { FeeDisclosure, useManifest } from '../components/Disclosure';
import { ManifestBanner } from '../components/ManifestBanner';
import { extractFragment } from '../lib/fragment';
import { safeText, payeeFingerprint } from '../lib/displayText';
import { formatCountdown, formatFiat, formatUnits, formatUnix, shortHex } from '../lib/format';
import { UserFacingError, userMessage, displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
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
  type BufferQuote,
  type SweepSimulation,
  type PayContext,
} from '../lib/pay';
import { verifyManifestForFlow } from '../lib/manifest';
import { PaymentProofQr } from '../components/PaymentRequestQr';
import { PrintBillButton } from '../components/PrintableBill';
import { PermitRejectedError, PostBroadcastError, buildReceipt, classifyPayerPermit, grantApproval, planApproval, preparePayment, revokeApproval, sendPayment, type ApprovalPlan, type Runtime, type SubmitResult } from '../lib/payExec';
import { useServices } from '../lib/services';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageValues, Part } from '../i18n/message';
import type { Translator } from '../i18n/translator';
import { connectWallet, walletWarnings, type WalletInfo, type WalletSession } from '../lib/wallet';
import { useApp } from '../state';
import { notifyEmbedDone } from '../lib/embedHost';
import { captureSessionVersionGuard } from '../lib/session';
import { bindReceiptToInvoice, MAX_RECEIPT_JSON_BYTES, parseVerifiedReceipt, type BoundReceipt } from '../lib/receipts';

type TagMap = Readonly<Record<string, (children: ReactNode) => ReactNode>>;

/** Rich catalog text ({#tag}..{/tag}) without Trans, so Pay still renders in isolated English-only tests. */
function renderParts(parts: readonly Part[], tags: TagMap): ReactNode[] {
  return parts.map((p, i) => {
    if (typeof p === 'string') return p;
    const inner = renderParts(p.children, tags);
    const wrap = tags[p.tag];
    return <Fragment key={i}>{wrap === undefined ? inner : wrap(inner)}</Fragment>;
  });
}

// i18n-use: pay.previous.body pay.connected pay.sent.body pay.done.hash pay.approval.confirmedHash pay.approval.excess
const monoTag = (name: string): TagMap => ({ [name]: (c) => <Mono>{c}</Mono> });

type Phase = 'input' | 'review' | 'waiting' | 'ready' | 'prepared' | 'busy' | 'submitted' | 'done';

/** QR links are interpreted locally, never followed. Restrict the URL wrapper before the canonical invoice parser. */
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
interface InvoiceQrPreview {
  readonly fragment: string;
  readonly result: OpenFragmentResult;
  readonly revision: number;
  readonly scope: object;
  readonly assertSession: () => void;
}

const SUPPORTED_INVOICE_ERROR = 'This build supports fixed-amount invoices without a seller buffer policy.';

function supportsInvoice(invoice: ParsedInvoice['invoice'], supportedOnly: boolean): boolean {
  return !supportedOnly || (invoice.v === 1 && invoice.amountPolicy.mode === 'fixed_token');
}

export function Pay({ supportedOnly = false }: { readonly supportedOnly?: boolean } = {}): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const trParts = i18n?.parts ?? SOURCE_TRANSLATOR.parts;
  const rich = (id: Parameters<Translator['parts']>[0], values: MessageValues, tags: TagMap): ReactNode => renderParts(trParts(id, values), tags);
  const app = useApp();
  const services = useServices();
  const [parsed, setParsed] = useState<ParsedInvoice | undefined>(undefined);
  const [rejected, setRejected] = useState<DisplayMessage | undefined>(undefined);
  const [paste, setPaste] = useState('');
  const [invoiceQrPreview, setInvoiceQrPreview] = useState<InvoiceQrPreview | undefined>();
  const [invoiceQrError, setInvoiceQrError] = useState<DisplayMessage | undefined>();
  const [invoiceQrReset, setInvoiceQrReset] = useState(0);
  const invoiceQrRevision = useRef(0);
  const invoiceQrMounted = useRef(true);
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
  const [builtFor, setBuiltFor] = useState<ParsedInvoice['invoice'] | undefined>(undefined);
  const [builtForContext, setBuiltForContext] = useState<PayContext | undefined>(undefined);
  const [resultForContext, setResultForContext] = useState<PayContext | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<DisplayMessage | undefined>(undefined);
  const [result, setResult] = useState<SubmitResult | undefined>(undefined);
  const [boundReceipt, setBoundReceipt] = useState<BoundReceipt | undefined>(undefined);
  const [receiptTrustedKey, setReceiptTrustedKey] = useState('');
  const [receiptError, setReceiptError] = useState<DisplayMessage | undefined>(undefined);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptConsent, setReceiptConsent] = useState(false);
  const receiptBusyRef = useRef(false);
  const receiptImportRevision = useRef(0);
  const [approval, setApproval] = useState<ApprovalPlan | undefined>(undefined);
  const [approvalHash, setApprovalHash] = useState<string | undefined>(undefined);
  const [paymentMayHaveBeenSent, setPaymentMayHaveBeenSent] = useState(false);
  const [granted, setGranted] = useState<bigint | undefined>(undefined);
  /** Set once the wallet broadcast but verification failed: terminal, Send is never offered again. */
  const [broadcast, setBroadcast] = useState<string | undefined>(undefined);
  const [broadcastKind, setBroadcastKind] = useState<'approval' | 'payment'>('payment');
  const [previousBroadcast, setPreviousBroadcast] = useState<{ readonly hash: string; readonly kind: 'approval' | 'payment' } | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const scheduler = useRef<DelayScheduler | undefined>(undefined);
  const flowRevision = useRef(0);

  const fragment = app.fragment;
  const pinned = app.settings.pinnedSigners;
  const invoiceQrScope = useMemo(() => ({ fragment, pinned, session: app.session, reset: invoiceQrReset, supportedOnly }), [fragment, pinned, app.session, invoiceQrReset, supportedOnly]);
  const currentInvoiceQrScope = useRef(invoiceQrScope); currentInvoiceQrScope.current = invoiceQrScope;
  const invalidateInvoiceQr = useCallback((): void => {
    invoiceQrRevision.current += 1;
    setInvoiceQrPreview(undefined);
    setInvoiceQrError(undefined);
  }, []);
  const resetInvoiceQr = useCallback((): void => { invalidateInvoiceQr(); setInvoiceQrReset((value) => value + 1); }, [invalidateInvoiceQr]);
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
    invoiceQrMounted.current = true;
    return () => { invoiceQrMounted.current = false; invoiceQrRevision.current += 1; };
  }, []);

  const importInvoiceQr = async (text: string, signal: AbortSignal): Promise<boolean> => {
    const revision = invoiceQrRevision.current;
    const scope = invoiceQrScope;
    const assertSession = captureSessionVersionGuard();
    const current = (): boolean => {
      if (!invoiceQrIsOpen() || signal.aborted || !invoiceQrMounted.current || invoiceQrRevision.current !== revision || currentInvoiceQrScope.current !== scope) return false;
      try { assertSession(); return true; } catch { return false; }
    };
    if (!current()) return false;
    const candidate = invoiceQrFragment(text, services.baseUrl());
    if (candidate === undefined) {
      setInvoiceQrError('Use an exact GhostPay v1 fragment or an HTTPS invoice link at this app’s host and path, without credentials, port or query.');
      return false;
    }
    try {
      const result = await openFragment(candidate, { pinnedSigners: pinned });
      if (!current()) return false;
      if (result.status === 'ok' && !supportsInvoice(result.parsed.invoice, supportedOnly)) throw new UserFacingError(SUPPORTED_INVOICE_ERROR);
      setInvoiceQrPreview({ fragment: candidate, result, revision, scope, assertSession });
      return true;
    } catch (error) {
      if (current()) setInvoiceQrError(captureUserMessage(error));
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
    setWallet(undefined);
    setStatus('');
    setError(undefined);
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
  const latest = useRef({ parsed, manifest, receiptTrustedKey, ctx, built, builtFor, builtForContext, result, resultForContext, fragment, wallet, settings: app.settings, session: app.session, receiptConsent, supportedOnly });
  latest.current = { parsed, manifest, receiptTrustedKey, ctx, built, builtFor, builtForContext, result, resultForContext, fragment, wallet, settings: app.settings, session: app.session, receiptConsent, supportedOnly };
  const receiptScope = useMemo(() => ({ ctx, session: app.session }), [ctx, app.session]);
  const authorityMatches = (): boolean => latest.current.wallet === wallet && latest.current.settings === app.settings && latest.current.session === app.session && latest.current.supportedOnly === supportedOnly;
  const cancelInvoiceOpening = (expectedFragment: string | undefined, revision: number): void => {
    if (!invoiceQrMounted.current || flowRevision.current !== revision || latest.current.fragment !== expectedFragment) return;
    flowRevision.current += 1;
    app.setFragment(undefined);
    setParsed(undefined);
    setNeedsPassphrase(false);
    setInvoicePassphrase('');
    setUnlocking(false);
    setPhase('input');
    setRejected('Seller keys changed while opening this invoice. Scan or paste it again to review.');
  };

  const assertCurrentInvoice = (revision: number, invoice: ParsedInvoice['invoice']): void => {
    if (!supportsInvoice(invoice, latest.current.supportedOnly)) throw new UserFacingError(SUPPORTED_INVOICE_ERROR);
    if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice || latest.current.ctx?.review.invoice !== invoice) {
      throw new Error('The invoice changed. Review it again before continuing.');
    }
  };
  const refreshContext = useCallback(async (): Promise<PayContext | undefined> => {
    const { parsed: p, manifest: m } = latest.current;
    if (p === undefined || m === undefined || !supportsInvoice(p.invoice, latest.current.supportedOnly)) {
      setCtx(undefined);
      return undefined;
    }
    const current = (): boolean => latest.current.parsed === p && latest.current.manifest === m && supportsInvoice(p.invoice, latest.current.supportedOnly);
    const now = Math.floor(services.nowMs() / 1000);
    const fresh = reviewInvoice(p, now, m);
    if (fresh.blockers.length > 0) {
      setCtx(undefined);
      setTick((n) => n + 1);
      return undefined;
    }
    try {
      const rpc = await app.getRpc(p.invoice.chainId);
      if (!current()) return undefined;
      // WEB-APP-01: read the manifest back from the chain before any payment is built from it.
      const checked = await verifyManifestForFlow(m, rpc);
      if (!current()) return undefined;
      if (checked.status !== 'loaded') {
        setCtx(undefined);
        setCtxError(checked.status === 'invalid' ? checked.reason : 'Payments are disabled on this chain: no deployment manifest is loaded.');
        return undefined;
      }
      const c = await createPayContext(fresh, rpc, { nowSeconds: now });
      if (!current()) return undefined;
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
  const refreshRef = useRef(refreshContext);
  refreshRef.current = refreshContext;
  const reviewKey = review === undefined ? '' : review.blockers.join('|');

  useEffect(() => {
    void refreshContext();
  }, [refreshContext, parsed, manifest, reviewKey]);

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
      setError('A gas buffer needs an RPC for this chain. Configure one in Settings.');
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
      setRejected('That is not a GhostPay v1 invoice link.');
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
      if (!invoiceQrMounted.current || flowRevision.current !== revision || latest.current.fragment !== fragmentAtStart || latest.current.supportedOnly !== supportedOnly) return false;
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
      setReceiptError('Consent is required before opening private receipt details.');
      return Promise.resolve(false);
    }
    const invoiceAtStart = parsed;
    const contextAtStart = ctx;
    const fragmentAtStart = fragment;
    const flowAtStart = flowRevision.current;
    if (latest.current.fragment !== fragmentAtStart || flowRevision.current !== flowAtStart) return Promise.resolve(false);
    if (invoiceAtStart === undefined || contextAtStart === undefined) return Promise.resolve(false);
    if (contextAtStart.review.invoice !== invoiceAtStart.invoice) {
      setReceiptError('Payment details are still updating for this invoice. Try again when they finish loading.');
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
        if (byteLength !== undefined && byteLength > MAX_RECEIPT_JSON_BYTES) throw new Error('Receipt file exceeds 64 KiB.');
        const text = await readText();
        if (text.length > MAX_RECEIPT_JSON_BYTES || new TextEncoder().encode(text).byteLength > MAX_RECEIPT_JSON_BYTES) {
          throw new Error(byteLength === undefined ? 'Receipt QR/text exceeds 64 KiB.' : 'Receipt file exceeds 64 KiB.');
        }
        if (signal?.aborted === true || !latest.current.receiptConsent) return false;
        const receipt = parseVerifiedReceipt(text);
        const current = latest.current;
        if (receiptImportRevision.current !== importRevision || flowRevision.current !== flowAtStart || current.fragment !== fragmentAtStart || current.parsed !== invoiceAtStart) return false;
        if (current.ctx?.review.invoice !== invoiceAtStart.invoice) throw new Error('Payment details are still updating for this invoice. Try again when they finish loading.');
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
    void importReceiptText(() => file.text(), file.size).finally(() => { if (fileInput !== null) fileInput.value = ''; });
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
      app.announce('Scheduled locally. Nothing has been signed or sent.');
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
              setError('The invoice or its price can no longer be paid as reviewed. Check the details again.');
              return;
            }
            setPhase('ready');
            app.announce('Delay complete. Review the updated details and confirm in your wallet.');
          })();
        } else if (snap.status === 'expired') {
          setPhase('review');
          setError('The invoice expired while waiting. Refresh and review again.');
        } else if (snap.status === 'cancelled') {
          setPhase('review');
          app.announce('Cancelled. Nothing was signed or sent.');
        }
      });
    } catch (e) {
      setError(captureUserMessage(e));
    }
  };

  const onContinue = (): void => {
    const revision = flowRevision.current;
    const invoice = parsed?.invoice;
    setError(undefined);
    if (useDelay) startWaiting();
    else {
      void (async () => {
        const c = await refreshRef.current();
        if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return;
        if (c === undefined) {
          setError('The invoice or its price can no longer be paid as reviewed. Check the details again.');
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
    if (phase === 'ready' && wallets === undefined) onFindWallets();
  }, [phase]);

  const runtime = useCallback(async (): Promise<Runtime> => {
    const rpc = chainId === undefined ? undefined : await app.getRpc(chainId);
    return { rpc, nowSeconds: () => Math.floor(services.nowMs() / 1000), sleep: services.sleep };
  }, [app, chainId, services]);

  const onConnect = (w: WalletInfo): void => {
    if (chainId === undefined) return;
    const revision = flowRevision.current;
    const sessionGuard = captureSessionVersionGuard();
    const invoice = parsed?.invoice;
    setError(undefined);
    setStatus('Waiting for your wallet…');
    connectWallet(w, chainId).then(
      (s) => {
        try { sessionGuard(); } catch { return; }
        if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return;
        setWallet(s);
        setStatus('');
        app.announce('Wallet connected.');
      },
      (e: unknown) => {
        if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice) return;
        setStatus('');
        setError(captureUserMessage(e));
      },
    );
  };

  const onPrepare = (): void => {
    if (wallet === undefined || ctx === undefined || parsed === undefined || ctx.review.invoice !== parsed.invoice) return;
    const revision = flowRevision.current;
    const sessionGuard = captureSessionVersionGuard();
    const invoice = parsed.invoice;
    const isCurrent = (): boolean => authorityMatches() && flowRevision.current === revision && latest.current.parsed?.invoice === invoice && latest.current.ctx?.review.invoice === invoice;
    const guard = (): void => {
      sessionGuard();
      assertCurrentInvoice(revision, invoice);
      if (!authorityMatches()) throw new Error('The wallet, settings or session changed. Review again before continuing.');
    };
    const scopedStatus = (message: string): void => { if (isCurrent()) setStatus(message); };
    setError(undefined);
    setPhase('busy');
    void (async () => {
      try {
        const rt = await runtime();
        guard();
        let buffer: BufferQuote | undefined;
        if (useBuffer && isErc20) {
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
          if (state === 'unsupported_token') scopedStatus('This token\u2019s permit could not be verified on-chain, so an exact approval is used instead.');
        }
        let plan: ApprovalPlan | undefined;
        if (isErc20 && !permit && tk?.address !== undefined && tk.address !== 'native') {
          plan = await planApproval(ctx, wallet, tk.address, rt);
          guard();
        }
        const b = await preparePayment(wallet, ctx, { usePermit: permit, ...(buffer === undefined ? {} : { buffer }) }, rt, scopedStatus, guard);
        guard();
        setApproval(plan);
        setGranted(undefined);
        setApprovalHash(undefined);
        setBuilt(b);
        setBuiltFor(invoice);
        setBuiltForContext(ctx);
        setStatus('');
        setPhase('prepared');
        app.announce('Payment prepared. Check the final details, then send.');
      } catch (e) {
        if (!isCurrent()) return;
        setStatus('');
        if (e instanceof PermitRejectedError) setPermitDeclined(true);
        if (!(e instanceof Error && e.message === 'buffer')) setError(captureUserMessage(e));
        setPhase('ready');
      }
    })();
  };

  const onSend = (): void => {
    if (wallet === undefined || ctx === undefined || built === undefined || parsed === undefined || ctx.review.invoice !== parsed.invoice || builtFor !== parsed.invoice || builtForContext !== ctx) return;
    const revision = flowRevision.current;
    const sessionGuard = captureSessionVersionGuard();
    const invoice = parsed.invoice;
    const isCurrent = (): boolean => authorityMatches() && flowRevision.current === revision && latest.current.parsed?.invoice === invoice && latest.current.ctx === ctx && latest.current.built === built && latest.current.builtFor === invoice && latest.current.builtForContext === ctx;
    const guard = (): void => {
      sessionGuard();
      assertCurrentInvoice(revision, invoice);
      if (!authorityMatches()) throw new Error('The wallet, settings or session changed. Review again before continuing.');
      if (latest.current.built !== built || latest.current.builtFor !== invoice || latest.current.builtForContext !== ctx) throw new Error('The prepared payment changed. Review it again before continuing.');
    };
    const scopedStatus = (message: string): void => { if (isCurrent()) setStatus(message); };
    setError(undefined);
    setPhase('busy');
    let actualAllowance = granted;
    let approvalBroadcastHash = approvalHash;
    let paymentWalletRequested = paymentMayHaveBeenSent;
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
        if (approval?.required === true && actualAllowance === undefined) {
          actualAllowance = await grantApproval(wallet, ctx, approval, rt, scopedStatus, preSignGuard, (hash) => {
            approvalBroadcastHash = hash;
            if (isCurrent()) setApprovalHash(hash);
            else setPreviousBroadcast({ hash, kind: 'approval' });
          });
          // Preserve the confirmed allowance before checking whether this flow is still current.
          if (isCurrent()) setGranted(actualAllowance);
          guard();
        }
        stage = 'payment';
        const res = await sendPayment(wallet, ctx, built, rt, scopedStatus, guard, () => {
          paymentWalletRequested = true;
          if (isCurrent()) setPaymentMayHaveBeenSent(true);
        });
        if (!isCurrent()) {
          setPreviousBroadcast({ hash: res.hash, kind: 'payment' });
          app.announce('A transaction may have been submitted for the previous invoice. Check your wallet before taking further action.');
          return;
        }
        setResult(res);
        notifyEmbedDone({ status: 'submitted', chainId: ctx.review.invoice.chainId, txHash: res.hash });
        setResultForContext(ctx);
        setPhase('done');
        setStatus('');
        app.announce('Payment submitted.');
      } catch (e) {
        if (!isCurrent()) {
          if (e instanceof PostBroadcastError) {
            setPreviousBroadcast({ hash: e.hash, kind: stage });
            app.announce('A transaction may have been submitted for the previous invoice. Check your wallet before taking further action.');
          } else if (approvalBroadcastHash !== undefined) {
            setPreviousBroadcast({ hash: approvalBroadcastHash, kind: 'approval' });
          }
          return;
        }
        setStatus('');
        if (e instanceof PostBroadcastError) {
          // A broadcast that failed follow-up checks must never be offered again as though nothing was sent.
          setBroadcast(e.hash);
          setBroadcastKind(stage);
          setError(captureUserMessage(e));
          setPhase('submitted');
          app.announce(`${stage === 'approval' ? 'Approval' : 'Payment'} sent, verification failed. Do not repeat it.`);
          return;
        }
        if (actualAllowance !== undefined) {
          const reason = userMessage(e, t).replaceAll('Nothing was sent.', '').replaceAll('Nothing was sent', '').trim();
          const paymentStatus = paymentWalletRequested ? 'the payment was not confirmed' : 'no payment was sent';
          setError(`Approval was confirmed${approvalBroadcastHash === undefined ? '' : ` (${approvalBroadcastHash})`}, but ${paymentStatus}. ${reason}`);
          app.announce(`Approval confirmed; ${paymentStatus}.`);
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
    const sessionGuard = captureSessionVersionGuard();
    const invoice = parsed.invoice;
    const isCurrent = (): boolean => authorityMatches() && flowRevision.current === revision && latest.current.parsed?.invoice === invoice && latest.current.ctx?.review.invoice === invoice;
    const scopedStatus = (message: string): void => { if (isCurrent()) setStatus(message); };
    setError(undefined);
    setPhase('busy');
    void (async () => {
      try {
        const rt = await runtime();
        if (!isCurrent()) return;
        await revokeApproval(wallet, ctx, approval, rt, scopedStatus, () => {
          sessionGuard();
          if (!isCurrent()) throw new Error('The invoice changed. Review it again before continuing.');
        }, (hash) => { if (!isCurrent()) setPreviousBroadcast({ hash, kind: 'approval' }); });
        if (!isCurrent()) return;
        setGranted(undefined);
        setApprovalHash(undefined);
        setApproval({ ...approval, have: 0n, required: true });
        app.announce('Approval revoked.');
      } catch (e) {
        if (!isCurrent()) {
          if (e instanceof PostBroadcastError) setPreviousBroadcast({ hash: e.hash, kind: 'approval' });
          return;
        }
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
    setPhase('input');
  };

  /* ------------------------------- rendering ------------------------------- */

  const buildRejection = parsed !== undefined && !supportsInvoice(parsed.invoice, supportedOnly) ? SUPPORTED_INVOICE_ERROR : undefined;
  const inputRejection = buildRejection ?? rejected;
  if (parsed === undefined || review === undefined || buildRejection !== undefined) {
    return (
      <section aria-labelledby="pay-h">
        <h2 id="pay-h">{t('pay.title.input')}</h2>
        <WalletAttempts />
        {previousBroadcast !== undefined && (
          <Notice kind="warn" title={t('pay.previous.title')}>
            {rich('pay.previous.body', { hash: previousBroadcast.hash, kind: previousBroadcast.kind }, monoTag('hash'))}
          </Notice>
        )}
        {inputRejection !== undefined && <Notice kind="error" title={t('pay.rejected.title')}>{displayMessage(inputRejection, t)}{` ${inputRejection === SUPPORTED_INVOICE_ERROR ? t('pay.rejected.controlsUnavailable') : t('pay.rejected.nothingSent')}`}</Notice>}
        {fragment !== undefined && inputRejection === undefined && <p role="status">{t('pay.reading')}</p>}
        {needsPassphrase && (
          <form onSubmit={onUnlock} className="stack">
            <Notice kind="warn" title={t('pay.passphrase.title')}>
              {t('pay.passphrase.body')}
            </Notice>
            <Field label={t('pay.passphrase.label')}>
              {(id) => <input id={id} type="password" autoComplete="off" value={invoicePassphrase} onChange={(e) => { setInvoicePassphrase(e.target.value); }} />}
            </Field>
            <button type="submit" className="btn btn-primary" disabled={unlocking || invoicePassphrase === ''}>{unlocking ? t('pay.passphrase.opening') : t('pay.passphrase.open')}</button>
          </form>
        )}
        <details ref={invoiceQrDisclosure} onToggle={(event) => { if (!event.currentTarget.open) invalidateInvoiceQr(); }}>
          <summary>{t('pay.scan.summary')}</summary>
          <p>{t('pay.scan.intro')}</p>
          <CameraImporter key={invoiceQrReset} label={t('pay.scan.importLabel')} scopeKey={invoiceQrScope} onInputChange={invalidateInvoiceQr} onText={importInvoiceQr} />
          <button type="button" className="btn" onClick={resetInvoiceQr}>{t('pay.scan.clear')}</button>
          {invoiceQrError !== undefined && <Notice kind="error" title={t('pay.scan.rejected')}>{displayMessage(invoiceQrError, t)}</Notice>}
          {invoiceQrPreview !== undefined && (
            <section aria-label={t('pay.scan.reviewAria')}>
              <h3>{t('pay.scan.reviewHeading')}</h3>
              {invoiceQrPreview.result.status === 'needsPassphrase'
                ? <p>{t('pay.scan.needsPassphrase')}</p>
                : <p>{invoiceQrPreview.result.parsed.verification.signatureValid ? t('pay.scan.chainValid', { chain: String(invoiceQrPreview.result.parsed.invoice.chainId) }) : t('pay.scan.chainInvalid', { chain: String(invoiceQrPreview.result.parsed.invoice.chainId) })}</p>}
              <p>{t('pay.scan.openNote')}</p>
              <button type="button" className="btn" onClick={openInvoiceQr}>{t('pay.scan.open')}</button>
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
  const warnings = walletWarnings(wallets ?? []);
  const ready = phase === 'ready' || phase === 'prepared' || phase === 'busy' || phase === 'submitted' || phase === 'done';
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
      <WalletAttempts />
      {previousBroadcast !== undefined && (
        <Notice kind="warn" title={t('pay.previous.title')}>
          {rich('pay.previous.body', { hash: previousBroadcast.hash, kind: previousBroadcast.kind }, monoTag('hash'))}
        </Notice>
      )}

      <Notice kind={review.trust.kind === 'invalid-signature' ? 'error' : review.trust.kind === 'trusted-seller' ? 'ok' : 'warn'} title={t('pay.signature')}>
        {review.trust.text}
      </Notice>
      {review.blockers.filter((b) => b !== review.trust.text).length > 0 && (
        <Notice kind="error" title={t('pay.cannotProceed')}>
          <ul>
            {review.blockers.filter((b) => b !== review.trust.text).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Notice>
      )}
      {ctxError !== undefined && <Notice kind="error">{displayMessage(ctxError, t)}</Notice>}
      {review.warnings.length > 0 && (
        <Notice kind="warn" title={t('pay.checkAmount')}>
          {review.warnings.map((w) => <p key={w}>{w}</p>)}
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
        chainName={review.chain?.name ?? `Chain ${String(inv.chainId)}`}
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
            <Field label={t('pay.receipt.fileLabel')}>
              {(id) => <input id={id} type="file" accept="application/json,.json" />}
            </Field>
            <Field label={t('pay.receipt.keyLabel')} hint={t('pay.receipt.keyHint')}>
              {(id) => <input id={id} className="mono" type="text" autoComplete="off" spellCheck={false} value={receiptTrustedKey} onChange={(event) => { setReceiptTrustedKey(event.target.value); setBoundReceipt(undefined); setReceiptError(undefined); }} placeholder="02… or 03…" />}
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

      {ready && phase !== 'done' && phase !== 'submitted' && (
        <div className="panel">
          <h3>{t('pay.wallet')}</h3>
          {wallet === undefined ? (
            <>
              {wallets === undefined && <p>{t('pay.lookingWallets')}</p>}
              {wallets?.length === 0 && <Notice kind="warn">{t('pay.noWallet')}</Notice>}
              <ul className="plain-list">
                {wallets?.map((w) => (
                  <li key={w.id}>
                    <button type="button" className="btn" onClick={() => { onConnect(w); }}>
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
            <button type="button" className="btn btn-primary" onClick={onPrepare} disabled={phase === 'busy' || ctx === undefined}>
              {t('pay.prepare')}
            </button>
          )}
        </div>
      )}

      {built !== undefined && builtFor === parsed.invoice && builtForContext === ctx && phase !== 'done' && phase !== 'submitted' && ctx !== undefined && (
        <FinalPreview built={built} ctx={ctx} onSend={onSend} busy={phase === 'busy'} approval={approval} granted={granted} approvalHash={approvalHash} onRevoke={onRevoke} />
      )}

      {status !== '' && <p role="status" className="status">{status}</p>}
      {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}

      {phase === 'submitted' && broadcast !== undefined && (
        <div className="panel" aria-live="polite">
          <h3>{broadcastKind === 'approval' ? t('pay.sent.approvalTitle') : t('pay.sent.paymentTitle')}</h3>
          <p>{rich('pay.sent.body', { kind: broadcastKind, hash: broadcast }, monoTag('hash'))}</p>
          <div className="actions">
            <CopyButton text={broadcast} label={t('pay.copyHash')} />
          </div>
        </div>
      )}

      {phase === 'done' && result !== undefined && ctx !== undefined && built !== undefined && (
        <div className="panel" aria-live="polite">
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
              : result.receipt.status !== 'success'
                ? t('pay.status.reverted')
                : result.verification === 'verified'
                  ? t('pay.status.included', { block: result.receipt.blockNumber.toString() })
                  : t('pay.status.unverified', { block: result.receipt.blockNumber.toString() })}
          </p>
          <div className="actions">
            <CopyButton text={result.hash} label={t('pay.copyHash')} />
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm(t('pay.receipt.download.confirm'))) {
                  downloadText('ghostpay-receipt.json', JSON.stringify(buildReceipt(ctx, built, result, new Date(services.nowMs())), null, 2), 'application/json');
                }
              }}
            >
              {t('pay.receipt.download')}
            </button>
          </div>
          <PaymentProofQr receipt={buildReceipt(ctx, built, result, new Date(services.nowMs()))} />
        </div>
      )}

      <div className="actions">
        {phase === 'review' && (
          <button type="button" className="btn btn-primary" onClick={onContinue} disabled={review.blockers.length > 0 || ctx === undefined}>
            {useDelay ? t('pay.startDelay') : t('pay.continue')}
          </button>
        )}
        {phase !== 'done' && phase !== 'submitted' && (
          <button type="button" className="btn" onClick={forget}>{t('pay.forget')}</button>
        )}
        {!app.settings.autoClearFragment && (
          <button type="button" className="btn" onClick={() => { history.replaceState(null, '', `${location.pathname}${location.search}`); }}>
            {t('pay.removeLink')}
          </button>
        )}
      </div>
    </section>
  );
}

function FinalPreview(props: {
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
            <p role="alert">{renderParts(trParts('pay.approval.excess', { granted: formatUnits(props.granted, dec), symbol: sym, need: formatUnits(props.approval.need, dec) }), { b: (c) => <strong>{c}</strong> })}</p>
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
