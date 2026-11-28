import { ControlTip } from './ControlTips';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { Translator } from '../i18n/translator';
import { subscribeAppLock } from '../lib/appLock';
import {
  clearCopiedRecovery, copiedRecoveryUnverified, copyClipboardText, emptyClipboardOnRequest, subscribeCopiedRecovery,
} from '../lib/clipboardPrivacy';
import { useClipboardDelayMs } from '../state';
import { Mono, Notice } from './Common';

/** A shown backup hides itself after this many milliseconds (the texts say "a minute"), and as soon as the tab is hidden. */
export const BACKUP_VISIBLE_MS = 60_000;

/**
 * Empties the clipboard if it still holds a wallet backup copied by {@link SecretBackup}, whatever the timer preference.
 * Newer or different clipboard content is left alone. Call it inside a click handler (Hide, Lock) where possible:
 * browsers allow clipboard access only during user activation, some only in a focused page. When the browser refuses,
 * {@link CopiedBackupNotice} says so and the next click or key press in this page tries once more. Copies the system
 * already made (clipboard history, sync to other devices) are out of reach.
 */
export function clearCopiedBackup(): void {
  void clearCopiedRecovery();
}

// The app lock checks a copied backup too, also after the view that showed it was left: that view, and its own lock,
// are gone by then. Without user activation the browser usually refuses, and the next click or key press retries.
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
 * Copying takes a second, warned click. Hiding, automatic hiding, the app lock and unmounting empty the clipboard while it
 * still holds the copied backup ({@link clearCopiedBackup}); the saved clipboard delay applies as well, even after unmount.
 * @param props.reveal Produces the backup text; called only when the user asks to see it.
 */
export function SecretBackup(props: { readonly reveal: () => string; readonly text: SecretBackupText }): ReactNode {
  const { text } = props;
  const delay = useClipboardDelayMs();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [shown, setShown] = useState<string | undefined>(undefined);
  const [copy, setCopy] = useState<'idle' | 'confirm' | 'copied' | 'failed'>('idle');
  const [copyPending, setCopyPending] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const copyRequest = useRef(0);
  const pending = useRef(false);

  const hide = useCallback((): void => {
    generation.current += 1;
    copyRequest.current += 1;
    pending.current = false;
    setShown(undefined);
    setCopy('idle');
    setCopyPending(false);
    clearCopiedBackup();
  }, []);

  useEffect(
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        generation.current += 1;
        copyRequest.current += 1;
        pending.current = false;
        // Leaving the view forgets the wallet like Lock does; leaving takes a click, which counts as user activation.
        clearCopiedBackup();
      };
    },
    [],
  );

  useEffect(() => subscribeAppLock(hide), [hide]);

  useEffect(() => {
    if (shown === undefined) return undefined;
    const timer = setTimeout(hide, BACKUP_VISIBLE_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') hide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [shown, hide]);

  const copyNow = (value: string): void => {
    if (pending.current) return;
    pending.current = true;
    setCopyPending(true);
    const revealGeneration = generation.current;
    const request = ++copyRequest.current;
    const current = (): boolean => mounted.current && generation.current === revealGeneration && copyRequest.current === request;
    void (async () => {
      try {
        await copyClipboardText(value, navigator.clipboard, delay, current, { recovery: true });
        // A write that settles after Hide, Lock or leaving the view is checked by the helper itself.
        if (current()) setCopy('copied');
      } catch {
        if (current()) setCopy('failed');
      } finally {
        if (current()) {
          pending.current = false;
          setCopyPending(false);
        }
      }
    })();
  };

  if (shown === undefined) {
    return (
      <Notice kind="warn" title={text.title}>
        <p>{text.warning} {text.hiddenHint}</p>
        <ControlTip message="tips.showSecret"><button type="button" className="btn" onClick={() => { generation.current += 1; setCopy('idle'); setShown(props.reveal()); }}>{text.show}</button></ControlTip>
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
          {copyPending && <ControlTip message="tips.clipboardStatus"><p role="status" aria-live="polite">{t('btc.seed.copying')}</p></ControlTip>}
          <ControlTip message="tips.copySecret"><button type="button" className="btn btn-danger" disabled={copyPending} onClick={() => { copyNow(shown); }}>{text.copyConfirm}</button></ControlTip>{' '}
          <ControlTip message="tips.cancel"><button type="button" className="btn" disabled={copyPending} onClick={() => { setCopy('idle'); }}>{text.copyCancel}</button></ControlTip>{' '}
        </>
      ) : (
        <>
          {copy !== 'idle' && <ControlTip message="tips.clipboardStatus"><p role="status">{copy === 'copied' ? text.copied : text.copyFailed}</p></ControlTip>}
          <ControlTip message="tips.reviewCopy"><button type="button" className="btn" onClick={() => { setCopy('confirm'); }}>{text.copy}</button></ControlTip>{' '}
        </>
      )}
      <ControlTip message="tips.hideSecret"><button
        type="button"
        className="btn"
        onClick={hide}
      >
        {text.hide}
      </button></ControlTip>
    </Notice>
  );
}

/**
 * App-wide: shown while a copied wallet backup may still be on the clipboard because the browser refused GhostPay's check
 * or clear. Emptying without the check is offered only as an explicit choice, because it also removes newer content.
 */
export function CopiedBackupNotice(): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const unverified = useSyncExternalStore(subscribeCopiedRecovery, copiedRecoveryUnverified, () => false);
  const [emptyFailed, setEmptyFailed] = useState(false);
  useEffect(() => { if (!unverified) setEmptyFailed(false); }, [unverified]);
  if (!unverified) return null;
  return (
    <Notice kind="warn" title={t('clipboard.backup.unverified.title')}>
      <ControlTip message="clipboard.backup.unverified.body"><p role="status">{t('clipboard.backup.unverified.body')}</p></ControlTip>
      <p className="hint">{t('clipboard.backup.empty.hint')}</p>
      <ControlTip message="tips.retryClipboard"><button type="button" className="btn" onClick={() => { void clearCopiedRecovery(); }}>{t('clipboard.backup.retry')}</button></ControlTip>{' '}
      <ControlTip message="clipboard.backup.empty.hint"><button type="button" className="btn btn-danger" onClick={() => { void emptyClipboardOnRequest().then((ok) => { setEmptyFailed(!ok); }); }}>
        {t('clipboard.backup.empty')}
      </button></ControlTip>
      {emptyFailed && <ControlTip message="tips.clipboardStatus"><p role="alert">{t('clipboard.backup.empty.failed')}</p></ControlTip>}
    </Notice>
  );
}
