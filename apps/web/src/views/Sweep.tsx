import { usePresentationGeneration } from '../components/SessionPresentationBoundary';
import { subscribeAppLock } from '../lib/appLock';
import { findChain, findToken, type Address } from '@ghostpay/chain-adapters';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../components/Common';
import { CameraImporter } from '../components/CameraImporter';
import { useManifest } from '../components/Disclosure';
import { ManifestBanner } from '../components/ManifestBanner';
import { verifyManifestForFlow } from '../lib/manifest';
import { UserFacingError, displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { formatUnits, formatUnix } from '../lib/format';
import { captureDestinationLedgerGuard, checkDestination, destinationWarning, loadDestLedger, recordSweepDestination, directSweep, DirectSweepOutcomeUnknownError, getSweepQuote, isUnresolvedAttempt, readBalance, reconcileSweepLock, relayedSweep, sweepPermitRefusalKey, sweepPermitSuggestsDirect, RELAYED_EXPIRY_MARGIN_SECONDS, type DirectSweepResult, type RelayedOrderRef, type SweepLock, type SweepQuoteView, type SweepTarget } from '../lib/sweep';
import { RelayerRefusedError } from '../lib/relayerClient';
import { authorizeEncryptedVault, readEncryptedVault } from '../lib/keyVault';
import { captureSessionGuard, captureSessionVersionGuard, getSessionBackup, subscribeSessionBackup } from '../lib/session';
import { browserStorage, loadScanPrivacy, privatePathForbidsDirect } from '../lib/scanPrivacy';
import { useServices } from '../lib/services';
import { beginSweepAttempt, getSweepAttempt, isSweepJournalBroken, resolveSweepAttempt, useApp, useSweepAttempt, useSweepJournalBroken } from '../state';
import { MAX_OTHER_HASHES, SweepJournalUnavailableError } from '../lib/sweepAttemptJournal';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';
import { assertNativeSweepReview, cancelNativeSweepReview, confirmNativeDirectSweep, prepareNativeDirectSweep, type NativeDirectSweepReview } from '../lib/sweep';

interface NativeReviewView {
  readonly review: NativeDirectSweepReview;
  readonly replaces?: SweepLock & { readonly nonce: number };
}

const ATTEMPT_TITLES: Partial<Record<string, MessageKey>> = {
  'unknown-after-handoff': 'sweep.attempt.unknown',
  included: 'sweep.attempt.included',
  reverted: 'sweep.attempt.reverted',
  expired: 'sweep.attempt.expired',
  refused: 'sweep.attempt.refused',
  replaced: 'sweep.attempt.replaced',
};

export function Sweep(): ReactNode {
  const generation = usePresentationGeneration();
  return <SweepPanel key={generation} />;
}

function SweepPanel(): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const latestT = useRef(t); latestT.current = t;
  const sel = app.sweepTarget;
  const chainId = sel?.chainId;
  const manifest = useManifest(chainId);
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState<'relayer' | 'direct'>('relayer');
  const [balance, setBalance] = useState<bigint | undefined>(undefined);
  // Every balance lookup names this one-time address to the Settings RPC and needs its own click.
  const privatePathRequired = privatePathForbidsDirect(loadScanPrivacy(browserStorage()));
  const balanceOperation = useRef(0);
  const balanceAbort = useRef<AbortController | undefined>(undefined);
  const actionAbort = useRef<AbortController | undefined>(undefined);
  const quoteOperation = useRef(0);
  const [quote, setQuote] = useState<SweepQuoteView | undefined>(undefined);
  const [nativeReview, setNativeReviewState] = useState<NativeReviewView | undefined>(undefined);
  const nativeReviewRef = useRef<NativeReviewView | undefined>(undefined);
  const setNativeReview = useCallback((next: NativeReviewView | undefined, cancelPrevious = true): void => {
    if (cancelPrevious && nativeReviewRef.current !== undefined) cancelNativeSweepReview(nativeReviewRef.current.review);
    nativeReviewRef.current = next;
    setNativeReviewState(next);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DisplayMessage | undefined>(undefined);
  const [hash, setHash] = useState<string | undefined>(undefined);
  const [vaultState, setVaultState] = useState<'checking' | 'empty' | 'saved' | 'error'>('checking');
  const [vaultPass, setVaultPass] = useState('');
  const vaultInput = useRef<HTMLInputElement | null>(null);
  const bindVaultInput = useCallback((field: HTMLInputElement | null): void => {
    if (field === null && vaultInput.current !== null) {
      vaultInput.current.value = '';
      vaultInput.current.removeAttribute('value');
    }
    vaultInput.current = field;
  }, []);
  const [vaultPhase, setVaultPhase] = useState<'idle' | 'authorizing' | 'action'>('idle');
  // Keys tied to a vault keep needing its passphrase even after the saved record is deleted or unreadable (L1-02).
  const vaultStepUp = useSyncExternalStore(subscribeSessionBackup, getSessionBackup)?.vaultStepUp === true;
  const operation = useRef(0);
  const authEpoch = useRef(0);
  // GP-SWEEP-OUTCOME-01: app-session record of the last direct sweep from this address; survives navigation.
  const attempt = useSweepAttempt(chainId, sel?.match.stealthAddress);
  const journalBroken = useSweepJournalBroken();
  const signingLocked = journalBroken || (attempt !== undefined && isUnresolvedAttempt(attempt));
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<DisplayMessage | undefined>(undefined);
  // L2-F1: the last direct sweep was sent although the RPC could not dry-run it (a warning, not a refusal).
  const [dryRunSkipped, setDryRunSkipped] = useState(false);
  // L2-F2: a direct lock whose handoff outcome is unknown may be replaced by a transaction with exactly its nonce (only
  // one can be mined). Not a submitted one (B-R5): the node accepted it and would refuse a replacement at the same fee.
  const replacementLimitReached = (attempt?.otherHashes?.length ?? 0) >= MAX_OTHER_HASHES;
  const resignNonce = !replacementLimitReached && !journalBroken && attempt !== undefined && attempt.order === undefined && attempt.status === 'unknown-after-handoff' ? attempt.nonce : undefined;

  useEffect(() => {
    if (nativeReview === undefined) return;
    if (nativeReview.replaces === undefined ? (attempt !== undefined && isUnresolvedAttempt(attempt)) : JSON.stringify(nativeReview.replaces) !== JSON.stringify(attempt)) {
      setNativeReview(undefined);
    }
  }, [attempt, nativeReview, setNativeReview]);

  useEffect(() => {
    if (nativeReview === undefined) return;
    const timer = setInterval(() => {
      if (nativeReviewRef.current !== nativeReview) return;
      try { assertNativeSweepReview(nativeReview.review); }
      catch { setNativeReview(undefined); setError({ key: 'sweep.nativeReview.stale' }); }
    }, 500);
    return () => { clearInterval(timer); };
  }, [nativeReview, setNativeReview]);

  useEffect(() => {
    let live = true;
    void readEncryptedVault().then(
      (saved) => { if (live) setVaultState(saved === undefined ? 'empty' : 'saved'); },
      () => { if (live) setVaultState('error'); },
    );
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setVaultPass('');
    authEpoch.current += 1;
    return () => { authEpoch.current += 1; };
  }, [app.session]);
  // Also at every idle lock, which leaves keys without a backup loaded (G2-05).
  useEffect(() => subscribeAppLock(() => {
    setVaultPass('');
    balanceOperation.current += 1;
    setBalance(undefined);
    setQuote(undefined);
    setNativeReview(undefined);
    balanceAbort.current?.abort();
    actionAbort.current?.abort();
  }), [setNativeReview]);

  const meta = sel?.match.metadata;
  const tokenAddr: Address | 'native' | undefined = meta === undefined ? undefined : meta.kind === 'native' ? 'native' : meta.token;
  const tokenCfg = chainId === undefined || tokenAddr === undefined || tokenAddr === 'native' ? undefined : findToken(chainId, tokenAddr);
  const decimals = tokenAddr === 'native' ? 18 : (tokenCfg?.decimals ?? 18);
  const symbol = tokenAddr === 'native' ? (chainId === undefined ? '' : (findChain(chainId)?.nativeSymbol ?? '')) : (tokenCfg?.symbol ?? t('sweep.tokenFallback'));

  const balanceRpcUrl = chainId === undefined ? undefined : app.settings.rpcUrls[String(chainId)];
  const balanceScope = useMemo(() => ({ sel, chainId, tokenAddr, rpcUrl: balanceRpcUrl, getRpc: app.getRpc, session: app.session, revision: app.networkRevision }),
    [sel, chainId, tokenAddr, balanceRpcUrl, app.getRpc, app.session, app.networkRevision]);
  const currentBalanceScope = useRef(balanceScope);
  currentBalanceScope.current = balanceScope;
  const destWarning = sel === undefined || chainId === undefined ? undefined : destinationWarning(destination, sel.match.stealthAddress, chainId, loadDestLedger(browserStorage()));
  const quoteScope = useMemo(() => ({ balanceScope, balance, destination, mode, relayerUrl: app.settings.relayerUrl, manifest, services }),
    [balanceScope, balance, destination, mode, app.settings.relayerUrl, manifest, services]);
  const currentQuoteScope = useRef(quoteScope);
  currentQuoteScope.current = quoteScope;

  useEffect(() => {
    setBalance(undefined);
    setQuote(undefined);
    return () => { balanceOperation.current += 1; balanceAbort.current?.abort(); };
  }, [balanceScope]);
  useEffect(() => {
    authEpoch.current += 1;
    actionAbort.current?.abort();
    setBusy(false);
    return () => { authEpoch.current += 1; actionAbort.current?.abort(); };
  }, [balanceScope, destination, mode, app.settings.relayerUrl]);

  useEffect(() => {
    setQuote(undefined);
    setNativeReview(undefined);
    return () => { quoteOperation.current += 1; setNativeReview(undefined); };
  }, [quoteScope, setNativeReview]);

  if (sel === undefined || chainId === undefined || tokenAddr === undefined) {
    return (
      <section aria-labelledby="sw-h">
        <h2 id="sw-h">{t('sweep.title')}</h2>
        <Notice kind="info">{t('sweep.choosePayment')}</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('scan'); }}>{t('sweep.goToScan')}</button>
      </section>
    );
  }
  if (app.session === undefined) {
    return (
      <section aria-labelledby="sw-h">
        <h2 id="sw-h">{t('sweep.title')}</h2>
        <Notice kind="info">{t('sweep.keysGone')}</Notice>
      </section>
    );
  }

  const target: SweepTarget = { chainId, token: tokenAddr, owner: sel.match.stealthAddress, announcement: sel.match.announcement };
  const loaded = manifest?.status === 'loaded' ? manifest.manifest : undefined;
  const relayerOk = tokenCfg?.permit === true && app.settings.relayerUrl !== '';
  const nowSec = (): number => Math.floor(services.nowMs() / 1000);

  const onReadBalance = (): void => {
    balanceAbort.current?.abort();
    const controller = new AbortController();
    balanceAbort.current = controller;
    const operationId = ++balanceOperation.current;
    const unchangedSession = captureSessionVersionGuard();
    const current = (): boolean => {
      if (controller.signal.aborted || balanceOperation.current !== operationId || currentBalanceScope.current !== balanceScope) return false;
      try { unchangedSession(); return true; } catch { return false; }
    };
    setBalance(undefined);
    setQuote(undefined);
    setNativeReview(undefined);
    setError(undefined);
    void (async () => {
      try {
        const rpc = await app.getRpc(chainId, { action: 'sweep-balance', signal: controller.signal, allowDirectOnce: true, balance: { owner: sel.match.stealthAddress, token: tokenAddr } });
        // RPC creation may be asynchronous. A changed selection must not disclose even the old address afterward.
        if (rpc === undefined || !current()) return;
        const next = await readBalance(rpc, sel.match.stealthAddress, tokenAddr);
        if (current()) setBalance(next);
      } catch (e) {
        if (current()) setError(captureUserMessage(e));
      } finally {
        controller.abort();
      }
    })();
  };

  const guard = async (fn: (assertCurrent: () => void, signal: AbortSignal) => Promise<boolean | void>): Promise<void> => {
    actionAbort.current?.abort();
    const controller = new AbortController();
    actionAbort.current = controller;
    const id = ++operation.current;
    const epoch = authEpoch.current;
    setBusy(true);
    setVaultPhase('authorizing');
    setError(undefined);
    try {
      const liveSession = captureSessionGuard();
      const assertCurrent = (): void => {
        if (controller.signal.aborted || authEpoch.current !== epoch) throw new UserFacingError({ key: 'sweep.vaultCancelledKeys' });
        liveSession();
      };
      const vaultGuard = await authorizeEncryptedVault(vaultPass);
      assertCurrent();
      vaultGuard?.();
      setVaultPhase('action');
      const assertAuthorized = (): void => { assertCurrent(); vaultGuard?.(); };
      const broadcast = await fn(assertAuthorized, controller.signal);
      // Once the transport accepts a transaction/order, a session lock cannot make it unsent.
      if (broadcast !== true) assertAuthorized();
    } catch (e) {
      if (operation.current === id && !controller.signal.aborted && authEpoch.current === epoch
        && currentBalanceScope.current === balanceScope && currentQuoteScope.current === quoteScope) {
        setError(captureUserMessage(e));
      }
    } finally {
      controller.abort();
      setVaultPass('');
      if (operation.current === id) {
        setBusy(false);
        setVaultPhase('idle');
      }
    }
  };

  /** WEB-APP-01: read the manifest back from the chain before anything is signed or requested from it. */
  const verified = async (rpc: Awaited<ReturnType<typeof app.getRpc>>, assertCurrent?: () => void): Promise<void> => {
    if (manifest === undefined) throw new Error('state');
    // Native confirmation's fee review also bounds public contract readback, before the helper's private preflight.
    // Once an in-flight response outlives that review, no later manifest request may be dispatched.
    assertCurrent?.();
    const checkedRpc = rpc === undefined || assertCurrent === undefined ? rpc : {
      ...rpc, async request(method: string, params: readonly unknown[]) {
        assertCurrent();
        const result = await rpc.request(method, params);
        assertCurrent();
        return result;
      },
    };
    const checked = await verifyManifestForFlow(manifest, checkedRpc);
    assertCurrent?.();
    if (checked.status !== 'loaded') throw new UserFacingError(checked.status === 'invalid' ? checked.reason : { key: 'sweep.paymentsDisabledChain' });
  };

  const onQuote = (): void => {
    const operationId = ++quoteOperation.current;
    const balanceId = balanceOperation.current;
    const current = (): boolean => quoteOperation.current === operationId
      && balanceOperation.current === balanceId && currentQuoteScope.current === quoteScope;
    void guard(async (assertCurrent, signal) => {
      try {
        const rpc = await app.getRpc(chainId, { action: 'sweep-quote', signal, allowDirectOnce: true });
        assertCurrent();
        if (!current()) return;
        await verified(rpc);
        assertCurrent();
        if (!current()) return;
        if (loaded === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
        const dest = checkDestination(destination, target.owner, loaded);
        const relayerContext = services.network?.authorize({ action: 'sweep-quote', category: 'relayer', endpoint: `${app.settings.relayerUrl.replace(/\/+$/, '')}/v1/quote`, signal, allowDirectOnce: true });
        const nextQuote = await getSweepQuote(app.settings.relayerUrl, { ...target, token: tokenAddr }, dest, balance, nowSec(), loaded.feeRecipient, relayerContext?.fetchFn ?? services.fetchFn);
        assertCurrent();
        if (current()) setQuote(nextQuote);
      } catch (e) {
        // A response for a changed review context must not restore its quote or its error.
        if (current()) throw e;
      }
    });
  };

  const onRelay = (): void => {
    if (signingLocked) return;
    const ledgerUnchanged = captureDestinationLedgerGuard();
    const balanceId = balanceOperation.current;
    const quoteId = quoteOperation.current;
    void guard(async (assertCurrent, signal) => {
      const assertReviewCurrent = (): void => {
        assertCurrent();
        if (balanceOperation.current !== balanceId || quoteOperation.current !== quoteId || currentQuoteScope.current !== quoteScope) {
          throw new UserFacingError({ key: 'sweep.vaultCancelled' });
        }
      };
      assertReviewCurrent();
      const rpc = await app.getRpc(chainId, { action: 'sweep-submit', signal, allowDirectOnce: true });
      assertReviewCurrent();
      await verified(rpc);
      assertReviewCurrent();
      if (loaded === undefined || rpc === undefined || quote === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      assertNoUnresolvedAttempt();
      // The order's lock is persisted before it is posted; a failed write aborts without contacting the relayer.
      const handoff: { lock?: SweepLock } = {};
      const onBeforeHandoff = (order: RelayedOrderRef): void => {
        assertReviewCurrent();
        const lock: SweepLock = { chainId, owner: target.owner, order, status: 'unknown-after-handoff' };
        beginSweepAttempt(lock);
        handoff.lock = lock;
      };
      let submitted: string;
      const relayerContext = services.network?.authorize({ action: 'sweep-submit', category: 'relayer', endpoint: `${app.settings.relayerUrl.replace(/\/+$/, '')}/v1/sweep`, signal, allowDirectOnce: true });
      try {
        submitted = await relayedSweep({ target: { ...target, token: tokenAddr }, manifest: loaded, destination: dest, amount: balance, quote: quote.quote, relayerUrl: app.settings.relayerUrl, rpc, nowSeconds: nowSec, fetchFn: relayerContext?.fetchFn ?? services.fetchFn, assertReviewCurrent, onBeforeHandoff });
      } catch (e) {
        // Only an explicit pre-broadcast refusal releases the lock; timeouts, 409 and 5xx stay unresolved until the
        // chain shows the order executed or expired.
        if (handoff.lock !== undefined && e instanceof RelayerRefusedError && e.beforeBroadcast) {
          resolveSweepAttempt(handoff.lock, { ...handoff.lock, status: 'refused' });
        }
        // Spec 04: a permit or grief-limit refusal gets its own honest text; never retried automatically.
        const permitKey = sweepPermitRefusalKey(e);
        if (permitKey !== undefined) throw new UserFacingError(sweepPermitSuggestsDirect(permitKey) ? { key: 'sweep.permit.withFallback', values: { reason: { key: permitKey }, fallback: { key: 'sweep.permit.directFallback' } } } : { key: permitKey });
        throw e;
      }
      setHash(submitted);
      recordSweepDestination(browserStorage(), chainId, dest, target.owner, ledgerUnchanged);
      // The relayed transaction may still land: keep signing disarmed for this address until its status is checked.
      // Compare-and-swap: a status check may already have resolved this order (and a newer lock may exist) while the
      // relayer was answering; never overwrite anything but the lock this flow created.
      if (handoff.lock !== undefined) resolveSweepAttempt(handoff.lock, { ...handoff.lock, expectedHash: submitted.toLowerCase() as `0x${string}`, status: 'submitted' });
      app.announce(latestT.current('sweep.announceRelayer'));
      return true;
    });
  };

  const onDirect = (): void => {
    if (signingLocked) return;
    sweepDirectly(false);
  };

  const assertNativeAttemptCurrent = (replaces: NativeReviewView['replaces']): void => {
    if (replaces === undefined) assertNoUnresolvedAttempt();
    else if (JSON.stringify(replaces) !== JSON.stringify(resignableLock())) throw new UserFacingError({ key: 'sweep.nativeReview.stale' });
  };

  const onPrepareNative = (resign = false): void => {
    if (tokenAddr !== 'native' || (!resign && signingLocked)) return;
    const balanceId = balanceOperation.current;
    const quoteId = ++quoteOperation.current;
    setNativeReview(undefined);
    void guard(async (assertCurrent, signal) => {
      let prepared: NativeDirectSweepReview | undefined;
      let published = false;
      const assertReviewCurrent = (): void => {
        assertCurrent();
        if (balanceOperation.current !== balanceId || quoteOperation.current !== quoteId || currentQuoteScope.current !== quoteScope) {
          throw new UserFacingError({ key: 'sweep.vaultCancelled' });
        }
      };
      try {
        assertReviewCurrent();
        // Preparation gets read-only authority. Confirmation later requests its own signing/broadcast action.
        const rpc = await app.getRpc(chainId, { action: 'sweep-quote', signal, allowDirectOnce: true });
        assertReviewCurrent();
        await verified(rpc, assertReviewCurrent);
        assertReviewCurrent();
        if (loaded === undefined || rpc === undefined || balance === undefined || balanceRpcUrl === undefined) throw new Error('state');
        const dest = checkDestination(destination, target.owner, loaded);
        const replaces = resign ? resignableLock() : undefined;
        assertNativeAttemptCurrent(replaces);
        prepared = await prepareNativeDirectSweep({ target, manifest: loaded, destination: dest, amount: balance, rpc,
          endpoint: balanceRpcUrl, context: quoteScope, assertReviewCurrent,
          ...(replaces === undefined ? {} : { replacement: replaces }) }, { nowMs: services.nowMs });
        assertReviewCurrent();
        assertNativeAttemptCurrent(replaces);
        setNativeReview({ review: prepared, ...(replaces === undefined ? {} : { replaces }) });
        published = true;
      } finally {
        if (!published && prepared !== undefined) cancelNativeSweepReview(prepared);
      }
    });
  };

  const onResign = (): void => {
    if (resignNonce === undefined) return;
    sweepDirectly(true);
  };

  /** `resign`: sign a replacement for the direct sweep whose handoff outcome is unknown, with exactly its nonce. */
  const sweepDirectly = (resign: boolean): void => {
    const selectedReview = tokenAddr === 'native' ? nativeReviewRef.current : undefined;
    if (tokenAddr === 'native') {
      if (selectedReview === undefined || (selectedReview.replaces !== undefined) !== resign) {
        setError({ key: 'sweep.nativeReview.stale' }); return;
      }
      // Remove the public review immediately so a second click cannot begin another action. Its helper capability
      // remains valid for this confirmation only; finally closes it even if vault/RPC initialization fails.
      setNativeReview(undefined, false);
    }
    const ledgerUnchanged = captureDestinationLedgerGuard();
    const balanceId = balanceOperation.current;
    const quoteId = quoteOperation.current;
    void guard(async (assertCurrent, signal) => {
      const handoff: { lock?: SweepLock } = {};
      const assertReviewCurrent = (): void => {
        assertCurrent();
        if (balanceOperation.current !== balanceId || quoteOperation.current !== quoteId || currentQuoteScope.current !== quoteScope) {
          throw new UserFacingError({ key: 'sweep.vaultCancelled' });
        }
        if (selectedReview !== undefined) {
          assertNativeSweepReview(selectedReview.review);
          if (handoff.lock === undefined) assertNativeAttemptCurrent(selectedReview.replaces);
        }
      };
      assertReviewCurrent();
      setDryRunSkipped(false);
      const rpc = await app.getRpc(chainId, { action: 'sweep-submit', signal, allowDirectOnce: true });
      assertReviewCurrent();
      await verified(rpc, selectedReview === undefined ? undefined : assertReviewCurrent);
      assertReviewCurrent();
      if (loaded === undefined || rpc === undefined || balance === undefined) throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      let replaces: (SweepLock & { readonly nonce: number }) | undefined;
      if (resign) replaces = resignableLock();
      else assertNoUnresolvedAttempt();
      // The lock is persisted before handoff; on an uncertain outcome it simply stays as begun (unknown-after-handoff).
      // A replacement takes over the recorded lock only by compare-and-swap and only with the same nonce, and the lock
      // as recorded keeps the replaced hashes.
      let res: DirectSweepResult;
      try {
        const input = {
          target, manifest: loaded, destination: dest, amount: balance, rpc, assertReviewCurrent,
          ...(replaces === undefined ? {} : { replaceNonce: replaces.nonce }),
          onBeforeHandoff: (a: Parameters<typeof beginSweepAttempt>[0]) => {
            assertReviewCurrent();
            handoff.lock = beginSweepAttempt(a, replaces);
          },
        };
        res = selectedReview === undefined ? await directSweep(input) : await confirmNativeDirectSweep(selectedReview.review, {
          ...input, endpoint: balanceRpcUrl ?? '', context: quoteScope,
          ...(replaces === undefined ? {} : { replacement: replaces }),
        });
      } catch (e) {
        // The transaction may be on the network with its dry run skipped: that warning applies here too (B-R6).
        if (e instanceof DirectSweepOutcomeUnknownError) setDryRunSkipped(e.simulation === 'unavailable');
        throw e;
      }
      if (handoff.lock !== undefined) resolveSweepAttempt(handoff.lock, { ...handoff.lock, status: res.attempt.status });
      recordSweepDestination(browserStorage(), chainId, dest, target.owner, ledgerUnchanged);
      setDryRunSkipped(res.simulation === 'unavailable');
      app.announce(latestT.current('sweep.announceBroadcast'));
      return true;
    }).finally(() => { if (selectedReview !== undefined) cancelNativeSweepReview(selectedReview.review); });
  };

  const assertNoUnresolvedAttempt = (): void => {
    if (isSweepJournalBroken()) throw new SweepJournalUnavailableError();
    const current = getSweepAttempt(chainId, target.owner);
    if (current !== undefined && isUnresolvedAttempt(current)) {
      throw new UserFacingError({ key: 'sweep.pendingBlocksSigning' });
    }
  };

  /** The direct lock with an unknown handoff outcome a replacement may take over, read again at signing time. */
  const resignableLock = (): SweepLock & { readonly nonce: number } => {
    if (isSweepJournalBroken()) throw new SweepJournalUnavailableError();
    const current = getSweepAttempt(chainId, target.owner);
    if (current === undefined || current.order !== undefined || current.nonce === undefined || current.status !== 'unknown-after-handoff') {
      throw new UserFacingError({ key: 'sweep.resign.nothingPending' });
    }
    if ((current.otherHashes?.length ?? 0) >= MAX_OTHER_HASHES) throw new UserFacingError({ key: 'sweep.resign.limit' });
    return { ...current, nonce: current.nonce };
  };

  const pendingNote: DisplayMessage = { key: attempt?.order !== undefined ? 'sweep.note.pendingRelayed' : 'sweep.note.pendingDirect' };

  const onCheckStatus = (): void => {
    if (attempt === undefined) return;
    actionAbort.current?.abort();
    const controller = new AbortController();
    actionAbort.current = controller;
    const current = (): boolean => !controller.signal.aborted && currentBalanceScope.current === balanceScope;
    setChecking(true);
    setCheckNote(undefined);
    void (async () => {
      try {
        const rpc = await app.getRpc(attempt.chainId, { action: 'sweep-status', signal: controller.signal, allowDirectOnce: true });
        if (!current()) return;
        if (rpc === undefined) {
          setCheckNote({ key: 'sweep.note.noRpc' });
          return;
        }
        const next = await reconcileSweepLock(rpc, attempt);
        if (!current()) return;
        if (next.status === attempt.status) setCheckNote(pendingNote);
        else if (!resolveSweepAttempt(attempt, next)) setCheckNote({ key: 'sweep.note.lockChanged' });
        else if (attempt.status === 'submitted' && next.status === 'unknown-after-handoff') setCheckNote({ key: 'sweep.note.rpcForgot' });
      } catch (e) {
        if (current()) setCheckNote(e instanceof UserFacingError ? captureUserMessage(e) : { key: 'sweep.note.checkFailed' });
      } finally {
        if (actionAbort.current === controller) setChecking(false);
        controller.abort();
      }
    })();
  };

  const cancelVaultCheck = (): void => {
    actionAbort.current?.abort();
    authEpoch.current += 1;
    setVaultPass('');
    setError({ key: 'sweep.vaultCancelled' });
    setNativeReview(undefined);
  };

  return (
    <section aria-labelledby="sw-h">
      <h2 id="sw-h">{t('sweep.title')}</h2>
      <dl className="details">
        <dt>{t('sweep.chain')}</dt>
        <dd>{findChain(chainId)?.name ?? String(chainId)}</dd>
        <dt>{t('sweep.oneTimeAddress')}</dt>
        <dd><Mono>{target.owner}</Mono></dd>
        <dt>{t('sweep.asset')}</dt>
        <dd>{symbol} {tokenAddr === 'native' ? '' : <Mono>{tokenAddr}</Mono>}</dd>
        <dt>{t('sweep.balanceOnChain')}</dt>
        <dd>{balance === undefined ? t('sweep.balanceUnknown') : `${formatUnits(balance, decimals)} ${symbol}`}</dd>
      </dl>
      <Notice kind="warn">
        {t(privatePathRequired ? 'sweep.balanceRead.warning' : 'sweep.balanceRead.note')}
        <p dir="ltr">{t('network.operationEndpoint', { endpoint: balanceRpcUrl ?? t('sweep.note.noRpc') })}</p>
        <br />
        <button type="button" className="btn" onClick={onReadBalance}>{t('sweep.balanceRead.button')}</button>
      </Notice>
      <ManifestBanner manifest={manifest} />
      {manifest !== undefined && loaded === undefined && <Notice kind="warn">{t('sweep.noManifest')}</Notice>}
      {tokenAddr !== 'native' && tokenCfg === undefined && <Notice kind="error">{t('sweep.tokenNotAllowed')}</Notice>}
      <Notice kind="warn" title={t('sweep.payerFollow.title')}>
        {t('sweep.payerFollow.body')}
      </Notice>

      <div className="stack">
        <p dir="ltr">{t('network.operationEndpoint', { endpoint: mode === 'relayer' ? app.settings.relayerUrl : (balanceRpcUrl ?? t('sweep.note.noRpc')) })}</p>
        <Field label={t('sweep.destination.label')}>{(id) => <input id={id} spellCheck={false} value={destination} onChange={(e) => { setDestination(e.target.value); setQuote(undefined); }} placeholder="0x…" />}</Field>
        {(vaultState === 'saved' || vaultStepUp) && (
          <Field label={t('sweep.vaultPass.label')} hint={t('sweep.vaultPass.hint')}>
            {(id, d) => <input ref={bindVaultInput} id={id} aria-describedby={d} type="password" autoComplete="off" name="ghostpay-step-up-sweep" value={vaultPass} onChange={(e) => { setVaultPass(e.target.value); }} />}
          </Field>
        )}
        {destWarning !== undefined && <Notice kind="warn">{t(destWarning === 'used' ? 'sweep.destination.used' : 'sweep.destination.knownWallet')}</Notice>}
        {vaultState === 'checking' && !vaultStepUp && <p role="status">{t('sweep.vaultChecking')}</p>}
        {vaultState === 'error' && !vaultStepUp && <Notice kind="error">{t('sweep.vaultError')}</Notice>}
        {loaded !== undefined && (
          <CameraImporter
            label={t('sweep.importQr')}
            onText={(text) => {
              try {
                const checked = checkDestination(text, target.owner, loaded);
                setDestination(checked);
                setQuote(undefined);
                setError(undefined);
                return true;
              } catch (e) {
                setError(captureUserMessage(e));
                return false;
              }
            }}
          />
        )}
        <fieldset>
          <legend>{t('sweep.feeLegend')}</legend>
          <div className="check">
            <input id="m-relay" type="radio" name="mode" checked={mode === 'relayer'} onChange={() => { setMode('relayer'); }} />
            <label htmlFor="m-relay">{t('sweep.modeRelayer')}</label>
          </div>
          <div className="check">
            <input id="m-direct" type="radio" name="mode" checked={mode === 'direct'} onChange={() => { setMode('direct'); }} />
            <label htmlFor="m-direct">{t('sweep.modeDirect')}</label>
          </div>
        </fieldset>

        {mode === 'relayer' ? (
          <>
            {!relayerOk && <Notice kind="info">{t('sweep.relayerNeeds')}</Notice>}
            <button type="button" className="btn" onClick={onQuote} disabled={busy || !relayerOk || balance === undefined || balance === 0n}>{t('sweep.getQuote')}</button>
            {quote !== undefined && (
              <div className="panel">
                <p>{t('sweep.relayerFee', { amount: `${formatUnits(quote.quote.fee, decimals)} ${symbol}` })} <Mono>{quote.quote.feeTo}</Mono></p>
                <p>{t('sweep.youReceive', { amount: `${formatUnits(quote.net, decimals)} ${symbol}` })}</p>
                <button type="button" className="btn btn-primary" onClick={onRelay} disabled={busy || signingLocked}>{t('sweep.signRelayer')}</button>
              </div>
            )}
          </>
        ) : tokenAddr === 'native' ? (
          <>
            <button type="button" className="btn" onClick={() => { onPrepareNative(); }} disabled={busy || signingLocked || balance === undefined || balance === 0n}>{t('sweep.nativeReview.prepare')}</button>
            {nativeReview !== undefined && (
              <section className="panel" aria-labelledby="native-sweep-review-h">
                <h3 id="native-sweep-review-h">{t('sweep.nativeReview.title')}</h3>
                <dl className="details">
                  <dt>{t('sweep.destination.label')}</dt><dd><Mono>{nativeReview.review.destination}</Mono></dd>
                  <dt>{t('sweep.nativeReview.balance')}</dt><dd>{formatUnits(nativeReview.review.balance, 18)} {symbol}</dd>
                  <dt>{t('sweep.nativeReview.nonce')}</dt><dd>{String(nativeReview.review.nonce)}</dd>
                  <dt>{t('sweep.nativeReview.gasLimit')}</dt><dd>{String(nativeReview.review.gas)}</dd>
                  <dt>{t('sweep.nativeReview.maxFeePerGas')}</dt><dd>{formatUnits(nativeReview.review.maxFeePerGas, 9)} gwei</dd>
                  <dt>{t('sweep.nativeReview.maxPriorityFeePerGas')}</dt><dd>{formatUnits(nativeReview.review.maxPriorityFeePerGas, 9)} gwei</dd>
                  <dt>{t('sweep.nativeReview.gasReserve')}</dt><dd>{formatUnits(nativeReview.review.maxGasCost, 18)} {symbol}</dd>
                  <dt>{t('sweep.nativeReview.additionalReserve')}</dt><dd>{formatUnits(nativeReview.review.additionalFeeReserve, 18)} {symbol}</dd>
                  <dt>{t('sweep.nativeReview.totalReserve')}</dt><dd>{formatUnits(nativeReview.review.totalFeeReserve, 18)} {symbol}</dd>
                </dl>
                <p>{t('sweep.youReceive', { amount: `${formatUnits(nativeReview.review.net, 18)} ${symbol}` })}</p>
                <p>{t('sweep.nativeReview.expiry', { time: formatUnix(nativeReview.review.expiresAtMs / 1000) })}</p>
                <p>{t('sweep.nativeReview.terms')}</p>
                {nativeReview.review.simulation === 'unavailable' && <Notice kind="warn">{t('sweep.nativeReview.simulationUnavailable')}</Notice>}
                <button type="button" className="btn" onClick={() => { setNativeReview(undefined); }}>{t('sweep.nativeReview.cancel')}</button>
                {nativeReview.replaces !== undefined && <button type="button" className="btn btn-primary" onClick={onResign} disabled={busy || resignNonce === undefined}>{t('sweep.resign.button')}</button>}
              </section>
            )}
            <button type="button" className="btn btn-primary" onClick={onDirect} disabled={busy || signingLocked || nativeReview === undefined || nativeReview.replaces !== undefined}>{t('sweep.signDirect')}</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onDirect} disabled={busy || signingLocked || balance === undefined || balance === 0n}>{t('sweep.signDirect')}</button>
        )}
      </div>

      {busy && <p role="status">{t('sweep.working')}</p>}
      {busy && vaultPhase === 'authorizing' && <button type="button" className="btn" onClick={cancelVaultCheck}>{t('sweep.cancelVault')}</button>}
      {busy && vaultPhase === 'action' && tokenAddr === 'native' && <button type="button" className="btn" onClick={cancelVaultCheck}>{t('sweep.nativeReview.cancelAction')}</button>}
      {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
      {dryRunSkipped && <Notice kind="warn">{t('sweep.dryRunUnavailable')}</Notice>}
      {journalBroken && <Notice kind="warn" title={t('sweep.journalBroken.title')}>{t('sweep.journalBroken.body')}</Notice>}
      {attempt !== undefined && (
        <Notice
          kind={attempt.status === 'submitted' || attempt.status === 'included' ? 'ok' : 'warn'}
          title={t(attempt.order !== undefined && attempt.status === 'included' ? 'sweep.attempt.executed' : ATTEMPT_TITLES[attempt.status] ?? 'sweep.submitted')}
        >
          {attempt.status === 'unknown-after-handoff' && <>{attempt.order === undefined
            ? t('sweep.attempt.unknownDirect')
            : t('sweep.attempt.unknownRelayed', { deadline: new Date(attempt.order.deadline * 1000).toISOString(), minutes: String(RELAYED_EXPIRY_MARGIN_SECONDS / 60) })}<br /></>}
          {attempt.status === 'expired' && <>{t('sweep.attempt.expiredBody')}<br /></>}
          {attempt.status === 'replaced' && <>{t('sweep.attempt.replacedBody')}<br /></>}
          {attempt.status === 'refused' && attempt.order !== undefined && <>{t('sweep.attempt.refusedBody', { deadline: new Date(attempt.order.deadline * 1000).toISOString() })}<br /></>}
          {attempt.expectedHash !== undefined && (
            <>
              {t('sweep.txHash')} <Mono>{attempt.expectedHash}</Mono> <CopyButton text={attempt.expectedHash} label={t('sweep.copyHash')} />
              {attempt.order !== undefined && <> {t('sweep.attempt.relayerHashUnverified')}</>}
              <br />
              {t('sweep.checkExplorer')}
            </>
          )}
          {isUnresolvedAttempt(attempt) && (
            <>
              <br />
              <button type="button" className="btn" onClick={onCheckStatus} disabled={checking}>{t('sweep.checkStatus')}</button>
            </>
          )}
          {replacementLimitReached && signingLocked && attempt.order === undefined && <><br />{t('sweep.resign.limit')}</>}
          {resignNonce !== undefined && (
            <>
              <br />
              {t('sweep.resign.hint', { nonce: String(resignNonce) })}
              <br />
              {tokenAddr === 'native'
                ? <button type="button" className="btn" onClick={() => { onPrepareNative(true); }} disabled={busy || mode !== 'direct' || balance === undefined || balance === 0n}>{t('sweep.nativeReview.prepareReplacement')}</button>
                : <button type="button" className="btn" onClick={onResign} disabled={busy || balance === undefined || balance === 0n}>{t('sweep.resign.button')}</button>}
            </>
          )}
          {checkNote !== undefined && <><br />{displayMessage(checkNote, t)}</>}
        </Notice>
      )}
      {hash !== undefined && (
        <Notice kind="ok" title={t('sweep.submitted')}>
          {t('sweep.txHash')} <Mono>{hash}</Mono> <CopyButton text={hash} label={t('sweep.copyHash')} />
          <br />
          {t('sweep.checkExplorer')}
        </Notice>
      )}
    </section>
  );
}

// i18n-use: sweep.announceBroadcast sweep.announceRelayer sweep.asset sweep.attempt.executed sweep.attempt.expired sweep.attempt.expiredBody sweep.attempt.included sweep.attempt.refused sweep.attempt.refusedBody sweep.attempt.relayerHashUnverified sweep.attempt.replaced sweep.attempt.replacedBody sweep.attempt.reverted sweep.attempt.unknown sweep.attempt.unknownDirect sweep.attempt.unknownRelayed sweep.balanceOnChain sweep.balanceRead.button sweep.balanceRead.note sweep.balanceRead.warning sweep.balanceUnknown sweep.cancelVault sweep.chain sweep.checkExplorer sweep.checkStatus sweep.choosePayment sweep.copyHash sweep.destination.label sweep.dryRunUnavailable sweep.feeLegend sweep.getQuote sweep.goToScan sweep.importQr sweep.journalBroken.body sweep.journalBroken.title sweep.keysGone sweep.modeDirect sweep.modeRelayer sweep.noManifest sweep.note.checkFailed sweep.note.lockChanged sweep.note.noRpc sweep.note.pendingDirect sweep.note.pendingRelayed sweep.note.rpcForgot sweep.oneTimeAddress sweep.payerFollow.body sweep.payerFollow.title sweep.paymentsDisabledChain sweep.pendingBlocksSigning sweep.permit.directFallback sweep.permit.withFallback sweep.relayerFee sweep.relayerNeeds sweep.resign.button sweep.resign.hint sweep.resign.limit sweep.resign.nothingPending sweep.signDirect sweep.signRelayer sweep.submitted sweep.title sweep.tokenFallback sweep.tokenNotAllowed sweep.txHash sweep.vaultCancelled sweep.vaultCancelledKeys sweep.vaultChecking sweep.vaultError sweep.vaultPass.hint sweep.vaultPass.label sweep.working sweep.youReceive

// i18n-use: sweep.destination.used sweep.destination.knownWallet
