import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { QrView } from '../../components/QrView';
import { useServices } from '../../lib/services';
import { EsploraClient, normalizeEsploraUrl } from './esplora';
import { BTC_NETWORKS, btcNetwork, type BtcNetworkId } from './network';
import { MAX_SCAN_BLOCKS, scanForPayments, type FoundPayment, type ScanResult } from './scan';
import { btcErrorMessage, formatBtc, reviewSweep, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { paymentUri, randomSeedHex, walletFromSeedHex, type BtcWallet } from './wallet';

/**
 * Bitcoin silent payments (BIP-352), test networks only. Keys live in this component's state and
 * vanish when you leave the view; nothing secret is stored.
 */
export function BtcView(): ReactNode {
  const services = useServices();
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
  const net = btcNetwork(netId);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  const resetFlow = (): void => {
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
      resetFlow();
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
    void (async () => {
      setScanning(true);
      resetFlow();
      const ac = new AbortController();
      abort.current = ac;
      try {
        const c = client();
        await c.checkNetwork(net, ac.signal);
        const from = Number(fromHeight);
        if (!Number.isInteger(from) || from < 0) throw new Error('Enter the first block height to scan.');
        const res = await scanForPayments({
          client: c,
          wallet,
          fromHeight: from,
          signal: ac.signal,
          onBlock: (h) => { setScanNote(`Found a payment in block ${String(h)}`); },
        });
        setScan(res);
        setScanNote(`Scanned blocks ${String(res.fromHeight)} to ${String(res.toHeight)}.`);
        setPicked(new Set(res.found.map((f) => `${f.txid}:${String(f.vout)}`)));
      } catch (e) {
        setError(btcErrorMessage(e));
      } finally {
        setScanning(false);
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
    guard(() => {
      setSigned(signSweep(wallet, selected, review));
    });
  };

  const doBroadcast = (): void => {
    if (signed === undefined) return;
    setError(undefined);
    void (async () => {
      try {
        const id = await client().broadcast(signed.rawHex);
        setBroadcastId(id);
      } catch (e) {
        setError(btcErrorMessage(e));
      }
    })();
  };

  const lock = (): void => {
    abort.current?.abort();
    setWallet(undefined);
    setSeedShown(undefined);
    resetFlow();
  };

  return (
    <section aria-labelledby="btc-h">
      <h2 id="btc-h">Bitcoin silent payments (test networks)</h2>
      <Notice kind="warn" title="Proof of concept, test networks only">
        Unaudited. Mainnet is disabled. Use only coins that have no value (testnet4, signet or a local regtest node).
        Keys are held in memory and are never saved; write down the seed if you want to keep the wallet.
      </Notice>
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <div className="panel">
        <h3>1. Network and server</h3>
        <Field label="Network">
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
          label="Esplora server URL"
          hint="Any Esplora-compatible REST server you trust for this network (https, or http to localhost for regtest). The server learns which block heights you scan and any transaction you broadcast. It cannot see your keys."
        >
          {(id, d) => (
            <input id={id} aria-describedby={d} type="url" spellCheck={false} autoComplete="off" placeholder={net.urlHint} value={url} onChange={(e) => { setUrl(e.target.value); }} />
          )}
        </Field>
      </div>

      <div className="panel">
        <h3>2. Wallet and receive address</h3>
        {wallet === undefined ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => { useSeed(randomSeedHex(), true); }}>
              Create new test wallet
            </button>
            <Field label="Or import a seed" hint="64 hex characters (32 bytes) from a wallet created here. Test coins only.">
              {(id, d) => (
                <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} className="mono" value={seedInput} onChange={(e) => { setSeedInput(e.target.value); }} />
              )}
            </Field>
            <button type="button" className="btn" disabled={seedInput.trim() === ''} onClick={() => { useSeed(seedInput, false); }}>
              Import seed
            </button>
          </>
        ) : (
          <>
            <p>Receive address ({net.label}):</p>
            <p><Mono>{wallet.address}</Mono></p>
            <CopyButton text={wallet.address} label="Copy address" />
            <Field label="Optional amount to request (BTC)">
              {(id) => (
                <input id={id} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); }} />
              )}
            </Field>
            {uri !== undefined && (
              <>
                <h4>Payment instructions</h4>
                <ol className="plain-list">
                  <li>Open a wallet that supports BIP-352 silent payments on {net.label}.</li>
                  <li>Send to the address above, or scan the QR code or open this link: <Mono>{uri}</Mono></li>
                  <li>Wait for one confirmation, then use "Scan" below starting a few blocks before the payment.</li>
                </ol>
                <CopyButton text={uri} label="Copy payment link" />
                <QrView text={uri} caption="Silent payment request" />
              </>
            )}
            {seedShown !== undefined && (
              <Notice kind="warn" title="Backup seed (shown once)">
                <p><Mono>{seedShown}</Mono></p>
                <p>Anyone with this seed controls the wallet. It is not stored anywhere.</p>
                <CopyButton text={seedShown} label="Copy seed" />{' '}
                <button type="button" className="btn" onClick={() => { setSeedShown(undefined); }}>Hide seed</button>
              </Notice>
            )}
            <p>
              <button type="button" className="btn btn-danger" onClick={lock}>Lock and forget keys</button>
            </p>
          </>
        )}
      </div>

      {wallet !== undefined && (
        <div className="panel">
          <h3>3. Scan for payments</h3>
          <Field label="First block height" hint={`Scans at most ${String(MAX_SCAN_BLOCKS)} blocks per run up to the server tip. Whole blocks are downloaded and checked on this device.`}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="numeric" value={fromHeight} onChange={(e) => { setFromHeight(e.target.value); }} />
            )}
          </Field>
          <button type="button" className="btn btn-primary" disabled={scanning || url.trim() === ''} onClick={runScan}>
            {scanning ? 'Scanning' : 'Scan'}
          </button>
          {scanning && (
            <button type="button" className="btn" onClick={() => { abort.current?.abort(); }}>Cancel</button>
          )}
          {scanNote !== undefined && <p role="status">{scanNote}</p>}
          {scan !== undefined && (
            <>
              <p>
                {scan.found.length === 0
                  ? 'No unspent payments found in this range.'
                  : `${String(scan.found.length)} unspent payment(s) found.`}
                {scan.spentCount > 0 && ` ${String(scan.spentCount)} already spent.`}
              </p>
              {scan.found.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Sweep</th><th>Output</th><th>Block</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {scan.found.map((f) => {
                        const id = `${f.txid}:${String(f.vout)}`;
                        return (
                          <tr key={id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Sweep ${id}`}
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
                          </tr>
                        );
                      })}
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
          <h3>4. Sweep</h3>
          <Field label="Destination address" hint={`A ${net.label} address or silent payment address (tsp1...). Check it carefully: a sent transaction cannot be reversed.`}>
            {(id, d) => (
              <input id={id} aria-describedby={d} className="mono" spellCheck={false} autoComplete="off" value={destination} onChange={(e) => { setDestination(e.target.value); setReview(undefined); setSigned(undefined); }} />
            )}
          </Field>
          <Field label="Fee rate (sat/vB)" hint="Chosen by you; this app has no fee oracle. Transactions signal RBF (BIP-125).">
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="decimal" value={feeRate} onChange={(e) => { setFeeRate(e.target.value); setReview(undefined); setSigned(undefined); }} />
            )}
          </Field>
          <button type="button" className="btn btn-primary" disabled={selected.length === 0 || destination.trim() === ''} onClick={doReview}>
            Review sweep
          </button>

          {review !== undefined && (
            <section className="card" aria-labelledby="btc-review-h">
              <h4 id="btc-review-h">Review before signing</h4>
              <dl>
                <dt>Network</dt><dd>{review.networkLabel}</dd>
                <dt>Spending</dt>
                <dd>
                  <ul className="plain-list">
                    {review.inputs.map((i) => (
                      <li key={`${i.txid}:${String(i.vout)}`}><Mono>{`${i.txid}:${String(i.vout)}`}</Mono> {formatBtc(i.amountSats)}</li>
                    ))}
                  </ul>
                </dd>
                <dt>Total in</dt><dd>{formatBtc(review.totalSats)}</dd>
                <dt>Fee</dt><dd>{formatBtc(review.feeSats)} ({String(review.feeSats)} sats, {String(review.feeRate)} sat/vB, {String(review.vsize)} vB)</dd>
                <dt>Destination receives</dt><dd>{formatBtc(review.sendSats)}</dd>
                <dt>Destination ({review.destinationKind})</dt><dd><Mono>{review.destination}</Mono></dd>
                <dt>Change</dt><dd>None (everything selected is swept)</dd>
              </dl>
              {review.destinationKind === 'silent payment address' && (
                <p className="hint">The actual output key of a silent payment is derived when signing, so it is not shown here.</p>
              )}
              {review.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
              <label>
                <input type="checkbox" checked={approved} onChange={(e) => { setApproved(e.target.checked); }} />{' '}
                I checked the destination address, the amount and the fee.
              </label>
              <p>
                <button type="button" className="btn btn-primary" disabled={!approved || signed !== undefined} onClick={doSign}>
                  Sign with software key
                </button>
              </p>
            </section>
          )}

          {signed !== undefined && (
            <section className="card" aria-labelledby="btc-signed-h">
              <h4 id="btc-signed-h">Signed transaction</h4>
              <p>Transaction id: <Mono>{signed.txid}</Mono></p>
              <p>Not sent yet. Broadcasting sends it to the server above.</p>
              <CopyButton text={signed.rawHex} label="Copy raw transaction" />{' '}
              <button type="button" className="btn btn-primary" disabled={broadcastId !== undefined} onClick={doBroadcast}>
                Broadcast to {net.label}
              </button>
              {broadcastId !== undefined && <Notice kind="ok" title="Broadcast">The server accepted transaction <Mono>{broadcastId}</Mono>.</Notice>}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
