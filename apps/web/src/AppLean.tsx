import type { ReactNode } from 'react';
import { AppShell } from './AppShell';
import type { ViewId } from './state';

/** Core routes only. No optional view module and no embed startup is imported here. */
const LEAN_ORDER: readonly ViewId[] = ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'registry', 'settings', 'about'];

export function App(): ReactNode {
  return <AppShell order={LEAN_ORDER} />;
}

export { App as AppLean };
