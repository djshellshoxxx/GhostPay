import { parseFragment, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BuiltPayment } from '@ghostpay/chain-adapters';
import { CopyButton, Mono, Notice, downloadText } from '../components/Common';
import { FeeDisclosure, useManifest } from '../components/Disclosure';
import { extractFragment } from '../lib/fragment';
import { formatCountdown, formatFiat, formatUnits, formatUnix, shortHex } from '../lib/format';
import { userMessage } from '../lib/errors';
import { DelayScheduler, randomDelayMs, type ScheduleSnapshot } from '../lib/jitter';
import {
  createPayContext,
  decodeForDisplay,
  quoteBuffer,
  reviewInvoice,
  type BufferQuote,
  type PayContext,
} from '../lib/pay';
import { buildReceipt, ensureAllowance, preparePayment, sendPayment, type Runtime, type SubmitResult } from '../lib/payExec';
import { useServices } from '../lib/services';
import { connectWallet, type WalletInfo, type WalletSession } from '../lib/wallet';
import { useApp } from '../state';

type Phase = 'input' | 'review' | 'waiting' | 'ready' | 'prepared' | 'busy' | 'done';

export function Pay(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [parsed, setParsed] = useState<ParsedInvoice | undefined>(undefined);
  const [rejected, setRejected] = useState<string | undefined>(undefined);
  const [paste, setPaste] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [useDelay, setUseDelay] = useState(false);
  const [useBuffer, setUseBuffer] = useState(false);
  const [bufferQuote, setBufferQuote] = useState<BufferQuote | undefined>(undefined);
  const [schedule, setSchedule] = useState<ScheduleSnapshot | undefined>(undefined);
  const [ctx, setCtx] = useState<PayContext | undefined>(undefined);
  const [ctxError, setCtxError] = useState<string | undefined>(undefined);
  const [wallets, setWallets] = useState<readonly WalletInfo[] | undefined>(undefined);
  const [wallet, setWallet] = useState<WalletSession | undefined>(undefined);
  const [built, setBuilt] = useState<BuiltPayment | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<SubmitResult | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const scheduler = useRef<DelayScheduler | undefined>(undefined);

  const fragment = app.fragment;
  const pinned = app.settings.pinnedSigners;

  // Parse whenever a fragment is present. Nothing is logged or sent anywhere.
  useEffect(() => {
    let live = true;
    if (fragment === undefined) {
      setParsed(undefined);
      setPhase('input');
      return;
    }
    parseFragment(fragment, { pinnedSigners: pinned }).then(
      (p) => {
        if (!live) return;
        setRejected(undefined);
        setParsed(p);
        setPhase('review');
      },
      (e: unknown) => {
        if (!live) return;
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
  const latest = useRef({ parsed, manifest });
  latest.current = { parsed, manifest };
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
      const c = await createPayContext(fresh, rpc, { nowSeconds: now });
      setCtx(c);
      setCtxError(undefined);
      return c;
    } catch (e) {
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
    const onVis = (): void => {
      scheduler.current?.check();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      scheduler.current?.cancel();
    };
  }, []);

  const token = review?.token;
  const isErc20 = parsed !== undefined && parsed.invoice.token !== 'native';

  const refreshBuffer = useCallback(async (): Promise<BufferQuote | undefined> => {
    if (chainId === undefined) return undefined;
    const rpc = await app.getRpc(chainId);
    if (rpc === undefined) {
      setError('A gas buffer needs an RPC for this chain. Configure one in Settings.');
      return undefined;
    }
    try {
      const q = await quoteBuffer(rpc, Math.floor(services.nowMs() / 1000));
      setBufferQuote(q);
      return q;
    } catch (e) {
      setError(userMessage(e));
      return undefined;
    }
  }, [chainId, app, services]);

  const onPasteSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const f = extractFragment(paste);
    if (f === undefined) {
      setRejected('That is not a GhostPay v1 invoice link.');
      return;
    }
    setRejected(undefined);
    app.setFragment(f);
    setPaste('');
  };

  const startWaiting = (): void => {
    if (parsed === undefined) return;
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
        setSchedule(snap);
        if (handled || snap.status === 'waiting') return;
        handled = true;
        if (snap.status === 'ready') {
          void (async () => {
            // Revalidate expiry, quote, chain support and amounts at the due time before anything else happens.
            const c = await refreshRef.current();
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
    setError(undefined);
    if (useDelay) startWaiting();
    else {
      void (async () => {
        const c = await refreshRef.current();
        if (c === undefined) {
          setError('The invoice or its price can no longer be paid as reviewed. Check the details again.');
          return;
        }
        setPhase('ready');
      })();
    }
  };

  const onFindWallets = (): void => {
    void services.discoverWallets().then(setWallets, () => {
      setWallets([]);
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
    setError(undefined);
    setStatus('Waiting for your wallet…');
    connectWallet(w, chainId).then(
      (s) => {
        setWallet(s);
        setStatus('');
        app.announce('Wallet connected.');
      },
      (e: unknown) => {
        setStatus('');
        setError(userMessage(e));
      },
    );
  };

  const onPrepare = (): void => {
    if (wallet === undefined || ctx === undefined) return;
    setError(undefined);
    setPhase('busy');
    void (async () => {
      try {
        const rt = await runtime();
        let buffer: BufferQuote | undefined;
        if (useBuffer && isErc20) {
          buffer = await refreshBuffer();
          if (buffer === undefined) throw new Error('buffer');
        }
        const t = ctx.review.token;
        const permit = t?.config?.permit === true && buffer === undefined;
        if (isErc20 && !permit && t?.address !== undefined && t.address !== 'native') {
          await ensureAllowance(wallet, ctx, t.address, rt, setStatus);
        }
        const b = await preparePayment(wallet, ctx, { usePermit: permit, ...(buffer === undefined ? {} : { buffer }) }, rt, setStatus);
        setBuilt(b);
        setStatus('');
        setPhase('prepared');
        app.announce('Payment prepared. Check the final details, then send.');
      } catch (e) {
        setStatus('');
        if (!(e instanceof Error && e.message === 'buffer')) setError(userMessage(e));
        setPhase('ready');
      }
    })();
  };

  const onSend = (): void => {
    if (wallet === undefined || ctx === undefined || built === undefined) return;
    setError(undefined);
    setPhase('busy');
    void (async () => {
      try {
        const rt = await runtime();
        const res = await sendPayment(wallet, ctx, built, rt, setStatus);
        setResult(res);
        setPhase('done');
        setStatus('');
        app.announce('Payment submitted.');
      } catch (e) {
        setStatus('');
        setError(userMessage(e));
        setPhase('prepared');
      }
    })();
  };

  const forget = (): void => {
    scheduler.current?.cancel();
    app.setFragment(undefined);
    setParsed(undefined);
    setBuilt(undefined);
    setWallet(undefined);
    setResult(undefined);
    setPhase('input');
  };

  /* ------------------------------- rendering ------------------------------- */

  if (parsed === undefined || review === undefined) {
    return (
      <section aria-labelledby="pay-h">
        <h2 id="pay-h">Pay an invoice</h2>
        {rejected !== undefined && <Notice kind="error" title="Invoice rejected">{rejected} Nothing was shown or sent.</Notice>}
        {fragment !== undefined && rejected === undefined && <p role="status">Reading invoice…</p>}
        <form onSubmit={onPasteSubmit} className="stack">
          <div className="field">
            <label htmlFor="paste">Paste an invoice link</label>
            <textarea id="paste" rows={3} value={paste} onChange={(e) => { setPaste(e.target.value); }} spellCheck={false} />
            <p className="hint">The link is read in this page only. It is never sent to a server.</p>
          </div>
          <button type="submit" className="btn btn-primary">Read invoice</button>
        </form>
      </section>
    );
  }

  const inv = parsed.invoice;
  const ready = phase === 'ready' || phase === 'prepared' || phase === 'busy' || phase === 'done';
  const decimals = token?.decimals ?? 18;
  const symbol = token?.symbol ?? '';

  return (
    <section aria-labelledby="pay-h">
      <h2 id="pay-h">Review payment</h2>

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
        <dt>Private part</dt>
        <dd>{parsed.encrypted ? 'Was encrypted in the link (decrypted here)' : 'Plain in the link'}</dd>
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
                  <td className="wrap">{li.description}</td>
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
          <strong>Memo:</strong> {inv.memo}
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
          {isErc20 && (
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
                  {bufferQuote === undefined ? 'Estimating buffer…' : `Extra ${formatUnits(bufferQuote.bufferWei, 18)} ${review.chain?.nativeSymbol ?? 'native coin'} (native, not ${symbol}) is sent in the same transaction to the one-time address. This publicly links your payment, the one-time address and the buffer. It is an estimate (${String(bufferQuote.gasLimit)} gas at up to ${String(bufferQuote.maxFeePerGas)} wei, +20 %), not a guarantee.`}
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

      {ready && phase !== 'done' && (
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
                    </button>
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

      {built !== undefined && phase !== 'done' && ctx !== undefined && (
        <FinalPreview built={built} ctx={ctx} onSend={onSend} busy={phase === 'busy'} />
      )}

      {status !== '' && <p role="status" className="status">{status}</p>}
      {error !== undefined && <Notice kind="error">{error}</Notice>}

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
        {phase !== 'done' && (
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

function FinalPreview(props: { readonly built: BuiltPayment; readonly ctx: PayContext; readonly onSend: () => void; readonly busy: boolean }): ReactNode {
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
        <dd>{formatUnits(decoded.fee, dec)} {sym} to {ctx.manifest.feeRecipient}</dd>
        <dt>Net to seller</dt>
        <dd>{formatUnits(decoded.net, dec)} {sym} (minimum accepted {formatUnits(decoded.minNet, dec)})</dd>
        <dt>Native value sent</dt>
        <dd>{formatUnits(built.tx.value, 18)} {ctx.chain.nativeSymbol}{p.method === 'payERC20WithBuffer' ? ' (gas buffer, public)' : ''}</dd>
        <dt>Deadline</dt>
        <dd>{formatUnix(Number(p.deadline))}</dd>
      </dl>
      <button type="button" className="btn btn-primary" onClick={props.onSend} disabled={props.busy}>
        Send payment in my wallet
      </button>
    </div>
  );
}
