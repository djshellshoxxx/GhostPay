import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { ViewId } from './state';
import { BtcView } from './features/btc/BtcView';
import { SolanaView } from './features/solana/SolanaView';
import { TronView } from './features/tron/TronView';
import { isPolicyFeatureEnabled } from './features/policy/flag';
import { PolicyView } from './features/policy/PolicyView';
import { BackupPanel } from './components/BackupPanel';
import { AppShell } from './AppShell';
import { MerchantProfilePanel } from './components/MerchantProfilePanel';
import { SOURCE_TRANSLATOR, useI18nOptional } from './i18n/context';

/** Replaced with a boolean literal by vite.config.ts; true only for a full build made with VITE_MERCHANT_DASHBOARD=1. */
declare const __GHOSTPAY_MERCHANT_DASHBOARD__: boolean;
// F04 merchant dashboard: excluded from beta/v1.0 (docs/ai/STOP_WORK_20261125.md). Only the full profile can opt in; the
// lean Pages entry (AppLean) never imports it. The raw define lets the bundler drop the chunk from a default build.
const MerchantDashboard = __GHOSTPAY_MERCHANT_DASHBOARD__ ? lazy(() => import('./views/MerchantDashboard')) : undefined;

const BASE_ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'btc', 'solana', 'tron', 'registry', 'settings', 'about'];
const ORDER: readonly ViewId[] = MerchantDashboard === undefined ? BASE_ORDER
  : [...BASE_ORDER.slice(0, BASE_ORDER.indexOf('scan') + 1), 'dashboard', ...BASE_ORDER.slice(BASE_ORDER.indexOf('scan') + 1)];

export function App(): ReactNode {
  const [merchantSearch] = useState(() => window.location.search);
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;

  const policyOn = isPolicyFeatureEnabled();
  const order: readonly ViewId[] = policyOn ? [...ORDER.slice(0, -2), 'policy', ...ORDER.slice(-2)] : ORDER;
  const extraViews = {
    btc: <BtcView />,
    solana: <SolanaView />,
    tron: <TronView />,
    ...(policyOn ? { policy: <PolicyView /> } : {}),
    ...(MerchantDashboard === undefined ? {} : {
      dashboard: <Suspense fallback={<p role="status">{t('dashboard.loading')}</p>}><MerchantDashboard /></Suspense>,
    }),
  };
  return (
    <AppShell profile="full" order={order} extraViews={extraViews} sellerArchive={<BackupPanel />} mainPrelude={<MerchantProfilePanel search={merchantSearch} />} />
  );
}
