import {
  dedupeClaims,
  findChain,
  tokensForChain,
  verifyClaimedPayment,
  verifyPaymentByTxHash,
  type PaymentVerification,
  type RpcClient,
  type TxPaymentResult,
} from '@ghostpay/chain-adapters';
import { unsafeRevealSecret } from '@ghostpay/core-crypto';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../components/Common';
import { useDeploymentCheck, useManifest } from '../components/Disclosure';
import { deploymentProblem } from '../lib/deployment';
import { formatUnits } from '../lib/format';
import { userMessage } from '../lib/errors';
import { runScan, type ScanMatch, type ScanProgress } from '../lib/scanClient';
import { useServices } from '../lib/services';
import { requireSession } from '../lib/session';
import type { TagPayload } from '../lib/tags';
import { useApp } from '../state';

export function Scan(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [chainId, setChainId] = useState<number>(services.chains[0]?.chainId ?? 84532);
  const [start, setStart] = useState('');
  const [resume, setResume] = useState(true);
  const [deep, setDeep] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);
  const [checks, setChecks] = useState<Readonly<Record<string, PaymentVerification | 'pending'>>>({});
  const abort = useRef<AbortController | undefined>(undefined);
  const manifest = useManifest(chainId);
  const { check } = useDeploymentCheck(manifest);
  const checkpoint = services.checkpoints.load(chainId);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  if (app.session === undefined) {
    return (
      <section aria-labelledby="scan-h">
        <h2 id="scan-h">Scan and receive</h2>
        <Notice kind="info">Load or generate seller keys first.</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>Go to Seller keys</button>
      </section>
    );
  }

  const verifiedDeployment = check !== undefined && check !== 'checking' && check.status === 'verified' ? check.verified : undefined;
  const problem = manifest?.status === 'loaded' ? deploymentProblem(check) : undefined;

  /** Verifies every (de-duplicated) match against the chain; amounts in announcements are claims until then. */
  const verifyAll = async (found: readonly ScanMatch[], chain: NonNullable<ReturnType<typeof findChain>>, rpc: RpcClient, router: ScanMatch['stealthAddress'], announcer: ScanMatch['stealthAddress']): Promise<void> => {
    setChecks(Object.fromEntries(found.map((m) => [m.announcement.id, 'pending' as const])));
    for (const m of found) {
      const v = await verifyClaimedPayment({ chain, client: rpc, router, announcer, claim: m });
      setChecks((c) => ({ ...c, [m.announcement.id]: v }));
    }
  };

  const begin = (): void => {
    setError(undefined);
    setDone(undefined);
    void (async () => {
      try {
        const chain = findChain(chainId);
        if (chain === undefined || manifest?.status !== 'loaded') throw new Error('manifest');
        if (verifiedDeployment === undefined) {
          setError(deploymentProblem(check) ?? 'The deployment has not been verified on-chain.');
          return;
        }
        const rpc: RpcClient | undefined = await app.getRpc(chainId);
        if (rpc === undefined) {
          setError('Configure an RPC for this chain in Settings first.');
          return;
        }
        let cursor = resume ? checkpoint : undefined;
        if (cursor === undefined) {
          if (!/^\d{1,15}$/.test(start.trim())) {
            setError('Enter the block number to start scanning from.');
            return;
          }
          cursor = { nextBlock: BigInt(start.trim()) };
        }
        const secrets = requireSession();
        const viewingKey = unsafeRevealSecret(secrets.keys.viewingSecret);
        const ctl = new AbortController();
        abort.current = ctl;
        setRunning(true);
        app.setMatches([]);
        setChecks({});
        const found: ScanMatch[] = [];
        // The router and announcer used to classify announcements are the ones READ FROM THE CHAIN.
        const res = await runScan({
          chain,
          manifest: { ...manifest.manifest, router: verifiedDeployment.router, announcer: verifiedDeployment.announcer },
          client: rpc,
          cursor,
          spendingPublicKeyHex: app.session?.spendingPublicKey ?? '',
          viewingKey,
          deep,
          createWorker: services.createScanWorker,
          signal: ctl.signal,
          checkpoints: services.checkpoints,
          onProgress: setProgress,
          onMatch: (m) => {
            found.push(m);
            app.setMatches([...found]);
          },
        });
        const unique = dedupeClaims(res.matches);
        app.setMatches(unique.items);
        const dup = unique.duplicates > 0 ? ` ${String(unique.duplicates)} repeated announcement${unique.duplicates === 1 ? '' : 's'} of the same one-time address ignored.` : '';
        setDone(
          ctl.signal.aborted
            ? `Cancelled. ${String(res.scanned)} announcements checked.${dup}`
            : `Finished. ${String(res.scanned)} announcements checked, ${String(unique.items.length)} announcement${unique.items.length === 1 ? '' : 's'} addressed to you.${dup} Now checking each one against the chain.`,
        );
        app.announce('Scan finished.');
        await verifyAll(unique.items, chain, rpc, verifiedDeployment.router, verifiedDeployment.announcer);
      } catch (e) {
        setError(e instanceof Error && e.message === 'manifest' ? 'Payments are disabled on this chain: no deployment manifest is bundled, so the announcer address is unknown.' : userMessage(e));
      } finally {
        setRunning(false);
      }
    })();
  };

  const hosts = app.rpcHosts(chainId);

  return (
    <section aria-labelledby="scan-h">
      <h2 id="scan-h">Scan and receive</h2>
      <p>
        Announcements are downloaded from your RPC and checked inside a dedicated worker. The worker gets public logs and your viewing key for this scan only; it cannot reach the network.
      </p>
      <Notice kind="warn" title="Your RPC provider sees this">
        {hosts.length === 0 ? 'The RPC provider you configure' : `Your RPC provider (${hosts.join(', ')})`} learns your IP address, which block ranges you scan and, later, which one-time addresses you look at and sweep. That ties your network identity to your payments. Use your own node, a provider you trust, or a Tor-capable setup if this matters. Run scans from the same place you would run a sweep only if you accept that link.
      </Notice>
      <div className="stack">
        <Field label="Chain">
          {(id) => (
            <select id={id} value={chainId} onChange={(e) => { setChainId(Number(e.target.value)); app.setMatches([]); setChecks({}); setDone(undefined); }} disabled={running}>
              {services.chains.map((c) => (
                <option key={c.chainId} value={c.chainId}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
        {manifest !== undefined && manifest.status !== 'loaded' && <Notice kind="warn">Payments disabled on this chain: no usable deployment manifest is bundled.</Notice>}
        {problem !== undefined && <Notice kind={check === undefined || check === 'checking' ? 'info' : 'warn'}>{problem}</Notice>}
        <Field label="Start block" hint={checkpoint === undefined ? 'The first block to scan from.' : `A checkpoint exists at block ${checkpoint.nextBlock.toString()}.`}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={start} onChange={(e) => { setStart(e.target.value); }} disabled={running} />}
        </Field>
        {checkpoint !== undefined && (
          <div className="check">
            <input id="resume" type="checkbox" checked={resume} onChange={(e) => { setResume(e.target.checked); }} />
            <label htmlFor="resume">Resume from checkpoint</label>
          </div>
        )}
        <div className="check">
          <input id="deep" type="checkbox" checked={deep} onChange={(e) => { setDeep(e.target.checked); }} disabled={running} />
          <label htmlFor="deep">Deep scan: also find payments whose view tag is wrong</label>
        </div>
        <p className="hint">
          A payer controls the view tag and the checkout contract cannot check it. A payer who publishes a wrong tag pays a one-time address that an ordinary scan never reports. Deep scan ignores the tag for announcements made by the GhostPay router. Cost: one extra elliptic-curve multiplication for every such announcement in the range, so it can be many times slower on busy chains. Announcements from anyone else stay tag-filtered.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={begin} disabled={running}>Start scan</button>
          <button type="button" className="btn" onClick={() => { abort.current?.abort(); }} disabled={!running}>Cancel</button>
          {checkpoint !== undefined && (
            <button type="button" className="btn" onClick={() => { services.checkpoints.clear(chainId); setResume(false); app.announce('Checkpoint cleared.'); }} disabled={running}>
              Clear checkpoint
            </button>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="status">
        {progress !== undefined && `Scanned up to block ${progress.nextBlock.toString()}; ${String(progress.scanned)} announcements checked, ${String(progress.matches)} addressed to you${progress.skipped > 0 ? `, ${String(progress.skipped)} malformed logs skipped` : ''}.`}
        {running && progress === undefined && 'Starting…'}
      </div>
      {done !== undefined && <Notice kind="ok">{done}</Notice>}
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <Matches chainId={chainId} checks={checks} />
      <ClaimCheck chainId={chainId} verified={verifiedDeployment} />
      <Tags chainId={chainId} />
    </section>
  );
}

function claimText(m: ScanMatch): string {
  if (m.metadata === undefined) return 'an unknown payment layout';
  if (m.metadata.kind === 'native') return `${formatUnits(m.metadata.netAmount, 18)} ${findChain(m.chainId)?.nativeSymbol ?? 'native'}`;
  const t = tokensForChain(m.chainId).find((x) => x.address.toLowerCase() === m.metadata?.token.toLowerCase());
  return t === undefined ? `${m.metadata.netAmount.toString()} units of unlisted token ${m.metadata.token}` : `${formatUnits(m.metadata.netAmount, t.decimals)} ${t.symbol}`;
}

function Status(props: { readonly m: ScanMatch; readonly v: PaymentVerification | 'pending' | undefined; readonly finality: number }): ReactNode {
  const { m, v } = props;
  const claim = claimText(m);
  if (v === undefined || v === 'pending') return <p role="status">Checking this announcement against the chain… It claims {claim}; that is not yet confirmed.</p>;
  const depth = `${v.confirmations.toString()} confirmation${v.confirmations === 1n ? '' : 's'} (${v.final ? `at least the ${String(props.finality)} this app treats as final` : `fewer than the ${String(props.finality)} this app treats as final; a reorganisation could still remove it`})`;
  if (v.status === 'received') {
    return (
      <>
        <p><strong>Received: {claim}</strong> (net, after the checkout fee), in block {m.announcement.blockNumber.toString()}.</p>
        <p className="hint">Verified against the chain: router announcement, canonical block, and an independent trace of the amount. {depth}.</p>
        {v.observedBalance !== undefined && <p className="hint">Balance at the one-time address now: {v.observedBalance.toString()} base units{v.observedBalance === 0n ? ' (already moved or swept)' : ''}.</p>}
      </>
    );
  }
  return (
    <>
      <p><strong>{v.status === 'unverified-announcement' ? 'Unverified announcement' : 'Unverified payment claim'}</strong> in block {m.announcement.blockNumber.toString()}: it claims {claim}. This is <strong>not</strong> money you have received.</p>
      <p className="hint">{v.reason}</p>
      {v.observedBalance !== undefined && <p className="hint">Balance of the claimed asset at the one-time address now: {v.observedBalance.toString()} base units.</p>}
    </>
  );
}

function Matches(props: { readonly chainId: number; readonly checks: Readonly<Record<string, PaymentVerification | 'pending'>> }): ReactNode {
  const app = useApp();
  const services = useServices();
  const [tags, setTags] = useState<Readonly<Record<string, string>>>({});
  const [label, setLabel] = useState<Readonly<Record<string, string>>>({});
  const [err, setErr] = useState<string | undefined>(undefined);
  const unlocked = services.vault.unlocked;
  const matches = app.matches.filter((m) => m.chainId === props.chainId);
  const other = app.matches.length - matches.length;
  const finality = findChain(props.chainId)?.finalityDepth ?? 0;

  useEffect(() => {
    let live = true;
    if (!unlocked) {
      setTags({});
      return;
    }
    void (async () => {
      const next: Record<string, string> = {};
      for (const m of app.matches.filter((x) => x.chainId === props.chainId)) {
        try {
          const t = await services.vault.find(props.chainId, m.stealthAddress);
          if (t !== undefined) next[m.announcement.id] = t.clientLabel;
        } catch {
          /* undecryptable tags are reported in the tag list */
        }
      }
      if (live) setTags(next);
    })();
    return () => {
      live = false;
    };
  }, [app.matches, unlocked, services, props.chainId]);

  if (matches.length === 0) return <p className="hint">No announcements addressed to you found yet.{other > 0 ? ` (${String(other)} found on another chain.)` : ''}</p>;
  return (
    <div>
      <h3>Announcements addressed to you</h3>
      <p className="hint">Amounts and tokens below come from announcement data that the payer (or anyone) chose. Only rows marked &ldquo;Received&rdquo; were confirmed against the chain.</p>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
      <ul className="plain-list matches">
        {matches.map((m) => {
          const id = m.announcement.id;
          return (
            <li key={id} className="card">
              <Status m={m} v={props.checks[id]} finality={finality} />
              {m.tagMatches === false && <Notice kind="warn" title="Wrong view tag">Found only by deep scan: the payer published a view tag that does not match, so an ordinary scan would have missed this payment.</Notice>}
              <p>One-time address: <Mono>{m.stealthAddress}</Mono></p>
              {tags[id] !== undefined && <p>Tag: <strong className="wrap">{tags[id]}</strong></p>}
              {unlocked && (
                <div className="row">
                  <div className="field">
                    <label htmlFor={`tag-${id}`}>Client tag (stored encrypted on this device)</label>
                    <input id={`tag-${id}`} value={label[id] ?? ''} maxLength={200} onChange={(e) => { setLabel({ ...label, [id]: e.target.value }); }} />
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const payload: TagPayload = { stealthAddress: m.stealthAddress, announcementId: id, logIndex: m.announcement.logIndex, clientLabel: label[id] ?? '' };
                      services.vault.save(props.chainId, payload).then(
                        () => {
                          setErr(undefined);
                          setTags({ ...tags, [id]: payload.clientLabel.trim() });
                          app.announce('Tag saved.');
                        },
                        (e: unknown) => {
                          setErr(userMessage(e));
                        },
                      );
                    }}
                  >
                    Save tag
                  </button>
                </div>
              )}
              <button type="button" className="btn btn-primary" onClick={() => { app.selectForSweep({ match: m, chainId: m.chainId }); app.setView('sweep'); }}>
                Sweep this payment
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Did this transaction pay me?" (D4): checks one transaction hash against the seller's keys without the view-tag shortcut. */
function ClaimCheck(props: { readonly chainId: number; readonly verified: { readonly router: `0x${string}`; readonly announcer: `0x${string}` } | undefined }): ReactNode {
  const app = useApp();
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>(undefined);
  const [res, setRes] = useState<readonly TxPaymentResult[] | undefined>(undefined);
  const run = (): void => {
    setErr(undefined);
    setRes(undefined);
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) {
      setErr('A transaction hash is 0x followed by 64 hex digits.');
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const chain = findChain(props.chainId);
        const rpc = await app.getRpc(props.chainId);
        if (chain === undefined || rpc === undefined) throw new Error('rpc');
        if (props.verified === undefined) throw new Error('deployment');
        const keys = requireSession().keys;
        setRes(
          await verifyPaymentByTxHash({
            chain,
            client: rpc,
            router: props.verified.router,
            announcer: props.verified.announcer,
            txHash: hash.trim(),
            viewingSecret: keys.viewingSecret,
            spendingPublicKey: keys.spendingPublicKey,
          }),
        );
      } catch (e) {
        setErr(e instanceof Error && e.message === 'rpc' ? 'Configure an RPC for this chain in Settings first.' : e instanceof Error && e.message === 'deployment' ? 'The deployment must be verified on-chain first.' : userMessage(e));
      } finally {
        setBusy(false);
      }
    })();
  };
  return (
    <div>
      <h3>Check a payer&rsquo;s transaction hash</h3>
      <p className="hint">If a payer says they paid but nothing appears above, paste the transaction hash they give you. The app reads that transaction from your RPC and tests every GhostPay announcement in it against your keys, ignoring the view tag.</p>
      <div className="row">
        <Field label="Transaction hash">{(id) => <input id={id} spellCheck={false} value={hash} onChange={(e) => { setHash(e.target.value); }} placeholder="0x…" />}</Field>
        <button type="button" className="btn" onClick={run} disabled={busy}>Check this transaction</button>
      </div>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
      {res !== undefined && res.length === 0 && <Notice kind="warn" title="Nothing for you">That transaction contains no GhostPay payment addressed to your keys. It may be for someone else, or it did not go through the GhostPay router.</Notice>}
      {res?.map((r) => (
        <div key={r.claim.announcement.id} className="card">
          <Status m={{ chainId: props.chainId, announcement: r.claim.announcement, stealthAddress: r.claim.stealthAddress, metadata: r.claim.metadata, viaRouter: true }} v={r.verification} finality={findChain(props.chainId)?.finalityDepth ?? 0} />
          {!r.tagMatches && <p className="hint">The payer published a wrong view tag, which is why an ordinary scan does not list this payment.</p>}
          <p>One-time address: <Mono>{r.claim.stealthAddress}</Mono></p>
        </div>
      ))}
    </div>
  );
}

function Tags(props: { readonly chainId: number }): ReactNode {
  const app = useApp();
  const services = useServices();
  const [, force] = useState(0);
  const [list, setList] = useState<readonly TagPayload[] | undefined>(undefined);
  const [err, setErr] = useState<string | undefined>(undefined);
  const unlocked = services.vault.unlocked;

  const refresh = (): void => {
    services.vault.list(props.chainId).then(setList, (e: unknown) => {
      setErr(userMessage(e));
    });
  };

  return (
    <div>
      <h3>Local client tags</h3>
      <p className="hint">
        Tags never leave this browser. They are encrypted with a key derived from your viewing key and stored in IndexedDB as ciphertext. The payload is encrypted, but the number of tags, their chain, creation times and random record ids are stored in the clear and visible to anything that can read this browser profile. They are readable while unlocked, so lock when you step away; the vault also locks after {app.settings.lockTimeoutMin} idle minutes.
      </p>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
      <div className="actions">
        {!unlocked ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                const key = unsafeRevealSecret(requireSession().keys.viewingSecret);
                services.vault.unlock(key).then(
                  () => {
                    setErr(undefined);
                    force((n) => n + 1);
                    refresh();
                    app.announce('Tags unlocked.');
                  },
                  (e: unknown) => {
                    setErr(userMessage(e));
                  },
                );
              } catch (e) {
                setErr(userMessage(e));
              }
            }}
          >
            Unlock tags
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => { services.vault.lock(); setList(undefined); force((n) => n + 1); app.announce('Tags locked.'); }}>
            Lock tags
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Delete every local tag on this device? This cannot be undone.')) {
              services.vault.wipe().then(
                () => {
                  setList(undefined);
                  force((n) => n + 1);
                  app.announce('All tags deleted.');
                },
                (e: unknown) => {
                  setErr(userMessage(e));
                },
              );
            }
          }}
        >
          Delete all tags
        </button>
      </div>
      {unlocked && list !== undefined && (
        <ul className="plain-list">
          {list.map((t) => (
            <li key={t.announcementId}>
              <span className="wrap">{t.clientLabel}</span> <Mono>{t.stealthAddress}</Mono>
            </li>
          ))}
          {list.length === 0 && <li>No tags yet.</li>}
        </ul>
      )}
    </div>
  );
}
