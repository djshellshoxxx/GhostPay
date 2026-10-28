import { useEffect, useRef, useState, type ReactNode } from 'react';
import { decodeTronAddress, type TronRpc } from '@ghostpay/tron-adapter';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { CameraImporter } from '../../components/CameraImporter';
import { PlainPaymentRequest } from '../../components/PaymentRequestQr';
import { QrFrame } from '../../components/QrFrame';
import { subscribeAppLock } from '../../lib/appLock';
import { useServices } from '../../lib/services';
import { TRON_NETWORK_LIST, tronNetwork, type TronNetworkId } from './network';
import { broadcastHex, checkNetwork, createRpc, getChainParams, isActivated, TronViewError, tronErrorMessage } from './rpc';
import { MAX_SCAN_BLOCKS, scanForPayments, type FoundPayment, type ScanResult } from './scan';
import { formatTrx, reviewSweep, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { backupHex, newWallet, walletFromBackupHex, wipeWallet, type TronWallet } from './wallet';

/**
 * TRON stealth payments (secp256k1, ERC-5564 scheme 1), test networks only. Keys live in this
 * component's state and vanish when you leave the view; nothing secret is stored.
 */
export function TronView(): ReactNode {
  const services = useServices();
  const [netId, setNetId] = useState<TronNetworkId>('nile');
  const [url, setUrl] = useState('');
  const [backupInput, setBackupInput] = useState('');
  const [wallet, setWallet] = useState<TronWallet | undefined>(undefined);
  const [backupShown, setBackupShown] = useState<string | undefined>(undefined);
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
      throw new TronViewError('Enter the node URL (https, or http to localhost for a local node).');
    }
    await checkNetwork(rpc, signal);
    return rpc;
  };

  const install = (w: TronWallet, reveal: boolean): void => {
    invalidate();
    if (walletRef.current !== undefined) wipeWallet(walletRef.current);
    resetFlow();
    walletRef.current = w;
    setWallet(w);
    setAppLocked(false);
    setBackupInput('');
    setBackupShown(reveal ? backupHex(w) : undefined);
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
        if (!/^\d{1,15}$/.test(fromBlock.trim())) throw new TronViewError('Enter the first block to scan.');
        const res = await scanForPayments({
          rpc,
          wallet,
          fromBlock: BigInt(fromBlock.trim()),
          signal,
          onFound: (b) => { if (live()) setScanNote(`Found a payment in block ${String(b)}`); },
        });
        if (!live()) return;
        setScan(res);
        setScanNote(`Scanned blocks ${String(res.fromBlock)} to ${String(res.toBlock)}.`);
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
    invalidate();
    if (walletRef.current !== undefined) wipeWallet(walletRef.current);
    walletRef.current = undefined;
    setWallet(undefined);
    setBackupShown(undefined);
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
      <h2 id="tron-h">TRON stealth payments (test networks)</h2>
      <Notice kind="warn" title="Proof of concept, test networks only">
        Unaudited. Mainnet is disabled. Use only coins that have no value (Nile, Shasta or a local node).
        Keys are held in memory and are never saved; write down the key backup if you want to keep the wallet.
      </Notice>
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <div className="panel">
        <h3>1. Network and node</h3>
        <Field label="Network">
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
          label="Node URL"
          hint="Any TRON full node or TronGrid-style HTTP API you trust for this network (https, or http to localhost). It sees the blocks you scan, each one-time address whose balance you check, and any transaction you broadcast. It cannot see your keys. This app only refuses a node that reports mainnet; it cannot prove which test network the node is on."
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
            {appLocked && <Notice kind="info">The app locked, so this wallet's keys were wiped from memory. Import the backup keys to use it again.</Notice>}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { guard(() => { install(newWallet(net), true); }); }}
            >
              Create new test wallet
            </button>
            <Field label="Or import keys" hint="128 hex characters (64 bytes) from the backup of a wallet created here. Test coins only.">
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
              Import keys
            </button>
          </>
        ) : (
          <>
            <p>Stealth meta-address ({net.label}):</p>
            <p><Mono>{wallet.metaAddress}</Mono></p>
            <CopyButton text={wallet.metaAddress} label="Copy address" />
            <h4>Payment instructions</h4>
            <ol className="plain-list">
              <li>The payer needs a tool that supports GhostPay TRON stealth payments on {net.label}. This view does not send payments.</li>
              <li>The payer pastes the address above (or scans the QR code), derives a one-time TRON address from it, and sends TRX to that address.</li>
              <li>The same transaction must carry the announcement memo (<Mono>GPT1</Mono>); without it this wallet cannot find the payment.</li>
              <li>Wait for the block to be produced, then use "Scan" below starting a little before it. TRC-20 tokens are detected but not swept here.</li>
            </ol>
            <QrFrame kind="caution" text={wallet.metaAddress} caption={`TRON stealth payment request (${net.label})`} />
            <PlainPaymentRequest family="tron" tronNetwork={net.id === 'local' ? undefined : net.id} testnet={net.id !== 'mainnet'} networkLabel={net.label} />
            {backupShown !== undefined && (
              <Notice kind="warn" title="Backup keys (shown once)">
                <p><Mono>{backupShown}</Mono></p>
                <p>Anyone with these keys controls the wallet. They are not stored anywhere.</p>
                <CopyButton text={backupShown} label="Copy keys" />{' '}
                <button type="button" className="btn" onClick={() => { setBackupShown(undefined); }}>Hide keys</button>
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
          <Field label="First block" hint={`Scans at most ${String(MAX_SCAN_BLOCKS)} blocks per run up to the node head. Whole blocks are downloaded and checked on this device.`}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="numeric" value={fromBlock} onChange={(e) => { setFromBlock(e.target.value); }} />
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
                  ? 'No funded payments found in this range.'
                  : `${String(scan.found.length)} funded payment(s) found.`}
                {scan.emptiedCount > 0 && ` ${String(scan.emptiedCount)} already swept.`}
                {scan.tokenCount > 0 && ` ${String(scan.tokenCount)} TRC-20 payment(s) not shown; this view sweeps TRX only.`}
              </p>
              {scan.found.length > 0 && (
                <div className="table-wrap">
                  <p role="note">
                    Payments and balances were checked with the configured node. This is a single-provider check, not independent verification. Select and review the exact one-time address below.
                  </p>
                  <table>
                    <thead>
                      <tr><th>Sweep</th><th>One-time address</th><th>Block</th><th>Balance</th></tr>
                    </thead>
                    <tbody>
                      {scan.found.map((f) => (
                        <tr key={f.stealthAddress}>
                          <td>
                            <input
                              type="radio"
                              name="tron-sweep"
                              aria-label={`Sweep ${f.stealthAddress}`}
                              checked={picked === f.stealthAddress}
                              onChange={() => { setPicked(f.stealthAddress); clearReview(); }}
                            />
                          </td>
                          <td><Mono>{f.stealthAddress}</Mono></td>
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
          <h3>4. Sweep</h3>
          <Field label="Destination address" hint={`A ${net.label} address (T...). Check it carefully: a sent transaction cannot be reversed.`}>
            {(id, d) => (
              <input id={id} aria-describedby={d} className="mono" spellCheck={false} autoComplete="off" value={destination} onChange={(e) => { setDestination(e.target.value); clearReview(); }} />
            )}
          </Field>
          <CameraImporter
            label="Import sweep destination QR"
            scopeKey={wallet}
            onText={(scanned) => {
              const candidate = scanned.trim().replace(/^tron:/i, '').split('?')[0] ?? '';
              try {
                decodeTronAddress(candidate);
                if (selected !== undefined && candidate === selected.stealthAddress) {
                  throw new TronViewError('Choose a different address than the one-time address being swept.');
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
          <p className="hint">The fee reserve is estimated from the node's chain parameters when you review.</p>
          <button type="button" className="btn btn-primary" disabled={selected === undefined || destination.trim() === '' || busy} onClick={doReview}>
            Review sweep
          </button>

          {review !== undefined && (
            <section className="card" aria-labelledby="tron-review-h">
              <h4 id="tron-review-h">Review before signing</h4>
              <dl>
                <dt>Network</dt><dd>{review.networkLabel}</dd>
                <dt>Spending from</dt><dd><Mono>{review.from}</Mono></dd>
                <dt>Total in</dt><dd>{formatTrx(review.totalSun)}</dd>
                <dt>Fee reserve (upper bound)</dt><dd>{formatTrx(review.feeReserveSun)} ({String(review.feeReserveSun)} sun)</dd>
                <dt>Destination receives</dt><dd>{formatTrx(review.sendSun)}</dd>
                <dt>Destination</dt><dd><Mono>{review.destination}</Mono></dd>
              </dl>
              {review.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
              <label>
                <input type="checkbox" checked={approved} onChange={(e) => { setApproved(e.target.checked); }} />{' '}
                I checked the destination address, the amount and the fee.
              </label>
              <p>
                <button type="button" className="btn btn-primary" disabled={!approved || signed !== undefined || busy} onClick={doSign}>
                  Sign with software key
                </button>
              </p>
            </section>
          )}

          {signed !== undefined && (
            <section className="card" aria-labelledby="tron-signed-h">
              <h4 id="tron-signed-h">Signed transaction</h4>
              <p>Transaction id: <Mono>{signed.txID}</Mono></p>
              <p>Not sent yet. Broadcasting sends it to the node above.</p>
              <CopyButton text={signed.signedHex} label="Copy raw transaction" />{' '}
              <button type="button" className="btn btn-primary" disabled={broadcastId !== undefined || busy} onClick={doBroadcast}>
                Broadcast to {net.label}
              </button>
              {broadcastId !== undefined && <Notice kind="ok" title="Broadcast">The node accepted transaction <Mono>{broadcastId}</Mono>.</Notice>}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
