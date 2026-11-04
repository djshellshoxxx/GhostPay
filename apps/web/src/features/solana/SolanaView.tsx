import { useEffect, useRef, useState, type ReactNode } from 'react';
import { zeroize, type SolanaRpc } from '@ghostpay/solana-stealth';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { CameraImporter } from '../../components/CameraImporter';
import { PlainPaymentRequest } from '../../components/PaymentRequestQr';
import { QrFrame } from '../../components/QrFrame';
import { RichText } from '../../components/RichText';
import { clearCopiedBackup, localizedBackupText, SecretBackup } from '../../components/SecretBackup';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import type { Translator } from '../../i18n/translator';
import { subscribeAppLock } from '../../lib/appLock';
import { useServices } from '../../lib/services';
import { SOL_NETWORKS, solNetwork, type SolNetworkId } from './network';
import { checkNetwork, createRpc, sendTransaction, SolViewError, solErrorMessage } from './rpc';
import { MAX_SCAN_PAGES, scanForPayments, wipeFound, type FoundPayment, type ScanResult } from './scan';
import { formatSol, reviewSweep, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { randomSeedHex, walletFromSeedHex, wipeWallet, type SolWallet } from './wallet';

/**
 * Solana dual-key stealth payments (ed25519), test networks only. Keys live in this component's
 * state and vanish when you leave the view; nothing secret is stored. A created wallet's seed is kept
 * as bytes for its backup, shown only on request, and wiped with the keys.
 */
export function SolanaView(): ReactNode {
  const services = useServices();
  const tr = useI18nOptional() ?? SOURCE_TRANSLATOR;
  // Through a ref: an error or note produced after an await uses the language in effect then.
  const trRef = useRef(tr);
  trRef.current = tr;
  const t = (key: Parameters<Translator['t']>[0], values?: Parameters<Translator['t']>[1]): string => trRef.current.t(key, values);
  const [netId, setNetId] = useState<SolNetworkId>('devnet');
  const [url, setUrl] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [wallet, setWallet] = useState<SolWallet | undefined>(undefined);
  /** A created wallet offers its backup seed on request; an imported seed is the user's own copy already. */
  const [hasBackup, setHasBackup] = useState(false);
  const [fromSlot, setFromSlot] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanNote, setScanNote] = useState<string | undefined>(undefined);
  const [scan, setScan] = useState<ScanResult | undefined>(undefined);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [destination, setDestination] = useState('');
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
  const walletRef = useRef<SolWallet | undefined>(undefined);
  /** Seed of a created wallet, as bytes so that Lock, a new wallet and unmount can wipe it. */
  const seedRef = useRef<Uint8Array | undefined>(undefined);
  const scanRef = useRef<ScanResult | undefined>(undefined);
  const net = solNetwork(netId);

  const invalidate = (): void => {
    op.current++;
    abort.current?.abort();
    setScanning(false);
    setBusy(false);
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
    setPicked(undefined);
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
      setError(solErrorMessage(e));
    }
  };

  /** Fresh client for the current URL, after proving the server is on the selected network. */
  const connect = async (signal: AbortSignal): Promise<SolanaRpc> => {
    let rpc: SolanaRpc;
    try {
      rpc = createRpc(url, services.fetchFn);
    } catch {
      throw new SolViewError(t('sol.rpc.missing'));
    }
    await checkNetwork(rpc, net, signal);
    return rpc;
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

  const selected: FoundPayment | undefined = scan?.found.find((f) => f.stealthAddress === picked);

  const runScan = (): void => {
    setError(undefined);
    if (wallet === undefined) return;
    resetFlow();
    const { signal, live } = begin();
    setScanning(true);
    void (async () => {
      try {
        const rpc = await connect(signal);
        if (!/^\d{1,15}$/.test(fromSlot.trim())) throw new SolViewError(t('sol.slot.required'));
        const res = await scanForPayments({
          rpc,
          wallet,
          fromSlot: BigInt(fromSlot.trim()),
          signal,
          onFound: (s) => { if (live()) setScanNote(t('sol.found', { slot: String(s) })); },
        });
        if (!live()) {
          wipeFound(res.found);
          return;
        }
        scanRef.current = res;
        setScan(res);
        setScanNote(t('sol.scanned', { from: String(res.fromSlot), to: String(res.toSlot) }));
        setPicked(res.found[0]?.stealthAddress);
      } catch (e) {
        if (live()) setError(solErrorMessage(e));
      } finally {
        if (live()) setScanning(false);
      }
    })();
  };

  const doReview = (): void => {
    if (wallet === undefined || selected === undefined) return;
    guard(() => {
      setReview(reviewSweep(wallet, selected, destination));
      setApproved(false);
      setSigned(undefined);
      setBroadcastId(undefined);
    });
  };

  const doSign = (): void => {
    if (wallet === undefined || selected === undefined || review === undefined || !approved || busy) return;
    setError(undefined);
    const { signal, live } = begin();
    setBusy(true);
    void (async () => {
      try {
        const rpc = await connect(signal);
        const out = await signSweep({ rpc, wallet, found: selected, review, signal });
        if (live()) setSigned(out);
      } catch (e) {
        if (live()) setError(solErrorMessage(e));
      } finally {
        if (live()) setBusy(false);
      }
    })();
  };

  const doBroadcast = (): void => {
    if (signed === undefined || busy) return;
    setError(undefined);
    const { signal, live } = begin();
    setBusy(true);
    void (async () => {
      try {
        const rpc = await connect(signal);
        const id = await sendTransaction(rpc, signed.wireBase64, signal);
        if (live()) setBroadcastId(id);
      } catch (e) {
        if (live()) setError(solErrorMessage(e));
      } finally {
        if (live()) setBusy(false);
      }
    })();
  };

  const lock = (): void => {
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

  const clearReview = (): void => {
    setReview(undefined);
    setApproved(false);
    setSigned(undefined);
  };

  const request = wallet?.metaAddress;

  return (
    <section aria-labelledby="sol-h">
      <h2 id="sol-h">{t('sol.title')}</h2>
      <Notice kind="warn" title={t('btc.warning.title')}>{t('sol.warning.body')}</Notice>
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <div className="panel">
        <h3>{t('btc.section.network')}</h3>
        <Field label={t('btc.network.label')}>
          {(id) => (
            <select
              id={id}
              value={netId}
              disabled={wallet !== undefined}
              onChange={(e) => { setNetId(e.target.value as SolNetworkId); }}
            >
              {SOL_NETWORKS.map((n) => (
                <option key={n.id} value={n.id} disabled={!n.enabled}>{n.label}</option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={t('sol.rpc.label')}
          hint={t('sol.rpc.hint')}
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
            <p>{t('chainView.metaAddress', { network: net.label })}</p>
            <p dir="ltr"><Mono>{wallet.metaAddress}</Mono></p>
            <CopyButton text={wallet.metaAddress} label={t('btc.wallet.copyAddress')} />
            {request !== undefined && (
              <>
                <h4>{t('btc.payment.heading')}</h4>
                <ol className="plain-list">
                  <li>{t('sol.instr.1', { network: net.label })}</li>
                  <li>{t('sol.instr.2')}</li>
                  <li><RichText id="sol.instr.3" tags={{ mono: (c) => <Mono>{c}</Mono> }} /></li>
                  <li>{t('sol.instr.4')}</li>
                </ol>
                <QrFrame kind="caution" text={request} caption={t('sol.qr.caption', { network: net.label })} />
                <PlainPaymentRequest family="solana" testnet={net.id !== 'mainnet'} networkLabel={net.label} />
              </>
            )}
            {hasBackup && (
              <SecretBackup
                reveal={() => (seedRef.current === undefined ? '' : bytesToHex(seedRef.current))}
                text={localizedBackupText(tr.t, 'seed')}
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
          <Field label={t('sol.slot.label')} hint={t('sol.slot.hint', { max: String(MAX_SCAN_PAGES) })}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="numeric" value={fromSlot} onChange={(e) => { setFromSlot(e.target.value); }} />
            )}
          </Field>
          <button type="button" className="btn btn-primary" disabled={scanning || url.trim() === ''} onClick={runScan}>
            {scanning ? t('btc.scan.scanning') : t('btc.scan.action')}
          </button>
          {scanning && (
            <button type="button" className="btn" onClick={() => { abort.current?.abort(); }}>{t('btc.scan.cancel')}</button>
          )}
          {scanNote !== undefined && <p role="status">{scanNote}</p>}
          {scan !== undefined && (
            <>
              <p>
                {scan.found.length === 0
                  ? t('chainView.noneFound')
                  : t('chainView.foundCount', { count: String(scan.found.length) })}
                {scan.emptiedCount > 0 && ` ${t('chainView.alreadySwept', { count: String(scan.emptiedCount) })}`}
              </p>
              {scan.found.length > 0 && (
                <div className="table-wrap">
                  <p role="note">{t('sol.singleProvider')}</p>
                  <table>
                    <thead>
                      <tr><th>{t('btc.scan.sweep')}</th><th>{t('sweep.oneTimeAddress')}</th><th>{t('sol.col.slot')}</th><th>{t('policy.account.balance')}</th></tr>
                    </thead>
                    <tbody>
                      {scan.found.map((f) => (
                        <tr key={f.stealthAddress}>
                          <td>
                            <input
                              type="radio"
                              name="sol-sweep"
                              aria-label={t('btc.scan.sweepAria', { id: f.stealthAddress })}
                              checked={picked === f.stealthAddress}
                              onChange={() => { setPicked(f.stealthAddress); clearReview(); }}
                            />
                          </td>
                          <td dir="ltr"><Mono>{f.stealthAddress}</Mono></td>
                          <td>{String(f.slot)}</td>
                          <td>{formatSol(f.balanceLamports)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {wallet !== undefined && scan !== undefined && scan.found.length > 0 && (
        <div className="panel">
          <h3>{t('btc.section.sweep')}</h3>
          <Field label={t('btc.sweep.destinationLabel')} hint={t('sol.destination.hint', { network: net.label })}>
            {(id, d) => (
              <input id={id} aria-describedby={d} className="mono" spellCheck={false} autoComplete="off" value={destination} onChange={(e) => { setDestination(e.target.value); clearReview(); }} />
            )}
          </Field>
          <CameraImporter
            label={t('btc.sweep.importQr')}
            scopeKey={wallet}
            onText={(scanned) => {
              const candidate = scanned.trim().replace(/^solana:/i, '').split('?')[0] ?? '';
              try {
                // reviewSweep applies the same address and amount checks used before signing.
                if (selected === undefined) throw new SolViewError(t('sol.selectFirst'));
                reviewSweep(wallet, selected, candidate);
                setDestination(candidate);
                clearReview();
                setError(undefined);
                return true;
              } catch (e) {
                setError(solErrorMessage(e));
                return false;
              }
            }}
          />
          <p className="hint">{t('sol.fee.hint')}</p>
          <button type="button" className="btn btn-primary" disabled={selected === undefined || destination.trim() === ''} onClick={doReview}>
            {t('btc.sweep.review')}
          </button>

          {review !== undefined && (
            <section className="card" aria-labelledby="sol-review-h">
              <h4 id="sol-review-h">{t('btc.review.heading')}</h4>
              <dl>
                <dt>{t('btc.review.network')}</dt><dd>{review.networkLabel}</dd>
                <dt>{t('sol.review.spendingFrom')}</dt><dd dir="ltr"><Mono>{review.from}</Mono></dd>
                <dt>{t('btc.review.totalIn')}</dt><dd>{formatSol(review.totalLamports)}</dd>
                <dt>{t('btc.review.fee')}</dt><dd>{t('sol.review.fee', { amount: formatSol(review.feeLamports), lamports: String(review.feeLamports) })}</dd>
                <dt>{t('btc.review.receives')}</dt><dd>{formatSol(review.sendLamports)}</dd>
                <dt>{t('pay.destination')}</dt><dd dir="ltr"><Mono>{review.destination}</Mono></dd>
                <dt>{t('btc.review.change')}</dt><dd>{t('sol.review.changeNone')}</dd>
              </dl>
              {review.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
              <label>
                <input type="checkbox" checked={approved} onChange={(e) => { setApproved(e.target.checked); }} />{' '}
                {t('btc.review.approve')}
              </label>
              <p>
                <button type="button" className="btn btn-primary" disabled={!approved || signed !== undefined || busy} onClick={doSign}>
                  {t('btc.review.sign')}
                </button>
              </p>
            </section>
          )}

          {signed !== undefined && (
            <section className="card" aria-labelledby="sol-signed-h">
              <h4 id="sol-signed-h">{t('btc.signed.heading')}</h4>
              <p>{t('sol.signed.signature')} <Mono>{signed.signature}</Mono></p>
              <p>{t('btc.signed.notSent')}</p>
              <CopyButton text={signed.wireBase64} label={t('btc.signed.copyRaw')} />{' '}
              <button type="button" className="btn btn-primary" disabled={broadcastId !== undefined || busy} onClick={doBroadcast}>
                {t('chainView.broadcastTo', { network: net.label })}
              </button>
              {broadcastId !== undefined && <Notice kind="ok" title={t('btc.broadcast.title')}>{t('btc.broadcast.accepted')} <Mono>{broadcastId}</Mono>.</Notice>}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
