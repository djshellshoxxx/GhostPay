import { findChain, tokensForChain, type RpcClient } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../components/Common';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { ReconciliationLedger } from '../components/ReconciliationLedger';
import { useManifest } from '../components/Disclosure';
import { verifyManifestState } from '../lib/manifest';
import { formatUnits } from '../lib/format';
import { UserFacingError, displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { checkpointKeyId, runScan, type ScanMatch, type ScanProgress } from '../lib/scanClient';
import { browserStorage, createWindowedScanClient, describeScanDisclosure, loadScanPrivacy, openScanClients, planScan } from '../lib/scanPrivacy';
import { describeAnonymitySet } from '../lib/scanSpam';
import { useServices } from '../lib/services';
import { captureSessionGuard, revealViewingKey, subscribeSession } from '../lib/session';
import { recordFromVerifiedMatch } from '../lib/reconciliationLedger';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import type { TagPayload } from '../lib/tags';
import { useApp } from '../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';
import type { MessageValues } from '../i18n/message';
import type { Translator } from '../i18n/translator';

type T = Translator['t'];

/** Isolated renders without a provider keep the bundled English source text. */
function useScanT(): T {
  const i18n = useI18nOptional();
  return i18n?.t ?? SOURCE_TRANSLATOR.t;
}

// latestT.current('key') is not seen by scripts/i18n/extract.mjs; the keys translated through it in this file:
// i18n-use: scan.error.reorg scan.error.observationLimit scan.announce.limit scan.announce.finished
// i18n-use: scan.tag.saved scan.tags.unlocked scan.tags.deleted
/** The translator of the latest render, for text produced after an await (a language change may have happened since). */
function useLatestScanT(t: T): { readonly current: T } {
  const ref = useRef(t);
  ref.current = t;
  return ref;
}

/** Scan state keeps a message key and values, not text, so it renders in the language current when it is shown.
 * Typed failures are rendered with the current translator; existing privacy-plan text stays literal. */
type ScanText = { readonly key: MessageKey; readonly values?: MessageValues } | { readonly text: string } | { readonly error: DisplayMessage };
// msg('key') descriptors are not seen by scripts/i18n/extract.mjs; the keys built through msg() in this file:
// i18n-use: scan.error.noRpc scan.error.secondRpc scan.error.startBlock scan.error.manifestMismatch scan.error.noManifest
// i18n-use: scan.error.discrepancy scan.error.backlog scan.error.limitReached scan.error.keysChanged scan.lag
// i18n-use: scan.done.note scan.done.cancelled scan.done.limit scan.done.finished scan.done.cancelledEarly
const msg = (key: MessageKey, values?: MessageValues): ScanText => (values === undefined ? { key } : { key, values });
const literal = (text: string): ScanText => ({ text });
const show = (m: ScanText, t: T): string => ('text' in m ? m.text : 'error' in m ? displayMessage(m.error, t) : t(m.key, m.values));

export function Scan(): ReactNode {
  const t = useScanT();
  const latestT = useLatestScanT(t);
  const app = useApp();
  const services = useServices();
  const [chainId, setChainId] = useState<number>(services.chains[0]?.chainId ?? 84532);
  const [start, setStart] = useState('');
  const [resume, setResume] = useState(true);
  const [deepScan, setDeepScan] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | undefined>(undefined);
  const [error, setError] = useState<ScanText | undefined>(undefined);
  const [done, setDone] = useState<readonly ScanText[] | undefined>(undefined);
  const [privacyNote, setPrivacyNote] = useState<string | undefined>(undefined);
  const [routerOnlyBlocks, setRouterOnlyBlocks] = useState<readonly bigint[] | undefined>(undefined);
  const [lagNote, setLagNote] = useState<ScanText | undefined>(undefined);
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
        <h2 id="scan-h">{t('scan.title')}</h2>
        <Notice kind="info">{t('scan.needKeys')}</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>{t('scan.goSeller')}</button>
      </section>
    );
  }

  const scanMatchesCurrentScope = scanOwner !== undefined && scanOwner.chainId === chainId && scanOwner.keyId === keyId && scanOwner.signerPublicKey === app.session.signerPublicKey;
  const scopedMatches = scanMatchesCurrentScope ? app.matches.filter((match) => match.chainId === chainId) : [];
  const routerOnlyNote = routerOnlyBlocks === undefined ? undefined : describeRouterOnly(routerOnlyBlocks, t);

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
    setRouterOnlyBlocks(undefined);
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
          setError(literal(plan.reason));
          return;
        }
        const clients = await openScanClients({ plan, chain, announcer: manifest.manifest.announcer, router: manifest.manifest.router, appRpc: () => app.getRpc(chainId), fetchImpl: services.fetchFn, sleep: services.sleep });
        assertScopeCurrent();
        if (clients === undefined) {
          setError(msg('scan.error.noRpc'));
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
          setError(msg('scan.error.secondRpc'));
          return;
        }
        assertScopeCurrent();
        let cursor = resume ? checkpoint : undefined;
        if (cursor === undefined) {
          if (!/^\d{1,15}$/.test(start.trim())) {
            setError(msg('scan.error.startBlock'));
            return;
          }
          cursor = { nextBlock: BigInt(start.trim()) };
        }
        const checked = await verifyManifestState(manifest, rpc);
        assertScopeCurrent();
        if (checked.status !== 'loaded') {
          setError(msg('scan.error.manifestMismatch'));
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
            if (nextProgress.routerOnlyBlocks !== undefined) setRouterOnlyBlocks(nextProgress.routerOnlyBlocks);
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
              const warning = new UserFacingError({ key: 'scan.error.reorg' });
              warning.cause = cause;
              throw warning;
            }
          },
          onMatch: (m) => {
            if (!scopeIsCurrent()) return;
            const identity = `${m.stealthAddress.toLowerCase()}|${m.announcement.ephemeralPublicKey.toLowerCase()}`;
            const prior = found.findIndex((x) => `${x.stealthAddress.toLowerCase()}|${x.announcement.ephemeralPublicKey.toLowerCase()}` === identity);
            if (prior < 0) {
              if (found.length + quarantined.length >= 10_000) throw new UserFacingError({ key: 'scan.error.observationLimit' });
              found.push(m);
            }
            else found[prior] = m;
            app.setMatches([...found]);
          },
        });
        if (!ctl.signal.aborted) assertScopeCurrent();
        if (res.discrepancies.length > 0) setError(msg('scan.error.discrepancy', { count: String(res.discrepancies.length) }));
        if ((res.backlog ?? 0) > 0) setError(msg('scan.error.backlog', { count: String(res.backlog), block: res.cursor.nextBlock.toString() }));
        setPrivacyNote(res.telemetry?.anonymity === undefined ? undefined : describeAnonymitySet(res.telemetry.anonymity));
        if ((res.routerOnlyBlocks ?? []).length > 0) setRouterOnlyBlocks(res.routerOnlyBlocks ?? []);
        if (res.secondaryLag !== undefined) setLagNote(msg('scan.lag', { secondary: res.secondaryLag.secondaryHead.toString(), behind: (res.secondaryLag.head - res.secondaryLag.secondaryHead).toString(), head: res.secondaryLag.head.toString() }));
        if (res.limitReached) setError(msg('scan.error.limitReached', { block: res.cursor.nextBlock.toString() }));
        const note = msg('scan.done.note', { block: cursor.nextBlock.toString(), fromCheckpoint: resume && checkpoint !== undefined ? 'yes' : 'no', oneRpc: rpc2 === undefined ? 'yes' : 'no' });
        const counts = { scanned: String(res.scanned), found: String(res.matches.length) };
        setDone([msg(ctl.signal.aborted ? 'scan.done.cancelled' : res.limitReached ? 'scan.done.limit' : 'scan.done.finished', counts), note]);
        app.announce(latestT.current(res.limitReached ? 'scan.announce.limit' : 'scan.announce.finished'));
      } catch (e) {
        if (!scopeKeysAreCurrent()) return;
        if (e instanceof Error && (e.message === 'scan-aborted' || e.message === 'scan-session-changed')) {
          if (e.message === 'scan-session-changed') setError(msg('scan.error.keysChanged'));
          else if (scopeKeysAreCurrent()) setDone([msg('scan.done.cancelledEarly')]);
          return;
        }
        setError(e instanceof Error && e.message === 'manifest' ? msg('scan.error.noManifest') : { error: captureUserMessage(e) });
      } finally {
        if (abort.current === ctl) abort.current = undefined;
        if (startingScope.current === scope) startingScope.current = undefined;
        setRunning(false);
      }
    })();
  };

  return (
    <section aria-labelledby="scan-h">
      <h2 id="scan-h">{t('scan.title')}</h2>
      <p>
        {t('scan.intro')}
      </p>
      <Notice kind="warn" title={t('scan.rpcPrivacy.title')}>
        {t('scan.rpcPrivacy.body')}
      </Notice>
      <details className="panel">
        <summary>{t('scan.disclosure.summary')}</summary>
        <ul>
          {describeScanDisclosure(scanPrivacy, { hasSecondary: (app.settings.rpcUrlsSecondary[String(chainId)] ?? '') !== '' }).map((row) => (
            <li key={row.party}><strong>{row.party}:</strong> {row.learns}</li>
          ))}
        </ul>
        <p className="hint">{t('scan.disclosure.hint')}</p>
      </details>
      <div className="stack">
        <Field label={t('scan.chain')}>
          {(id) => (
            <select id={id} value={chainId} onChange={(e) => { setChainId(Number(e.target.value)); }} disabled={running}>
              {services.chains.map((c) => (
                <option key={c.chainId} value={c.chainId}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
        {manifest?.status === 'loaded' && manifest.trust === 'unsigned-dev' && <Notice kind="warn">{manifest.warning ?? t('scan.manifest.unsignedFallback')}</Notice>}
        {manifest !== undefined && manifest.status !== 'loaded' && <Notice kind="warn">{t('scan.manifest.disabled')}</Notice>}
        <Field label={t('scan.startBlock')} hint={checkpoint === undefined ? t('scan.startBlock.hint') : t('scan.startBlock.checkpoint', { block: checkpoint.nextBlock.toString() })}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={start} onChange={(e) => { setStart(e.target.value); }} disabled={running} />}
        </Field>
        {checkpoint !== undefined && (
          <div className="check">
            <input id="resume" type="checkbox" checked={resume} onChange={(e) => { setResume(e.target.checked); }} />
            <label htmlFor="resume">{t('scan.resume')}</label>
          </div>
        )}
        <div className="check">
          <input id="deep-scan" type="checkbox" checked={deepScan} onChange={(e) => { setDeepScan(e.target.checked); }} disabled={running} />
          <label htmlFor="deep-scan">{t('scan.deepScan')}</label>
        </div>
        {deepScan && <Notice kind="warn">{t('scan.deepScan.warn')}</Notice>}
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={begin} disabled={running}>{t('scan.start')}</button>
          <button type="button" className="btn" onClick={() => { abort.current?.abort(); }} disabled={!running}>{t('scan.cancel')}</button>
          {checkpoint !== undefined && (
            <button type="button" className="btn" onClick={() => { if (keyId !== undefined) services.checkpoints.clear(chainId, keyId); setResume(false); app.announce(t('scan.checkpointCleared')); }} disabled={running}>
              {t('scan.clearCheckpoint')}
            </button>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="status">
        {progress !== undefined && t('scan.progress', { block: progress.nextBlock.toString(), scanned: String(progress.scanned), matches: String(progress.matches), hasSkipped: progress.skipped > 0 ? 'yes' : 'no', skipped: String(progress.skipped), limit: progress.limitReached ? 'yes' : 'no' })}
        {running && progress === undefined && t('scan.starting')}
      </div>
      {done !== undefined && <Notice kind="ok">{done.map((m) => show(m, t)).join(' ')}</Notice>}
      {privacyNote !== undefined && <Notice kind="info" title={t('scan.privacySet.title')}>{privacyNote}</Notice>}
      {routerOnlyNote !== undefined && <Notice kind="warn">{routerOnlyNote}</Notice>}
      {lagNote !== undefined && <Notice kind="warn">{show(lagNote, t)}</Notice>}
      {error !== undefined && <Notice kind="error">{show(error, t)}</Notice>}

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
function describeRouterOnly(blocks: readonly bigint[], t: T): string | undefined {
  if (blocks.length === 0) return undefined;
  const shown = blocks.slice(0, 5).map(String).join(', ');
  const list = blocks.length > 5 ? t('scan.routerOnly.more', { shown, count: String(blocks.length - 5) }) : shown;
  return t('scan.routerOnly', { list, single: blocks.length === 1 ? 'yes' : 'no' });
}

function describe(m: ScanMatch, chainId: number, t: T): string {
  if (m.metadata === undefined) return t('scan.match.unknownLayout');
  if (m.metadata.kind === 'native') return `${formatUnits(m.metadata.netAmount, 18)} ${findChain(chainId)?.nativeSymbol ?? 'native'}`;
  const token = tokensForChain(chainId).find((x) => x.address.toLowerCase() === m.metadata?.token.toLowerCase());
  return token === undefined ? t('scan.match.unlistedToken', { amount: m.metadata.netAmount.toString(), token: m.metadata.token }) : `${formatUnits(m.metadata.netAmount, token.decimals)} ${token.symbol}`;
}

function Matches(props: { readonly chainId: number; readonly matches: readonly ScanMatch[]; readonly sellerSignerPublicKey: string; readonly receiptSignerPublicKey: string | undefined }): ReactNode {
  const t = useScanT();
  const latestT = useLatestScanT(t);
  const app = useApp();
  const services = useServices();
  const [tags, setTags] = useState<Readonly<Record<string, string>>>({});
  const [label, setLabel] = useState<Readonly<Record<string, string>>>({});
  const [err, setErr] = useState<ScanText | undefined>(undefined);
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
          const tag = await services.vault.find(props.chainId, m.stealthAddress);
          if (tag !== undefined) next[m.announcement.id] = tag.clientLabel;
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

  if (matches.length === 0) return <p className="hint">{t('scan.matches.none')}</p>;
  return (
    <div>
      <h3>{t('scan.matches.heading')}</h3>
      {err !== undefined && <Notice kind="error">{show(err, t)}</Notice>}
      <ul className="plain-list matches">
        {matches.map((m) => {
          const id = m.announcement.id;
          return (
            <li key={id} className="card">
              <p>
                <strong>{m.receipt === 'verified' ? describe(m, m.chainId, t) : t('scan.match.claimedPrefix', { amount: describe(m, m.chainId, t) })}</strong> {t('scan.match.inBlock', { block: m.announcement.blockNumber.toString() })}
                {m.viaRouter ? '' : ` ${t('scan.match.direct')}`}
                {!m.tagMatches && ` ${t('scan.match.deepFound')}`}
                {m.receipt === 'claimed' && ` - ${m.viaRouter ? t('scan.match.claimedRouter') : t('scan.match.claimedDirect')}`}
                {m.receipt === 'pending' && ` - ${t('scan.match.pending')}`}
              </p>
              <p>{t('scan.match.address')} <Mono>{m.stealthAddress}</Mono></p>
              {tags[id] !== undefined && <p>{t('scan.match.tag')} <strong className="wrap">{tags[id]}</strong></p>}
              {unlocked && (
                <div className="row">
                  <div className="field">
                    <label htmlFor={`tag-${id}`}>{t('scan.tag.label')}</label>
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
                        setErr({ error: captureUserMessage(e) });
                        return;
                      }
                      services.vault.save(props.chainId, payload).then(
                        () => {
                          try {
                            sessionGuard();
                          } catch (e) {
                            // The keys changed while saving: never leave the tags open for the new keys.
                            services.vault.lock();
                            setErr({ error: captureUserMessage(e) });
                            return;
                          }
                          setErr(undefined);
                          setTags({ ...tags, [id]: payload.clientLabel.trim() });
                          app.announce(latestT.current('scan.tag.saved'));
                        },
                        (e: unknown) => {
                          setErr({ error: captureUserMessage(e) });
                        },
                      );
                    }}
                  >
                    {t('scan.tag.save')}
                  </button>
                </div>
              )}
              {m.receipt === 'verified' && m.metadata !== undefined && props.receiptSignerPublicKey !== undefined && props.receiptSignerPublicKey === props.sellerSignerPublicKey && (
                <ReceiptPanel match={m} sellerSignerPublicKey={props.receiptSignerPublicKey} />
              )}
              <button type="button" className="btn btn-primary" onClick={() => { app.selectForSweep({ match: m, chainId: m.chainId }); app.setView('sweep'); }}>
                {t('scan.sweep')}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Tags(props: { readonly chainId: number }): ReactNode {
  const t = useScanT();
  const latestT = useLatestScanT(t);
  const app = useApp();
  const services = useServices();
  const [, force] = useState(0);
  const [list, setList] = useState<readonly TagPayload[] | undefined>(undefined);
  const [err, setErr] = useState<ScanText | undefined>(undefined);
  const unlocked = services.vault.unlocked;

  const refresh = (): void => {
    services.vault.list(props.chainId).then(setList, (e: unknown) => {
      setErr({ error: captureUserMessage(e) });
    });
  };

  return (
    <div>
      <h3>{t('scan.tags.heading')}</h3>
      <p className="hint">
        {t('scan.tags.hint', { minutes: String(app.settings.lockTimeoutMin) })}
      </p>
      {err !== undefined && <Notice kind="error">{show(err, t)}</Notice>}
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
                      setErr({ error: captureUserMessage(e) });
                      return;
                    }
                    setErr(undefined);
                    force((n) => n + 1);
                    refresh();
                    app.announce(latestT.current('scan.tags.unlocked'));
                  },
                  (e: unknown) => {
                    setErr({ error: captureUserMessage(e) });
                  },
                );
              } catch (e) {
                setErr({ error: captureUserMessage(e) });
              }
            }}
          >
            {t('scan.tags.unlock')}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => { services.vault.lock(); setList(undefined); force((n) => n + 1); app.announce(t('scan.tags.locked')); }}>
            {t('scan.tags.lock')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm(t('scan.tags.deleteConfirm'))) {
              services.vault.wipe().then(
                () => {
                  setList(undefined);
                  force((n) => n + 1);
                  app.announce(latestT.current('scan.tags.deleted'));
                },
                (e: unknown) => {
                  setErr({ error: captureUserMessage(e) });
                },
              );
            }
          }}
        >
          {t('scan.tags.deleteAll')}
        </button>
      </div>
      {unlocked && list !== undefined && (
        <ul className="plain-list">
          {list.map((tg) => (
            <li key={tg.announcementId}>
              <span className="wrap">{tg.clientLabel}</span> <Mono>{tg.stealthAddress}</Mono>
            </li>
          ))}
          {list.length === 0 && <li>{t('scan.tags.none')}</li>}
        </ul>
      )}
    </div>
  );
}
