import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { startEmbedHost, readProfileFromSearch } from './lib/embedHost';
import { clearFragment, readInvoiceFragment } from './lib/fragment';
import { loadedKeysRecoverable } from './lib/keyVault';
import type { ScanMatch } from './lib/scanClient';
import { useServices } from './lib/services';
import { captureSessionVersionGuard, clearSession, getSessionBackup, getSessionPublic, hasSession, notifyIdleLock, subscribeSession, subscribeSessionBackup } from './lib/session';
import { loadSettings, saveSettings, type Settings as SettingsData } from './lib/settings';
import { AppContext, VIEW_LABELS, type AppState, type ViewId } from './state';
import { BtcView } from './features/btc/BtcView';
import { SolanaView } from './features/solana/SolanaView';
import { TronView } from './features/tron/TronView';
import { RegistryView } from './features/registry/RegistryView';
import { isPolicyFeatureEnabled } from './features/policy/flag';
import { PolicyView } from './features/policy/PolicyView';
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
import { notifyAppLock } from './lib/appLock';
import { SOURCE_TRANSLATOR, useI18nOptional } from './i18n/context';

const ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'btc', 'solana', 'tron', 'registry', 'settings', 'about'];

function ViewSwitch(props: { readonly view: ViewId }): ReactNode {
  switch (props.view) {
    case 'home':
      return <Home />;
    case 'seller':
      return <SellerKeys />;
    case 'create':
      // An invoice invites payments that only these keys can sweep: no invoice until they are backed up or the risk is waived (L1-01).
      // Also when only a signing key generated at a hex import is unsaved: invoices are signed with it (C-R10).
      return <BackupGate heading="Create invoice"><CreateInvoice /></BackupGate>;
    case 'pay':
      return <Pay />;
    case 'scan':
      return <Scan />;
    case 'sweep':
      return <Sweep />;
    case 'btc':
      return <BtcView />;
    case 'solana':
      return <SolanaView />;
    case 'tron':
      return <TronView />;
    case 'registry':
      return <RegistryView />;
    case 'policy':
      // Experimental (ADR-0014): only reachable when the build flag is on.
      return isPolicyFeatureEnabled() ? <PolicyView /> : <Home />;
    case 'settings':
      return <Settings />;
    case 'about':
      return <About />;
  }
}

export function App(): ReactNode {
  const services = useServices();
  const [fragment, setFragment] = useState<string | undefined>(() => readInvoiceFragment(window.location));
  const [view, setViewState] = useState<ViewId>(() => (readInvoiceFragment(window.location) === undefined ? 'home' : 'pay'));
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings());
  const [matches, setMatches] = useState<readonly ScanMatch[]>([]);
  const [sweepTarget, selectForSweep] = useState<AppState['sweepTarget']>(undefined);
  const [live, setLive] = useState('');
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

  // Clear the fragment from the address bar right after it was read (default on).
  useEffect(() => {
    if (readInvoiceFragment(window.location) !== undefined && settings.autoClearFragment) {
      clearFragment(window.location, window.history);
    }
    // Only at load: later changes come through the hashchange handler below.
  }, []);

  // Embed completion channel: inert unless framed, built with VITE_EMBED_IFRAME=1 (header-capable host) and given a valid signed profile.
  useEffect(() => {
    const profile = readProfileFromSearch(window.location.search, Math.floor(Date.now() / 1000));
    const session = startEmbedHost(window, profile, import.meta.env.VITE_EMBED_IFRAME === '1');
    return () => {
      session?.close();
    };
  }, []);

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
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const minutes = settings.lockTimeoutMin;
    const lock = (): void => {
      services.vault.lock();
      // Key hex and passphrases typed into a view go too, whether or not the keys are wiped below (G2-05). The Bitcoin,
      // Solana and TRON views wipe their own keys, and a copied backup is emptied from the clipboard (G2-02).
      notifyIdleLock();
      notifyAppLock('idle');
      if (!hasSession()) {
        setLive(t('app.idle.tagsLocked'));
        return;
      }
      const unchanged = captureSessionVersionGuard();
      void loadedKeysRecoverable().then((recoverable) => {
        try { unchanged(); } catch { return; }
        const signerLost = getSessionBackup()?.signerOnly === true;
        if (!recoverable && !signerLost) {
          setLive(t('app.idle.kept'));
          return;
        }
        clearSession();
        setIdleWiped({ minutes, signerLost });
        setLive(t('app.idle.wiped'));
      });
    };
    const arm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(lock, minutes * 60_000);
    };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [services, settings.lockTimeoutMin, t]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [view]);

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
      setView: setViewState,
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
    [view, settings, session, fragment, matches, sweepTarget, getRpc, getSecondaryRpc],
  );

  return (
    <AppContext.Provider value={state}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site-header">
        <h1>GhostPay</h1>
        <p className="tagline">Stealth-address payments. Everything runs in your browser. Unaudited software.</p>
        <nav aria-label="Main">
          <ul className="nav">
            {(isPolicyFeatureEnabled() ? [...ORDER.slice(0, -2), 'policy' as const, ...ORDER.slice(-2)] : ORDER).map((v) => (
              <li key={v}>
                <button type="button" className="nav-btn" aria-current={view === v ? 'page' : undefined} onClick={() => { setViewState(v); }}>
                  {VIEW_LABELS[v]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} ref={main}>
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
          <ViewSwitch view={view} />
        </ErrorBoundary>
      </main>
      <div className="sr-only" role="status" aria-live="polite">{live}</div>
      <footer className="site-footer">
        <p>No analytics, no third-party scripts, no remote fonts. Fee and contract addresses come only from the deployment manifest.</p>
      </footer>
    </AppContext.Provider>
  );
}
