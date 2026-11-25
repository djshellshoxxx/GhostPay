import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { WalletDisclosureProvider } from './components/WalletDisclosure';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { clearFragment, readInvoiceFragment } from './lib/fragment';
import { loadedKeysRecoverable } from './lib/keyVault';
import type { ScanMatch } from './lib/scanClient';
import { useServices } from './lib/services';
import { captureSessionVersionGuard, clearSession, getSessionBackup, getSessionPublic, hasSession, sessionHasExternalCopy, subscribeSession, subscribeSessionBackup } from './lib/session';
import { loadSettings, saveSettings, type Settings as SettingsData } from './lib/settings';
import { AppContext, VIEW_LABELS, type AppState, type ViewId } from './state';
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
import { BrowserChecks } from './components/BrowserChecks';
import { notifyAppLock } from './lib/appLock';

/** How often the idle lock compares the wall clock with the last activity, for devices whose timers paused in sleep (GP-PAGES-04). */
export const IDLE_CHECK_MS = 20_000;
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

function ViewSwitch(props: { readonly view: ViewId; readonly extraViews: ExtraViews; readonly profile: 'full' | 'lean'; readonly sellerArchive?: ReactNode }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
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
  const [fragment, setFragment] = useState<string | undefined>(() => readInvoiceFragment(window.location));
  const [selectedView, setViewState] = useState<ViewId>(() => (readInvoiceFragment(window.location) === undefined ? 'home' : 'pay'));
  const view = profile === 'lean' && !CORE_ORDER.includes(selectedView) ? 'home' : selectedView;
  const setView = useCallback((next: ViewId): void => {
    setViewState(profile === 'lean' && !CORE_ORDER.includes(next) ? 'home' : next);
  }, [profile]);
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  const [matches, setMatches] = useState<readonly ScanMatch[]>([]);
  const [sweepTarget, selectForSweep] = useState<AppState['sweepTarget']>(undefined);
  const [live, setLive] = useState<string | { readonly key: MessageKey }>('');
  // Minutes of the idle lock that last wiped seller keys, and whether an unsaved signing key went with them (C-R10), for a
  // visible notice; cleared once keys are loaded again.
  const [idleWiped, setIdleWiped] = useState<{ readonly minutes: number; readonly signerLost: boolean } | undefined>(undefined);
  const session = useSyncExternalStore(subscribeSession, getSessionPublic);
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  const rpcCache = useRef(new Map<string, Promise<RpcClient>>());

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
      setViewState('pay');
      if (settings.autoClearFragment) clearFragment(window.location, window.history);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, [settings.autoClearFragment]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Tag keys derived from one seller identity must never serve another: lock local tags whenever keys change (L1-04).
  useEffect(() => subscribeSession(() => {
    services.vault.lock();
    if (hasSession()) setIdleWiped(undefined);
  }), [services]);

  // Idle lock (L1-01). Local tags always lock. Seller keys are wiped only when a copy survives the wipe (imported keys, a
  // downloaded keystore, or their vault still saved here); keys that exist nowhere else stay loaded under the backup
  // banner, because wiping them would lose every payment sent to their meta-address. Hex keys imported without their
  // signing key are wiped too: the hex loads them again, and the notice says that the signing key generated here is gone (C-R10).
  useEffect(() => {
    const minutes = settings.lockTimeoutMin;
    const timeoutMs = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Both clocks enforce the deadline (GP-PAGES-04): wall time advances across device sleep on platforms that pause
    // performance.now(), while monotonic time prevents a wall-clock adjustment from extending the idle period.
    // Any rollback since the last observation locks immediately, including when both timers and monotonic time paused.
    let lastActivityWall = Date.now();
    let lastActivityMonotonic = performance.now();
    let lastObservedWall = lastActivityWall;
    let lastObservedMonotonic = lastActivityMonotonic;
    let locked = false;
    const lock = (): void => {
      if (locked) return;
      locked = true;
      services.vault.lock();
      // Key hex and passphrases typed into a view go too, whether or not the keys are wiped below (G2-05). The Bitcoin,
      // Solana and TRON views wipe their own keys, and a copied backup is emptied from the clipboard (G2-02).
      notifyAppLock('idle');
      if (!hasSession()) {
        setLive({ key: 'app.idle.tagsLocked' });
        return;
      }
      const unchanged = captureSessionVersionGuard();
      void loadedKeysRecoverable().then((recoverable) => {
        try { unchanged(); } catch { return; }
        const signerLost = getSessionBackup()?.signerOnly === true;
        if (!recoverable && !signerLost) {
          // A downloaded keystore that was never verified does not count: the file may never have reached the disk (GP-PAGES-02).
          setLive({ key: getSessionBackup()?.backedUp === true ? 'app.idle.keptUnverified' : 'app.idle.kept' });
          return;
        }
        clearSession();
        setIdleWiped({ minutes, signerLost });
        setLive({ key: 'app.idle.wiped' });
      });
    };
    const overdue = (): boolean => {
      const wall = Date.now();
      const monotonic = performance.now();
      const rolledBack = wall < lastObservedWall || monotonic < lastObservedMonotonic;
      lastObservedWall = wall;
      lastObservedMonotonic = monotonic;
      return rolledBack || !Number.isFinite(wall) || !Number.isFinite(monotonic) ||
        wall - lastActivityWall >= timeoutMs || monotonic - lastActivityMonotonic >= timeoutMs;
    };
    const check = (): void => { if (overdue()) lock(); };
    const arm = (): void => {
      // Activity after a sleep that passed the deadline locks first; the activity then starts the next idle period.
      check();
      lastActivityWall = Date.now();
      lastActivityMonotonic = performance.now();
      lastObservedWall = lastActivityWall;
      lastObservedMonotonic = lastActivityMonotonic;
      locked = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(lock, timeoutMs);
    };
    const onVisibility = (): void => { if (document.visibilityState === 'visible') check(); };
    arm();
    const interval = setInterval(check, IDLE_CHECK_MS);
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', onVisibility);
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
    (urls: Readonly<Record<string, string>>, chainId: number): Promise<RpcClient | undefined> => {
      const url = urls[String(chainId)];
      const chain = services.chains.find((c) => c.chainId === chainId);
      if (url === undefined || chain === undefined) return Promise.resolve(undefined);
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
  const getRpc = useCallback((chainId: number) => rpcFor(settings.rpcUrls, chainId), [rpcFor, settings.rpcUrls]);
  const getSecondaryRpc = useCallback((chainId: number) => rpcFor(settings.rpcUrlsSecondary, chainId), [rpcFor, settings.rpcUrlsSecondary]);

  const state = useMemo<AppState>(
    () => ({
      view,
      setView,
      settings,
      updateSettings: (s) => {
        setSettings(s);
        return saveSettings(s);
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
    [view, setView, settings, session, fragment, matches, sweepTarget, getRpc, getSecondaryRpc],
  );
  // One gate scope for the life of the shell: a connected wallet keeps working across key or settings changes, which
  // each view's own authority checks handle. Such a change only cancels a review that is open at that moment.
  const [walletDisclosureScope] = useState(() => ({}));
  const walletDisclosureRevision = useMemo(() => ({ session, settings }), [session, settings]);

  return (
    <AppContext.Provider value={state}>
      <WalletDisclosureProvider scope={walletDisclosureScope} revokeOn={walletDisclosureRevision}>
      <a className="skip" href="#main" onClick={() => { main.current?.focus(); }}>{t('app.shell.skip')}</a>
      <header className="site-header">
        <h1>GhostPay</h1>
        <p className="tagline">{t('app.shell.tagline')}</p>
        <nav aria-label={t('app.shell.main')}>
          <ul className="nav">
            {order.map((v) => (
              <li key={v}>
                <button type="button" className="nav-btn" data-view={v} aria-current={view === v ? 'page' : undefined} onClick={() => { setView(v); }}>
                  {t(VIEW_LABELS[v])}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} ref={main}>
        {props.mainPrelude}
        {session !== undefined && backup?.backedUp === true && backup.verified === false && (
          <Notice kind="warn" title={t('app.backup.unverified.title')}>
            {t('app.backup.unverified.body')}
            {view !== 'seller' && <> <button type="button" className="btn" onClick={() => { setViewState('seller'); }}>{t('app.backup.unverified.action')}</button></>}
          </Notice>
        )}
        {session !== undefined && backup?.backedUp === false && (
          // Payments stay sweepable from typed hex when only the signing key generated for it is unsaved (C-R10).
          <Notice kind="warn" title={backup.signerOnly ? t('app.backup.signerOnly.title') : t('app.backup.title')}>
            {backup.signerOnly ? t('app.backup.signerOnly.body') : t('app.backup.body')}
            {view !== 'seller' && <> <button type="button" className="btn" onClick={() => { setViewState('seller'); }}>{t('app.backup.action')}</button></>}
          </Notice>
        )}
        {session === undefined && idleWiped !== undefined && (
          <Notice kind="info">
            {t('app.idle.wipedNotice', { minutes: idleWiped.minutes })}{idleWiped.signerLost && <> {t('app.idle.signerLost')}</>}{' '}
            <button type="button" className="btn" onClick={() => { setIdleWiped(undefined); }}>{t('app.idle.dismiss')}</button>
          </Notice>
        )}
        {/* A render error in a view shows an error panel instead of unmounting the app (G1-01). */}
        <ErrorBoundary resetKey={view} onBack={() => { setFragment(undefined); setViewState('home'); }}>
          <ShellProfileContext.Provider value={profile}>
            <ViewSwitch view={view} extraViews={extraViews} profile={profile} sellerArchive={props.sellerArchive} />
          </ShellProfileContext.Provider>
        </ErrorBoundary>
      </main>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{typeof live === 'string' ? live : t(live.key)}</div>
      <footer className="site-footer">
        <BrowserChecks />
        <p>{t('app.shell.footer')}</p>
        <ul className="footer-links">
          <li><a href="./help.html" target="_blank" rel="noopener noreferrer">{t('app.shell.help')} <span className="sr-only">{t('app.shell.newTab')}</span></a></li>
          <li><a href="./privacy.html" target="_blank" rel="noopener noreferrer">{t('app.shell.privacy')} <span className="sr-only">{t('app.shell.newTab')}</span></a></li>
          <li><a href="./help.html#technology" target="_blank" rel="noopener noreferrer">{t('footer.sources')} <span className="sr-only">{t('app.shell.newTab')}</span></a></li>
        </ul>
      </footer>
      </WalletDisclosureProvider>
    </AppContext.Provider>
  );
}

// i18n-use: app.idle.tagsLocked app.idle.kept app.idle.wiped
