import { FRAGMENT_PREFIX, MAX_DECODED_BYTES, invoiceDigest, openFragment, type OpenFragmentResult, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { userMessage } from '../lib/errors';
import { DelayScheduler, randomDelayMs, type ScheduleSnapshot } from '../lib/jitter';
import {
  createPayContext,
  applyBufferPolicy,
  bufferOffered,
  decodeForDisplay,
  quoteBuffer,
  reviewInvoice,
  type BufferQuote,
  type SweepSimulation,
  type PayContext,
} from '../lib/pay';
import { verifyManifestForFlow } from '../lib/manifest';
import { PermitRejectedError, PostBroadcastError, buildReceipt, classifyPayerPermit, grantApproval, planApproval, preparePayment, revokeApproval, sendPayment, type ApprovalPlan, type Runtime, type SubmitResult } from '../lib/payExec';
import { useServices } from '../lib/services';
import { connectWallet, walletWarnings, type WalletInfo, type WalletSession } from '../lib/wallet';
import { useApp } from '../state';
import { notifyEmbedDone } from '../lib/embedHost';
import { captureSessionVersionGuard } from '../lib/session';
import { bindReceiptToInvoice, MAX_RECEIPT_JSON_BYTES, parseVerifiedReceipt, type BoundReceipt } from '../lib/receipts';

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

export function Pay(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [parsed, setParsed] = useState<ParsedInvoice | undefined>(undefined);
  const [rejected, setRejected] = useState<string | undefined>(undefined);
  const [paste, setPaste] = useState('');
  const [invoiceQrPreview, setInvoiceQrPreview] = useState<InvoiceQrPreview | undefined>();
  const [invoiceQrError, setInvoiceQrError] = useState<string | undefined>();
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
  const [ctxError, setCtxError] = useState<string | undefined>(undefined);
  const [wallets, setWallets] = useState<readonly WalletInfo[] | undefined>(undefined);
  const [wallet, setWallet] = useState<WalletSession | undefined>(undefined);
  const [built, setBuilt] = useState<BuiltPayment | undefined>(undefined);
  const [builtFor, setBuiltFor] = useState<ParsedInvoice['invoice'] | undefined>(undefined);
  const [builtForContext, setBuiltForContext] = useState<PayContext | undefined>(undefined);
  const [resultForContext, setResultForContext] = useState<PayContext | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<SubmitResult | undefined>(undefined);
  const [boundReceipt, setBoundReceipt] = useState<BoundReceipt | undefined>(undefined);
  const [receiptTrustedKey, setReceiptTrustedKey] = useState('');
  const [receiptError, setReceiptError] = useState<string | undefined>(undefined);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptConsent, setReceiptConsent] = useState(false);
  const receiptBusyRef = useRef(false);
  const receiptImportRevision = useRef(0);
  const [approval, setApproval] = useState<ApprovalPlan | undefined>(undefined);
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
  const invoiceQrScope = useMemo(() => ({ fragment, pinned, session: app.session, reset: invoiceQrReset }), [fragment, pinned, app.session, invoiceQrReset]);
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
      setInvoiceQrPreview({ fragment: candidate, result, revision, scope, assertSession });
      return true;
    } catch (error) {
      if (current()) setInvoiceQrError(userMessage(error));
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
      if (!live || flowRevision.current !== revision || latest.current.fragment !== fragment) return false;
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
    setBroadcast(undefined);
    setBroadcastKind('payment');
    setApproval(undefined);
    setGranted(undefined);
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
        setRejected(undefined);
        setParsed(p);
        setPhase('review');
      },
      (e: unknown) => {
        if (!current()) return;
        setParsed(undefined);
        setRejected(userMessage(e));
        setPhase('input');
      },
    );
    return () => {
      live = false;
    };
  }, [fragment, pinned]);

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
  const latest = useRef({ parsed, manifest, receiptTrustedKey, ctx, built, builtFor, builtForContext, result, resultForContext, fragment, wallet, settings: app.settings, session: app.session, receiptConsent });
  latest.current = { parsed, manifest, receiptTrustedKey, ctx, built, builtFor, builtForContext, result, resultForContext, fragment, wallet, settings: app.settings, session: app.session, receiptConsent };
  const receiptScope = useMemo(() => ({ ctx, session: app.session }), [ctx, app.session]);
  const authorityMatches = (): boolean => latest.current.wallet === wallet && latest.current.settings === app.settings && latest.current.session === app.session;
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
    if (flowRevision.current !== revision || latest.current.parsed?.invoice !== invoice || latest.current.ctx?.review.invoice !== invoice) {
      throw new Error('The invoice changed. Review it again before continuing.');
    }
  };
  const refreshContext = useCallback(async (): Promise<PayContext | undefined> => {
    const { parsed: p, manifest: m } = latest.current;
    if (p === undefined || m === undefined) {
      setCtx(undefined);
      return undefined;
    }
    const now = Math.floor(services.nowMs() / 1000);
    const fresh = reviewInvoice(p, now, m);
    if (fresh.blockers.length > 0) {
      setCtx(undefined);
      setTick((n) => n + 1);
      return undefined;
    }
    try {
      const rpc = await app.getRpc(p.invoice.chainId);
      if (latest.current.parsed !== p || latest.current.manifest !== m) return undefined;
      // WEB-APP-01: read the manifest back from the chain before any payment is built from it.
      const checked = await verifyManifestForFlow(m, rpc);
      if (latest.current.parsed !== p || latest.current.manifest !== m) return undefined;
      if (checked.status !== 'loaded') {
        setCtx(undefined);
        setCtxError(checked.status === 'invalid' ? checked.reason : 'Payments are disabled on this chain: no deployment manifest is loaded.');
        return undefined;
      }
      const c = await createPayContext(fresh, rpc, { nowSeconds: now });
      if (latest.current.parsed !== p || latest.current.manifest !== m) return undefined;
      setCtx(c);
      setCtxError(undefined);
      return c;
    } catch (e) {
      if (latest.current.parsed !== p || latest.current.manifest !== m) return undefined;
      setCtx(undefined);
      setCtxError(userMessage(e));
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
    const t = setInterval(() => {
      setTick((n) => n + 1);
    }, 5000);
    return () => {
      clearInterval(t);
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
      setError(userMessage(e));
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
      if (!invoiceQrMounted.current || flowRevision.current !== revision || latest.current.fragment !== fragmentAtStart) return false;
      try { sessionGuard(); return true; } catch { cancelInvoiceOpening(fragmentAtStart, revision); return false; }
    };
    setUnlocking(true);
    setRejected(undefined);
    void openFragment(fragment, { pinnedSigners: pinned, passphrase: invoicePassphrase }).then(
      (result) => {
        if (!current()) return;
        if (result.status !== 'ok') throw new Error('passphrase');
        setParsed(result.parsed);
        setNeedsPassphrase(false);
        setInvoicePassphrase('');
        setRejected(undefined);
        setPhase('review');
      },
      (e: unknown) => {
        if (!current()) return;
        setRejected(userMessage(e));
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
        if (receiptImportRevision.current === importRevision && flowRevision.current === flowAtStart && latest.current.fragment === fragmentAtStart && latest.current.parsed === invoiceAtStart && latest.current.receiptTrustedKey === trustedKeyAtStart) setReceiptError(userMessage(err));
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
      setError(userMessage(e));
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
        setError(userMessage(e));
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
        const t = ctx.review.token;
        let permit = t?.config?.permit === true && buffer === undefined && !permitDeclined;
        if (permit) {
          const state = await classifyPayerPermit(ctx, wallet, rt);
          guard();
          permit = state === 'ok_to_permit';
          if (state === 'unsupported_token') scopedStatus('This token\u2019s permit could not be verified on-chain, so an exact approval is used instead.');
        }
        let plan: ApprovalPlan | undefined;
        if (isErc20 && !permit && t?.address !== undefined && t.address !== 'native') {
          plan = await planApproval(ctx, wallet, t.address, rt);
          guard();
        }
        const b = await preparePayment(wallet, ctx, { usePermit: permit, ...(buffer === undefined ? {} : { buffer }) }, rt, scopedStatus, guard);
        guard();
        setApproval(plan);
        setGranted(undefined);
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
        if (!(e instanceof Error && e.message === 'buffer')) setError(userMessage(e));
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
    void (async () => {
      let stage: 'approval' | 'payment' = approval?.required === true && granted === undefined ? 'approval' : 'payment';
      try {
        const rt = await runtime();
        guard();
        let actualAllowance = granted;
        if (approval?.required === true && actualAllowance === undefined) {
          actualAllowance = await grantApproval(wallet, ctx, approval, rt, scopedStatus, guard, (hash) => {
            if (!isCurrent()) setPreviousBroadcast({ hash, kind: 'approval' });
          });
          guard();
          setGranted(actualAllowance);
        }
        stage = 'payment';
        const res = await sendPayment(wallet, ctx, built, rt, scopedStatus, guard);
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
          }
          return;
        }
        setStatus('');
        if (e instanceof PostBroadcastError) {
          // A broadcast that failed follow-up checks must never be offered again as though nothing was sent.
          setBroadcast(e.hash);
          setBroadcastKind(stage);
          setError(userMessage(e));
          setPhase('submitted');
          app.announce(`${stage === 'approval' ? 'Approval' : 'Payment'} sent, verification failed. Do not repeat it.`);
          return;
        }
        setError(userMessage(e));
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
        setApproval({ ...approval, have: 0n, required: true });
        app.announce('Approval revoked.');
      } catch (e) {
        if (!isCurrent()) {
          if (e instanceof PostBroadcastError) setPreviousBroadcast({ hash: e.hash, kind: 'approval' });
          return;
        }
        setError(userMessage(e));
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
    setBroadcast(undefined);
    setBroadcastKind('payment');
    setApproval(undefined);
    setGranted(undefined);
    setPhase('input');
  };

  /* ------------------------------- rendering ------------------------------- */

  if (parsed === undefined || review === undefined) {
    return (
      <section aria-labelledby="pay-h">
        <h2 id="pay-h">Pay an invoice</h2>
        <WalletAttempts />
        {previousBroadcast !== undefined && (
          <Notice kind="warn" title="Previous invoice transaction may have been submitted">
            Check your wallet before paying again. The transaction hash is <Mono>{previousBroadcast.hash}</Mono>. This was a {previousBroadcast.kind} for the invoice that was open before you changed links.
          </Notice>
        )}
        {rejected !== undefined && <Notice kind="error" title="Invoice rejected">{rejected} Nothing was shown or sent.</Notice>}
        {fragment !== undefined && rejected === undefined && <p role="status">Reading invoice…</p>}
        {needsPassphrase && (
          <form onSubmit={onUnlock} className="stack">
            <Notice kind="warn" title="Passphrase-protected invoice">
              The link header claims this invoice is protected. Its chain and signer details are unverified until the passphrase opens the invoice. The passphrase is used in this page only and is not stored.
            </Notice>
            <Field label="Invoice passphrase">
              {(id) => <input id={id} type="password" autoComplete="off" value={invoicePassphrase} onChange={(e) => { setInvoicePassphrase(e.target.value); }} />}
            </Field>
            <button type="submit" className="btn btn-primary" disabled={unlocking || invoicePassphrase === ''}>{unlocking ? 'Opening invoice…' : 'Open invoice'}</button>
          </form>
        )}
        <details ref={invoiceQrDisclosure} onToggle={(event) => { if (!event.currentTarget.open) invalidateInvoiceQr(); }}>
          <summary>Scan an invoice QR</summary>
          <p>Read a GhostPay v1 invoice fragment or an HTTPS link at this app’s host and path. Scanned links stay on this page. Review the scan, then choose whether to open its payment details.</p>
          <CameraImporter key={invoiceQrReset} label="Invoice QR import" scopeKey={invoiceQrScope} onInputChange={invalidateInvoiceQr} onText={importInvoiceQr} />
          <button type="button" className="btn" onClick={resetInvoiceQr}>Clear invoice QR</button>
          {invoiceQrError !== undefined && <Notice kind="error" title="Invoice QR not accepted">{invoiceQrError}</Notice>}
          {invoiceQrPreview !== undefined && (
            <section aria-label="Scanned invoice review">
              <h3>Review scanned invoice</h3>
              {invoiceQrPreview.result.status === 'needsPassphrase'
                ? <p>This invoice needs a passphrase. Its header is unverified until it opens.</p>
                : <p>Chain {String(invoiceQrPreview.result.parsed.invoice.chainId)}. {invoiceQrPreview.result.parsed.verification.signatureValid ? 'The embedded key signed this invoice; this does not establish seller identity.' : 'The invoice signature is invalid. Payment will remain blocked.'}</p>}
              <p>Opening shows the ordinary invoice review. It does not connect a wallet or submit a payment.</p>
              <button type="button" className="btn" onClick={openInvoiceQr}>Open scanned invoice</button>
            </section>
          )}
        </details>
        <form onSubmit={onPasteSubmit} className="stack">
          <div className="field">
            <label htmlFor="paste">{needsPassphrase ? 'Or paste a different invoice link' : 'Paste an invoice link'}</label>
            <textarea id="paste" rows={3} value={paste} onChange={(e) => { setPaste(e.target.value); }} spellCheck={false} />
            <p className="hint">The link is read in this page only. It is never sent to a server.</p>
            <p className="hint">
              Pasting is safer than clicking: a browser may keep a clicked invoice URL, including its secret part, in its history even after this page removes it from the address bar. Copy the link and paste it here, or open it in a private window.
            </p>
          </div>
          <button type="submit" className="btn btn-primary">Read invoice</button>
        </form>
      </section>
    );
  }

  const inv = parsed.invoice;
  const warnings = walletWarnings(wallets ?? []);
  const ready = phase === 'ready' || phase === 'prepared' || phase === 'busy' || phase === 'submitted' || phase === 'done';
  const decimals = token?.decimals ?? 18;
  const symbol = token?.symbol ?? '';

  return (
    <section aria-labelledby="pay-h">
      <h2 id="pay-h">Review payment</h2>
      <WalletAttempts />
      {previousBroadcast !== undefined && (
        <Notice kind="warn" title="Previous invoice transaction may have been submitted">
          Check your wallet before paying again. The transaction hash is <Mono>{previousBroadcast.hash}</Mono>. This was a {previousBroadcast.kind} for the invoice that was open before you changed links.
        </Notice>
      )}

      <Notice kind={review.trust.kind === 'invalid-signature' ? 'error' : review.trust.kind === 'trusted-seller' ? 'ok' : 'warn'} title="Signature">
        {review.trust.text}
      </Notice>
      {review.blockers.filter((b) => b !== review.trust.text).length > 0 && (
        <Notice kind="error" title="This payment cannot proceed">
          <ul>
            {review.blockers.filter((b) => b !== review.trust.text).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Notice>
      )}
      {ctxError !== undefined && <Notice kind="error">{ctxError}</Notice>}

      <dl className="details">
        <dt>Chain</dt>
        <dd>{review.chain?.name ?? `Unknown (${String(inv.chainId)})`}</dd>
        <dt>Token</dt>
        <dd>
          {symbol} {inv.token === 'native' ? '(native coin)' : <Mono>{inv.token}</Mono>}
        </dd>
        <dt>Invoice total</dt>
        <dd>{formatFiat(BigInt(inv.fiat.minorUnits), inv.fiat.currency)}</dd>
        <dt>Pricing</dt>
        <dd>
          {inv.amountPolicy.mode === 'fixed_token'
            ? `Fixed: ${formatUnits(BigInt(inv.amountPolicy.tokenAmount), decimals)} ${symbol}`
            : `Fiat quote from ${inv.quote.source}, taken ${formatUnix(inv.quote.timestamp)}, valid until ${formatUnix(inv.quote.expiresAt)}, max slippage ${String(inv.quote.maxSlippageBps / 100)} %. Not a guaranteed fiat value.`}
        </dd>
        <dt>Who pays the checkout fee</dt>
        <dd>{inv.feePolicy === 'payer_pays' ? 'You (added on top)' : 'Seller (deducted from the amount)'}</dd>
        <dt>Invoice expires</dt>
        <dd>{formatUnix(inv.expiresAt)}</dd>
        <dt>Seller meta-address</dt>
        <dd><Mono>{shortHex(inv.metaAddress, 18, 8)}</Mono></dd>
        <dt>Seller fingerprint</dt>
        <dd><Mono>{payeeFingerprint(inv.metaAddress)}</Mono> (compare with the seller by another channel)</dd>
        <dt>Private part</dt>
        <dd>{parsed.passphraseProtected ? 'Entire invoice decrypted here with a passphrase' : parsed.encrypted ? 'Private invoice fields decrypted here with a key from the link' : 'Plain in the link'}</dd>
      </dl>

      {inv.lineItems.length > 0 && (
        <div className="table-wrap" role="region" aria-label="Line items" tabIndex={0}>
          <table>
            <caption>Line items</caption>
            <thead>
              <tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Unit</th></tr>
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
          <p>Tax ({String(inv.tax.rateBps / 100)} %): {formatFiat(BigInt(inv.tax.minorUnits), inv.fiat.currency)}</p>
        </div>
      )}
      {inv.memo !== undefined && (
        <p className="wrap">
          <strong>Memo:</strong> {safeText(inv.memo).text}{safeText(inv.memo).flagged ? ' (this text contained hidden or look-alike characters; they are shown as markers)' : ''}
        </p>
      )}

      {ctx !== undefined && (
        <dl className="details amounts">
          <dt>You pay (gross)</dt>
          <dd>{formatUnits(ctx.request.grossAmount, decimals)} {symbol}</dd>
          <dt>Checkout fee (0.25 %)</dt>
          <dd>{formatUnits(ctx.request.feeAmount, decimals)} {symbol}</dd>
          <dt>Seller receives (net)</dt>
          <dd>{formatUnits(ctx.request.netAmount, decimals)} {symbol}</dd>
          <dt>Contract (router)</dt>
          <dd><Mono>{ctx.manifest.router}</Mono></dd>
          <dt>Fee recipient</dt>
          <dd><Mono>{ctx.manifest.feeRecipient}</Mono></dd>
          <dt>Destination</dt>
          <dd>A fresh one-time (stealth) address is derived when the payment is prepared and shown before you send.</dd>
        </dl>
      )}
      {ctx !== undefined && (
        <section className="panel" aria-labelledby="seller-receipt-h">
          <h3 id="seller-receipt-h">Import a seller receipt</h3>
          <p className="hint">
            This checks the receipt signature against the current signed invoice, chain, asset and exact seller amount. If this page has a transaction hash or prepared one-time address, those are checked too. A seller signature proves control of a key and does not independently prove an on-chain payment or seller identity.
          </p>
          <p className="hint">A receipt may reveal a private amount, transaction and invoice association on this screen.</p>
          <label><input type="checkbox" checked={receiptConsent} onChange={(event) => {
            setReceiptConsent(event.target.checked);
            receiptImportRevision.current += 1;
            receiptBusyRef.current = false;
            setReceiptBusy(false);
            setBoundReceipt(undefined);
            setReceiptError(undefined);
          }} /> I consent to opening private receipt details on this screen.</label>
          <form className="stack" onSubmit={onImportReceipt}>
            <Field label="Signed seller receipt JSON">
              {(id) => <input id={id} type="file" accept="application/json,.json" />}
            </Field>
            <Field label="Explicitly trusted signer key (optional)" hint="Use only a compressed public key you verified with the seller through another channel. Leave blank to require the receipt key to match the valid invoice-signing key.">
              {(id) => <input id={id} className="mono" type="text" autoComplete="off" spellCheck={false} value={receiptTrustedKey} onChange={(event) => { setReceiptTrustedKey(event.target.value); setBoundReceipt(undefined); setReceiptError(undefined); }} placeholder="02… or 03…" />}
            </Field>
            <button type="submit" className="btn" disabled={receiptBusy || ctx === undefined}>{receiptBusy ? 'Checking receipt…' : 'Check receipt against this invoice'}</button>
          </form>
          <CameraImporter
            key={fragment ?? ''}
            label="Scan or paste a seller receipt"
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
          {receiptError !== undefined && <Notice kind="error" title="Receipt not accepted">{receiptError}</Notice>}
          {boundReceipt !== undefined && (
            <Notice kind="ok" title="Receipt matches this invoice">
              The signature matches {boundReceipt.signerMatch === 'invoice-signing-key' ? 'the valid invoice-signing key' : 'the explicitly trusted key you entered'}, and the invoice digest, chain, asset and seller amount match. This is a seller-key attestation, not independent payment proof.
            </Notice>
          )}
        </section>
      )}
      <ManifestBanner manifest={manifest} />
      <FeeDisclosure manifest={manifest} chainName={review.chain?.name} />
      <Notice kind="info" title="What becomes public">
        Your address, the token, the amounts, the fee and the time are public on-chain. The seller&rsquo;s identity is not revealed by the one-time address.
      </Notice>

      {phase === 'review' && (
        <fieldset className="options">
          <legend>Options</legend>
          <div className="check">
            <input id="delay" type="checkbox" checked={useDelay} onChange={(e) => { setUseDelay(e.target.checked); }} />
            <label htmlFor="delay">
              Wait a random time first ({String(Math.round(app.settings.delayMinSec / 60))} to {String(Math.round(app.settings.delayMaxSec / 60))} minutes)
            </label>
          </div>
          <p className="hint">Timing friction only, not anonymity. While waiting nothing is signed or sent, and the page must stay open. You can cancel or send now.</p>
          {isErc20 && parsed !== undefined && !bufferOffered(parsed.invoice) && (
            <p className="hint">The seller does not accept a gas buffer for this invoice.</p>
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
                <label htmlFor="buf">Add a gas buffer for the seller&rsquo;s sweep (default: off)</label>
              </div>
              {useBuffer && (
                <Notice kind="warn" title="Public linkage">
                  {bufferQuote === undefined ? 'Estimating buffer…' : `Extra ${formatUnits(bufferQuote.bufferWei, 18)} ${review.chain?.nativeSymbol ?? 'native coin'} (native, not ${symbol}) is sent in the same transaction to the one-time address. This publicly links your payment, the one-time address and the buffer. It is an estimate (${String(bufferQuote.gasLimit)} gas${bufferQuote.gasSource === 'simulated' ? ', from a simulated token transfer' : ', default table value until you prepare the payment'} at up to ${String(bufferQuote.maxFeePerGas)} wei, +20 %), not a guarantee.${bufferQuote.raisedToSellerMinimum === true ? " Raised to the seller's minimum buffer for this invoice." : ""} It is never refunded.`}
                </Notice>
              )}
            </>
          )}
        </fieldset>
      )}

      {phase === 'waiting' && schedule !== undefined && (
        <div className="panel" role="status">
          <p>
            <strong>Scheduled locally. Nothing has been signed or broadcast.</strong>
          </p>
          <p>Time left: {formatCountdown(schedule.remainingMs)}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => { scheduler.current?.sendNow(); }}>Send now</button>
            <button type="button" className="btn btn-danger" onClick={() => { scheduler.current?.cancel(); }}>Cancel</button>
          </div>
        </div>
      )}

      {ready && phase !== 'done' && phase !== 'submitted' && (
        <div className="panel">
          <h3>Wallet</h3>
          {wallet === undefined ? (
            <>
              {wallets === undefined && <p>Looking for wallets…</p>}
              {wallets?.length === 0 && <Notice kind="warn">No browser wallet found. Install or unlock one, then reload this page.</Notice>}
              <ul className="plain-list">
                {wallets?.map((w) => (
                  <li key={w.id}>
                    <button type="button" className="btn" onClick={() => { onConnect(w); }}>
                      {w.icon !== undefined && <img src={w.icon} alt="" width={20} height={20} />} Connect {w.name}
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
              Connected: {wallet.wallet.name}, <Mono>{wallet.account}</Mono>, chain {wallet.chainId}
            </p>
          )}
          {wallet !== undefined && built === undefined && (
            <button type="button" className="btn btn-primary" onClick={onPrepare} disabled={phase === 'busy' || ctx === undefined}>
              Prepare payment
            </button>
          )}
        </div>
      )}

      {built !== undefined && builtFor === parsed.invoice && builtForContext === ctx && phase !== 'done' && phase !== 'submitted' && ctx !== undefined && (
        <FinalPreview built={built} ctx={ctx} onSend={onSend} busy={phase === 'busy'} approval={approval} granted={granted} onRevoke={onRevoke} />
      )}

      {status !== '' && <p role="status" className="status">{status}</p>}
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      {phase === 'submitted' && broadcast !== undefined && (
        <div className="panel" aria-live="polite">
          <h3>{broadcastKind === 'approval' ? 'Approval sent, verifying' : 'Payment sent, verifying'}</h3>
          <p>Your wallet already broadcast this {broadcastKind}. Do not repeat it. Transaction hash: <Mono>{broadcast}</Mono></p>
          <div className="actions">
            <CopyButton text={broadcast} label="Copy hash" />
          </div>
        </div>
      )}

      {phase === 'done' && result !== undefined && ctx !== undefined && built !== undefined && (
        <div className="panel" aria-live="polite">
          <h3>Submitted</h3>
          <p>Transaction hash: <Mono>{result.hash}</Mono></p>
          <p>
            {result.verification === 'verified' && 'Independently verified on your RPC: the network saw exactly the previewed transaction.'}
            {result.verification === 'not-visible-yet' && 'Your RPC does not show the transaction yet, so it could not be checked against the preview. Check it in your wallet.'}
            {result.verification === 'no-rpc' && 'No RPC is configured, so this app could not verify the transaction independently. Check it in your wallet.'}
          </p>
          <p>
            {result.receipt === undefined
              ? 'Status: not yet confirmed (included is not the same as final).'
              : result.receipt.status === 'success'
                ? `Status: included in block ${result.receipt.blockNumber.toString()} (not necessarily final yet).`
                : 'Status: the transaction reverted. Nothing was paid.'}
          </p>
          <div className="actions">
            <CopyButton text={result.hash} label="Copy hash" />
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm('This receipt contains the amount and time of your payment. Keep it private. Download?')) {
                  downloadText('ghostpay-receipt.json', JSON.stringify(buildReceipt(ctx, built, result, new Date(services.nowMs())), null, 2), 'application/json');
                }
              }}
            >
              Download local receipt
            </button>
          </div>
        </div>
      )}

      <div className="actions">
        {phase === 'review' && (
          <button type="button" className="btn btn-primary" onClick={onContinue} disabled={review.blockers.length > 0 || ctx === undefined}>
            {useDelay ? 'Start the delay' : 'Continue'}
          </button>
        )}
        {phase !== 'done' && phase !== 'submitted' && (
          <button type="button" className="btn" onClick={forget}>Forget this invoice</button>
        )}
        {!app.settings.autoClearFragment && (
          <button type="button" className="btn" onClick={() => { history.replaceState(null, '', `${location.pathname}${location.search}`); }}>
            Remove link from address bar
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
  readonly granted: bigint | undefined;
  readonly onRevoke: () => void;
}): ReactNode {
  const { built, ctx } = props;
  const p = built.preview;
  const decoded = decodeForDisplay(built, ctx.chain.chainId);
  const t = ctx.review.token;
  const dec = t?.decimals ?? 18;
  const sym = t?.symbol ?? '';
  return (
    <div className="panel" aria-labelledby="final-h">
      <h3 id="final-h">Final check before your wallet</h3>
      <p>These values are decoded from the exact transaction data your wallet will receive, and were compared to the preview.</p>
      <dl className="details">
        <dt>Method</dt>
        <dd>{decoded.method}</dd>
        <dt>Contract</dt>
        <dd><Mono>{built.tx.to}</Mono></dd>
        <dt>One-time destination</dt>
        <dd><Mono>{decoded.stealth}</Mono></dd>
        <dt>Gross</dt>
        <dd>{formatUnits(decoded.gross, dec)} {sym}</dd>
        <dt>Fee</dt>
        <dd>{formatUnits(decoded.fee, dec)} {sym} to {ctx.manifest.feeRecipient} (deployment manifest verified against the chain)</dd>
        <dt>Net to seller</dt>
        <dd>{formatUnits(decoded.net, dec)} {sym} (minimum accepted {formatUnits(decoded.minNet, dec)})</dd>
        <dt>Native value sent</dt>
        <dd>{formatUnits(built.tx.value, 18)} {ctx.chain.nativeSymbol}{p.method === 'payERC20WithBuffer' ? ' (gas buffer, public)' : ''}</dd>
        <dt>Deadline</dt>
        <dd>{formatUnix(Number(p.deadline))}</dd>
      </dl>
      {props.approval !== undefined && (
        <div className="notice notice-warn" role="note">
          <strong className="notice-title">Token approval{props.approval.required ? ' needed first' : ' already in place'}</strong>
          <dl className="details">
            <dt>Spender (router)</dt>
            <dd><Mono>{props.approval.spender}</Mono></dd>
            <dt>Allowance before this payment</dt>
            <dd>{formatUnits(props.approval.have, dec)} {sym}</dd>
            <dt>{props.approval.required ? 'Exact amount requested' : 'Needed for this payment'}</dt>
            <dd>{formatUnits(props.approval.need, dec)} {sym}</dd>
          </dl>
          {props.approval.required ? (
            <p>Pressing the button first asks your wallet for this exact approval and then for the payment. Check the amount in your wallet: it must not be unlimited. The approval is public and can link to the payment that follows. Permit-capable tokens avoid a separate approval transaction.</p>
          ) : (
            <p>The router already has enough allowance. This payment does not change a larger existing allowance; you can revoke it in your wallet.</p>
          )}
          {props.granted !== undefined && props.granted > props.approval.need && (
            <p role="alert"><strong>Your wallet granted {formatUnits(props.granted, dec)} {sym}, more than the {formatUnits(props.approval.need, dec)} requested.</strong> Revoke it unless you meant to allow more.</p>
          )}
          {props.granted !== undefined && (
            <p>Allowance now: {formatUnits(props.granted, dec)} {sym}. If you stop before payment, remove it: <button type="button" className="btn" onClick={props.onRevoke} disabled={props.busy}>Revoke approval</button></p>
          )}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={props.onSend} disabled={props.busy}>
        {props.approval?.required === true && props.granted === undefined ? 'Approve exactly, then send payment in my wallet' : 'Send payment in my wallet'}
      </button>
    </div>
  );
}
