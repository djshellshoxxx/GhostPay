import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { CameraImporter } from '../../components/CameraImporter';
import { QrFrame } from '../../components/QrFrame';
import { useServices } from '../../lib/services';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import { EsploraClient, normalizeEsploraUrl } from './esplora';
import { BTC_NETWORKS, btcNetwork, type BtcNetworkId } from './network';
import { MAX_SCAN_BLOCKS, scanForPayments, wipeFound, type FoundPayment, type ScanResult } from './scan';
import { btcErrorMessage, checkDestination, formatBtc, reviewSweep, SIGNER_DESCRIPTION, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { SCAN_CHECKS, SCAN_LIMITS, SCAN_MODES } from './verification';
import { paymentUri, randomSeedHex, walletFromSeedHex, wipeWallet, type BtcWallet } from './wallet';

/**
 * Bitcoin silent payments (BIP-352), test networks only. Keys live in this component's state and
 * vanish when you leave the view; nothing secret is stored. Lock, a new wallet and unmount wipe the
 * scan and spend secrets; a new scan, lock and unmount wipe the spend tweaks of the scan results.
 */
export function BtcView(): ReactNode {
  const services = useServices();
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [netId, setNetId] = useState<BtcNetworkId>('testnet4');
  const [url, setUrl] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [wallet, setWallet] = useState<BtcWallet | undefined>(undefined);
  const [seedShown, setSeedShown] = useState<string | undefined>(undefined);
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
  const abort = useRef<AbortController | undefined>(undefined);
  /** Bumped by every new async action and by lock/unmount: results of older actions are dropped. */
  const op = useRef(0);
  const walletRef = useRef<BtcWallet | undefined>(undefined);
  const scanRef = useRef<ScanResult | undefined>(undefined);
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
      if (scanRef.current !== undefined) wipeFound(scanRef.current.found);
    },
    [],
  );

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

  const useSeed = (hex: string, reveal: boolean): void => {
    guard(() => {
      const w = walletFromSeedHex(hex, net);
      invalidate();
      if (walletRef.current !== undefined) wipeWallet(walletRef.current);
      resetFlow();
      walletRef.current = w;
      setWallet(w);
      setSeedInput('');
      setSeedShown(reveal ? hex : undefined);
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

  const selected: readonly FoundPayment[] = scan === undefined ? [] : scan.found.filter((f) => picked.has(`${f.txid}:${String(f.vout)}`));

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
        const res = await scanForPayments({
          client: c,
          wallet,
          fromHeight: from,
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
        if (live()) setError(btcErrorMessage(e));
      } finally {
        if (live()) setScanning(false);
      }
    })();
  };

  const doReview = (): void => {
    if (wallet === undefined) return;
    guard(() => {
      const rate = Number(feeRate);
      setReview(reviewSweep(wallet, selected, destination, rate));
      setApproved(false);
      setSigned(undefined);
      setBroadcastId(undefined);
    });
  };

  const doSign = (): void => {
    if (wallet === undefined || review === undefined || !approved) return;
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
    if (signed === undefined) return;
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
    invalidate();
    if (walletRef.current !== undefined) wipeWallet(walletRef.current);
    walletRef.current = undefined;
    setWallet(undefined);
    setSeedShown(undefined);
    resetFlow();
  };

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
              onChange={(e) => { setNetId(e.target.value as BtcNetworkId); }}
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
            {seedShown !== undefined && (
              <Notice kind="warn" title={t('btc.seed.title')}>
                <p><Mono>{seedShown}</Mono></p>
                <p>{t('btc.seed.warning')}</p>
                <CopyButton text={seedShown} label={t('btc.seed.copy')} />{' '}
                <button type="button" className="btn" onClick={() => { setSeedShown(undefined); }}>{t('btc.seed.hide')}</button>
              </Notice>
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
          {scanning && (
            <button type="button" className="btn" onClick={() => { abort.current?.abort(); }}>{t('btc.scan.cancel')}</button>
          )}
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
                                checked={picked.has(id)}
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
          <button type="button" className="btn btn-primary" disabled={selected.length === 0 || destination.trim() === ''} onClick={doReview}>
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
                <button type="button" className="btn btn-primary" disabled={!approved || signed !== undefined} onClick={doSign}>
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
              <button type="button" className="btn btn-primary" disabled={broadcastId !== undefined} onClick={doBroadcast}>
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
