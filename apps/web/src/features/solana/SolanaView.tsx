import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SolanaRpc } from '@ghostpay/solana-stealth';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { CameraImporter } from '../../components/CameraImporter';
import { PlainPaymentRequest } from '../../components/PaymentRequestQr';
import { QrFrame } from '../../components/QrFrame';
import { subscribeAppLock } from '../../lib/appLock';
import { useServices } from '../../lib/services';
import { SOL_NETWORKS, solNetwork, type SolNetworkId } from './network';
import { checkNetwork, createRpc, sendTransaction, SolViewError, solErrorMessage } from './rpc';
import { MAX_SCAN_PAGES, scanForPayments, wipeFound, type FoundPayment, type ScanResult } from './scan';
import { formatSol, reviewSweep, signSweep, type SignedSweep, type SweepReview } from './sweep';
import { randomSeedHex, walletFromSeedHex, wipeWallet, type SolWallet } from './wallet';

/**
 * Solana dual-key stealth payments (ed25519), test networks only. Keys live in this component's
 * state and vanish when you leave the view; nothing secret is stored.
 */
export function SolanaView(): ReactNode {
  const services = useServices();
  const [netId, setNetId] = useState<SolNetworkId>('devnet');
  const [url, setUrl] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [wallet, setWallet] = useState<SolWallet | undefined>(undefined);
  const [seedShown, setSeedShown] = useState<string | undefined>(undefined);
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
      if (scanRef.current !== undefined) wipeFound(scanRef.current.found);
    },
    [],
  );

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
      throw new SolViewError('Enter the RPC server URL (https, or http to localhost for a local validator).');
    }
    await checkNetwork(rpc, net, signal);
    return rpc;
  };

  const useSeed = (hex: string, reveal: boolean): void => {
    guard(() => {
      const w = walletFromSeedHex(hex, net);
      invalidate();
      if (walletRef.current !== undefined) wipeWallet(walletRef.current);
      resetFlow();
      walletRef.current = w;
      setWallet(w);
      setAppLocked(false);
      setSeedInput('');
      setSeedShown(reveal ? hex : undefined);
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
        if (!/^\d{1,15}$/.test(fromSlot.trim())) throw new SolViewError('Enter the first slot to scan.');
        const res = await scanForPayments({
          rpc,
          wallet,
          fromSlot: BigInt(fromSlot.trim()),
          signal,
          onFound: (s) => { if (live()) setScanNote(`Found a payment in slot ${String(s)}`); },
        });
        if (!live()) {
          wipeFound(res.found);
          return;
        }
        scanRef.current = res;
        setScan(res);
        setScanNote(`Scanned finalized slots ${String(res.fromSlot)} to ${String(res.toSlot)}.`);
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
    invalidate();
    if (walletRef.current !== undefined) wipeWallet(walletRef.current);
    walletRef.current = undefined;
    setWallet(undefined);
    setSeedShown(undefined);
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
      <h2 id="sol-h">Solana stealth payments (test networks)</h2>
      <Notice kind="warn" title="Proof of concept, test networks only">
        Unaudited. Mainnet is disabled. Use only coins that have no value (devnet, testnet or a local validator).
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
              onChange={(e) => { setNetId(e.target.value as SolNetworkId); }}
            >
              {SOL_NETWORKS.map((n) => (
                <option key={n.id} value={n.id} disabled={!n.enabled}>{n.label}</option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="RPC server URL"
          hint="Any Solana JSON-RPC server you trust for this network (https, or http to localhost for a local validator). It sees the transactions you scan, each one-time address whose balance you check, and any transaction you broadcast. It cannot see your keys."
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
            {appLocked && <Notice kind="info">The app locked, so this wallet's keys were wiped from memory. Import the backup seed to use it again.</Notice>}
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
            <p>Stealth meta-address ({net.label}):</p>
            <p><Mono>{wallet.metaAddress}</Mono></p>
            <CopyButton text={wallet.metaAddress} label="Copy address" />
            {request !== undefined && (
              <>
                <h4>Payment instructions</h4>
                <ol className="plain-list">
                  <li>The payer needs a tool that supports GhostPay Solana stealth payments on {net.label}. This view does not send payments.</li>
                  <li>The payer pastes the address above (or scans the QR code), derives a one-time address from it, and sends SOL to that address.</li>
                  <li>The same transaction must carry the announcement memo (<Mono>gpst1:...</Mono>); without it this wallet cannot find the payment.</li>
                  <li>Wait for finalization, then use "Scan" below starting a little before the payment slot.</li>
                </ol>
                <QrFrame kind="caution" text={request} caption={`Solana stealth payment request (${net.label})`} />
                <PlainPaymentRequest family="solana" testnet={net.id !== 'mainnet'} networkLabel={net.label} />
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
          <Field label="First slot" hint={`Scans finalized announcements from this slot up to the server head, at most ${String(MAX_SCAN_PAGES)} pages of 1000 transactions. Every transaction is downloaded and checked on this device.`}>
            {(id, d) => (
              <input id={id} aria-describedby={d} inputMode="numeric" value={fromSlot} onChange={(e) => { setFromSlot(e.target.value); }} />
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
              </p>
              {scan.found.length > 0 && (
                <div className="table-wrap">
                  <p role="note">
                    Payments and balances were checked with the configured RPC provider. This is a single-provider check, not independent verification. Select and review the exact one-time address below.
                  </p>
                  <table>
                    <thead>
                      <tr><th>Sweep</th><th>One-time address</th><th>Slot</th><th>Balance</th></tr>
                    </thead>
                    <tbody>
                      {scan.found.map((f) => (
                        <tr key={f.stealthAddress}>
                          <td>
                            <input
                              type="radio"
                              name="sol-sweep"
                              aria-label={`Sweep ${f.stealthAddress}`}
                              checked={picked === f.stealthAddress}
                              onChange={() => { setPicked(f.stealthAddress); clearReview(); }}
                            />
                          </td>
                          <td><Mono>{f.stealthAddress}</Mono></td>
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
          <h3>4. Sweep</h3>
          <Field label="Destination address" hint={`A ${net.label} address. Check it carefully: a sent transaction cannot be reversed.`}>
            {(id, d) => (
              <input id={id} aria-describedby={d} className="mono" spellCheck={false} autoComplete="off" value={destination} onChange={(e) => { setDestination(e.target.value); clearReview(); }} />
            )}
          </Field>
          <CameraImporter
            label="Import sweep destination QR"
            scopeKey={wallet}
            onText={(scanned) => {
              const candidate = scanned.trim().replace(/^solana:/i, '').split('?')[0] ?? '';
              try {
                // reviewSweep applies the same address and amount checks used before signing.
                if (selected === undefined) throw new SolViewError('Select a payment first.');
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
          <p className="hint">The fee is fixed at the base rate for one signature; this app has no fee oracle.</p>
          <button type="button" className="btn btn-primary" disabled={selected === undefined || destination.trim() === ''} onClick={doReview}>
            Review sweep
          </button>

          {review !== undefined && (
            <section className="card" aria-labelledby="sol-review-h">
              <h4 id="sol-review-h">Review before signing</h4>
              <dl>
                <dt>Network</dt><dd>{review.networkLabel}</dd>
                <dt>Spending from</dt><dd><Mono>{review.from}</Mono></dd>
                <dt>Total in</dt><dd>{formatSol(review.totalLamports)}</dd>
                <dt>Fee</dt><dd>{formatSol(review.feeLamports)} ({String(review.feeLamports)} lamports)</dd>
                <dt>Destination receives</dt><dd>{formatSol(review.sendLamports)}</dd>
                <dt>Destination</dt><dd><Mono>{review.destination}</Mono></dd>
                <dt>Change</dt><dd>None (the whole balance is swept)</dd>
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
            <section className="card" aria-labelledby="sol-signed-h">
              <h4 id="sol-signed-h">Signed transaction</h4>
              <p>Signature: <Mono>{signed.signature}</Mono></p>
              <p>Not sent yet. Broadcasting sends it to the server above.</p>
              <CopyButton text={signed.wireBase64} label="Copy raw transaction" />{' '}
              <button type="button" className="btn btn-primary" disabled={broadcastId !== undefined || busy} onClick={doBroadcast}>
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
