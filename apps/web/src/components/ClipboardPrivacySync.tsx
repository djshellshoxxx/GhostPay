import { useLayoutEffect } from 'react';
import { cancelClipboardCleanup } from '../lib/clipboardPrivacy';
import { useApp } from '../state';

/** Lives with AppShell, so changing the preference cancels work even after the copying view unmounts. */
export function ClipboardPrivacySync(): null {
  const { clipboardClearAfterMs } = useApp().settings;
  useLayoutEffect(() => {
    cancelClipboardCleanup();
    return cancelClipboardCleanup;
  }, [clipboardClearAfterMs]);
  return null;
}
