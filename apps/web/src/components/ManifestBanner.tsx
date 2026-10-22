import type { ReactNode } from 'react';
import type { ManifestState } from '../lib/manifest';
import { Notice } from './Common';

/** Loud warning for every flow that uses a manifest which carries no verified release signature (testnet only). */
export function ManifestBanner(props: { readonly manifest: ManifestState | undefined }): ReactNode {
  const m = props.manifest;
  if (m?.status !== 'loaded' || m.trust !== 'unsigned-dev') return null;
  return <Notice kind="warn">{m.warning ?? 'UNSIGNED DEV MANIFEST: testnet only.'}</Notice>;
}
