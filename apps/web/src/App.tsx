import { useState, type ReactNode } from 'react';
import type { ViewId } from './state';
import { BtcView } from './features/btc/BtcView';
import { SolanaView } from './features/solana/SolanaView';
import { TronView } from './features/tron/TronView';
import { isPolicyFeatureEnabled } from './features/policy/flag';
import { PolicyView } from './features/policy/PolicyView';
import { BackupPanel } from './components/BackupPanel';
import { AppShell } from './AppShell';
import { MerchantProfilePanel } from './components/MerchantProfilePanel';

const ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'dashboard', 'sweep', 'btc', 'solana', 'tron', 'registry', 'settings', 'about'];

export function App(): ReactNode {
  const [merchantSearch] = useState(() => window.location.search);

  const policyOn = isPolicyFeatureEnabled();
  const order: readonly ViewId[] = policyOn ? [...ORDER.slice(0, -2), 'policy', ...ORDER.slice(-2)] : ORDER;
  const extraViews = {
    btc: <BtcView />,
    solana: <SolanaView />,
    tron: <TronView />,
    ...(policyOn ? { policy: <PolicyView /> } : {}),
  };
  return (
    <AppShell profile="full" order={order} extraViews={extraViews} sellerArchive={<BackupPanel />} mainPrelude={<MerchantProfilePanel search={merchantSearch} />} />
  );
}
