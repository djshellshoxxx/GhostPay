import { findChain, tokensForChain, type RpcClient } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../components/Common';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { ReconciliationLedger } from '../components/ReconciliationLedger';
import { useManifest } from '../components/Disclosure';
import { verifyManifestState } from '../lib/manifest';
import { formatUnits } from '../lib/format';
import { UserFacingError, userMessage } from '../lib/errors';
import { checkpointKeyId, runScan, type ScanMatch, type ScanProgress } from '../lib/scanClient';
import { browserStorage, createWindowedScanClient, describeScanDisclosure, loadScanPrivacy, openScanClients, planScan } from '../lib/scanPrivacy';
import { describeAnonymitySet } from '../lib/scanSpam';
import { useServices } from '../lib/services';
import { captureSessionGuard, revealViewingKey, subscribeSession } from '../lib/session';
import { recordFromVerifiedMatch } from '../lib/reconciliationLedger';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import type { TagPayload } from '../lib/tags';
import { useApp } from '../state';

export function Scan(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [chainId, setChainId] = useState<number>(services.chains[0]?.chainId ?? 84532);
  const [start, setStart] = useState('');
  const [resume, setResume] = useState(true);
  const [deepScan, setDeepScan] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);
  const [privacyNote, setPrivacyNote] = useState<string | undefined>(undefined);
  const [routerOnlyNote, setRouterOnlyNote] = useState<string | undefined>(undefined);
  const [lagNote, setLagNote] = useState<string | undefined>(undefined);
  const [scanOwner, setScanOwner] = useState<{ readonly chainId: number; readonly keyId: string; readonly signerPublicKey: string } | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const startingScope = useRef<{ readonly chainId: number; readonly keyId: string; readonly signerPublicKey: string } | undefined>(undefined);
  const manifest = useManifest(chainId);
  const scanPrivacy = loadScanPrivacy(browserStorage());
  const keyId = app.session === undefined ? undefined : checkpointKeyId(app.session.spendingPublicKey, app.session.viewingPublicKey);
  const checkpoint = keyId === undefined ? undefined : services.checkpoints.load(chainId, keyId);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  useEffect(() => subscribeSession(() => {
    // A revision change invalidates even a clear-and-restore of identical public keys.
    abort.current?.abort();
    app.setMatches([]);
    setScanOwner(undefined);
    setProgress(undefined);
    setDone(undefined);
  }), [app.setMatches]);

  useEffect(() => {
    const scope = startingScope.current;
    if (scope !== undefined && (scope.chainId !== chainId || scope.keyId !== keyId || scope.signerPublicKey !== app.session?.signerPublicKey)) {
      abort.current?.abort();
    }
  }, [app.session?.signerPublicKey, chainId, keyId]);

  useEffect(() => {
    if (scanOwner !== undefined && (scanOwner.chainId !== chainId || scanOwner.keyId !== keyId || scanOwner.signerPublicKey !== app.session?.signerPublicKey)) {
      abort.current?.abort();
      app.setMatches([]);
      setScanOwner(undefined);
    }
  }, [app.session?.signerPublicKey, app.setMatches, chainId, keyId, scanOwner]);

  if (app.session === undefined) {
    return (
      <section aria-labelledby="scan-h">
        <h2 id="scan-h">Scan and receive</h2>
        <Notice kind="info">Load or generate seller keys first.</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>Go to Seller keys</button>
      </section>
    );
  }

  const scanMatchesCurrentScope = scanOwner !== undefined && scanOwner.chainId === chainId && scanOwner.keyId === keyId && scanOwner.signerPublicKey === app.session.signerPublicKey;
  const scopedMatches = scanMatchesCurrentScope ? app.matches.filter((match) => match.chainId === chainId) : [];

  const begin = (): void => {
    if (keyId === undefined || abort.current !== undefined) return;
    const sessionAtStart = app.session;
    if (sessionAtStart === undefined) return;
    const guardSession = captureSessionGuard();
    const scope = { chainId, keyId, signerPublicKey: sessionAtStart.signerPublicKey };
    const ctl = new AbortController();
    abort.current = ctl;
    startingScope.current = scope;
    setRunning(true);
    setError(undefined);
    setDone(undefined);
    setPrivacyNote(undefined);
    setRouterOnlyNote(undefined);
    setLagNote(undefined);
    setScanOwner(undefined);
    app.setMatches([]);
    const scopeKeysAreCurrent = (): boolean => {
      try { guardSession(); return true; } catch { return false; }
    };
    const scopeIsCurrent = (): boolean => !ctl.signal.aborted && scopeKeysAreCurrent();
    const assertScopeCurrent = (): void => {
      if (ctl.signal.aborted) throw new Error('scan-aborted');
      if (!scopeIsCurrent()) throw new Error('scan-session-changed');
    };
    void (async () => {
      try {
        const chain = findChain(chainId);
        if (chain === undefined || manifest?.status !== 'loaded') throw new Error('manifest');
        // Spec 10: the scan path is planned first; a required private path that is missing blocks the scan, never downgrades.
        const privacy = loadScanPrivacy(browserStorage());
        const plan = planScan(privacy, chain);
        if (plan.kind === 'blocked') {
          setError(plan.reason);
          return;
        }
        const clients = await openScanClients({ plan, chain, announcer: manifest.manifest.announcer, router: manifest.manifest.router, appRpc: () => app.getRpc(chainId), fetchImpl: services.fetchFn, sleep: services.sleep });
        assertScopeCurrent();
        if (clients === undefined) {
          setError('Configure an RPC for this chain in Settings first.');
          return;
        }
        const rpc: RpcClient = clients.base;
        // A configured second RPC is a user-chosen cross-check. If it cannot be opened (unreachable, wrong chain),
        // block instead of silently scanning with one provider; the user can remove it in Settings to opt out.
        // Behind a required local proxy it is not contacted at all (it would be reached directly).
        let rpc2: RpcClient | undefined;
        try {
          rpc2 = plan.useSecondary ? await app.getSecondaryRpc(chainId) : undefined;
        } catch {
          assertScopeCurrent();
          setError('Scan blocked: the second RPC configured for this chain could not be used. Check it in Settings, or remove it to scan with one provider.');
          return;
        }
        assertScopeCurrent();
        let cursor = resume ? checkpoint : undefined;
        if (cursor === undefined) {
          if (!/^\d{1,15}$/.test(start.trim())) {
            setError('Enter the block number to start scanning from.');
            return;
          }
          cursor = { nextBlock: BigInt(start.trim()) };
        }
        const checked = await verifyManifestState(manifest, rpc);
        assertScopeCurrent();
        if (checked.status !== 'loaded') {
          setError('Scan blocked: the contracts on this chain do not match the deployment manifest.');
          return;
        }
        // The second RPC gets the same aligned announcement windows as the scan RPC, never the exact checkpoint range.
        const secondary = rpc2 === undefined ? undefined : createWindowedScanClient(rpc2, { chain, announcer: manifest.manifest.announcer, router: manifest.manifest.router, policy: plan.window, sleep: services.sleep });
        assertScopeCurrent();
        setScanOwner(scope);
        let found: ScanMatch[] = [];
        let quarantined: ScanMatch[] = [];
        // Only a copy of the viewing key leaves the session, and runScan wipes it; spending and signing keys stay boxed.
        const viewingKey = revealViewingKey();
        const res = await runScan({
          chain,
          manifest: manifest.manifest,
          client: clients.scan,
          openLaneBudget: privacy.openLaneBudget,
          cursor,
          spendingPublicKeyHex: app.session?.spendingPublicKey ?? '',
          keyId,
          deep: deepScan,
          ...(secondary === undefined ? {} : { secondaryClient: secondary }),
          viewingKey,
          createWorker: services.createScanWorker,
          signal: ctl.signal,
          checkpoints: services.checkpoints,
          onProgress: (nextProgress) => {
            if (!scopeIsCurrent()) return;
            setProgress(nextProgress);
            // Shown as pages commit, so a later error in this run cannot hide a block that was narrowed.
            if (nextProgress.routerOnlyBlocks !== undefined) setRouterOnlyNote(describeRouterOnly(nextProgress.routerOnlyBlocks));
          },
          onQuarantine: (to) => {
            if (!scopeIsCurrent()) return;
            // These already bounded run observations are retained only until confirmation,
            // so unsaved verified evidence can receive persistent tombstones as well.
            const affected = found.filter((m) => m.announcement.blockNumber >= to);
            quarantined.push(...affected);
            found = found.filter((m) => m.announcement.blockNumber < to);
            app.setMatches([...found]);
          },
          onReorg: async (to, canonicalHash) => {
            if (!scopeIsCurrent()) return;
            // Observations of this run, saved or not; only those whose block was replaced are tombstoned.
            const observed = [...found, ...quarantined].filter((m) => m.announcement.blockNumber >= to && m.receipt === 'verified' && m.viaRouter && m.metadata !== undefined && m.announcement.transactionHash !== undefined).map((m) => recordFromVerifiedMatch(m, keyId));
            found = found.filter((m) => m.announcement.blockNumber < to);
            app.setMatches([...found]);
            try {
              const reconciliation = await createCurrentReconciliationVault(chainId, keyId);
              const lockOnAbort = (): void => { reconciliation.lock(); };
              ctl.signal.addEventListener('abort', lockOnAbort, { once: true });
              try { if (!scopeIsCurrent()) return; await reconciliation.invalidateFrom(to, observed, canonicalHash); }
              finally { ctl.signal.removeEventListener('abort', lockOnAbort); reconciliation.lock(); }
              quarantined = quarantined.filter((m) => m.announcement.blockNumber < to);
            } catch (cause) {
              if (cause instanceof UserFacingError) throw cause;
              const warning = new UserFacingError('A scan reorg was detected, but encrypted reconciliation invalidation could not be committed. Stop relying on historical records until this is resolved.');
              warning.cause = cause;
              throw warning;
            }
          },
          onMatch: (m) => {
            if (!scopeIsCurrent()) return;
            const identity = `${m.stealthAddress.toLowerCase()}|${m.announcement.ephemeralPublicKey.toLowerCase()}`;
            const prior = found.findIndex((x) => `${x.stealthAddress.toLowerCase()}|${x.announcement.ephemeralPublicKey.toLowerCase()}` === identity);
            if (prior < 0) {
              if (found.length + quarantined.length >= 10_000) throw new UserFacingError('The scan observation safety limit was reached. Start a fresh scan to continue.');
              found.push(m);
            }
            else found[prior] = m;
            app.setMatches([...found]);
          },
        });
        if (!ctl.signal.aborted) assertScopeCurrent();
        if (res.discrepancies.length > 0) setError(`The second RPC provider disagreed on ${String(res.discrepancies.length)} check(s). Results may be incomplete or forged; checkpoints were not advanced. Try another provider.`);
        if ((res.backlog ?? 0) > 0) setError(`${String(res.backlog)} announcements not posted by the GhostPay router were deferred by the per-scan budget (Settings). Nothing was skipped: scan again to continue from block ${res.cursor.nextBlock.toString()}.`);
        setPrivacyNote(res.telemetry?.anonymity === undefined ? undefined : describeAnonymitySet(res.telemetry.anonymity));
        if ((res.routerOnlyBlocks ?? []).length > 0) setRouterOnlyNote(describeRouterOnly(res.routerOnlyBlocks ?? []));
        if (res.secondaryLag !== undefined) setLagNote(`The second RPC reports block ${res.secondaryLag.secondaryHead.toString()}, ${(res.secondaryLag.head - res.secondaryLag.secondaryHead).toString()} blocks behind the scan RPC (block ${res.secondaryLag.head.toString()}). Each scan stops at the last block both providers have, so later payments appear only once the second RPC catches up. Check it in Settings if this persists.`);
        if (res.limitReached) setError(`This scan reached its safety limit. It stopped before processing the next page; resume from block ${res.cursor.nextBlock.toString()} to continue.`);
        const note = ` Started at block ${cursor.nextBlock.toString()}${resume && checkpoint !== undefined ? ' (from checkpoint)' : ''}.${rpc2 === undefined ? ' Only one RPC was used: add a second RPC in Settings to cross-check it.' : ''}`;
        setDone((ctl.signal.aborted ? `Cancelled. ${String(res.scanned)} announcements checked.` : res.limitReached ? `Stopped at the safety limit. ${String(res.scanned)} announcements checked, ${String(res.matches.length)} payments found.` : `Finished. ${String(res.scanned)} announcements checked, ${String(res.matches.length)} payments found.`) + note);
        app.announce(res.limitReached ? 'Scan stopped at the safety limit.' : 'Scan finished.');
      } catch (e) {
        if (!scopeKeysAreCurrent()) return;
        if (e instanceof Error && (e.message === 'scan-aborted' || e.message === 'scan-session-changed')) {
          if (e.message === 'scan-session-changed') setError('Seller keys changed while the scan was starting. The scan was stopped; start again with the current keys.');
          else if (scopeKeysAreCurrent()) setDone('Cancelled. The scan stopped before completing.');
          return;
        }
        setError(e instanceof Error && e.message === 'manifest' ? 'Payments are disabled on this chain: no deployment manifest is loaded, so the announcer address is unknown.' : userMessage(e));
      } finally {
        if (abort.current === ctl) abort.current = undefined;
        if (startingScope.current === scope) startingScope.current = undefined;
        setRunning(false);
      }
    })();
  };

  return (
    <section aria-labelledby="scan-h">
      <h2 id="scan-h">Scan and receive</h2>
      <p>
        Announcements are downloaded from your RPC and checked inside a dedicated worker. The worker gets public logs and your viewing key for this scan only; it cannot reach the network.
      </p>
      <Notice kind="warn" title="RPC privacy">
        Your RPC provider sees your IP address, scan ranges, and logs. Verifying a router payment also requests token transfer logs filtered for the one-time address, or the transaction receipt; these requests can reveal which public announcements matched your keys. A configured second provider sees the same verification evidence. Use trusted private RPC providers or your own nodes if this matters to you.
      </Notice>
      <details className="panel">
        <summary>What each party learns with your scan privacy settings</summary>
        <ul>
          {describeScanDisclosure(scanPrivacy, { hasSecondary: (app.settings.rpcUrlsSecondary[String(chainId)] ?? '') !== '' }).map((row) => (
            <li key={row.party}><strong>{row.party}:</strong> {row.learns}</li>
          ))}
        </ul>
        <p className="hint">Change the scan transport, windows and delays in Settings. None of these options hides anything on-chain.</p>
      </details>
      <div className="stack">
        <Field label="Chain">
          {(id) => (
            <select id={id} value={chainId} onChange={(e) => { setChainId(Number(e.target.value)); }} disabled={running}>
              {services.chains.map((c) => (
                <option key={c.chainId} value={c.chainId}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
        {manifest?.status === 'loaded' && manifest.trust === 'unsigned-dev' && <Notice kind="warn">{manifest.warning ?? 'UNSIGNED DEV MANIFEST: testnet only.'}</Notice>}
        {manifest !== undefined && manifest.status !== 'loaded' && <Notice kind="warn">Payments disabled on this chain: no deployment manifest is loaded.</Notice>}
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
          <input id="deep-scan" type="checkbox" checked={deepScan} onChange={(e) => { setDeepScan(e.target.checked); }} disabled={running} />
          <label htmlFor="deep-scan">Deep scan (also check wrong view tags)</label>
        </div>
        {deepScan && <Notice kind="warn">Deep scan spends substantially more CPU per router announcement. It still verifies the full stealth address and marks incorrect view tags for review.</Notice>}
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={begin} disabled={running}>Start scan</button>
          <button type="button" className="btn" onClick={() => { abort.current?.abort(); }} disabled={!running}>Cancel</button>
          {checkpoint !== undefined && (
            <button type="button" className="btn" onClick={() => { if (keyId !== undefined) services.checkpoints.clear(chainId, keyId); setResume(false); app.announce('Checkpoint cleared.'); }} disabled={running}>
              Clear checkpoint
            </button>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="status">
        {progress !== undefined && `Scanned up to block ${progress.nextBlock.toString()}; ${String(progress.scanned)} announcements checked, ${String(progress.matches)} payments found${progress.skipped > 0 ? `, ${String(progress.skipped)} malformed logs skipped` : ''}${progress.limitReached ? '; safety limit reached' : ''}.`}
        {running && progress === undefined && 'Starting…'}
      </div>
      {done !== undefined && <Notice kind="ok">{done}</Notice>}
      {privacyNote !== undefined && <Notice kind="info" title="Privacy set (local estimate)">{privacyNote}</Notice>}
      {routerOnlyNote !== undefined && <Notice kind="warn">{routerOnlyNote}</Notice>}
      {lagNote !== undefined && <Notice kind="warn">{lagNote}</Notice>}
      {error !== undefined && <Notice kind="error">{error}</Notice>}

      <Matches
        chainId={chainId}
        matches={scopedMatches}
        sellerSignerPublicKey={app.session.signerPublicKey}
        receiptSignerPublicKey={scanMatchesCurrentScope ? scanOwner.signerPublicKey : undefined}
      />
      <ReconciliationLedger
        chainId={chainId}
        sellerKeyId={keyId}
        matches={app.matches}
        scanMatchesCurrentScope={scanMatchesCurrentScope}
        onAnnounce={app.announce}
      />
      <Tags chainId={chainId} />
    </section>
  );
}

/** L4-01: blocks too large to fetch whole were checked for router-posted announcements only; say which. */
function describeRouterOnly(blocks: readonly bigint[]): string | undefined {
  if (blocks.length === 0) return undefined;
  const shown = blocks.slice(0, 5).map(String).join(', ');
  const list = blocks.length > 5 ? `${shown} and ${String(blocks.length - 5)} more` : shown;
  const one = blocks.length === 1;
  return `${one ? 'Block' : 'Blocks'} ${list} held more announcements than one RPC response may carry (likely announcement spam). Payments posted through the GhostPay router were still checked there, but announcements there that were not posted by the GhostPay router were skipped, so a direct payment in ${one ? 'that block' : 'those blocks'} would not be listed.`;
}

function describe(m: ScanMatch, chainId: number): string {
  if (m.metadata === undefined) return 'Unknown payment layout';
  if (m.metadata.kind === 'native') return `${formatUnits(m.metadata.netAmount, 18)} ${findChain(chainId)?.nativeSymbol ?? 'native'}`;
  const t = tokensForChain(chainId).find((x) => x.address.toLowerCase() === m.metadata?.token.toLowerCase());
  return t === undefined ? `${m.metadata.netAmount.toString()} units of unlisted token ${m.metadata.token}` : `${formatUnits(m.metadata.netAmount, t.decimals)} ${t.symbol}`;
}

function Matches(props: { readonly chainId: number; readonly matches: readonly ScanMatch[]; readonly sellerSignerPublicKey: string; readonly receiptSignerPublicKey: string | undefined }): ReactNode {
  const app = useApp();
  const services = useServices();
  const [tags, setTags] = useState<Readonly<Record<string, string>>>({});
  const [label, setLabel] = useState<Readonly<Record<string, string>>>({});
  const [err, setErr] = useState<string | undefined>(undefined);
  const unlocked = services.vault.unlocked;
  const matches = props.matches;

  useEffect(() => {
    let live = true;
    if (!unlocked) {
      setTags({});
      return;
    }
    void (async () => {
      const next: Record<string, string> = {};
      for (const m of matches) {
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
  }, [matches, unlocked, services, props.chainId]);

  if (matches.length === 0) return <p className="hint">No payments found yet.</p>;
  return (
    <div>
      <h3>Payments found</h3>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
      <ul className="plain-list matches">
        {matches.map((m) => {
          const id = m.announcement.id;
          return (
            <li key={id} className="card">
              <p>
                <strong>{m.receipt === 'verified' ? describe(m, m.chainId) : `Claimed, not confirmed: ${describe(m, m.chainId)}`}</strong> in block {m.announcement.blockNumber.toString()}
                {m.viaRouter ? '' : ' (paid directly, no GhostPay fee)'}
                {!m.tagMatches && ' (found by deep scan: announced view tag did not match)'}
                {m.receipt === 'claimed' && (m.viaRouter ? ' - this announcement could not be verified as a payment; do not release goods based on it.' : ' - this is a direct announcement claim; an existing balance does not prove this payment occurred, so do not release goods based on it.')}
                {m.receipt === 'pending' && ' - waiting for enough confirmations.'}
              </p>
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
                      let sessionGuard: () => void;
                      try {
                        sessionGuard = captureSessionGuard();
                      } catch (e) {
                        setErr(userMessage(e));
                        return;
                      }
                      services.vault.save(props.chainId, payload).then(
                        () => {
                          try {
                            sessionGuard();
                          } catch (e) {
                            // The keys changed while saving: never leave the tags open for the new keys.
                            services.vault.lock();
                            setErr(userMessage(e));
                            return;
                          }
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
              {m.receipt === 'verified' && m.metadata !== undefined && props.receiptSignerPublicKey !== undefined && props.receiptSignerPublicKey === props.sellerSignerPublicKey && (
                <ReceiptPanel match={m} sellerSignerPublicKey={props.receiptSignerPublicKey} />
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
        Tags never leave this browser. They are encrypted with a key derived from your viewing key and stored in IndexedDB as ciphertext. They are readable while unlocked, so lock when you step away; the vault also locks after {app.settings.lockTimeoutMin} idle minutes.
      </p>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
      <div className="actions">
        {!unlocked ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                const sessionGuard = captureSessionGuard();
                const key = revealViewingKey();
                services.vault.unlock(key).then(
                  () => {
                    try {
                      sessionGuard();
                    } catch (e) {
                      // Unlocked with the previous keys' viewing key: lock again before anything reads or writes tags.
                      services.vault.lock();
                      force((n) => n + 1);
                      setErr(userMessage(e));
                      return;
                    }
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
