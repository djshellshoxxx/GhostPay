import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_FORK_HEADERS, SilentPaymentError, zeroize, createScanState, type ScanState, type HeaderChain } from '@ghostpay/btc-silent-payments';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { BroadcastReference } from '../../components/BroadcastReference';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { CameraImporter } from '../../components/CameraImporter';
import { QrFrame } from '../../components/QrFrame';
import { clearCopiedBackup, SecretBackup } from '../../components/SecretBackup';
import { subscribeAppLock } from '../../lib/appLock';
import { IdbReconciliationVaultStore, type ReconciliationVaultStore } from '../../lib/reconciliationVault';
import { BtcScanVault } from './scanStore';
import { UserFacingError, displayMessage, type MessageDescriptor } from '../../lib/errors';
import { referencedBroadcastOutcome, TRANSACTION_PHASE_KEYS, type TransactionOutcome } from '../../lib/transactionOutcome';
import { useServices } from '../../lib/services';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import { EsploraClient, normalizeEsploraUrl } from './esplora';
import {
  EsploraHeaderSource,
  HeaderSyncError,
  idbHeaderStore,
  MAX_HEADERS,
  type HeaderSyncOutcome,
  invalidateReorged,
  loadHeaderChain,
  memoryHeaderStore,
  syncHeaders,
  type HeaderStoreFor,
} from './headers';
import { BTC_NETWORKS, btcNetwork, type BtcNetworkId } from './network';
import { scanForPaymentsInWorker, type BtcScanWorkerFactory } from './scanWorkerClient';
import { normalizeOracleConfig, type BtcOracleConfig } from './oracleSource';
import { MAX_SCAN_BLOCKS, wipeFound, type FoundPayment, type ScanResult } from './scan';
import { captureBtcErrorMessage, checkDestination, formatBtc, reviewSweep, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { SCAN_CHECK_KEYS, SCAN_LIMIT_KEYS, SCAN_MODE_KEYS } from './verification';
import { paymentUri, randomSeedHex, walletFromSeedHex, wipeWallet, type BtcWallet } from './wallet';

interface HeaderNote {
  readonly kind: 'info' | 'warn' | 'error' | 'ok';
  readonly text: MessageDescriptor;
}

function defaultHeaderStore(): { readonly storeFor: HeaderStoreFor; readonly persistent: boolean } {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  return idb === undefined ? { storeFor: memoryHeaderStore(), persistent: false } : { storeFor: idbHeaderStore(idb), persistent: true };
}

/**
 * Bitcoin silent payments (BIP-352), test networks only. Keys live in this component's state and
 * vanish when you leave the view; keys and spend tweaks are never persisted. Opt-in encrypted scan metadata
 * resumes only after importing the same wallet and revalidates prior outputs before spending. Lock, a new wallet and unmount wipe the
 * scan and spend secrets; a new scan, lock and unmount wipe the spend tweaks of the scan results.
 * A created wallet's seed is kept as bytes for its backup, shown only on request, and wiped with the keys.
 *
 * Block headers (public chain data) are checked on this device (`headers.ts`) and saved per network in IndexedDB
 * when the browser has it; every scanned block must be on that checked chain. Saved headers are validated again
 * on load and discarded on any failure. `headerStore` replaces that storage (tests).
 */
export function BtcView(
  props: { readonly scanWorkerFactory?: BtcScanWorkerFactory; readonly scanStore?: ReconciliationVaultStore; readonly headerStore?: HeaderStoreFor; readonly headerSyncLimits?: { readonly maxRounds?: number; readonly headersPerRound?: number; readonly maxHeaders?: number } } = {},
): ReactNode {
  const services = useServices();
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [netId, setNetId] = useState<BtcNetworkId>('testnet4');
  const [url, setUrl] = useState('');
  const [oracleKind, setOracleKind] = useState<'none' | 'http' | 'grpc'>('none');
  const [oracleUrl, setOracleUrl] = useState('');
  const [lightScan, setLightScan] = useState(false);
  const [secondOracle, setSecondOracle] = useState(false);
  const [secondKind, setSecondKind] = useState<'http' | 'grpc'>('http');
  const [secondUrl, setSecondUrl] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [wallet, setWallet] = useState<BtcWallet | undefined>(undefined);
  /** A created wallet offers its backup seed on request; an imported seed is the user's own copy already. */
  const [hasBackup, setHasBackup] = useState(false);
  const [amount, setAmount] = useState('');
  const [fromHeight, setFromHeight] = useState('');
  // Spec 12 local spend tracking: the server is asked per outpoint only on request (light oracle scans have no block spends).
  const [providerCheck, setProviderCheck] = useState(false);
  const [saveScan, setSaveScan] = useState(false);
  const [savedScan, setSavedScan] = useState<ScanState | undefined>();
  const [forgetScan, setForgetScan] = useState(false);
  const [scanStorage] = useState(() => props.scanStore ?? (typeof globalThis.indexedDB === 'undefined' ? undefined : new IdbReconciliationVaultStore()));
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<MessageDescriptor | undefined>(undefined);
  const [scan, setScan] = useState<ScanResult | undefined>(undefined);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [destination, setDestination] = useState('');
  const [feeRate, setFeeRate] = useState('1');
  const [review, setReview] = useState<SweepReview | undefined>(undefined);
  const [approved, setApproved] = useState(false);
  const [signed, setSigned] = useState<SignedSweep | undefined>(undefined);
  const [broadcastOutcome, setBroadcastOutcome] = useState<TransactionOutcome | undefined>(undefined);
  const currentBroadcast = broadcastOutcome?.reference === signed?.txid ? broadcastOutcome : undefined;
  const [error, setError] = useState<MessageDescriptor | undefined>(undefined);
  /** The app lock (idle timeout) forgot the wallet: say so instead of silently showing an empty view. */
  const [appLocked, setAppLocked] = useState(false);
  const abort = useRef<AbortController | undefined>(undefined);
  /** Bumped by every new async action and by lock/unmount: results of older actions are dropped. */
  const op = useRef(0);
  const walletRef = useRef<BtcWallet | undefined>(undefined);
  /** Seed of a created wallet, as bytes so that Lock, a new wallet and unmount can wipe it. */
  const seedRef = useRef<Uint8Array | undefined>(undefined);
  const scanRef = useRef<ScanResult | undefined>(undefined);
  const [headerStorage] = useState(() => (props.headerStore === undefined ? defaultHeaderStore() : { storeFor: props.headerStore, persistent: true }));
  /** The checked header chain of the network it was loaded for (public data; kept across lock). */
  const chainRef = useRef<{ readonly netId: BtcNetworkId; readonly chain: HeaderChain } | undefined>(undefined);
  const [headerNotes, setHeaderNotes] = useState<readonly HeaderNote[]>([]);
  const [headerProgress, setHeaderProgress] = useState<MessageDescriptor | undefined>(undefined);
  /** Height the checked header chain reaches; payments above it are kept but cannot be swept. */
  const [checkedTip, setCheckedTip] = useState<number | undefined>(undefined);
  const [confirmForget, setConfirmForget] = useState(false);
  /** Mirrors `scanning` for click handlers: no review, signature or broadcast while a check or scan runs. */
  const scanningRef = useRef(false);
  /** Sets the busy state and its ref together, so render and click handlers always agree. */
  const setBusy = (b: boolean): void => {
    scanningRef.current = b;
    setScanning(b);
  };
  /** Bumped by "Forget saved headers": a sync started before it may neither save nor change scan results. */
  const forgetGen = useRef(0);
  const net = btcNetwork(netId);
  const usingLightScan = oracleKind !== 'none' && lightScan;

  const invalidate = (): void => {
    op.current++;
    abort.current?.abort();
    setBusy(false);
    setHeaderProgress(undefined);
  };

  const begin = (): { readonly signal: AbortSignal; readonly live: () => boolean } => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const mine = ++op.current;
    return { signal: ac.signal, live: () => op.current === mine };
  };

  useEffect(
    () => () => {
      op.current++;
      abort.current?.abort();
      if (walletRef.current !== undefined) wipeWallet(walletRef.current);
      if (seedRef.current !== undefined) zeroize(seedRef.current);
      if (scanRef.current !== undefined) wipeFound(scanRef.current.found);
    },
    [],
  );

  const forgetSeed = (): void => {
    if (seedRef.current !== undefined) zeroize(seedRef.current);
    seedRef.current = undefined;
    setHasBackup(false);
  };

  /** Clears every selection and the review, approval, signature, broadcast and scan-note state. */
  const clearFlowState = (): void => {
    setPicked(new Set());
    setReview(undefined);
    setApproved(false);
    setSigned(undefined);
    setBroadcastOutcome(undefined);
    setScanNote(undefined);
  };

  const resetFlow = (): void => {
    if (scanRef.current !== undefined) wipeFound(scanRef.current.found);
    scanRef.current = undefined;
    setScan(undefined);
    clearFlowState();
  };
  const changeSource = (): void => {
    invalidate(); resetFlow(); setProviderCheck(false); setError(undefined); setSaveScan(false); setSavedScan(undefined); setForgetScan(false);
  };
  const oracleSelection = (): BtcOracleConfig | undefined => oracleKind === 'none' ? undefined : normalizeOracleConfig({
    kind: oracleKind, url: oracleUrl, mode: lightScan ? 'light' : 'full',
    ...(secondOracle ? { second: { kind: secondKind, url: secondUrl } } : {}),
  }, url);
  const persistencePolicy = (oracle: BtcOracleConfig | undefined): string | undefined => oracle === undefined ? undefined
    : JSON.stringify({ esplora: normalizeEsploraUrl(url), oracle });

  const guard = (f: () => void): void => {
    setError(undefined);
    try {
      f();
    } catch (e) {
      setError(captureBtcErrorMessage(e));
    }
  };

  const client = (): EsploraClient => {
    normalizeEsploraUrl(url);
    return new EsploraClient({ baseUrl: url, fetchFn: services.fetchFn });
  };

  const useSeed = (hex: string, offerBackup: boolean): void => {
    guard(() => {
      const w = walletFromSeedHex(hex, net);
      invalidate();
      if (walletRef.current !== undefined) wipeWallet(walletRef.current);
      forgetSeed();
      resetFlow();
      walletRef.current = w;
      if (offerBackup) seedRef.current = hexToBytes(hex);
      setHasBackup(offerBackup);
      setWallet(w);
      setAppLocked(false);
      setSeedInput('');
      setSaveScan(false);
      setSavedScan(undefined);
      setForgetScan(false);
      setProviderCheck(false);
    });
  };

  const uri = useMemo(() => {
    if (wallet === undefined) return undefined;
    try {
      const sats = amount.trim() === '' ? undefined : BigInt(Math.round(Number(amount) * 1e8));
      return paymentUri(wallet, sats !== undefined && sats > 0n ? sats : undefined);
    } catch {
      return paymentUri(wallet);
    }
  }, [wallet, amount]);

  /** Both payment inclusion and sufficient spentness evidence must remain current. */
  const spentStatus = scan?.spentStatus === 'local' && checkedTip !== undefined && scan.toHeight !== checkedTip ? 'unknown' : scan?.spentStatus;
  const sweepable = (f: FoundPayment): boolean => spentStatus !== undefined && spentStatus !== 'unknown' && checkedTip !== undefined && f.height <= checkedTip;
  const selected: readonly FoundPayment[] = scan === undefined ? [] : scan.found.filter((f) => sweepable(f) && picked.has(`${f.txid}:${String(f.vout)}`));

  /** Inputs of the review all sit in blocks the checked header chain reaches. */
  const inputsChecked = (r: SweepReview | undefined): boolean => {
    // The live chain too: a running check updates it in place before React state catches up.
    const live = chainRef.current?.netId === net.id ? chainRef.current.chain : undefined;
    return (
      r !== undefined &&
      live !== undefined &&
      (scan?.spentStatus !== 'local' || scan.toHeight === live.tipHeight) &&
      r.inputs.every((i) => {
        const f = scan?.found.find((x) => x.txid === i.txid && x.vout === i.vout);
        return f !== undefined && sweepable(f) && live.hashAt(f.height) === f.blockHash;
      })
    );
  };
  /** For the click handlers: also refuse while any check or scan runs (the buttons render from `scanning`). */
  const reviewChecked = (r: SweepReview | undefined): boolean => !scanningRef.current && inputsChecked(r);

  /** Forgets the review, approval, signature and broadcast state, and every selection that cannot be swept now. */
  const clearSweepFlow = (): void => {
    setReview(undefined);
    setApproved(false);
    setSigned(undefined);
    setBroadcastOutcome(undefined);
    setPicked((cur) => new Set([...cur].filter((id) => scan?.found.some((f) => `${f.txid}:${String(f.vout)}` === id && sweepable(f)) === true)));
  };

  // Whenever the checked tip drops below a reviewed input (or headers are gone), the sweep must be reviewed again.
  useEffect(() => {
    if (review !== undefined && !inputsChecked(review)) clearSweepFlow();
  }, [checkedTip, scan, review]);

  /** Drops scan results from blocks that left the checked chain; wipes their spend tweaks. */
  const applyChainToScan = (chain: HeaderChain): HeaderNote[] => {
    const current = scanRef.current;
    if (current === undefined) return [];
    const { scan: next, dropped } = invalidateReorged(current, chain);
    if (next === current) return [];
    const kept = new Set((next?.found ?? []).map((f) => f.spendTweak));
    for (const d of dropped) if (!kept.has(d.spendTweak)) zeroize(d.spendTweak);
    scanRef.current = next;
    setScan(next);
    clearFlowState();
    return [
      next === undefined
        ? { kind: 'warn', text: { key: 'btc.headers.scanDiscarded' } }
        : dropped.length === 0 && next.spentStatus === 'unknown'
          ? { kind: 'warn', text: { key: 'btc.scan.spentEvidenceChanged' } }
        : { kind: 'warn', text: { key: 'btc.headers.resultsDropped', values: { height: String(next.toHeight), count: String(dropped.length) } } },
    ];
  };

  /**
   * Loads (or reuses) the checked header chain of the selected network and syncs it with the server. Every
   * outcome is reported in the header notes. Returns `undefined` when the check failed (fail closed: no scan).
   */
  const checkHeaders = async (c: EsploraClient, signal: AbortSignal, live: () => boolean): Promise<HeaderChain | undefined> => {
    const notes: HeaderNote[] = [];
    const gen = forgetGen.current;
    let chain: HeaderChain;
    let fresh = false;
    if (chainRef.current?.netId === net.id) {
      chain = chainRef.current.chain;
    } else {
      fresh = true;
      if (live()) setHeaderProgress({ key: 'btc.headers.loading', values: { height: '0' } });
      const loaded = await loadHeaderChain(net, headerStorage.storeFor(net.id), {
        onProgress: (h) => { if (live()) setHeaderProgress({ key: 'btc.headers.loading', values: { height: String(h) } }); },
      });
      if (!live()) return undefined;
      chain = loaded.chain;
      if (forgetGen.current === gen) chainRef.current = { netId: net.id, chain };
      if (loaded.loaded === 'restored') notes.push({ kind: 'info', text: { key: 'btc.headers.restored', values: { count: String(chain.tipHeight) } } });
      if (loaded.loaded === 'discarded') notes.push({ kind: 'warn', text: { key: 'btc.headers.discarded' } });
    }
    if (live()) setHeaderProgress({ key: 'btc.headers.checking' });
    const before = chain.tipHash;
    let out: HeaderSyncOutcome | undefined;
    let failure: unknown;
    try {
      out = await syncHeaders({
        chain,
        sources: [new EsploraHeaderSource(c)],
        store: headerStorage.storeFor(net.id),
        signal,
        canSave: () => live() && forgetGen.current === gen,
        ...props.headerSyncLimits,
        onProgress: (h) => { if (live()) setHeaderProgress({ key: 'btc.headers.progress', values: { height: String(h) } }); },
      });
    } catch (e) {
      failure = e;
    } finally {
      if (live()) setHeaderProgress(undefined);
    }
    // Only the active operation owns the displayed chain. It may have switched before a failure, or just loaded a
    // different stored chain: reconcile its results before offering any sweep, but never let an old wallet/source
    // operation mutate a newer session after a late storage or transport response.
    if (!live()) return undefined;
    const dropped = forgetGen.current !== gen || (!fresh && chain.tipHash === before) ? [] : applyChainToScan(chain);
    if (forgetGen.current === gen) setCheckedTip(chain.tipHeight);
    const partial = out ?? (failure instanceof HeaderSyncError ? failure.partial : undefined);
    if (partial?.reorgFrom !== undefined) notes.push({ kind: 'warn', text: { key: 'btc.headers.reorg', values: { height: String(partial.reorgFrom) } } });
    if (partial?.lessWork === true) notes.push({ kind: 'warn', text: { key: 'btc.headers.lessWork' } }, { kind: 'info', text: { key: 'btc.headers.conflictHint' } });
    notes.push(...dropped);
    if (out === undefined) {
      const code = failure instanceof SilentPaymentError ? failure.code : undefined;
      const reason: MessageDescriptor =
        code === 'FORK_TOO_DEEP' ? { key: 'btc.headers.forkTooDeep', values: { max: String(DEFAULT_FORK_HEADERS) } }
          : code === 'FORK_UNRESOLVED' ? { key: 'btc.headers.forkUnresolved' }
            : code === 'UNSUPPORTED' ? { key: 'btc.headers.tooMany', values: { max: String(props.headerSyncLimits?.maxHeaders ?? MAX_HEADERS) } }
              : code === 'INVALID_HEADER' ? { key: 'btc.headers.claimRejected' }
              : captureBtcErrorMessage(failure);
      notes.push({ kind: 'error', text: { key: 'btc.headers.failed', values: { reason } } });
      if (code === 'FORK_TOO_DEEP' || code === 'FORK_UNRESOLVED') notes.push({ kind: 'info', text: { key: 'btc.headers.conflictHint' } });
      if (live()) setHeaderNotes(notes);
      return undefined;
    }
    if (out.refused) notes.push({ kind: 'warn', text: { key: 'btc.headers.otherTab' } });
    else if (!headerStorage.persistent || !out.saved) notes.push({ kind: 'info', text: { key: 'btc.headers.notSaved' } });
    notes.push({ kind: 'ok', text: { key: 'btc.headers.verified', values: { height: String(chain.tipHeight), hash: chain.tipHash } } });
    if (out.more) notes.push({ kind: 'info', text: { key: 'btc.headers.more', values: { height: String(chain.tipHeight) } } });
    if (!live()) return undefined;
    setHeaderNotes(notes);
    return chain;
  };

  /** Deletes this network's saved headers and forgets the checked chain; the next check starts at genesis. */
  const forgetHeaders = (): void => {
    setError(undefined);
    const { live } = begin();
    chainRef.current = undefined;
    forgetGen.current++;
    setCheckedTip(undefined);
    setConfirmForget(false);
    setBusy(false);
    clearSweepFlow();
    // Every selection goes: none was made against headers that are checked now.
    setPicked(new Set());
    void (async () => {
      let ok = true;
      try {
        await headerStorage.storeFor(net.id).clear();
      } catch {
        ok = false;
      }
      if (live()) setHeaderNotes([{ kind: ok ? 'info' : 'error', text: ok ? { key: 'btc.headers.forgotten' } : { key: 'btc.headers.forgetFailed' } }]);
    })();
  };

  const updateHeaders = (): void => {
    setError(undefined);
    const { signal, live } = begin();
    setBusy(true);
    void (async () => {
      try {
        const c = client();
        await c.checkNetwork(net, signal);
        await checkHeaders(c, signal, live);
      } catch (e) {
        if (live()) setError(captureBtcErrorMessage(e));
      } finally {
        if (live()) setBusy(false);
      }
    })();
  };

  /** Loading and deleting metadata are explicit local actions and never contact an Esplora server. */
  const loadSavedScan = (remove = false): void => {
    if (wallet === undefined || scanStorage === undefined || scanningRef.current) return;
    resetFlow(); setError(undefined);
    const { live, signal } = begin(); setBusy(true);
    const guard = (): void => { if (!live() || signal.aborted || walletRef.current !== wallet) throw new Error('stale Bitcoin scan session'); };
    void (async () => {
      let vault: BtcScanVault | undefined;
      try {
        vault = await BtcScanVault.open(wallet, scanStorage, guard, persistencePolicy(oracleSelection()));
        if (remove) { await vault.forget(); guard(); setSavedScan(undefined); setForgetScan(false); }
        else {
          const saved = await vault.load(); guard(); setSavedScan(saved);
          if (saved !== undefined) setFromHeight(String(saved.birthHeight));
        }
      } catch { if (live()) setError({ key: 'btc.persistence.error' }); }
      finally { vault?.lock(); if (live()) setBusy(false); }
    })();
  };

  const runScan = (recoveryOffset = 0): void => {
    setError(undefined);
    if (wallet === undefined) return;
    if (usingLightScan && !providerCheck) { setError({ key: 'btc.scan.providerCheckLight' }); return; }
    resetFlow();
    const { signal, live } = begin();
    setBusy(true);
    void (async () => {
      let vault: BtcScanVault | undefined;
      let storageFailed = false;
      try {
        const guard = (): void => { if (!live() || signal.aborted || walletRef.current !== wallet) throw new Error('stale Bitcoin scan session'); };
        const oracle = oracleSelection();
        let resumeState: ScanState | undefined;
        let from = Number(fromHeight);
        if (saveScan && scanStorage !== undefined) {
          try {
            vault = await BtcScanVault.open(wallet, scanStorage, guard, persistencePolicy(oracle));
            resumeState = await vault.load(); guard();
            if (resumeState !== undefined) { from = resumeState.birthHeight; setFromHeight(String(from)); setSavedScan(resumeState); }
          } catch (e) { storageFailed = true; throw e; }
        }
        const c = client();
        await c.checkNetwork(net, signal);
        if ((resumeState === undefined && fromHeight.trim() === '') || !Number.isInteger(from) || from < 0) throw new UserFacingError({ key: 'btc.scan.firstHeightRequired' });
        const headers = await checkHeaders(c, signal, live);
        if (headers === undefined) return;
        if (from > headers.tipHeight) throw new UserFacingError({ key: 'btc.headers.behind', values: { height: String(headers.tipHeight) } });
        const res = await scanForPaymentsInWorker({
          client: c,
          wallet,
          fromHeight: from,
          headers,
          signal,
          ...(oracle === undefined ? {} : { oracle }),
          providerSpentCheck: providerCheck,
          ...(vault === undefined ? {} : {
            resumeState: resumeState ?? createScanState(net.id, from),
            recoveryOffset,
            onState: async (state: ScanState): Promise<void> => {
              try { guard(); await vault?.save(state); guard(); setSavedScan(state); }
              catch (e) { storageFailed = true; throw e; }
            },
          }),
          onBlock: (h) => { if (live()) setScanNote({ key: 'btc.scan.foundBlock', values: { height: String(h) } }); },
        }, props.scanWorkerFactory, services.fetchFn);
        if (!live()) {
          wipeFound(res.found);
          return;
        }
        scanRef.current = res;
        setScan(res);
        setScanNote({ key: 'btc.scan.scanned', values: { from: String(res.fromHeight), to: String(res.toHeight) } });
        // Nothing is selected: spending outputs together links them publicly (PRIVACY-E2E-03), so each is an explicit choice.
      } catch (e) {
        if (live()) {
          setError(storageFailed ? { key: 'btc.persistence.error' } : captureBtcErrorMessage(e));
          // The server's blocks disagree with the checked headers: say how to recover if that is expected.
          if (e instanceof SilentPaymentError && e.code === 'REORG_DETECTED') {
            const hint: MessageDescriptor = { key: 'btc.headers.conflictHint' };
            setHeaderNotes((n) => (n.some((x) => x.text.key === hint.key) ? n : [...n, { kind: 'info', text: hint }]));
          }
        }
      } finally {
        vault?.lock();
        if (live()) setBusy(false);
      }
    })();
  };

  /** Authority edits invalidate pending sign/broadcast work; an attempted request keeps its public reference. */
  const clearSigning = (): void => {
    invalidate();
    setApproved(false);
    setSigned(undefined);
    setBroadcastOutcome((current) => current?.phase === 'broadcast-attempted' && current.reference !== undefined
      ? referencedBroadcastOutcome('broadcast-unknown', current.reference) : current);
  };

  const clearReview = (): void => {
    clearSigning();
    setReview(undefined);
  };

  const doReview = (): void => {
    if (wallet === undefined || scanningRef.current) return;
    guard(() => {
      clearReview();
      const rate = Number(feeRate);
      setReview(reviewSweep(wallet, selected, destination, rate));
      setApproved(false);
      setSigned(undefined);
    });
  };

  const doSign = (): void => {
    if (wallet === undefined || review === undefined || !approved || !reviewChecked(review)) return;
    setError(undefined);
    const { live } = begin();
    void (async () => {
      try {
        const out = await signSweep(wallet, selected, review);
        if (live()) setSigned(out);
      } catch (e) {
        if (live()) setError(captureBtcErrorMessage(e));
      }
    })();
  };

  const doBroadcast = (): void => {
    if (signed === undefined || !approved || !reviewChecked(review) || currentBroadcast?.phase === 'broadcast-attempted' || currentBroadcast?.phase === 'pending-confirmation') return;
    setError(undefined);
    const { live } = begin();
    void (async () => {
      let requested = false;
      try {
        const c = client();
        requested = true;
        setBroadcastOutcome(referencedBroadcastOutcome('broadcast-attempted', signed.txid));
        const id = await c.broadcast(signed.rawHex);
        if (live()) setBroadcastOutcome(referencedBroadcastOutcome(id === signed.txid ? 'pending-confirmation' : 'verification-incomplete', signed.txid));
      } catch (e) {
        if (!live()) return;
        if (requested) setBroadcastOutcome(referencedBroadcastOutcome('broadcast-unknown', signed.txid));
        else setError(captureBtcErrorMessage(e));
      }
    })();
  };

  const lock = (): void => {
    setConfirmForget(false);
    // First, while a Lock click still counts as user activation (the browser allows clipboard writes only then).
    clearCopiedBackup();
    invalidate();
    if (walletRef.current !== undefined) wipeWallet(walletRef.current);
    walletRef.current = undefined;
    forgetSeed();
    setWallet(undefined);
    setProviderCheck(false);
    setSaveScan(false); setSavedScan(undefined); setForgetScan(false);
    resetFlow();
  };

  // The app lock reaches these keys too: they live outside the tag vault and the EVM session. A seed typed into the
  // import field goes with them.
  useEffect(() =>
    subscribeAppLock(() => {
      if (walletRef.current !== undefined) setAppLocked(true);
      setSeedInput('');
      lock();
    }),
  );

  return (
    <section aria-labelledby="btc-h">
      <h2 id="btc-h">{t('btc.title')}</h2>
      <Notice kind="warn" title={t('btc.warning.title')}>
        {t('btc.warning.body')}
      </Notice>
      {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
      {broadcastOutcome !== undefined && <div data-transaction-phase={broadcastOutcome.phase}>
                <Notice kind={broadcastOutcome.phase === 'pending-confirmation' ? 'ok' : broadcastOutcome.phase === 'broadcast-attempted' ? 'info' : 'error'} title={t(TRANSACTION_PHASE_KEYS[broadcastOutcome.phase])}>
                  {displayMessage(broadcastOutcome.message, t)}
                </Notice>
                {broadcastOutcome.reference !== undefined && (broadcastOutcome.phase === 'broadcast-unknown' || broadcastOutcome.phase === 'verification-incomplete') && (
                  <BroadcastReference key={broadcastOutcome.reference} reference={broadcastOutcome.reference} />
                )}
              </div>}

      <div className="panel">
        <h3>{t('btc.section.network')}</h3>
        <Field label={t('btc.network.label')}>
          {(id) => (
            <select
              id={id}
              value={netId}
              disabled={wallet !== undefined}
              onChange={(e) => {
                changeSource();
                setNetId(e.target.value as BtcNetworkId);
                chainRef.current = undefined;
                setConfirmForget(false);
                setHeaderNotes([]);
                setCheckedTip(undefined);
              }}
            >
              {BTC_NETWORKS.map((n) => (
                <option key={n.id} value={n.id} disabled={!n.enabled}>{n.label}</option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={t('btc.server.label')}
          hint={t('btc.server.hint')}
        >
          {(id, d) => (
            <input id={id} aria-describedby={d} type="url" spellCheck={false} autoComplete="off" placeholder={net.urlHint} value={url} onChange={(e) => { setUrl(e.target.value); changeSource(); }} />
          )}
        </Field>
        <Field label={t('btc.oracle.modeLabel')}>
          {(id) => <select id={id} value={oracleKind} onChange={(e) => { setOracleKind(e.target.value as typeof oracleKind); changeSource(); }}>
            <option value="none">{t('btc.oracle.none')}</option><option value="http">{t('btc.oracle.http')}</option><option value="grpc">{t('btc.oracle.grpc')}</option>
          </select>}
        </Field>
        {oracleKind !== 'none' && <>
          <Field label={t('btc.oracle.urlLabel')} hint={t('btc.oracle.urlHint')}>
            {(id, d) => <input id={id} aria-describedby={d} type="url" autoComplete="off" spellCheck={false} value={oracleUrl} onChange={(e) => { setOracleUrl(e.target.value); changeSource(); }} />}
          </Field>
          <p className="hint">{t('btc.oracle.disclosure')}</p>
          <label><input type="checkbox" checked={lightScan} onChange={(e) => { setLightScan(e.target.checked); changeSource(); }} />{' '}{t('btc.oracle.light')}</label>
          <p role="note">{t(lightScan ? 'btc.oracle.lightHelp' : 'btc.oracle.fullHelp')}</p>
          <label><input type="checkbox" checked={secondOracle} onChange={(e) => { setSecondOracle(e.target.checked); changeSource(); }} />{' '}{t('btc.oracle.secondEnable')}</label>
          {secondOracle && <>
            <Field label={t('btc.oracle.secondKind')}>
              {(id) => <select id={id} value={secondKind} onChange={(e) => { setSecondKind(e.target.value as typeof secondKind); changeSource(); }}>
                <option value="http">HTTP</option><option value="grpc">gRPC-Web</option>
              </select>}
            </Field>
            <Field label={t('btc.oracle.secondUrl')}>
              {(id) => <input id={id} type="url" autoComplete="off" spellCheck={false} value={secondUrl} onChange={(e) => { setSecondUrl(e.target.value); changeSource(); }} />}
            </Field>
          </>}
        </>}
      </div>

      <div className="panel">
        <h3>{t('btc.section.wallet')}</h3>
        {wallet === undefined ? (
          <>
            {appLocked && <Notice kind="info">{t('btc.appLocked')}</Notice>}
            <button type="button" className="btn btn-primary" onClick={() => { useSeed(randomSeedHex(), true); }}>
              {t('btc.wallet.create')}
            </button>
            <Field label={t('btc.wallet.importLabel')} hint={t('btc.wallet.importHint')}>
              {(id, d) => (
                <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} className="mono" value={seedInput} onChange={(e) => { setSeedInput(e.target.value); }} />
              )}
            </Field>
            <button type="button" className="btn" disabled={seedInput.trim() === ''} onClick={() => { useSeed(seedInput, false); }}>
              {t('btc.wallet.import')}
            </button>
          </>
        ) : (
          <>
            <p>{t('btc.wallet.receiveAddress', { network: net.label })}</p>
            <p><Mono>{wallet.address}</Mono></p>
            <CopyButton text={wallet.address} label={t('btc.wallet.copyAddress')} />
            <Field label={t('btc.request.amount')}>
              {(id) => (
                <input id={id} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); }} />
              )}
            </Field>
            {uri !== undefined && (
              <>
                <h4>{t('btc.payment.heading')}</h4>
                <ol className="plain-list">
                  <li>{t('btc.payment.step1', { network: net.label })}</li>
                  <li>{t('btc.payment.step2')} <Mono>{uri}</Mono></li>
                  <li>{t('btc.payment.step3')}</li>
                </ol>
                <CopyButton text={uri} label={t('btc.payment.copyLink')} />
                <QrFrame kind="caution" text={uri} caption={t('btc.payment.caption', { network: net.label })} />
              </>
            )}
            {hasBackup && (
              <SecretBackup
                reveal={() => (seedRef.current === undefined ? '' : bytesToHex(seedRef.current))}
                text={{
                  title: t('btc.seed.heading'),
                  warning: t('btc.seed.warning'),
                  hiddenHint: t('btc.seed.hiddenHint'),
                  show: t('btc.seed.show'),
                  hide: t('btc.seed.hide'),
                  copy: t('btc.seed.copy'),
                  copyWarning: t('btc.seed.copyWarning'),
                  copyConfirm: t('btc.seed.copyConfirm'),
                  copyCancel: t('btc.seed.copyCancel'),
                  copied: t('btc.seed.copied'),
                  copyFailed: t('btc.seed.copyFailed'),
                }}
              />
            )}
            <p>
              <button type="button" className="btn btn-danger" onClick={lock}>{t('btc.lock')}</button>
            </p>
          </>
        )}
      </div>

      {wallet !== undefined && (
        <div className="panel">
          <h3>{t('btc.section.scan')}</h3>
          <label>
            <input type="checkbox" checked={saveScan} disabled={scanning || scanStorage === undefined} onChange={(e) => {
              const enabled = e.target.checked;
              setSaveScan(enabled); setSavedScan(undefined); setForgetScan(false);
              if (enabled) loadSavedScan(); else { invalidate(); resetFlow(); }
            }} />{' '}{t('btc.persistence.enable')}
          </label>
          <p className="hint">{t('btc.persistence.help')}</p>
          {scanStorage === undefined && <p className="hint">{t('btc.persistence.unavailable')}</p>}
          {saveScan && <>
            {savedScan !== undefined && <p role="status">{t('btc.persistence.saved', { birth: String(savedScan.birthHeight), height: String(savedScan.lastHeight), count: String(savedScan.matches.length) })}</p>}
            <button type="button" className="btn" disabled={scanning} onClick={() => { loadSavedScan(); }}>{t('btc.persistence.reload')}</button>{' '}
            {forgetScan ? <div role="group" aria-label={t('btc.persistence.forget')}>
              <p>{t('btc.persistence.forgetConfirm')}</p>
              <button type="button" className="btn btn-danger" disabled={scanning} onClick={() => { loadSavedScan(true); }}>{t('btc.persistence.forgetYes')}</button>
            </div> : <button type="button" className="btn" disabled={scanning} onClick={() => { setForgetScan(true); }}>{t('btc.persistence.forget')}</button>}
          </>}
          <Field label={t('btc.scan.heightLabel')} hint={t('btc.scan.heightHint', { max: String(MAX_SCAN_BLOCKS) })}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="numeric" disabled={scanning || (saveScan && savedScan !== undefined)} value={fromHeight} onChange={(e) => { setFromHeight(e.target.value); }} />
            )}
          </Field>
          <div className="field">
            <label>
              <input type="checkbox" checked={providerCheck} onChange={(e) => {
                invalidate(); resetFlow(); setError(undefined); setProviderCheck(e.target.checked);
              }} />{' '}
              {t(usingLightScan ? 'btc.scan.providerCheckLightLabel' : 'btc.scan.providerCheckLabel')}
            </label>
            <p className="hint">{t(usingLightScan ? 'btc.scan.providerCheckLight' : 'btc.scan.providerCheckHint')}</p>
            <p role="note">{t(usingLightScan ? 'btc.scan.mode.light' : providerCheck ? 'btc.scan.mode.provider' : 'btc.scan.mode.local')}</p>
          </div>
          <button type="button" className="btn btn-primary" disabled={scanning || url.trim() === '' || (usingLightScan && !providerCheck)} onClick={() => { runScan(); }}>
            {scanning ? t('btc.scan.scanning') : t('btc.scan.action')}
          </button>
          {' '}
          <button type="button" className="btn" disabled={scanning || url.trim() === ''} onClick={updateHeaders}>
            {t('btc.headers.update')}
          </button>
          {scanning && (
            <button type="button" className="btn" onClick={() => { abort.current?.abort(); }}>{t('btc.scan.cancel')}</button>
          )}
          <section aria-labelledby="btc-headers-h">
            <h4 id="btc-headers-h">{t('btc.headers.heading')}</h4>
            {headerStorage.persistent && <p className="hint">{t('btc.headers.storageNote')}</p>}
            {headerProgress !== undefined && <p role="status">{displayMessage(headerProgress, t)}</p>}
            {headerNotes.map((n) => <Notice key={n.text.key} kind={n.kind}>{displayMessage(n.text, t)}</Notice>)}
            {confirmForget ? (
              <div role="group" aria-label={t('btc.headers.forget')}>
                <p>{t('btc.headers.forgetConfirm')}</p>
                <button type="button" className="btn btn-danger" onClick={forgetHeaders}>{t('btc.headers.forgetYes')}</button>{' '}
                <button type="button" className="btn" onClick={() => { setConfirmForget(false); }}>{t('btc.headers.forgetNo')}</button>
              </div>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => { setConfirmForget(true); }}>
                {t('btc.headers.forget')}
              </button>
            )}
          </section>
          <details>
            <summary>{t('btc.scan.details')}</summary>
            <p>{t('btc.scan.checked')}</p>
            <ul>{(oracleKind !== 'none' && lightScan ? SCAN_CHECK_KEYS.filter((key) => key !== 'btc.verification.check.transactions' && key !== 'btc.verification.check.witness') : SCAN_CHECK_KEYS).map((key) => <li key={key}>{t(key)}</li>)}</ul>
            {oracleKind !== 'none' && lightScan && <p>{t('btc.oracle.lightChecks')}</p>}
            <p>{t('btc.scan.limits')}</p>
            {oracleKind !== 'none' && lightScan ? <p>{t('btc.oracle.lightLimits')}</p> : <ul>{SCAN_LIMIT_KEYS.map((key) => <li key={key}>{t(key)}</li>)}</ul>}
            <div className="table-wrap">
              <table>
                <caption>{t('btc.scan.sourceCaption')}</caption>
                <thead>
                  <tr><th>{t('btc.scan.mode')}</th><th>{t('btc.scan.keyLeaves')}</th><th>{t('btc.scan.serverLearns')}</th><th>{t('btc.scan.available')}</th></tr>
                </thead>
                <tbody>
                  {SCAN_MODE_KEYS.map((m) => (
                    <tr key={m.mode}><td>{t(m.mode)}</td><td>{t(m.keyLeaves)}</td><td>{t(m.serverLearns)}</td><td>{t(m.available)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {scanNote !== undefined && <p role="status">{displayMessage(scanNote, t)}</p>}
          {scan?.recoveredHistory !== undefined && scan.recoveredHistory.total > MAX_SCAN_BLOCKS && <>
            <p role="status">{t('btc.persistence.page', { first: String(scan.recoveredHistory.offset + 1), last: String(scan.recoveredHistory.end), total: String(scan.recoveredHistory.total) })}</p>
            <button type="button" className="btn" disabled={scanning || scan.recoveredHistory.offset === 0} onClick={() => { runScan(Math.max(0, (scan.recoveredHistory?.offset ?? 0) - MAX_SCAN_BLOCKS)); }}>{t('btc.persistence.previous')}</button>{' '}
            <button type="button" className="btn" disabled={scanning || scan.recoveredHistory.end >= scan.recoveredHistory.total} onClick={() => { runScan(scan.recoveredHistory?.end ?? 0); }}>{t('btc.persistence.next')}</button>
          </>}
          {scan !== undefined && (
            <>
              <p>
                {scan.found.length === 0
                  ? t('btc.scan.noneFound')
                  : t(spentStatus === 'unknown' ? 'btc.scan.unknownCount' : 'btc.scan.foundCount', { count: String(scan.found.length) })}
                {scan.spentCount > 0 && ` ${t('btc.scan.alreadySpent', { count: String(scan.spentCount) })}`}
              </p>
              <p role="note">{t(spentStatus === 'local' ? 'btc.scan.spentStatus.local' : spentStatus === 'provider' ? 'btc.scan.spentStatus.provider' : 'btc.scan.spentStatus.unknown', { height: String(scan.toHeight) })}</p>
              {scan.found.length > 0 && (
                <div className="table-wrap">
                  <p role="note">
                    {t(oracleKind === 'none' ? 'btc.scan.singleProvider' : 'btc.oracle.resultsNote')}
                  </p>
                  {scan.found.some((f) => checkedTip === undefined || f.height > checkedTip) && (
                    <Notice kind="warn">{checkedTip === undefined ? t('btc.headers.uncheckedNone') : t('btc.headers.uncheckedResults', { height: String(checkedTip) })}</Notice>
                  )}
                  <table>
                    <thead>
                      <tr><th>{t('btc.scan.sweep')}</th><th>{t('btc.scan.output')}</th><th>{t('btc.scan.block')}</th><th>{t('btc.scan.amount')}</th><th>{t('btc.scan.keyStatus')}</th></tr>
                    </thead>
                    <tbody>
                      {scan.found.map((f) => {
                        const id = `${f.txid}:${String(f.vout)}`;
                        return (
                          <tr key={id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={t('btc.scan.sweepAria', { id })}
                                checked={picked.has(id) && sweepable(f)}
                                disabled={!sweepable(f)}
                                onChange={(e) => {
                                  const next = new Set(picked);
                                  if (e.target.checked) next.add(id);
                                  else next.delete(id);
                                  setPicked(next);
                                  clearReview();
                                }}
                              />
                            </td>
                            <td><Mono>{id}</Mono></td>
                            <td>{f.height}</td>
                            <td>{formatBtc(f.amountSats)}</td>
                            <td>{f.duplicateKey ? t('btc.scan.duplicateKey') : t('btc.scan.uniqueKey')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {selected.length > 1 && <Notice kind="warn">{t('btc.scan.linkWarning', { count: String(selected.length) })}</Notice>}
            </>
          )}
        </div>
      )}

      {wallet !== undefined && scan !== undefined && scan.found.length > 0 && (
        <div className="panel">
          <h3>{t('btc.section.sweep')}</h3>
          <Field label={t('btc.sweep.destinationLabel')} hint={t('btc.sweep.destinationHint', { network: net.label })}>
            {(id, d) => (
              <input id={id} aria-describedby={d} className="mono" spellCheck={false} autoComplete="off" value={destination} onChange={(e) => { setDestination(e.target.value); clearReview(); }} />
            )}
          </Field>
          {wallet !== undefined && (
            <CameraImporter
              label={t('btc.sweep.importQr')}
              onText={(scanned) => {
                const candidate = scanned.trim();
                let address = candidate;
                if (/^bitcoin:/i.test(candidate)) {
                  try {
                    const uriParts = new URL(candidate);
                    address = uriParts.searchParams.get('sp') ?? uriParts.pathname;
                  } catch {
                    setError({ key: 'btc.sweep.invalidQr' });
                    return false;
                  }
                }
                try {
                  // The address checks used before signing; no payment has to be selected yet (amounts are checked at review).
                  checkDestination(wallet, address);
                  setDestination(address);
                  clearReview();
                  setError(undefined);
                  return true;
                } catch (e) {
                  setError(captureBtcErrorMessage(e));
                  return false;
                }
              }}
            />
          )}
          <Field label={t('btc.sweep.feeLabel')} hint={t('btc.sweep.feeHint')}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="decimal" value={feeRate} onChange={(e) => { setFeeRate(e.target.value); clearReview(); }} />
            )}
          </Field>
          <button type="button" className="btn btn-primary" disabled={scanning || selected.length === 0 || destination.trim() === ''} onClick={doReview}>
            {t('btc.sweep.review')}
          </button>

          {review !== undefined && (
            <section className="card" aria-labelledby="btc-review-h">
              <h4 id="btc-review-h">{t('btc.review.heading')}</h4>
              <dl>
                <dt>{t('btc.review.network')}</dt><dd>{review.networkLabel}</dd>
                <dt>{t('btc.review.spending')}</dt>
                <dd>
                  <ul className="plain-list">
                    {review.inputs.map((i) => (
                      <li key={`${i.txid}:${String(i.vout)}`}><Mono>{`${i.txid}:${String(i.vout)}`}</Mono> {formatBtc(i.amountSats)}</li>
                    ))}
                  </ul>
                </dd>
                <dt>{t('btc.review.totalIn')}</dt><dd>{formatBtc(review.totalSats)}</dd>
                <dt>{t('btc.review.fee')}</dt><dd>{formatBtc(review.feeSats)} {t('btc.review.feeDetail', { sats: String(review.feeSats), rate: String(review.feeRate), vsize: String(review.vsize) })}</dd>
                <dt>{t('btc.review.receives')}</dt><dd>{formatBtc(review.sendSats)}</dd>
                <dt>{t('btc.review.destination', { kind: t(review.destinationKind === 'silent payment address' ? 'btc.destination.silent' : 'btc.destination.regular') })}</dt><dd><Mono>{review.destination}</Mono></dd>
                <dt>{t('btc.review.change')}</dt><dd>{t('btc.review.changeNone')}</dd>
              </dl>
              {review.destinationKind === 'silent payment address' && (
                <p className="hint">{t('btc.review.silentKeyHint')}</p>
              )}
              {review.warningMessages.map((w) => <Notice key={w.key} kind="warn">{displayMessage(w, t)}</Notice>)}
              <label>
                <input type="checkbox" checked={approved} onChange={(e) => { if (!e.target.checked) clearSigning(); else setApproved(true); }} />{' '}
                {t('btc.review.approve')}
              </label>
              <p className="hint">{t('btc.sweep.signer')}</p>
              <p>
                <button type="button" className="btn btn-primary" disabled={scanning || !approved || signed !== undefined || !inputsChecked(review)} onClick={doSign}>
                  {t('btc.review.sign')}
                </button>
              </p>
            </section>
          )}

          {signed !== undefined && (
            <section className="card" aria-labelledby="btc-signed-h">
              <h4 id="btc-signed-h">{t('btc.signed.heading')}</h4>
              <p>{t('btc.signed.txid')} <Mono>{signed.txid}</Mono></p>
              {currentBroadcast === undefined && <p>{t('btc.signed.notSent')}</p>}
              <CopyButton text={signed.rawHex} label={t('btc.signed.copyRaw')} />{' '}
              <button type="button" className="btn btn-primary" disabled={scanning || (currentBroadcast?.phase === 'pending-confirmation' || currentBroadcast?.phase === 'broadcast-attempted') || !inputsChecked(review)} onClick={doBroadcast}>
                {t('btc.broadcast.action', { network: net.label })}
              </button>

            </section>
          )}
        </div>
      )}
    </section>
  );
}

// i18n-use: btc.scan.providerCheckLabel btc.scan.providerCheckHint btc.scan.providerCheckLight btc.scan.spentStatus.local btc.scan.spentStatus.provider btc.scan.spentStatus.unknown
// i18n-use: btc.headers.scanDiscarded btc.headers.resultsDropped btc.headers.loading btc.headers.restored btc.headers.discarded btc.headers.checking btc.headers.progress btc.headers.reorg btc.headers.lessWork btc.headers.conflictHint btc.headers.forkTooDeep btc.headers.forkUnresolved btc.headers.tooMany btc.headers.claimRejected btc.headers.failed btc.headers.otherTab btc.headers.notSaved btc.headers.verified btc.headers.more btc.headers.forgotten btc.headers.forgetFailed btc.scan.firstHeightRequired btc.headers.behind btc.scan.foundBlock btc.scan.scanned btc.sweep.invalidQr
