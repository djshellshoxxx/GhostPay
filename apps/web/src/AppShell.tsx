import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { clearFragment, readInvoiceFragment } from './lib/fragment';
import { loadedKeysRecoverable } from './lib/keyVault';
import type { ScanMatch } from './lib/scanClient';
import { useServices } from './lib/services';
import { captureSessionVersionGuard, clearSession, getSessionBackup, getSessionPublic, hasSession, isSessionSuspended, sessionHasExternalCopy, subscribeSession, subscribeSessionBackup, subscribeSessionExpiryCheck, suspendSession } from './lib/session';
import { clearRpcSessionOnly, loadPrivacyPreferences, loadSettings, savePrivacyPreferences, saveSettings, SETTINGS_KEY, UI_PRIVACY_KEY, type Settings as SettingsData } from './lib/settings';
import { sameExecutionSettings } from './lib/executionSettings';
import { AppContext, VIEW_LABELS, type AppState, type RpcAuthorizationOptions, type ViewId } from './state';
import { UserFacingError } from './lib/errors';
import { RegistryView } from './features/registry/RegistryView';
import { About } from './views/About';
import { CreateInvoice } from './views/CreateInvoice';
import { Home } from './views/Home';
import { Pay } from './views/Pay';
import { Scan } from './views/Scan';
import { BackupGate, SellerKeys } from './views/SellerKeys';
import { Settings } from './views/Settings';
import { Sweep } from './views/Sweep';
import { Notice } from './components/Common';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyControls } from './components/PrivacyControls';
import { ClipboardPrivacySync } from './components/ClipboardPrivacySync';
import { PrivacyQuickHide } from './components/PrivacyQuickHide';
import { WalletDisclosureProvider } from './components/WalletDisclosure';
import { SensitiveContent } from './components/SensitiveContent';
import { PrivacyProvider, revokePrivacyReveal } from './lib/privacyMode';
import { notifyAppLock, subscribeAppLock } from './lib/appLock';
import { FRAME_REFUSAL, ORIGIN_MISMATCH, currentOriginCheck, embedModeEnabled, frameRefusesView, isFramed, originMismatch } from './lib/frameGuard';

/** How often the idle lock compares the wall clock with the last activity, for devices whose timers paused in sleep (GP-PAGES-04). */
export const IDLE_CHECK_MS = 20_000;

interface IdleObservation { readonly wall: number; readonly monotonic: number }
interface IdleLease {
  readonly session: ReturnType<typeof getSessionPublic>;
  activity: IdleObservation | undefined;
  observed: IdleObservation | undefined;
  expired: boolean;
}

/** A clock observation is one indivisible sample. Unknown/negative clocks never establish a new lease. */
function observeIdleClocks(): IdleObservation | undefined {
  try {
    const wall = Date.now();
    const monotonic = performance.now();
    return Number.isFinite(wall) && wall >= 0 && Number.isFinite(monotonic) && monotonic >= 0
      ? { wall, monotonic } : undefined;
  } catch {
    return undefined;
  }
}
import { SOURCE_TRANSLATOR, useI18nOptional } from './i18n/context';
import type { MessageKey } from './i18n/catalog';
import { ShellProfileContext } from './lib/buildProfile';

export type ExtraViews = Readonly<Partial<Record<ViewId, ReactNode>>>;
export interface AppShellProps {
  readonly order: readonly ViewId[];
  readonly extraViews?: ExtraViews;
  readonly sellerArchive?: ReactNode;
  /** Optional full-profile content stays inside the main landmark, after the skip link and navigation. */
  readonly mainPrelude?: ReactNode;
  readonly profile?: 'full' | 'lean';
}

export const CORE_ORDER: readonly ViewId[] = Object.freeze<ViewId[]>(['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'registry', 'settings', 'about']);
const noNetworkSubscription = (): (() => void) => () => undefined;
const noNetworkRevision = (): number => 0;
function storedSettingsRevision(): string | null | undefined {
  try { return window.localStorage.getItem(SETTINGS_KEY); } catch { return undefined; }
}

/** Shown instead of a key, sweep or settings view while the page is framed by another site (SEC-18). */
function FrameRefusal(): ReactNode {
  return (
    <Notice kind="warn" title={FRAME_REFUSAL.title}>
      {FRAME_REFUSAL.body}{' '}
      {/* The app root without the current fragment: an invoice link is never handed to the new tab. */}
      <a href="./" target="_blank" rel="noopener noreferrer">{FRAME_REFUSAL.action}</a>
    </Notice>
  );
}

function ViewSwitch(props: { readonly view: ViewId; readonly extraViews: ExtraViews; readonly profile: 'full' | 'lean'; readonly sellerArchive?: ReactNode; readonly framedRefusal: boolean }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  if (props.framedRefusal) return <FrameRefusal />;
  switch (props.view) {
    case 'home':
      return <Home />;
    case 'seller':
      return <SellerKeys archive={props.sellerArchive} />;
    case 'create':
      // An invoice invites payments that only these keys can sweep: no invoice until they are backed up or the risk is waived (L1-01).
      // Also when only a signing key generated at a hex import is unsaved: invoices are signed with it (C-R10).
      return <BackupGate heading={t(VIEW_LABELS.create)}><CreateInvoice supportedOnly={props.profile === 'lean'} /></BackupGate>;
    case 'pay':
      return <Pay supportedOnly={props.profile === 'lean'} />;
    case 'scan':
      return <Scan />;
    case 'sweep':
      return <Sweep />;
    case 'registry':
      return <RegistryView />;
    case 'settings':
      return <Settings />;
    case 'about':
      return <About />;
    default:
      return props.profile === 'lean' ? <Home /> : (props.extraViews[props.view] ?? <Home />);
  }
}

export function AppShell(props: AppShellProps): ReactNode {
  const profile = props.profile ?? 'full';
  const extraViews = props.extraViews ?? {};
  const order = profile === 'lean' ? props.order.filter((id) => CORE_ORDER.includes(id)) : props.order;
  const services = useServices();
  const networkRevision = useSyncExternalStore(services.network?.subscribe ?? noNetworkSubscription, services.network?.getRevision ?? noNetworkRevision);
  const [fragment, setFragmentState] = useState<string | undefined>(() => readInvoiceFragment(window.location));
  const setFragment = useCallback((next: string | undefined): void => {
    services.network?.invalidate();
    setFragmentState(next);
  }, [services]);
  const [selectedView, setViewState] = useState<ViewId>(() => (readInvoiceFragment(window.location) === undefined ? 'home' : 'pay'));
  const setView = useCallback((next: ViewId): void => {
    services.network?.invalidate();
    setViewState(profile === 'lean' && !CORE_ORDER.includes(next) ? 'home' : next);
  }, [profile, services]);
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  const settingsRevision = useRef(storedSettingsRevision());
  const [matches, setMatches] = useState<readonly ScanMatch[]>([]);
  const [sweepTarget, selectForSweep] = useState<AppState['sweepTarget']>(undefined);
  const [live, setLive] = useState<string | { readonly key: MessageKey }>('');
  // Minutes of the idle lock that last wiped seller keys, and whether an unsaved signing key went with them (C-R10), for a
  // visible notice; cleared once keys are loaded again.
  const [idleWiped, setIdleWiped] = useState<{ readonly minutes: number; readonly signerLost: boolean } | undefined>(undefined);
  const session = useSyncExternalStore(subscribeSession, getSessionPublic);
  const suspended = useSyncExternalStore(subscribeSession, isSessionSuspended);
  const view = suspended ? 'seller' : profile === 'lean' && !CORE_ORDER.includes(selectedView) ? 'home' : selectedView;
  // Consent for one invoice or sweep target must not reveal a replacement on the same route. Keep the grant's
  // identity opaque instead of copying invoice text or seller details into the reveal model.
  const privacyScope = useMemo(() => ({}), [view, fragment, sweepTarget, session, suspended]);
  // Visual privacy preferences revoke the displayed approval but must not strand an established wallet's gate.
  // Every execution-setting field (including future fields) retains the existing conservative scope comparison.
  const disclosureSettings = useRef(settings);
  if (!sameExecutionSettings(disclosureSettings.current, settings)) disclosureSettings.current = settings;
  const walletDisclosureScope = useMemo(() => ({}), [privacyScope, disclosureSettings.current, networkRevision]);
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  // Framed by another site outside the explicit embed mode: key, sweep and settings views are refused (SEC-18).
  const [framed] = useState(() => isFramed(window));
  const embedMode = embedModeEnabled(import.meta.env, profile);
  // Served from another origin than the build declares (SEC-09): manifests are refused in loadBundledManifest; say why.
  const [wrongOrigin] = useState(() => {
    const check = currentOriginCheck();
    return check !== undefined && originMismatch(check.declared, check.actual) ? check : undefined;
  });
  const rpcCache = useRef(new Map<string, Promise<RpcClient>>());
  // Configuration/service rerenders do not count as activity. Only actual key installation starts a new session lease.
  const idleLease = useRef<IdleLease | undefined>(undefined);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== SETTINGS_KEY && event.key !== UI_PRIVACY_KEY) return;
      if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
      if (event.key === UI_PRIVACY_KEY) {
        // A display preference from another tab does not replace selected endpoint/signer references or clear
        // session-only endpoint consent. The separate execution-storage listener keeps its existing boundary.
        setSettings((current) => {
          const privacy = loadPrivacyPreferences(current);
          return privacy.privacyMode === current.privacyMode && privacy.clipboardClearAfterMs === current.clipboardClearAfterMs
            ? current : { ...current, ...privacy };
        });
        return;
      }
      clearRpcSessionOnly();
      rpcCache.current.clear();
      settingsRevision.current = storedSettingsRevision();
      setSettings((current) => ({
        ...loadSettings(),
        // Clearing or losing execution storage is not consent to expose a currently masked screen.
        // An explicit valid visual preference still wins; absent/invalid storage retains this tab's choice.
        ...loadPrivacyPreferences(current),
      }));
    };
    window.addEventListener('storage', onStorage);
    const unsubscribeLock = subscribeAppLock(() => { rpcCache.current.clear(); });
    return () => { window.removeEventListener('storage', onStorage); unsubscribeLock(); };
  }, []);
  useEffect(() => { rpcCache.current.clear(); }, [networkRevision]);
  useEffect(() => services.vault.subscribeAccess(() => {
    if (!services.vault.unlocked) revokePrivacyReveal();
  }), [services.vault]);

  // Remove a sensitive invoice fragment on initial load and when the user re-enables automatic clearing.
  // Hash changes arriving later are handled by the listener below.
  useEffect(() => {
    if (readInvoiceFragment(window.location) !== undefined && settings.autoClearFragment) {
      clearFragment(window.location, window.history);
    }
  }, [settings.autoClearFragment]);

  useEffect(() => {
    const onHash = (): void => {
      const f = readInvoiceFragment(window.location);
      if (f === undefined) return;
      setFragment(f);
      setView('pay');
      if (settings.autoClearFragment) clearFragment(window.location, window.history);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, [settings.autoClearFragment, setFragment, setView]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Tag keys derived from one seller identity must never serve another: lock local tags whenever keys change (L1-04).
  useEffect(() => subscribeSession(() => {
    rpcCache.current.clear();
    services.vault.lock();
    if (hasSession()) setIdleWiped(undefined);
  }), [services]);

  // GP-PAGES-04: expire authority synchronously; custody checks decide only whether retained boxes can be disposed.
  // A sole copy remains available to the existing encrypted backup path, never to ordinary signing/scanning/export.
  useEffect(() => {
    const minutes = settings.lockTimeoutMin;
    const timeoutMs = minutes * 60_000;
    const freshLease = (): IdleLease => {
      const observation = observeIdleClocks();
      return { session: getSessionPublic(), activity: observation, observed: observation, expired: false };
    };
    const previous = idleLease.current;
    let lease = previous?.session === getSessionPublic() ? previous : undefined;
    lease ??= freshLease();
    // A concrete local binding lets queued callbacks compare object identity after any session replacement.
    let current: IdleLease = lease;
    idleLease.current = current;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timerRevision = 0;
    let lockRevision = 0;
    const cancelTimer = (): void => {
      timerRevision++;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const overdue = (now: IdleObservation | undefined): boolean => {
      const { activity, observed } = current;
      if (now === undefined || activity === undefined || observed === undefined) return true;
      const rolledBack = now.wall < observed.wall || now.monotonic < observed.monotonic;
      current.observed = now;
      return rolledBack || now.wall - activity.wall >= timeoutMs || now.monotonic - activity.monotonic >= timeoutMs;
    };
    const retainedNotice = (): void => {
      const backupState = getSessionBackup();
      setLive({ key: backupState?.verified === true ? 'app.idle.keptUnconfirmed'
        : backupState?.backedUp === true ? 'app.idle.keptUnverified' : 'app.idle.kept' });
    };
    const finishLock = (expected: IdleLease): void => {
      const revision = ++lockRevision;
      const unchanged = captureSessionVersionGuard();
      const stillCurrent = (): boolean => {
        if (!active || current !== expected || revision !== lockRevision) return false;
        try { unchanged(); return true; } catch { return false; }
      };
      void loadedKeysRecoverable().then((recoverable) => {
        if (!stillCurrent()) return;
        const signerLost = getSessionBackup()?.signerOnly === true;
        if (!recoverable && !signerLost) { retainedNotice(); return; }
        clearSession();
        setIdleWiped({ minutes, signerLost });
        setLive({ key: 'app.idle.wiped' });
      }, () => {
        // An unavailable custody check must preserve the copy and the suspended authority, with no unhandled promise.
        if (stillCurrent()) retainedNotice();
      });
    };
    const lock = (): void => {
      if (!active || current.expired) return;
      const expected = current;
      current.expired = true;
      cancelTimer();
      // Revoke the generation before notifying views or awaiting IndexedDB. Pending imports/borrows fail immediately.
      suspendSession();
      services.vault.lock();
      notifyAppLock('idle');
      setMatches([]);
      selectForSweep(undefined);
      setFragment(undefined);
      // A synchronous listener may have installed a new wallet. Never apply the old lock's custody answer to it.
      if (current !== expected || getSessionPublic() !== expected.session) return;
      if (!hasSession()) { setLive({ key: 'app.idle.tagsLocked' }); return; }
      finishLock(expected);
    };
    const schedule = (delay: number): void => {
      cancelTimer();
      const revision = timerRevision;
      const expected = current;
      timer = setTimeout(() => {
        if (active && revision === timerRevision && current === expected) lock();
      }, delay);
    };
    const start = (now: IdleObservation | undefined): void => {
      if (current.expired) {
        // Replacing an effect must retire its asynchronous answer without leaving a recoverable copy inaccessible.
        if (hasSession()) finishLock(current);
        return;
      }
      if (now === undefined || overdue(now)) { lock(); return; }
      const activity = current.activity;
      if (activity === undefined) { lock(); return; }
      schedule(Math.min(timeoutMs - (now.wall - activity.wall), timeoutMs - (now.monotonic - activity.monotonic)));
    };
    const onSession = (): void => {
      if (!active || getSessionPublic() === current.session) return;
      cancelTimer();
      lockRevision++;
      if (getSessionPublic() === undefined) {
        // A wipe is not new activity. Preserve the expired latch so restoration events cannot emit duplicate locks.
        current = { ...current, session: undefined };
        idleLease.current = current;
        if (!current.expired) start(observeIdleClocks());
      } else {
        current = freshLease();
        idleLease.current = current;
        start(current.activity);
      }
    };
    const check = (): void => {
      if (!active) return;
      if (getSessionPublic() !== current.session) { onSession(); return; }
      if (!current.expired && overdue(observeIdleClocks())) lock();
    };
    const arm = (): void => {
      if (!active) return;
      if (current.expired) {
        // Fresh post-lock input needs a cleanup timer for recovery/unlock passphrases. This renews only that UI
        // deadline: session authority stays suspended until normal import/unlock. Keep this lease's identity so
        // activity cannot cancel an outstanding custody decision for the already-revoked session.
        const now = observeIdleClocks();
        current.activity = now;
        current.observed = now;
        current.expired = false;
        start(now);
        return;
      }
      const now = observeIdleClocks();
      if (now === undefined || overdue(now)) { lock(); return; }
      current.activity = now;
      schedule(timeoutMs);
    };
    const unsubscribeExpiry = subscribeSessionExpiryCheck(check);
    const unsubscribeSession = subscribeSession(onSession);
    start(previous === current ? observeIdleClocks() : current.activity);
    const interval = setInterval(check, IDLE_CHECK_MS);
    // Capture runs before React/target handlers can start a protected operation with the first input after sleep.
    window.addEventListener('pointerdown', arm, true);
    window.addEventListener('keydown', arm, true);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('pagehide', check);
    document.addEventListener('visibilitychange', check);
    document.addEventListener('resume', check);
    document.addEventListener('freeze', check);
    return () => {
      active = false;
      lockRevision++;
      cancelTimer();
      clearInterval(interval);
      unsubscribeExpiry();
      unsubscribeSession();
      window.removeEventListener('pointerdown', arm, true);
      window.removeEventListener('keydown', arm, true);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('pagehide', check);
      document.removeEventListener('visibilitychange', check);
      document.removeEventListener('resume', check);
      document.removeEventListener('freeze', check);
    };
  }, [services, settings.lockTimeoutMin]);

  // A cached local-vault copy can disappear in another tab before this tab learns about it. Closing is synchronous:
  // protect loaded keys unless a full verified copy exists outside this browser profile (SEC-40). Check custody at
  // the event, because verifying an external copy need not change a summary already marked verified by a local vault.
  const loadedKeys = session !== undefined;
  useEffect(() => {
    if (!loadedKeys) return;
    // preventDefault is the standard; a truthy returnValue covers older engines.
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (!hasSession() || sessionHasExternalCopy()) return;
      e.preventDefault(); e.returnValue = true;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => { window.removeEventListener('beforeunload', onBeforeUnload); };
  }, [loadedKeys]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // A new invoice deep link must move focus even when Pay is already selected.
    // Benign anchor changes do not update fragment and must not steal focus.
    main.current?.focus();
  }, [view, fragment]);

  const rpcFor = useCallback(
    (urls: Readonly<Record<string, string>>, chainId: number, authorization?: RpcAuthorizationOptions): Promise<RpcClient | undefined> => {
      const url = urls[String(chainId)];
      const chain = services.chains.find((c) => c.chainId === chainId);
      if (url === undefined || chain === undefined) return Promise.resolve(undefined);
      if (services.network !== undefined) {
        if (authorization === undefined) return Promise.reject(new UserFacingError({ key: 'error.network.authorizationRefused' }));
        try {
          const context = services.network.authorize({ ...authorization, category: 'rpc', endpoint: url, network: { kind: 'evm', chainId } });
          return services.createRpc(chain, url, context).catch((error: unknown) => { context.dispose(); throw error; });
        } catch { return Promise.reject(new UserFacingError({ key: 'error.network.authorizationRefused' })); }
      }
      const key = `${String(chainId)}|${url}`;
      let p = rpcCache.current.get(key);
      if (p === undefined) {
        p = services.createRpc(chain, url);
        rpcCache.current.set(key, p);
        p.catch(() => {
          rpcCache.current.delete(key);
        });
      }
      return p;
    },
    [services],
  );
  const getRpc = useCallback((chainId: number, authorization?: RpcAuthorizationOptions) => rpcFor(settings.rpcUrls, chainId, authorization), [rpcFor, settings.rpcUrls]);
  const getSecondaryRpc = useCallback((chainId: number, authorization?: RpcAuthorizationOptions) => rpcFor(settings.rpcUrlsSecondary, chainId, authorization), [rpcFor, settings.rpcUrlsSecondary]);

  const state = useMemo<AppState>(
    () => ({
      view,
      setView,
      settings,
      networkRevision,
      updateSettings: (s) => {
        // A form opened before another tab saved may not overwrite that newer selection.
        if (storedSettingsRevision() !== settingsRevision.current) {
          rpcCache.current.clear();
          clearRpcSessionOnly();
          settingsRevision.current = storedSettingsRevision();
          setSettings((current) => ({
            ...loadSettings(),
            // Refusing an obsolete edit is not consent to expose the current tab's sensitive content.
            ...loadPrivacyPreferences(current),
          }));
          services.network?.invalidate();
          setLive({ key: 'error.network.authorizationRefused' });
          return false;
        }
        if (sameExecutionSettings(settings, s)) {
          setSettings(s);
          // Preserve the exact raw execution-settings bytes to which active network grants are bound.
          return savePrivacyPreferences(s);
        }
        rpcCache.current.clear();
        setSettings(s);
        const saved = saveSettings(s);
        settingsRevision.current = storedSettingsRevision();
        services.network?.invalidate();
        return saved;
      },
      session,
      fragment,
      setFragment,
      matches,
      setMatches,
      sweepTarget,
      selectForSweep,
      getRpc,
      getSecondaryRpc,
      announce: setLive,
    }),
    [view, setView, settings, networkRevision, session, fragment, setFragment, matches, sweepTarget, getRpc, getSecondaryRpc, services],
  );

  return (
    <AppContext.Provider value={state}>
      <ClipboardPrivacySync />
      <PrivacyProvider enabled={settings.privacyMode} scope={privacyScope}>
      <WalletDisclosureProvider scope={walletDisclosureScope}>
      <a className="skip" href="#main" onClick={() => { main.current?.focus(); }}>{t('app.shell.skip')}</a>
      <header className="site-header">
        <h1>GhostPay</h1>
        <p className="tagline">{t('app.shell.tagline')}</p>
        <PrivacyControls />
        <PrivacyQuickHide />
        <nav aria-label={t('app.shell.main')}>
          <ul className="nav">
            {order.map((v) => (
              <li key={v}>
                <button type="button" className="nav-btn" data-view={v} disabled={suspended && v !== 'seller'} aria-current={view === v ? 'page' : undefined} onClick={() => { setView(v); }}>
                  {t(VIEW_LABELS[v])}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} ref={main}>
        {services.network !== undefined && <Notice kind="info">
          <p>{t('network.actionConsent')}</p>
          <button type="button" className="btn" onClick={() => { services.network?.invalidate(); setLive({ key: 'network.revoked' }); }}>{t('network.revoke')}</button>
        </Notice>}
        <SensitiveContent>{!suspended && props.mainPrelude}</SensitiveContent>
        {suspended && <Notice kind="warn" title={t('app.idle.suspended.title')}>{t('app.idle.suspended.body')}</Notice>}
        {wrongOrigin !== undefined && (
          <Notice kind="error" title={ORIGIN_MISMATCH.title}>{ORIGIN_MISMATCH.body(wrongOrigin.declared ?? 'another origin', wrongOrigin.actual)}</Notice>
        )}
        {session !== undefined && backup?.backedUp === true && backup.verified === false && (
          <Notice kind="warn" title={t('app.backup.unverified.title')}>
            {t('app.backup.unverified.body')}
            {view !== 'seller' && <> <button type="button" className="btn" onClick={() => { setView('seller'); }}>{t('app.backup.unverified.action')}</button></>}
          </Notice>
        )}
        {session !== undefined && backup?.backedUp === false && (
          // Payments stay sweepable from typed hex when only the signing key generated for it is unsaved (C-R10).
          <Notice kind="warn" title={backup.signerOnly ? t('app.backup.signerOnly.title') : t('app.backup.title')}>
            {backup.signerOnly ? t('app.backup.signerOnly.body') : t('app.backup.body')}
            {view !== 'seller' && <> <button type="button" className="btn" onClick={() => { setView('seller'); }}>{t('app.backup.action')}</button></>}
          </Notice>
        )}
        {session === undefined && idleWiped !== undefined && (
          <Notice kind="info">
            {t('app.idle.wipedNotice', { minutes: idleWiped.minutes })}{idleWiped.signerLost && <> {t('app.idle.signerLost')}</>}{' '}
            <button type="button" className="btn" onClick={() => { setIdleWiped(undefined); }}>{t('app.idle.dismiss')}</button>
          </Notice>
        )}
        {/* A render error in a view shows an error panel instead of unmounting the app (G1-01). */}
        <ErrorBoundary resetKey={view} onBack={() => { setFragment(undefined); setView('home'); }}>
          <ShellProfileContext.Provider value={profile}>
            <SensitiveContent active={view !== 'home' && view !== 'about' && view !== 'settings'}>
            <ViewSwitch view={view} extraViews={extraViews} profile={profile} sellerArchive={suspended ? undefined : props.sellerArchive} framedRefusal={frameRefusesView(view, framed, embedMode)} />
            </SensitiveContent>
          </ShellProfileContext.Provider>
        </ErrorBoundary>
      </main>
      <SensitiveContent><div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{typeof live === 'string' ? live : t(live.key)}</div></SensitiveContent>
      <footer className="site-footer">
        <p>{t('app.shell.footer')}</p>
        <ul className="footer-links">
          <li><a href="./help.html" target="_blank" rel="noopener noreferrer">{t('app.shell.help')} <span className="sr-only">{t('app.shell.newTab')}</span></a></li>
          <li><a href="./privacy.html" target="_blank" rel="noopener noreferrer">{t('app.shell.privacy')} <span className="sr-only">{t('app.shell.newTab')}</span></a></li>
          <li><a href="./help.html#technology" target="_blank" rel="noopener noreferrer">{t('footer.sources')} <span className="sr-only">{t('app.shell.newTab')}</span></a></li>
        </ul>
      </footer>
      </WalletDisclosureProvider>
      </PrivacyProvider>
    </AppContext.Provider>
  );
}

// i18n-use: app.idle.tagsLocked app.idle.kept app.idle.wiped
