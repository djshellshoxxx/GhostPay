import { useEffect, useRef, useState, type ReactNode } from 'react';
import { decodeTronAddress, type TronRpc } from '@ghostpay/tron-adapter';
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
import { TRON_NETWORK_LIST, tronNetwork, type TronNetworkId } from './network';
import { broadcastHex, checkNetwork, createRpc, getChainParams, isActivated, TronViewError, tronErrorMessage } from './rpc';
import { MAX_SCAN_BLOCKS, scanForPayments, type FoundPayment, type ScanResult } from './scan';
import { formatTrx, reviewSweep, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { backupHex, newWallet, walletFromBackupHex, wipeWallet, type TronWallet } from './wallet';

/**
 * TRON stealth payments (secp256k1, ERC-5564 scheme 1), test networks only. Keys live in this
 * component's state and vanish when you leave the view; nothing secret is stored. The key backup of a
 * created wallet is shown only on request.
 */
export function TronView(): ReactNode {
  const services = useServices();
  const tr = useI18nOptional() ?? SOURCE_TRANSLATOR;
  // Through a ref: an error or note produced after an await uses the language in effect then.
  const trRef = useRef(tr);
  trRef.current = tr;
  const t = (key: Parameters<Translator['t']>[0], values?: Parameters<Translator['t']>[1]): string => trRef.current.t(key, values);
  const [netId, setNetId] = useState<TronNetworkId>('nile');
  const [url, setUrl] = useState('');
  const [backupInput, setBackupInput] = useState('');
  const [wallet, setWallet] = useState<TronWallet | undefined>(undefined);
  /** A created wallet offers its key backup on request; imported keys are the user's own copy already. */
  const [hasBackup, setHasBackup] = useState(false);
  const [fromBlock, setFromBlock] = useState('');
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
  const walletRef = useRef<TronWallet | undefined>(undefined);
  const net = tronNetwork(netId);

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
    },
    [],
  );

  const resetFlow = (): void => {
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
      setError(tronErrorMessage(e));
    }
  };

  /** Fresh client for the current URL, after refusing a node that reports mainnet. */
  const connect = async (signal: AbortSignal): Promise<TronRpc> => {
    let rpc: TronRpc;
    try {
      rpc = createRpc(url, services.fetchFn);
    } catch {
      throw new TronViewError(t('tron.node.missing'));
    }
    await checkNetwork(rpc, signal);
    return rpc;
  };

  const install = (w: TronWallet, offerBackup: boolean): void => {
    invalidate();
    if (walletRef.current !== undefined) wipeWallet(walletRef.current);
    resetFlow();
    walletRef.current = w;
    setWallet(w);
    setAppLocked(false);
    setBackupInput('');
    setHasBackup(offerBackup);
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
        if (!/^\d{1,15}$/.test(fromBlock.trim())) throw new TronViewError(t('tron.block.required'));
        const res = await scanForPayments({
          rpc,
          wallet,
          fromBlock: BigInt(fromBlock.trim()),
          signal,
          onFound: (b) => { if (live()) setScanNote(t('tron.found', { block: String(b) })); },
        });
        if (!live()) return;
        setScan(res);
        setScanNote(t('tron.scanned', { from: String(res.fromBlock), to: String(res.toBlock) }));
        setPicked(res.found[0]?.stealthAddress);
      } catch (e) {
        if (live()) setError(tronErrorMessage(e));
      } finally {
        if (live()) setScanning(false);
      }
    })();
  };

  const doReview = (): void => {
    if (wallet === undefined || selected === undefined || busy) return;
    setError(undefined);
    const { signal, live } = begin();
    setBusy(true);
    void (async () => {
      try {
        // Cheap local checks first, so a typo never costs a round trip.
        decodeTronAddress(destination.trim());
        const rpc = await connect(signal);
        const params = await getChainParams(rpc, signal);
        const destinationActivated = await isActivated(rpc, destination.trim(), signal);
        const out = reviewSweep(wallet, selected, destination, { params, destinationActivated });
        if (!live()) return;
        setReview(out);
        setApproved(false);
        setSigned(undefined);
        setBroadcastId(undefined);
      } catch (e) {
        if (live()) setError(tronErrorMessage(e));
      } finally {
        if (live()) setBusy(false);
      }
    })();
  };

  const doSign = (): void => {
    if (wallet === undefined || selected === undefined || review === undefined || !approved || busy) return;
    setError(undefined);
    const { signal, live } = begin();
    setBusy(true);
    void (async () => {
      try {
        const rpc = await connect(signal);
        const out = await signSweep({ rpc, wallet, found: selected, review, nowMs: services.nowMs(), signal });
        if (live()) setSigned(out);
      } catch (e) {
        if (live()) setError(tronErrorMessage(e));
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
        const id = await broadcastHex(rpc, signed.signedHex, signed.txID, signal);
        if (live()) setBroadcastId(id);
      } catch (e) {
        if (live()) setError(tronErrorMessage(e));
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
    setWallet(undefined);
    setHasBackup(false);
    resetFlow();
  };

  // The app lock reaches these keys too: they live outside the tag vault and the EVM session. A key backup typed into
  // the import field goes with them.
  useEffect(() =>
    subscribeAppLock(() => {
      if (walletRef.current !== undefined) setAppLocked(true);
      setBackupInput('');
      lock();
    }),
  );

  const clearReview = (): void => {
    setReview(undefined);
    setApproved(false);
    setSigned(undefined);
  };

  return (
    <section aria-labelledby="tron-h">
      <h2 id="tron-h">{t('tron.title')}</h2>
      <Notice kind="warn" title={t('btc.warning.title')}>{t('tron.warning.body')}</Notice>
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <div className="panel">
        <h3>{t('tron.section.network')}</h3>
        <Field label={t('btc.network.label')}>
          {(id) => (
            <select
              id={id}
              value={netId}
              disabled={wallet !== undefined}
              onChange={(e) => { setNetId(e.target.value as TronNetworkId); }}
            >
              {TRON_NETWORK_LIST.map((n) => (
                <option key={n.id} value={n.id} disabled={!n.enabled}>{n.label}</option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={t('tron.node.label')}
          hint={t('tron.node.hint')}
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
            {appLocked && <Notice kind="info">{t('tron.appLocked')}</Notice>}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { guard(() => { install(newWallet(net), true); }); }}
            >
              {t('btc.wallet.create')}
            </button>
            <Field label={t('tron.import.label')} hint={t('tron.import.hint')}>
              {(id, d) => (
                <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} className="mono" value={backupInput} onChange={(e) => { setBackupInput(e.target.value); }} />
              )}
            </Field>
            <button
              type="button"
              className="btn"
              disabled={backupInput.trim() === ''}
              onClick={() => { guard(() => { install(walletFromBackupHex(backupInput, net), false); }); }}
            >
              {t('tron.import.button')}
            </button>
          </>
        ) : (
          <>
            <p>{t('chainView.metaAddress', { network: net.label })}</p>
            <p dir="ltr"><Mono>{wallet.metaAddress}</Mono></p>
            <CopyButton text={wallet.metaAddress} label={t('btc.wallet.copyAddress')} />
            <h4>{t('btc.payment.heading')}</h4>
            <ol className="plain-list">
              <li>{t('tron.instr.1', { network: net.label })}</li>
              <li>{t('tron.instr.2')}</li>
              <li><RichText id="tron.instr.3" tags={{ mono: (c) => <Mono>{c}</Mono> }} /></li>
              <li>{t('tron.instr.4')}</li>
            </ol>
            <QrFrame kind="caution" text={wallet.metaAddress} caption={t('tron.qr.caption', { network: net.label })} />
            <PlainPaymentRequest family="tron" tronNetwork={net.id === 'local' ? undefined : net.id} testnet={net.id !== 'mainnet'} networkLabel={net.label} />
            {hasBackup && (
              <SecretBackup
                reveal={() => (walletRef.current === undefined ? '' : backupHex(walletRef.current))}
                text={localizedBackupText(tr.t, 'keys')}
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
          <Field label={t('tron.block.label')} hint={t('tron.block.hint', { max: String(MAX_SCAN_BLOCKS) })}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="numeric" value={fromBlock} onChange={(e) => { setFromBlock(e.target.value); }} />
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
                {scan.tokenCount > 0 && ` ${t('tron.tokens', { count: String(scan.tokenCount) })}`}
              </p>
              {scan.found.length > 0 && (
                <div className="table-wrap">
                  <p role="note">{t('tron.singleProvider')}</p>
                  <table>
                    <thead>
                      <tr><th>{t('btc.scan.sweep')}</th><th>{t('sweep.oneTimeAddress')}</th><th>{t('btc.scan.block')}</th><th>{t('policy.account.balance')}</th></tr>
                    </thead>
                    <tbody>
                      {scan.found.map((f) => (
                        <tr key={f.stealthAddress}>
                          <td>
                            <input
                              type="radio"
                              name="tron-sweep"
                              aria-label={t('btc.scan.sweepAria', { id: f.stealthAddress })}
                              checked={picked === f.stealthAddress}
                              onChange={() => { setPicked(f.stealthAddress); clearReview(); }}
                            />
                          </td>
                          <td dir="ltr"><Mono>{f.stealthAddress}</Mono></td>
                          <td>{String(f.blockNumber)}</td>
                          <td>{formatTrx(f.balanceSun)}</td>
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
          <Field label={t('btc.sweep.destinationLabel')} hint={t('tron.destination.hint', { network: net.label })}>
            {(id, d) => (
              <input id={id} aria-describedby={d} className="mono" spellCheck={false} autoComplete="off" value={destination} onChange={(e) => { setDestination(e.target.value); clearReview(); }} />
            )}
          </Field>
          <CameraImporter
            label={t('btc.sweep.importQr')}
            scopeKey={wallet}
            onText={(scanned) => {
              const candidate = scanned.trim().replace(/^tron:/i, '').split('?')[0] ?? '';
              try {
                decodeTronAddress(candidate);
                if (selected !== undefined && candidate === selected.stealthAddress) {
                  throw new TronViewError(t('tron.sameAddress'));
                }
                setDestination(candidate);
                clearReview();
                setError(undefined);
                return true;
              } catch (e) {
                setError(tronErrorMessage(e));
                return false;
              }
            }}
          />
          <p className="hint">{t('tron.fee.hint')}</p>
          <button type="button" className="btn btn-primary" disabled={selected === undefined || destination.trim() === '' || busy} onClick={doReview}>
            {t('btc.sweep.review')}
          </button>

          {review !== undefined && (
            <section className="card" aria-labelledby="tron-review-h">
              <h4 id="tron-review-h">{t('btc.review.heading')}</h4>
              <dl>
                <dt>{t('btc.review.network')}</dt><dd>{review.networkLabel}</dd>
                <dt>{t('sol.review.spendingFrom')}</dt><dd dir="ltr"><Mono>{review.from}</Mono></dd>
                <dt>{t('btc.review.totalIn')}</dt><dd>{formatTrx(review.totalSun)}</dd>
                <dt>{t('tron.review.feeReserve')}</dt><dd>{t('tron.review.feeValue', { amount: formatTrx(review.feeReserveSun), sun: String(review.feeReserveSun) })}</dd>
                <dt>{t('btc.review.receives')}</dt><dd>{formatTrx(review.sendSun)}</dd>
                <dt>{t('pay.destination')}</dt><dd dir="ltr"><Mono>{review.destination}</Mono></dd>
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
            <section className="card" aria-labelledby="tron-signed-h">
              <h4 id="tron-signed-h">{t('btc.signed.heading')}</h4>
              <p>{t('tron.signed.txid')} <Mono>{signed.txID}</Mono></p>
              <p>{t('tron.signed.notSent')}</p>
              <CopyButton text={signed.signedHex} label={t('btc.signed.copyRaw')} />{' '}
              <button type="button" className="btn btn-primary" disabled={broadcastId !== undefined || busy} onClick={doBroadcast}>
                {t('chainView.broadcastTo', { network: net.label })}
              </button>
              {broadcastId !== undefined && <Notice kind="ok" title={t('btc.broadcast.title')}>{t('tron.broadcast.accepted')} <Mono>{broadcastId}</Mono>.</Notice>}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
