import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { RpcClient } from '@ghostpay/chain-adapters';
import { clearFragment, readInvoiceFragment } from './lib/fragment';
import type { ScanMatch } from './lib/scanClient';
import { useServices } from './lib/services';
import { clearSession, getSessionPublic, subscribeSession } from './lib/session';
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
import { SellerKeys } from './views/SellerKeys';
import { Settings } from './views/Settings';
import { Sweep } from './views/Sweep';

const ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'btc', 'solana', 'tron', 'registry', 'settings', 'about'];

function ViewSwitch(props: { readonly view: ViewId }): ReactNode {
  switch (props.view) {
    case 'home':
      return <Home />;
    case 'seller':
      return <SellerKeys />;
    case 'create':
      return <CreateInvoice />;
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
  const session = useSyncExternalStore(subscribeSession, getSessionPublic);
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

  // Idle lock for local tags.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        services.vault.lock();
        clearSession();
        setLive('Seller keys and local tags locked after inactivity.');
      }, settings.lockTimeoutMin * 60_000);
    };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [services, settings.lockTimeoutMin]);

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
        <ViewSwitch view={view} />
      </main>
      <div className="sr-only" role="status" aria-live="polite">{live}</div>
      <footer className="site-footer">
        <p>No analytics, no third-party scripts, no remote fonts. Fee and contract addresses come only from the deployment manifest.</p>
      </footer>
    </AppContext.Provider>
  );
}
