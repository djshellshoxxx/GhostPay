import { useEffect, type ReactNode } from 'react';
import { startEmbedHost, readProfileFromSearch } from './lib/embedHost';
import type { ViewId } from './state';
import { BtcView } from './features/btc/BtcView';
import { SolanaView } from './features/solana/SolanaView';
import { TronView } from './features/tron/TronView';
import { isPolicyFeatureEnabled } from './features/policy/flag';
import { PolicyView } from './features/policy/PolicyView';
import { AppShell } from './AppShell';

const ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'btc', 'solana', 'tron', 'registry', 'settings', 'about'];

export function App(): ReactNode {
  // Embed completion channel: inert unless framed, built with VITE_EMBED_IFRAME=1 (header-capable host) and given a valid signed profile.
  useEffect(() => {
    const profile = readProfileFromSearch(window.location.search, Math.floor(Date.now() / 1000));
    const session = startEmbedHost(window, profile, import.meta.env.VITE_EMBED_IFRAME === '1');
    return () => {
      session?.close();
    };
  }, []);

  const policyOn = isPolicyFeatureEnabled();
  const order: readonly ViewId[] = policyOn ? [...ORDER.slice(0, -2), 'policy', ...ORDER.slice(-2)] : ORDER;
  const extraViews = {
    btc: <BtcView />,
    solana: <SolanaView />,
    tron: <TronView />,
    ...(policyOn ? { policy: <PolicyView /> } : {}),
  };
  return <AppShell order={order} extraViews={extraViews} />;
}
