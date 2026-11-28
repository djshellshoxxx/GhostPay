import { findChain, tokensForChain, verifyClaimedPayment, type RpcClient } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../components/Common';
import { StealthExportArchive } from '../components/StealthExportArchive';
import { StealthExportPayment } from '../components/StealthExportPayment';
import type { ExportRpc } from '../lib/paymentKeyExport';
import { loadSettings } from '../lib/settings';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { ReconciliationLedger } from '../components/ReconciliationLedger';
import { useManifest } from '../components/Disclosure';
import { NO_SECONDARY, verifyManifestState } from '../lib/manifest';
import { formatUnits } from '../lib/format';
import { UserFacingError, displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { checkpointKeyId, runScan, type ScanMatch, type ScanProgress } from '../lib/scanClient';
import { placeScanMatch, sharedRouterAddresses } from '../lib/scanMatches';
import { browserStorage, createWindowedScanClient, describeScanDisclosureMessages, guardScanClient, loadScanPrivacy, openScanClients, planScan, SCAN_ROUTE_CHANGED } from '../lib/scanPrivacy';
import { PRIVACY_TRANSFER_WINDOW_BLOCKS, loadScanLanes, type AnonymitySet } from '../lib/scanSpam';
import { useServices } from '../lib/services';
import { captureSessionGuard, revealViewingKey, subscribeSession } from '../lib/session';
import { recordFromObservedMatch } from '../lib/reconciliationLedger';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import { randomDelayMs } from '../lib/jitter';
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

/** Scan state keeps public message data so outcomes render with the current translator. */
type ScanText = { readonly key: MessageKey; readonly values?: MessageValues } | { readonly error: DisplayMessage };
// msg('key') descriptors are not seen by scripts/i18n/extract.mjs; the keys built through msg() in this file:
// i18n-use: scan.error.noRpc scan.error.secondRpc scan.error.startBlock scan.error.manifestMismatch scan.error.noManifest
// i18n-use: scan.error.discrepancy scan.error.backlog scan.error.limitReached scan.error.keysChanged scan.lag
// i18n-use: scan.done.note scan.done.cancelled scan.done.limit scan.done.finished scan.done.cancelledEarly scan.done.indexerCaveat
const msg = (key: MessageKey, values?: MessageValues): ScanText => (values === undefined ? { key } : { key, values });
const show = (m: ScanText, t: T): string => ('error' in m ? displayMessage(m.error, t) : t(m.key, m.values));

// i18n-use: scan.privacySet.low scan.privacySet.medium scan.privacySet.high
function describePrivacySet(a: AnonymitySet, t: T): string {
  const body = t('scan.privacySet.body', {
    level: t(a.level === 'low' ? 'scan.privacySet.low' : a.level === 'medium' ? 'scan.privacySet.medium' : 'scan.privacySet.high'),
    count7d: String(a.count7d),
    count30d: String(a.count30d),
    partial: a.partial ? 'yes' : 'no',
  });
  // Spec 05 B opt-in: a labelled same-token estimate that never changes the level.
  if (a.transfers === undefined) return body;
  const transfers = a.transfers.status === 'estimate'
    ? t('scan.privacySet.transfers', { count: String(a.transfers.count), blocks: String(a.transfers.windowBlocks) })
    : t('scan.privacySet.transfersUnknown', { reason: a.transfers.reason });
  return `${body} ${transfers}`;
}

/**
 * Opt-in automatic re-check while the page is open (GitHub Pages release: no background server exists). After a scan
 * finished cleanly, the next run resumes from the saved checkpoint after a randomized delay, only while the tab is
 * visible and the same keys and chain are selected. Any error, a cancel, a chain or key change, or locking stops it;
 * results are merged into the current list, never cleared, so a payment selected for sweeping stays listed.
 */
export const AUTO_RESCAN_MIN_MS = 60_000;
export const AUTO_RESCAN_MAX_MS = 90_000;

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
  const [privacyNote, setPrivacyNote] = useState<AnonymitySet | undefined>(undefined);
  const [routerOnlyBlocks, setRouterOnlyBlocks] = useState<readonly bigint[] | undefined>(undefined);
  const [lagNote, setLagNote] = useState<ScanText | undefined>(undefined);
  const [scanOwner, setScanOwner] = useState<{ readonly exportRpc: ExportRpc; readonly chainId: number; readonly keyId: string; readonly signerPublicKey: string } | undefined>(undefined);
  const [lateReview, setLateReview] = useState<{
    readonly matches: readonly ScanMatch[];
    readonly verify: (match: ScanMatch) => Promise<boolean>;
  }>();
  const [autoRescan, setAutoRescan] = useState(false);
  // Bumped to re-arm the timer after a tick that was skipped because the tab was hidden.
  const [autoWake, setAutoWake] = useState(0);
  const autoTick = useRef<() => void>(() => undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const startingScope = useRef<{ readonly chainId: number; readonly keyId: string; readonly signerPublicKey: string } | undefined>(undefined);
  const manifest = useManifest(chainId);
  const scanPrivacy = loadScanPrivacy(browserStorage());
  const scanLanes = loadScanLanes(browserStorage());
  const keyId = app.session === undefined ? undefined : checkpointKeyId(app.session.spendingPublicKey, app.session.viewingPublicKey);
  const checkpoint = keyId === undefined ? undefined : services.checkpoints.load(chainId, keyId);
  const ownsCurrentScope = scanOwner !== undefined && keyId !== undefined && scanOwner.chainId === chainId && scanOwner.keyId === keyId && scanOwner.signerPublicKey === app.session?.signerPublicKey;
  const autoArmed = autoRescan && !running && error === undefined && done !== undefined && ownsCurrentScope && checkpoint !== undefined;

  useEffect(() => {
    if (!autoArmed) return undefined;
    const handle = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') {
        setAutoWake((n) => n + 1);
        return;
      }
      autoTick.current();
    }, randomDelayMs(AUTO_RESCAN_MIN_MS, AUTO_RESCAN_MAX_MS));
    return () => { window.clearTimeout(handle); };
    // `done` is new after every scan: a re-check that starts and finishes within one render never shows `autoArmed`
    // as false, and would otherwise leave no timer for the next one.
  }, [autoArmed, autoWake, done]);

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
    setLateReview(undefined);
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
      setLateReview(undefined);
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

  const begin = (opts?: { readonly append: true }): void => {
    if (keyId === undefined || abort.current !== undefined) return;
    const sessionAtStart = app.session;
    if (sessionAtStart === undefined) return;
    // An automatic re-check only continues a clean scan of this exact scope from its checkpoint, and keeps its results.
    const append = opts?.append === true;
    if (append && (!scanMatchesCurrentScope || checkpoint === undefined)) return;
    const seed: readonly ScanMatch[] = append ? scopedMatches : [];
    const guardSession = captureSessionGuard();
    const scope = { chainId, keyId, signerPublicKey: sessionAtStart.signerPublicKey };
    const ctl = new AbortController();
    abort.current = ctl;
    startingScope.current = scope;
    setRunning(true);
    setLateReview(undefined);
    setError(undefined);
    setDone(undefined);
    setPrivacyNote(undefined);
    setRouterOnlyBlocks(undefined);
    setLagNote(undefined);
    if (!append) {
      setScanOwner(undefined);
      app.setMatches([]);
    }
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
        const lanes = loadScanLanes(browserStorage());
        const plan = planScan(privacy, chain);
        const scanPrivacySelection = JSON.stringify(privacy);
        const selectedRpcUrl = app.settings.rpcUrls[String(chainId)];
        if (plan.kind === 'blocked') throw new UserFacingError(plan.reasonMessage);
        // Unreadable lane settings may hold a cover opt-in: block instead of verifying matches without cover.
        if (lanes.unreadable === true) throw new UserFacingError({ key: 'scanPrivacy.blocked.settingsUnreadable' });
        // Every request of this scan re-checks the saved route it started with: its privacy settings, its cover choice,
        // the Settings RPC it uses and its second RPC. A change in this or another tab stops it before anything more is
        // sent.
        const savedAtStart = loadSettings();
        const startRpcUrl = savedAtStart.rpcUrls[String(chainId)];
        const startSecondaryUrl = savedAtStart.rpcUrlsSecondary[String(chainId)];
        const assertScanPath = (): void => {
          const saved = loadSettings();
          const cover = loadScanLanes(browserStorage());
          if (JSON.stringify(loadScanPrivacy(browserStorage())) !== scanPrivacySelection ||
              cover.unreadable === true || cover.matchCover !== lanes.matchCover ||
              (plan.endpoint === undefined && saved.rpcUrls[String(chainId)] !== startRpcUrl) ||
              (plan.useSecondary && saved.rpcUrlsSecondary[String(chainId)] !== startSecondaryUrl)) {
            throw new UserFacingError(SCAN_ROUTE_CHANGED);
          }
        };
        const clients = await openScanClients({ plan, chain, announcer: manifest.manifest.announcer, router: manifest.manifest.router, appRpc: () => app.getRpc(chainId), fetchImpl: services.fetchFn, sleep: services.sleep, assertCurrent: assertScanPath, signal: ctl.signal });
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
        if (rpc2 !== undefined) rpc2 = guardScanClient(rpc2, assertScanPath);
        assertScopeCurrent();
        let cursor = resume || append ? checkpoint : undefined;
        if (cursor === undefined) {
          if (!/^\d{1,15}$/.test(start.trim())) {
            setError(msg('scan.error.startBlock'));
            return;
          }
          cursor = { nextBlock: BigInt(start.trim()) };
        }
        // The manifest read-back goes through the second RPC too (L2-I4): both providers must agree before scanning.
        const checked = await verifyManifestState(manifest, rpc, rpc2 === undefined ? NO_SECONDARY : { kind: 'client', client: rpc2 }, { sleep: services.sleep });
        assertScopeCurrent();
        // A route change during the read-back surfaces as SCAN_ROUTE_CHANGED, not as a provider failure.
        assertScanPath();
        if (checked.status !== 'loaded') {
          const cause = checked.status === 'invalid' ? checked.cause : undefined;
          setError(msg(cause === 'second-rpc-unavailable' ? 'scan.error.secondRpc'
            : cause === 'providers-disagree' ? 'scan.error.manifestDisagree'
              : cause === 'rpc-unreadable' ? 'scan.error.manifestUnreadable'
                : 'scan.error.manifestMismatch'));
          return;
        }
        // The second RPC gets the same aligned announcement windows as the scan RPC, never the exact checkpoint range.
        const secondary = rpc2 === undefined ? undefined : createWindowedScanClient(rpc2, { chain, announcer: manifest.manifest.announcer, router: manifest.manifest.router, policy: plan.window, sleep: services.sleep });
        assertScopeCurrent();
        // A stopped scan can still export its matches. Reuse only its verified client.
        // Check the saved route again before sending an address or returning an export.
        const assertScanRoute = (): void => {
          guardSession();
          if (JSON.stringify(loadScanPrivacy(browserStorage())) !== scanPrivacySelection ||
              (plan.endpoint === undefined && loadSettings().rpcUrls[String(chainId)] !== selectedRpcUrl)) {
            throw new UserFacingError({ key: 'error.paymentKeyExport.noRpc' });
          }
        };
        const exportRpc: ExportRpc = {
          chainId: rpc.chainId,
          request: (method, params) => rpc.request(method, params),
          assertCurrent: assertScanRoute,
        };
        setScanOwner({ ...scope, exportRpc });
        let found: ScanMatch[] = [...seed];
        let quarantined: ScanMatch[] = [];
        // Only a copy of the viewing key leaves the session, and runScan wipes it; spending and signing keys stay boxed.
        const viewingKey = revealViewingKey();
        const withReconciliation = async (action: (vault: Awaited<ReturnType<typeof createCurrentReconciliationVault>>) => Promise<void>): Promise<void> => {
          assertScopeCurrent();
          const vault = await createCurrentReconciliationVault(chainId, keyId);
          const lockOnAbort = (): void => { vault.lock(); };
          ctl.signal.addEventListener('abort', lockOnAbort, { once: true });
          try { assertScopeCurrent(); await action(vault); }
          finally { ctl.signal.removeEventListener('abort', lockOnAbort); vault.lock(); }
        };
        const observations = (matches: readonly ScanMatch[]) => matches
          .filter((match) => match.viaRouter && match.metadata !== undefined && match.announcement.transactionHash !== undefined)
          .map((match) => recordFromObservedMatch(match, keyId));
        let caughtUp = false;
        let persistenceIssue = false;
        const res = await runScan({
          chain,
          manifest: manifest.manifest,
          client: clients.scan,
          openLaneBudget: privacy.openLaneBudget,
          floodPerBlock: lanes.floodPerBlock,
          spamScoring: lanes.spamScoring,
          privacySetTransfers: lanes.privacySetTransfers,
          ...(lanes.matchCover ? { matchCover: true } : {}),
          cursor,
          spendingPublicKeyHex: app.session?.spendingPublicKey ?? '',
          keyId,
          deep: deepScan,
          ...(secondary === undefined ? {} : { secondaryClient: secondary }),
          viewingKey,
          createWorker: services.createScanWorker,
          signal: ctl.signal,
          checkpoints: services.checkpoints,
          // The checkpoint this render showed and `cursor` was chosen against: a change by another tab since then is
          // foreign to this run, even if it happened during the awaits above.
          checkpointSeen: checkpoint ?? null,
          onProgress: (nextProgress) => {
            if (!scopeIsCurrent()) return;
            caughtUp = nextProgress.caughtUp;
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
            const observed = observations([...found, ...quarantined].filter((m) => m.announcement.blockNumber >= to));
            found = found.filter((m) => m.announcement.blockNumber < to);
            app.setMatches([...found]);
            try {
              await withReconciliation((vault) => vault.invalidateFrom(to, observed, canonicalHash));
              quarantined = quarantined.filter((m) => m.announcement.blockNumber < to);
            } catch (cause) {
              if (cause instanceof UserFacingError) throw cause;
              const warning = new UserFacingError({ key: 'scan.error.reorg' });
              warning.cause = cause;
              throw warning;
            }
          },
          onUnresolvedEvidence: async (from) => {
            try {
              await withReconciliation((vault) => vault.quarantineInvoicePayments(from, assertScopeCurrent));
            } catch {
              persistenceIssue = true;
              if (scopeIsCurrent()) setError(msg('ledger.late.persistence'));
            }
          },
          onPageMatches: async (matches, page) => {
            try {
              const evidence = observations(matches);
              await withReconciliation((vault) => vault.observeInvoicePayments(evidence, assertScopeCurrent, page));
              return true;
            } catch {
              persistenceIssue = true;
              if (scopeIsCurrent()) setError(msg('ledger.late.persistence'));
              return false;
            }
          },
          onMatch: (m) => {
            if (!scopeIsCurrent()) return;
            // F1: the same rule as runScan's result, so a front-run router record never replaces the genuine one.
            const slot = placeScanMatch(found, m);
            if (slot === 'skip') return;
            if (slot === 'append') {
              if (found.length + quarantined.length >= 10_000) throw new UserFacingError({ key: 'scan.error.observationLimit' });
              found.push(m);
            }
            else found[slot] = m;
            app.setMatches([...found]);
          },
        });
        if (!ctl.signal.aborted) {
          assertScopeCurrent();
          if (caughtUp && !persistenceIssue && res.discrepancies.length === 0 &&
              !res.limitReached && !res.backlog && res.secondaryLag === undefined) {
            const matches = res.matches.filter((match) => match.receipt === 'verified');
            setLateReview({
              matches,
              verify: async (match) => {
                // Recheck only through the route this scan used; a changed RPC or privacy selection needs a new scan.
                assertScanRoute();
                const { announcement, metadata } = match;
                if (!matches.includes(match) || metadata === undefined || announcement.blockTimestamp === undefined) return false;
                const evidence = await verifyClaimedPayment({
                  chain, client: clients.scan, router: manifest.manifest.router, announcer: manifest.manifest.announcer,
                  claim: { ...match, metadata },
                  ...(secondary === undefined ? {} : { secondaryClient: secondary }),
                });
                assertScanRoute();
                if (evidence.status !== 'received' || !evidence.final) return false;
                const clientsToCheck = secondary === undefined ? [clients.scan] : [clients.scan, secondary];
                const blocks = await Promise.all(clientsToCheck.map((client) => client.getBlock(announcement.blockNumber)));
                assertScanRoute();
                return blocks.every((block) => block !== null && block.number === announcement.blockNumber &&
                  block.hash.toLowerCase() === announcement.blockHash.toLowerCase() &&
                  block.timestamp?.toString() === announcement.blockTimestamp);
              },
            });
          }
        }
        if (res.discrepancies.length > 0) setError(msg('scan.error.discrepancy', { count: String(res.discrepancies.length) }));
        if ((res.backlog ?? 0) > 0) setError(msg('scan.error.backlog', { count: String(res.backlog), block: res.cursor.nextBlock.toString() }));
        setPrivacyNote(res.telemetry?.anonymity);
        if ((res.routerOnlyBlocks ?? []).length > 0) setRouterOnlyBlocks(res.routerOnlyBlocks ?? []);
        if (res.secondaryLag !== undefined) setLagNote(msg('scan.lag', { secondary: res.secondaryLag.secondaryHead.toString(), behind: (res.secondaryLag.head - res.secondaryLag.secondaryHead).toString(), head: res.secondaryLag.head.toString() }));
        if (res.limitReached) setError(msg('scan.error.limitReached', { block: res.cursor.nextBlock.toString() }));
        const note = msg('scan.done.note', { block: cursor.nextBlock.toString(), fromCheckpoint: (resume || append) && checkpoint !== undefined ? 'yes' : 'no', oneRpc: rpc2 === undefined ? 'yes' : 'no' });
        const counts = { scanned: String(res.scanned), found: String(res.matches.length) };
        // Keep the outcome bound to this run's source even if settings change after it finishes.
        const indexerCaveat = plan.indexerUrl === undefined ? [] : [msg('scan.done.indexerCaveat')];
        setDone([msg(ctl.signal.aborted ? 'scan.done.cancelled' : res.limitReached ? 'scan.done.limit' : 'scan.done.finished', counts), note, ...indexerCaveat]);
        // A cancelled run must not re-arm the automatic re-check.
        if (ctl.signal.aborted) setAutoRescan(false);
        app.announce([latestT.current(ctl.signal.aborted ? 'scan.done.cancelledEarly' : res.limitReached ? 'scan.announce.limit' : 'scan.announce.finished'), ...indexerCaveat.map((message) => show(message, latestT.current))].join(' '));
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

  autoTick.current = () => { begin({ append: true }); };

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
          {describeScanDisclosureMessages(scanPrivacy, { hasSecondary: (app.settings.rpcUrlsSecondary[String(chainId)] ?? '') !== '' }).map((row) => (
            <li key={row.party.key}><strong>{displayMessage(row.party, t)}:</strong> {displayMessage(row.learns, t)}</li>
          ))}
          {scanLanes.privacySetTransfers && <li><strong>{t('scanPrivacy.disclosure.rpcParty')}:</strong> {t('scanLanes.disclosure.transfers', { blocks: String(PRIVACY_TRANSFER_WINDOW_BLOCKS) })}</li>}
          {scanLanes.matchCover && <li><strong>{t('scanPrivacy.disclosure.rpcParty')}:</strong> {t('scanLanes.disclosure.matchCover')}</li>}
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
        <div className="check">
          <input id="auto-rescan" type="checkbox" checked={autoRescan} onChange={(e) => { setAutoRescan(e.target.checked); }} aria-describedby="auto-rescan-hint" />
          <label htmlFor="auto-rescan">{t('scan.autoRescan')}</label>
        </div>
        <p id="auto-rescan-hint" className="hint">{t('scan.autoRescan.hint')}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => { begin(); }} disabled={running}>{t('scan.start')}</button>
          <button type="button" className="btn" onClick={() => { setAutoRescan(false); abort.current?.abort(); }} disabled={!running}>{t('scan.cancel')}</button>
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
      {privacyNote !== undefined && <Notice kind="info" title={t('scan.privacySet.title')}>{describePrivacySet(privacyNote, t)}</Notice>}
      {routerOnlyNote !== undefined && <Notice kind="warn">{routerOnlyNote}</Notice>}
      {lagNote !== undefined && <Notice kind="warn">{show(lagNote, t)}</Notice>}
      {error !== undefined && <Notice kind="error">{show(error, t)}</Notice>}
      {autoRescan && error !== undefined && <Notice kind="warn">{t('scan.autoRescan.stopped')}</Notice>}

      <Matches
        chainId={chainId}
        matches={scopedMatches}
        exportRpc={scanMatchesCurrentScope ? scanOwner.exportRpc : undefined}
        sellerSignerPublicKey={app.session.signerPublicKey}
        receiptSignerPublicKey={scanMatchesCurrentScope ? scanOwner.signerPublicKey : undefined}
      />
      <ReconciliationLedger
        chainId={chainId}
        sellerKeyId={keyId}
        matches={app.matches}
        scanMatchesCurrentScope={scanMatchesCurrentScope}
        freshLateMatches={scanMatchesCurrentScope && !running ? lateReview?.matches : undefined}
        verifyLateEvidence={scanMatchesCurrentScope && !running ? lateReview?.verify : undefined}
        onAnnounce={app.announce}
      />
      <Tags key={chainId} chainId={chainId} sellerKeyId={keyId} />
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

function Matches(props: { readonly exportRpc: ExportRpc | undefined; readonly chainId: number; readonly matches: readonly ScanMatch[]; readonly sellerSignerPublicKey: string; readonly receiptSignerPublicKey: string | undefined }): ReactNode {
  const t = useScanT();
  const latestT = useLatestScanT(t);
  const app = useApp();
  const services = useServices();
  const [tags, setTags] = useState<Readonly<Record<string, string>>>({});
  const [label, setLabel] = useState<Readonly<Record<string, string>>>({});
  const [err, setErr] = useState<ScanText | undefined>(undefined);
  const access = useSyncExternalStore(services.vault.subscribeAccess, services.vault.getAccessRevision);
  const [displayAccess, setDisplayAccess] = useState(access);
  const unlocked = services.vault.unlocked;
  const matches = props.matches;
  if (displayAccess !== access) {
    setDisplayAccess(access);
    setTags({});
    setLabel({});
    setErr(undefined);
  }

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
          if (!live || services.vault.getAccessRevision() !== access) return;
          if (tag !== undefined) next[m.announcement.id] = tag.clientLabel;
        } catch {
          /* undecryptable tags are reported in the tag list */
        }
      }
      if (live && services.vault.getAccessRevision() === access) setTags(next);
    })();
    return () => {
      live = false;
    };
  }, [matches, unlocked, services, props.chainId, access]);

  if (matches.length === 0) return <p className="hint">{t('scan.matches.none')}</p>;
  const shared = sharedRouterAddresses(matches);
  return (
    <div>
      <h3>{t('scan.matches.heading')}</h3>
      <StealthExportArchive matches={matches} chainId={props.chainId} rpc={props.exportRpc} announce={app.announce} />
      {err !== undefined && <Notice kind="error">{show(err, t)}</Notice>}
      {shared.size > 0 && <Notice kind="warn">{t('scan.matches.sharedAddress')}</Notice>}
      <ul className="plain-list matches">
        {matches.map((m) => {
          const id = m.announcement.id;
          return (
            <li key={id} className="card">
              <p>
                <strong>{m.receipt === 'verified' ? describe(m, m.chainId, t) : t('scan.match.claimedPrefix', { amount: describe(m, m.chainId, t) })}</strong> {t('scan.match.inBlock', { block: m.announcement.blockNumber.toString() })}
                {m.viaRouter ? '' : ` ${t('scan.match.direct')}`}
                {m.viaRouter && shared.has(m.stealthAddress.toLowerCase()) && ` ${t('scan.match.sharedAddress')}`}
                {!m.tagMatches && ` ${t('scan.match.deepFound')}`}
                {m.receipt === 'claimed' && ` - ${m.viaRouter ? t('scan.match.claimedRouter') : t('scan.match.claimedDirect')}`}
                {m.receipt === 'pending' && ` - ${t('scan.match.pending')}`}
              </p>
              <p>{t('scan.match.address')} <Mono>{m.stealthAddress}</Mono></p>
              {unlocked && tags[id] !== undefined && <p>{t('scan.match.tag')} <strong className="wrap">{tags[id]}</strong></p>}
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
                          if (services.vault.getAccessRevision() !== access) return;
                          try {
                            sessionGuard();
                          } catch (e) {
                            // The keys changed while saving: never leave the tags open for the new keys.
                            services.vault.lock();
                            setErr({ error: captureUserMessage(e) });
                            return;
                          }
                          setErr(undefined);
                          setTags((current) => ({ ...current, [id]: payload.clientLabel.trim() }));
                          app.announce(latestT.current('scan.tag.saved'));
                        },
                        (e: unknown) => {
                          if (services.vault.getAccessRevision() !== access) return;
                          setErr({ error: captureUserMessage(e) });
                        },
                      );
                    }}
                  >
                    {t('scan.tag.save')}
                  </button>
                </div>
              )}
              {m.announcement.schemeId === 1n && (
                <StealthExportPayment match={m} chainId={props.chainId} rpc={props.exportRpc} announce={app.announce} />
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

function Tags(props: { readonly chainId: number; readonly sellerKeyId: string | undefined }): ReactNode {
  const t = useScanT();
  const latestT = useLatestScanT(t);
  const app = useApp();
  const services = useServices();
  const [refreshGeneration, force] = useState(0);
  const [loadedList, setList] = useState<{ readonly access: number; readonly rows: readonly TagPayload[] } | undefined>();
  const [err, setErr] = useState<ScanText | undefined>(undefined);
  const [authorizedSellerKeyId, setAuthorizedSellerKeyId] = useState(props.sellerKeyId);
  const access = useSyncExternalStore(services.vault.subscribeAccess, services.vault.getAccessRevision);
  const list = loadedList?.access === access ? loadedList.rows : undefined;
  const unlocked = services.vault.unlocked && authorizedSellerKeyId === props.sellerKeyId;

  // Session revisions invalidate tag access even when the replacement has the same public keys.
  // Keep this component mounted within a chain so a pending unlock can report its guarded failure.
  useEffect(() => subscribeSession(() => {
    services.vault.lock();
    setAuthorizedSellerKeyId(undefined);
    setList(undefined);
    force((n) => n + 1);
  }), [services.vault]);

  // Re-read the selected chain after unlocking or remounting. The parent keys this component by
  // chain and seller key identity so the previous chain's rows cannot flash during a scope switch.
  // In-flight readbacks belong to the previous effect and are never allowed to repopulate this list.
  useEffect(() => {
    let live = true;
    setList(undefined);
    if (!unlocked) return () => { live = false; };
    let sessionGuard: () => void;
    try {
      sessionGuard = captureSessionGuard();
    } catch {
      return () => { live = false; };
    }
    void services.vault.list(props.chainId).then(
      (next) => {
        if (!live || services.vault.getAccessRevision() !== access) return;
        try { sessionGuard(); } catch { return; }
        setList({ access, rows: next });
      },
      (e: unknown) => {
        if (!live || services.vault.getAccessRevision() !== access) return;
        try { sessionGuard(); } catch { return; }
        setErr({ error: captureUserMessage(e) });
      },
    );
    return () => { live = false; };
  }, [props.chainId, props.sellerKeyId, refreshGeneration, services.vault, unlocked, access]);

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
                    setList(undefined);
                    setAuthorizedSellerKeyId(props.sellerKeyId);
                    setErr(undefined);
                    force((n) => n + 1);
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
