import { useEffect, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR } from '../i18n/context';
import type { Translator } from '../i18n/translator';
import { subscribeAppLock } from '../lib/appLock';
import { Mono, Notice } from './Common';

/** A shown backup hides itself after this many milliseconds (the texts say "a minute"), and as soon as the tab is hidden. */
export const BACKUP_VISIBLE_MS = 60_000;

/** Numbers the copies made by {@link SecretBackup}. */
let copies = 0;
/** The latest copy that may still be on the clipboard (0: none). Only a clear that worked unmarks it. */
let onClipboard = 0;
/** The copy whose clear is still pending (0: none), so that a second Hide or Lock meanwhile does not write again. */
let clearing = 0;
/** A clear the browser refused waits for the next click or key press ({@link retryAtActivation}). */
let retrying = false;

/**
 * While a refused clear waits, the next click or key press in the page tries again: it is user activation, so the
 * browser allows the write. Capture phase, before the page's own handlers, so a click that copies is not emptied
 * right after it copied.
 */
function retryAtActivation(on: boolean): void {
  retrying = on;
  for (const type of ['click', 'keydown'] as const) {
    if (on) window.addEventListener(type, clearCopiedBackup, true);
    else window.removeEventListener(type, clearCopiedBackup, true);
  }
}

/**
 * Best-effort: empties the clipboard if a wallet backup was copied there since the last clear that worked. Call it
 * inside a click handler (Hide, Lock): browsers allow clipboard writes only during user activation, some only in a
 * focused page. When the browser refuses (the app lock runs on a timer), the backup stays marked: the next click or
 * key press in this page tries again, and so does the next Hide or Lock. Copies the system already made (clipboard
 * history, sync to other devices) are out of reach.
 */
export function clearCopiedBackup(): void {
  const copy = onClipboard;
  if (copy === 0) {
    retryAtActivation(false);
    return;
  }
  if (clearing === copy) return;
  clearing = copy;
  const settle = (cleared: boolean): void => {
    if (clearing === copy) clearing = 0;
    // A copy started in the meantime is not this clear's to unmark.
    if (cleared && onClipboard === copy) onClipboard = 0;
    retryAtActivation(!cleared && onClipboard !== 0);
  };
  void (async () => {
    try {
      // The call itself runs synchronously in this activation; only settlement is awaited.
      await navigator.clipboard.writeText('');
      settle(true);
    } catch {
      // A throwing or unavailable API does not prove a previously copied backup was cleared.
      settle(false);
    }
  })();
}

// The app lock empties a copied backup too, also after the view that showed it was left: that view, and its own
// lock, are gone by then. Without user activation the browser usually refuses, and the next click or key press retries.
subscribeAppLock(() => {
  clearCopiedBackup();
});

/** Every text {@link SecretBackup} shows. Build it with {@link localizedBackupText}. */
export interface SecretBackupText {
  readonly title: string;
  /** Who controls the wallet with the backup, and that it is not stored. */
  readonly warning: string;
  /** Next to the Show button: how showing works. */
  readonly hiddenHint: string;
  readonly show: string;
  readonly hide: string;
  readonly copy: string;
  /** Shown before anything is copied. */
  readonly copyWarning: string;
  readonly copyConfirm: string;
  readonly copyCancel: string;
  readonly copied: string;
  readonly copyFailed: string;
}

/**
 * Texts for the views that back up a `seed` (Solana, shared with Bitcoin: btc.seed.*) or `keys` (TRON: secret.keys.*).
 * The warning, hint and clipboard texts are security keys, so an unreviewed locale keeps their English source.
 */
export function localizedBackupText(t: Translator['t'], noun: 'seed' | 'keys'): SecretBackupText {
  return {
    title: noun === 'seed' ? t('btc.seed.heading') : t('secret.keys.title'),
    warning: noun === 'seed' ? t('btc.seed.warning') : t('secret.keys.warning'),
    hiddenHint: t('btc.seed.hiddenHint'),
    show: noun === 'seed' ? t('btc.seed.show') : t('secret.keys.show'),
    hide: noun === 'seed' ? t('btc.seed.hide') : t('secret.keys.hide'),
    copy: noun === 'seed' ? t('btc.seed.copy') : t('secret.keys.copy'),
    copyWarning: t('btc.seed.copyWarning'),
    copyConfirm: t('btc.seed.copyConfirm'),
    copyCancel: t('btc.seed.copyCancel'),
    copied: t('btc.seed.copied'),
    copyFailed: t('btc.seed.copyFailed'),
  };
}

/** English texts, for isolated tests without an I18nProvider. */
export function englishBackupText(noun: 'seed' | 'keys'): SecretBackupText {
  return localizedBackupText(SOURCE_TRANSLATOR.t, noun);
}

/**
 * A wallet backup (seed or keys) that is not in the page until asked for. It is shown on request, again as often as
 * needed while the wallet is loaded, and hides itself after {@link BACKUP_VISIBLE_MS} or as soon as the page is hidden.
 * Copying takes a second, warned click; Hide empties the clipboard again, and so do each view's Lock, the app lock
 * and leaving the view (this component unmounts).
 * @param props.reveal Produces the backup text; called only when the user asks to see it.
 */
export function SecretBackup(props: { readonly reveal: () => string; readonly text: SecretBackupText }): ReactNode {
  const { text } = props;
  const [shown, setShown] = useState<string | undefined>(undefined);
  const [copy, setCopy] = useState<'idle' | 'confirm' | 'copied' | 'failed'>('idle');

  // Leaving the view forgets the wallet like Lock does, so it empties the clipboard like Lock: leaving takes a click,
  // which the browser counts as user activation. Not when a refused clear already waits for the next click or key
  // press: this unmounts without one then (the app lock), and that click runs the clear anyway.
  useEffect(
    () => () => {
      if (!retrying) clearCopiedBackup();
    },
    [],
  );

  useEffect(() => {
    if (shown === undefined) return undefined;
    const hide = (): void => {
      setShown(undefined);
      setCopy('idle');
    };
    const timer = setTimeout(hide, BACKUP_VISIBLE_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') hide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [shown]);

  const copyNow = (value: string): void => {
    const earlier = onClipboard;
    const mine = ++copies;
    // Marked before the write, so a Hide or Lock clicked while it is pending still clears it.
    onClipboard = mine;
    void (async () => {
      try {
        await navigator.clipboard.writeText(value);
        setCopy('copied');
      } catch {
        // Nothing was copied: an earlier copy that may still be on the clipboard stays marked.
        if (onClipboard === mine) onClipboard = earlier;
        setCopy('failed');
      }
    })();
  };

  if (shown === undefined) {
    return (
      <Notice kind="warn" title={text.title}>
        <p>{text.warning} {text.hiddenHint}</p>
        <button type="button" className="btn" onClick={() => { setShown(props.reveal()); }}>{text.show}</button>
      </Notice>
    );
  }
  return (
    <Notice kind="warn" title={text.title}>
      <p><Mono>{shown}</Mono></p>
      <p>{text.warning}</p>
      {copy === 'confirm' ? (
        <>
          <p><strong>{text.copyWarning}</strong></p>
          <button type="button" className="btn btn-danger" onClick={() => { copyNow(shown); }}>{text.copyConfirm}</button>{' '}
          <button type="button" className="btn" onClick={() => { setCopy('idle'); }}>{text.copyCancel}</button>{' '}
        </>
      ) : (
        <>
          {copy !== 'idle' && <p role="status">{copy === 'copied' ? text.copied : text.copyFailed}</p>}
          <button type="button" className="btn" onClick={() => { setCopy('confirm'); }}>{text.copy}</button>{' '}
        </>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => {
          setShown(undefined);
          setCopy('idle');
          clearCopiedBackup();
        }}
      >
        {text.hide}
      </button>
    </Notice>
  );
}
