import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createReconciledClient, type DeploymentManifest, type RpcClient } from '@ghostpay/chain-adapters';
import { checkDeployment as runCheck, type DeploymentCheck } from './lib/deployment';
import { clearFragment, readInvoiceFragment } from './lib/fragment';
import type { ScanMatch } from './lib/scanClient';
import { useServices } from './lib/services';
import { getSessionPublic, subscribeSession } from './lib/session';
import { loadSettings, saveSettings, type Settings as SettingsData } from './lib/settings';
import { AppContext, VIEW_LABELS, type AppState, type ViewId } from './state';
import { About } from './views/About';
import { CreateInvoice } from './views/CreateInvoice';
import { Home } from './views/Home';
import { Pay } from './views/Pay';
import { Scan } from './views/Scan';
import { SellerKeys } from './views/SellerKeys';
import { Settings } from './views/Settings';
import { Sweep } from './views/Sweep';

const ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'settings', 'about'];

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
        setLive('Local tags locked after inactivity.');
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

  const rawRpc = useCallback(
    (chainId: number, url: string | undefined): Promise<RpcClient> | undefined => {
      const chain = services.chains.find((c) => c.chainId === chainId);
      if (url === undefined || chain === undefined) return undefined;
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

  // With a second provider configured every client request goes through identical-result reconciliation (S3-14).
  const getRpc = useCallback(
    async (chainId: number): Promise<RpcClient | undefined> => {
      const a = rawRpc(chainId, settings.rpcUrls[String(chainId)]);
      if (a === undefined) return undefined;
      const b = rawRpc(chainId, settings.secondaryRpcUrls[String(chainId)]);
      return b === undefined ? a : createReconciledClient(await a, await b);
    },
    [rawRpc, settings.rpcUrls, settings.secondaryRpcUrls],
  );

  const checkCache = useRef(new Map<string, Promise<DeploymentCheck>>());
  const checkDeployment = useCallback(
    (manifest: DeploymentManifest): Promise<DeploymentCheck> => {
      const id = String(manifest.chainId);
      const key = `${id}|${settings.rpcUrls[id] ?? ''}|${settings.secondaryRpcUrls[id] ?? ''}`;
      const hit = checkCache.current.get(key);
      if (hit !== undefined) return hit;
      const p = (async (): Promise<DeploymentCheck> => {
        const primary = rawRpc(manifest.chainId, settings.rpcUrls[id]);
        if (primary === undefined) return { status: 'no-rpc' };
        let a: RpcClient;
        let b: RpcClient | undefined;
        try {
          a = await primary;
          const second = rawRpc(manifest.chainId, settings.secondaryRpcUrls[id]);
          b = second === undefined ? undefined : await second;
        } catch {
          return { status: 'unverified', reason: 'the RPC endpoint is unreachable or reports another chain' };
        }
        return runCheck(manifest, a, b, services.verifyDeployment);
      })();
      checkCache.current.set(key, p);
      void p.then((r) => {
        if (r.status !== 'verified') checkCache.current.delete(key);
      });
      return p;
    },
    [rawRpc, services, settings.rpcUrls, settings.secondaryRpcUrls],
  );

  const rpcHosts = useCallback(
    (chainId: number): readonly string[] => {
      const hosts: string[] = [];
      for (const u of [settings.rpcUrls[String(chainId)], settings.secondaryRpcUrls[String(chainId)]]) {
        if (u === undefined) continue;
        try {
          hosts.push(new URL(u).host);
        } catch {
          /* ignore */
        }
      }
      return hosts;
    },
    [settings.rpcUrls, settings.secondaryRpcUrls],
  );

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
      checkDeployment,
      rpcHosts,
      announce: setLive,
    }),
    [view, settings, session, fragment, matches, sweepTarget, getRpc, checkDeployment, rpcHosts],
  );

  return (
    <AppContext.Provider value={state}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site-header">
        <h1>GhostPay</h1>
        <p className="tagline">Stealth-address payments. Everything runs in your browser. Unaudited software.</p>
        <nav aria-label="Main">
          <ul className="nav">
            {ORDER.map((v) => (
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
        <p>No analytics, no third-party scripts, no remote fonts. Contract addresses and the fee recipient come from a manifest compiled into this app and are read back from the chain before any payment.</p>
      </footer>
    </AppContext.Provider>
  );
}
