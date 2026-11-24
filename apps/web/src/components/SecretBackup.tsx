import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { Translator } from '../i18n/translator';
import { subscribeAppLock } from '../lib/appLock';
import { copyClipboardText } from '../lib/clipboardPrivacy';
import { useClipboardDelayMs } from '../state';
import { Mono, Notice } from './Common';

/** A shown backup hides itself after this many milliseconds (the texts say "a minute"), and as soon as the tab is hidden. */
export const BACKUP_VISIBLE_MS = 60_000;

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
 * Copying takes a second, warned click. The shared clipboard timer follows the saved preference even after unmount.
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
  }, []);

  useEffect(
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        generation.current += 1;
        copyRequest.current += 1;
        pending.current = false;
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
        await copyClipboardText(value, navigator.clipboard, delay, current);
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
        <button type="button" className="btn" onClick={() => { generation.current += 1; setCopy('idle'); setShown(props.reveal()); }}>{text.show}</button>
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
          {copyPending && <p role="status" aria-live="polite">{t('btc.seed.copying')}</p>}
          <button type="button" className="btn btn-danger" disabled={copyPending} onClick={() => { copyNow(shown); }}>{text.copyConfirm}</button>{' '}
          <button type="button" className="btn" disabled={copyPending} onClick={() => { setCopy('idle'); }}>{text.copyCancel}</button>{' '}
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
        onClick={hide}
      >
        {text.hide}
      </button>
    </Notice>
  );
}
