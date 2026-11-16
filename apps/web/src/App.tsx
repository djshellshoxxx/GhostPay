import { useEffect, useState, type ReactNode } from 'react';
import { startEmbedHost, readProfileFromSearch } from './lib/embedHost';
import type { MerchantProfile } from '@ghostpay/invoice-schema';
import type { ViewId } from './state';
import { BtcView } from './features/btc/BtcView';
import { SolanaView } from './features/solana/SolanaView';
import { TronView } from './features/tron/TronView';
import { isPolicyFeatureEnabled } from './features/policy/flag';
import { PolicyView } from './features/policy/PolicyView';
import { BackupPanel } from './components/BackupPanel';
import { AppShell } from './AppShell';
import { MerchantProfileNotice } from './components/MerchantProfileNotice';

const ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'btc', 'solana', 'tron', 'registry', 'settings', 'about'];

export function App(): ReactNode {
  const [merchantProfile] = useState<MerchantProfile | undefined>(() =>
    readProfileFromSearch(window.location.search, Math.floor(Date.now() / 1000)),
  );
  // Embed completion channel: inert unless framed, built with VITE_EMBED_IFRAME=1 (header-capable host) and given a valid signed profile.
  useEffect(() => {
    const session = startEmbedHost(window, merchantProfile, import.meta.env.VITE_EMBED_IFRAME === '1');
    return () => {
      session?.close();
    };
  }, [merchantProfile]);

  const policyOn = isPolicyFeatureEnabled();
  const order: readonly ViewId[] = policyOn ? [...ORDER.slice(0, -2), 'policy', ...ORDER.slice(-2)] : ORDER;
  const extraViews = {
    btc: <BtcView />,
    solana: <SolanaView />,
    tron: <TronView />,
    ...(policyOn ? { policy: <PolicyView /> } : {}),
  };
  return (
    <>
      {merchantProfile !== undefined && <MerchantProfileNotice profile={merchantProfile} />}
      <AppShell profile="full" order={order} extraViews={extraViews} sellerArchive={<BackupPanel />} />
    </>
  );
}
