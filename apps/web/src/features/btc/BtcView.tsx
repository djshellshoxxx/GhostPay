import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_FORK_HEADERS, SilentPaymentError, zeroize, type HeaderChain } from '@ghostpay/btc-silent-payments';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { CameraImporter } from '../../components/CameraImporter';
import { QrFrame } from '../../components/QrFrame';
import { clearCopiedBackup, SecretBackup } from '../../components/SecretBackup';
import { subscribeAppLock } from '../../lib/appLock';
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
import { MAX_SCAN_BLOCKS, scanForPayments, wipeFound, type FoundPayment, type ScanResult } from './scan';
import { btcErrorMessage, checkDestination, formatBtc, reviewSweep, SIGNER_DESCRIPTION, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { SCAN_CHECKS, SCAN_LIMITS, SCAN_MODES } from './verification';
import { paymentUri, randomSeedHex, walletFromSeedHex, wipeWallet, type BtcWallet } from './wallet';

interface HeaderNote {
  readonly kind: 'info' | 'warn' | 'error' | 'ok';
  readonly text: string;
}

function defaultHeaderStore(): { readonly storeFor: HeaderStoreFor; readonly persistent: boolean } {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  return idb === undefined ? { storeFor: memoryHeaderStore(), persistent: false } : { storeFor: idbHeaderStore(idb), persistent: true };
}

/**
 * Bitcoin silent payments (BIP-352), test networks only. Keys live in this component's state and
 * vanish when you leave the view; nothing secret is stored. Lock, a new wallet and unmount wipe the
 * scan and spend secrets; a new scan, lock and unmount wipe the spend tweaks of the scan results.
 * A created wallet's seed is kept as bytes for its backup, shown only on request, and wiped with the keys.
 *
 * Block headers (public chain data) are checked on this device (`headers.ts`) and saved per network in IndexedDB
 * when the browser has it; every scanned block must be on that checked chain. Saved headers are validated again
 * on load and discarded on any failure. `headerStore` replaces that storage (tests).
 */
export function BtcView(
  props: { readonly headerStore?: HeaderStoreFor; readonly headerSyncLimits?: { readonly maxRounds?: number; readonly headersPerRound?: number; readonly maxHeaders?: number } } = {},
): ReactNode {
  const services = useServices();
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [netId, setNetId] = useState<BtcNetworkId>('testnet4');
  const [url, setUrl] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [wallet, setWallet] = useState<BtcWallet | undefined>(undefined);
  /** A created wallet offers its backup seed on request; an imported seed is the user's own copy already. */
  const [hasBackup, setHasBackup] = useState(false);
  const [amount, setAmount] = useState('');
  const [fromHeight, setFromHeight] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | undefined>(undefined);
  const [scan, setScan] = useState<ScanResult | undefined>(undefined);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [destination, setDestination] = useState('');
  const [feeRate, setFeeRate] = useState('1');
  const [review, setReview] = useState<SweepReview | undefined>(undefined);
  const [approved, setApproved] = useState(false);
  const [signed, setSigned] = useState<SignedSweep | undefined>(undefined);
  const [broadcastId, setBroadcastId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  /** The app lock (idle timeout) forgot the wallet: say so instead of silently showing an empty view. */
  const [appLocked, setAppLocked] = useState(false);
  const abort = useRef<AbortController | undefined>(undefined);
  /** Bumped by every new async action and by lock/unmount: results of older actions are dropped. */
  const op = useRef(0);
  const walletRef = useRef<BtcWallet | undefined>(undefined);
  /** Seed of a created wallet, as bytes so that Lock, a new wallet and unmount can wipe it. */
  const seedRef = useRef<Uint8Array | undefined>(undefined);
  const scanRef = useRef<ScanResult | undefined>(undefined);
  useEffect(() => {
    scanningRef.current = scanning;
  }, [scanning]);
  const [headerStorage] = useState(() => (props.headerStore === undefined ? defaultHeaderStore() : { storeFor: props.headerStore, persistent: true }));
  /** The checked header chain of the network it was loaded for (public data; kept across lock). */
  const chainRef = useRef<{ readonly netId: BtcNetworkId; readonly chain: HeaderChain } | undefined>(undefined);
  const [headerNotes, setHeaderNotes] = useState<readonly HeaderNote[]>([]);
  const [headerProgress, setHeaderProgress] = useState<string | undefined>(undefined);
  /** Height the checked header chain reaches; payments above it are kept but cannot be swept. */
  const [checkedTip, setCheckedTip] = useState<number | undefined>(undefined);
  const [confirmForget, setConfirmForget] = useState(false);
  /** Mirrors `scanning` for click handlers: no review, signature or broadcast while a check or scan runs. */
  const scanningRef = useRef(false);
  /** Bumped by "Forget saved headers": a sync started before it may neither save nor change scan results. */
  const forgetGen = useRef(0);
  const net = btcNetwork(netId);

  const invalidate = (): void => {
    op.current++;
    abort.current?.abort();
    setScanning(false);
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

  const resetFlow = (): void => {
    if (scanRef.current !== undefined) wipeFound(scanRef.current.found);
    scanRef.current = undefined;
    setScan(undefined);
    setPicked(new Set());
    setReview(undefined);
    setApproved(false);
    setSigned(undefined);
    setBroadcastId(undefined);
    setScanNote(undefined);
  };

  const guard = (f: () => void): void => {
    setError(undefined);
    try {
      f();
    } catch (e) {
      setError(btcErrorMessage(e));
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

  /** Only payments in blocks the checked header chain reaches may be swept. */
  const sweepable = (f: FoundPayment): boolean => checkedTip !== undefined && f.height <= checkedTip;
  const selected: readonly FoundPayment[] = scan === undefined ? [] : scan.found.filter((f) => sweepable(f) && picked.has(`${f.txid}:${String(f.vout)}`));

  /** Inputs of the review all sit in blocks the checked header chain reaches. */
  const inputsChecked = (r: SweepReview | undefined): boolean => {
    // The live chain too: a running check updates it in place before React state catches up.
    const live = chainRef.current?.netId === net.id ? chainRef.current.chain : undefined;
    return (
      r !== undefined &&
      live !== undefined &&
      r.inputs.every((i) => {
        const f = scan?.found.find((x) => x.txid === i.txid && x.vout === i.vout);
        return f !== undefined && sweepable(f) && live.hashAt(f.height) === f.blockHash;
      })
    );
  };
  /** Review, signing and broadcast also wait for any running check or scan to finish. */
  const reviewChecked = (r: SweepReview | undefined): boolean => !scanningRef.current && inputsChecked(r);

  /** Forgets the review, approval, signature and broadcast state, and every selection that cannot be swept now. */
  const clearSweepFlow = (): void => {
    setReview(undefined);
    setApproved(false);
    setSigned(undefined);
    setBroadcastId(undefined);
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
    setPicked(new Set());
    setReview(undefined);
    setApproved(false);
    setSigned(undefined);
    setBroadcastId(undefined);
    setScanNote(undefined);
    return [
      next === undefined
        ? { kind: 'warn', text: t('btc.headers.scanDiscarded') }
        : { kind: 'warn', text: t('btc.headers.resultsDropped', { height: String(next.toHeight), count: String(dropped.length) }) },
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
      if (live()) setHeaderProgress(t('btc.headers.loading', { height: '0' }));
      const loaded = await loadHeaderChain(net, headerStorage.storeFor(net.id), {
        onProgress: (h) => { if (live()) setHeaderProgress(t('btc.headers.loading', { height: String(h) })); },
      });
      chain = loaded.chain;
      if (forgetGen.current === gen) chainRef.current = { netId: net.id, chain };
      if (loaded.loaded === 'restored') notes.push({ kind: 'info', text: t('btc.headers.restored', { count: String(chain.tipHeight) }) });
      if (loaded.loaded === 'discarded') notes.push({ kind: 'warn', text: t('btc.headers.discarded') });
    }
    if (live()) setHeaderProgress(t('btc.headers.checking'));
    const before = chain.tipHash;
    let out: HeaderSyncOutcome | undefined;
    let failure: unknown;
    try {
      out = await syncHeaders({
        chain,
        sources: [new EsploraHeaderSource(c)],
        store: headerStorage.storeFor(net.id),
        signal,
        canSave: () => forgetGen.current === gen,
        ...props.headerSyncLimits,
        onProgress: (h) => { if (live()) setHeaderProgress(t('btc.headers.progress', { height: String(h) })); },
      });
    } catch (e) {
      failure = e;
    } finally {
      if (live()) setHeaderProgress(undefined);
    }
    // The chain may have switched before a failure, or while this action went stale, or it was just loaded from
    // storage (another tab's, or a fresh one after a forget) and never compared with what is on screen: results from
    // blocks it does not have are removed (and their tweaks wiped), before anything else.
    const dropped = forgetGen.current !== gen || (!fresh && chain.tipHash === before) ? [] : applyChainToScan(chain);
    if (forgetGen.current === gen) setCheckedTip(chain.tipHeight);
    const partial = out ?? (failure instanceof HeaderSyncError ? failure.partial : undefined);
    if (partial?.reorgFrom !== undefined) notes.push({ kind: 'warn', text: t('btc.headers.reorg', { height: String(partial.reorgFrom) }) });
    if (partial?.lessWork === true) notes.push({ kind: 'warn', text: t('btc.headers.lessWork') }, { kind: 'info', text: t('btc.headers.conflictHint') });
    notes.push(...dropped);
    if (out === undefined) {
      const code = failure instanceof SilentPaymentError ? failure.code : undefined;
      const reason =
        code === 'FORK_TOO_DEEP' ? t('btc.headers.forkTooDeep', { max: String(DEFAULT_FORK_HEADERS) })
          : code === 'FORK_UNRESOLVED' ? t('btc.headers.forkUnresolved')
            : code === 'UNSUPPORTED' ? t('btc.headers.tooMany', { max: String(props.headerSyncLimits?.maxHeaders ?? MAX_HEADERS) })
              : code === 'INVALID_HEADER' ? t('btc.headers.claimRejected')
              : btcErrorMessage(failure);
      notes.push({ kind: 'error', text: t('btc.headers.failed', { reason }) });
      if (code === 'FORK_TOO_DEEP' || code === 'FORK_UNRESOLVED') notes.push({ kind: 'info', text: t('btc.headers.conflictHint') });
      if (live()) setHeaderNotes(notes);
      return undefined;
    }
    if (out.refused) notes.push({ kind: 'warn', text: t('btc.headers.otherTab') });
    else if (!headerStorage.persistent || !out.saved) notes.push({ kind: 'info', text: t('btc.headers.notSaved') });
    notes.push({ kind: 'ok', text: t('btc.headers.verified', { height: String(chain.tipHeight), hash: chain.tipHash }) });
    if (out.more) notes.push({ kind: 'info', text: t('btc.headers.more', { height: String(chain.tipHeight) }) });
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
    setScanning(false);
    scanningRef.current = false;
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
      if (live()) setHeaderNotes([{ kind: ok ? 'info' : 'error', text: ok ? t('btc.headers.forgotten') : t('btc.headers.forgetFailed') }]);
    })();
  };

  const updateHeaders = (): void => {
    setError(undefined);
    const { signal, live } = begin();
    setScanning(true);
    void (async () => {
      try {
        const c = client();
        await c.checkNetwork(net, signal);
        await checkHeaders(c, signal, live);
      } catch (e) {
        if (live()) setError(btcErrorMessage(e));
      } finally {
        if (live()) setScanning(false);
      }
    })();
  };

  const runScan = (): void => {
    setError(undefined);
    if (wallet === undefined) return;
    resetFlow();
    const { signal, live } = begin();
    setScanning(true);
    void (async () => {
      try {
        const c = client();
        await c.checkNetwork(net, signal);
        const from = Number(fromHeight);
        if (fromHeight.trim() === '' || !Number.isInteger(from) || from < 0) throw new Error(t('btc.scan.firstHeightRequired'));
        const headers = await checkHeaders(c, signal, live);
        if (headers === undefined) return;
        if (from > headers.tipHeight) throw new Error(t('btc.headers.behind', { height: String(headers.tipHeight) }));
        const res = await scanForPayments({
          client: c,
          wallet,
          fromHeight: from,
          headers,
          signal,
          onBlock: (h) => { if (live()) setScanNote(t('btc.scan.foundBlock', { height: String(h) })); },
        });
        if (!live()) {
          wipeFound(res.found);
          return;
        }
        scanRef.current = res;
        setScan(res);
        setScanNote(t('btc.scan.scanned', { from: String(res.fromHeight), to: String(res.toHeight) }));
        // Nothing is selected: spending outputs together links them publicly (PRIVACY-E2E-03), so each is an explicit choice.
      } catch (e) {
        if (live()) {
          setError(btcErrorMessage(e));
          // The server's blocks disagree with the checked headers: say how to recover if that is expected.
          if (e instanceof SilentPaymentError && e.code === 'REORG_DETECTED') {
            const hint = t('btc.headers.conflictHint');
            setHeaderNotes((n) => (n.some((x) => x.text === hint) ? n : [...n, { kind: 'info', text: hint }]));
          }
        }
      } finally {
        if (live()) setScanning(false);
      }
    })();
  };

  const doReview = (): void => {
    if (wallet === undefined || scanningRef.current) return;
    guard(() => {
      const rate = Number(feeRate);
      setReview(reviewSweep(wallet, selected, destination, rate));
      setApproved(false);
      setSigned(undefined);
      setBroadcastId(undefined);
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
        if (live()) setError(btcErrorMessage(e));
      }
    })();
  };

  const doBroadcast = (): void => {
    if (signed === undefined || !reviewChecked(review)) return;
    setError(undefined);
    const { live } = begin();
    void (async () => {
      try {
        const id = await client().broadcast(signed.rawHex);
        if (live()) setBroadcastId(id);
      } catch (e) {
        if (live()) setError(btcErrorMessage(e));
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
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <div className="panel">
        <h3>{t('btc.section.network')}</h3>
        <Field label={t('btc.network.label')}>
          {(id) => (
            <select
              id={id}
              value={netId}
              disabled={wallet !== undefined}
              onChange={(e) => {
                setNetId(e.target.value as BtcNetworkId);
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
            <input id={id} aria-describedby={d} type="url" spellCheck={false} autoComplete="off" placeholder={net.urlHint} value={url} onChange={(e) => { setUrl(e.target.value); }} />
          )}
        </Field>
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
          <Field label={t('btc.scan.heightLabel')} hint={t('btc.scan.heightHint', { max: String(MAX_SCAN_BLOCKS) })}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="numeric" value={fromHeight} onChange={(e) => { setFromHeight(e.target.value); }} />
            )}
          </Field>
          <button type="button" className="btn btn-primary" disabled={scanning || url.trim() === ''} onClick={runScan}>
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
            {headerProgress !== undefined && <p role="status">{headerProgress}</p>}
            {headerNotes.map((n) => <Notice key={n.text} kind={n.kind}>{n.text}</Notice>)}
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
            <ul>{SCAN_CHECKS.map((c) => <li key={c}>{c}</li>)}</ul>
            <p>{t('btc.scan.limits')}</p>
            <ul>{SCAN_LIMITS.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="table-wrap">
              <table>
                <caption>{t('btc.scan.sourceCaption')}</caption>
                <thead>
                  <tr><th>{t('btc.scan.mode')}</th><th>{t('btc.scan.keyLeaves')}</th><th>{t('btc.scan.serverLearns')}</th><th>{t('btc.scan.available')}</th></tr>
                </thead>
                <tbody>
                  {SCAN_MODES.map((m) => (
                    <tr key={m.mode}><td>{m.mode}</td><td>{m.keyLeaves}</td><td>{m.serverLearns}</td><td>{m.available}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {scanNote !== undefined && <p role="status">{scanNote}</p>}
          {scan !== undefined && (
            <>
              <p>
                {scan.found.length === 0
                  ? t('btc.scan.noneFound')
                  : t('btc.scan.foundCount', { count: String(scan.found.length) })}
                {scan.spentCount > 0 && ` ${t('btc.scan.alreadySpent', { count: String(scan.spentCount) })}`}
              </p>
              {scan.found.length > 0 && (
                <div className="table-wrap">
                  <p role="note">
                    {t('btc.scan.singleProvider')}
                  </p>
                  {scan.found.some((f) => !sweepable(f)) && (
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
                                  setReview(undefined);
                                  setSigned(undefined);
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
              <input id={id} aria-describedby={d} className="mono" spellCheck={false} autoComplete="off" value={destination} onChange={(e) => { setDestination(e.target.value); setReview(undefined); setSigned(undefined); }} />
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
                    setError(t('btc.sweep.invalidQr'));
                    return false;
                  }
                }
                try {
                  // The address checks used before signing; no payment has to be selected yet (amounts are checked at review).
                  checkDestination(wallet, address);
                  setDestination(address);
                  setReview(undefined);
                  setApproved(false);
                  setSigned(undefined);
                  setError(undefined);
                  return true;
                } catch (e) {
                  setError(btcErrorMessage(e));
                  return false;
                }
              }}
            />
          )}
          <Field label={t('btc.sweep.feeLabel')} hint={t('btc.sweep.feeHint')}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="decimal" value={feeRate} onChange={(e) => { setFeeRate(e.target.value); setReview(undefined); setSigned(undefined); }} />
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
                <dt>{t('btc.review.destination', { kind: review.destinationKind })}</dt><dd><Mono>{review.destination}</Mono></dd>
                <dt>{t('btc.review.change')}</dt><dd>{t('btc.review.changeNone')}</dd>
              </dl>
              {review.destinationKind === 'silent payment address' && (
                <p className="hint">{t('btc.review.silentKeyHint')}</p>
              )}
              {review.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
              <label>
                <input type="checkbox" checked={approved} onChange={(e) => { setApproved(e.target.checked); }} />{' '}
                {t('btc.review.approve')}
              </label>
              <p className="hint">{SIGNER_DESCRIPTION}</p>
              <p>
                <button type="button" className="btn btn-primary" disabled={scanning || !approved || signed !== undefined || !reviewChecked(review)} onClick={doSign}>
                  {t('btc.review.sign')}
                </button>
              </p>
            </section>
          )}

          {signed !== undefined && (
            <section className="card" aria-labelledby="btc-signed-h">
              <h4 id="btc-signed-h">{t('btc.signed.heading')}</h4>
              <p>{t('btc.signed.txid')} <Mono>{signed.txid}</Mono></p>
              <p>{t('btc.signed.notSent')}</p>
              <CopyButton text={signed.rawHex} label={t('btc.signed.copyRaw')} />{' '}
              <button type="button" className="btn btn-primary" disabled={scanning || broadcastId !== undefined || !reviewChecked(review)} onClick={doBroadcast}>
                {t('btc.broadcast.action', { network: net.label })}
              </button>
              {broadcastId !== undefined && <Notice kind="ok" title={t('btc.broadcast.title')}>{t('btc.broadcast.accepted')} <Mono>{broadcastId}</Mono>.</Notice>}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
