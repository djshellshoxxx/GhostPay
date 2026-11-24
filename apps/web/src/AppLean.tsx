import type { ReactNode } from 'react';
import { AppShell, CORE_ORDER } from './AppShell';

/** Supported EVM routes only; optional views, archive and embedding startup are not imported. */
export function App(): ReactNode {
  return <AppShell profile="lean" order={CORE_ORDER} />;
}

export { App as AppLean };
