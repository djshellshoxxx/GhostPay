import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR } from '../i18n/context';
import type { Translator } from '../i18n/translator';
import { subscribeAppLock } from '../lib/appLock';
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
}

/**
 * Texts for the views that back up a `seed` (Solana, shared with Bitcoin: btc.seed.*) or `keys` (TRON: secret.keys.*).
 * The warning and hint texts are security keys, so an unreviewed locale keeps their English source.
 */
export function localizedBackupText(t: Translator['t'], noun: 'seed' | 'keys'): SecretBackupText {
  return {
    title: noun === 'seed' ? t('btc.seed.heading') : t('secret.keys.title'),
    warning: noun === 'seed' ? t('btc.seed.warning') : t('secret.keys.warning'),
    hiddenHint: t('btc.seed.hiddenHint'),
    show: noun === 'seed' ? t('btc.seed.show') : t('secret.keys.show'),
    hide: noun === 'seed' ? t('btc.seed.hide') : t('secret.keys.hide'),
  };
}

/** English texts, for isolated tests without an I18nProvider. */
export function englishBackupText(noun: 'seed' | 'keys'): SecretBackupText {
  return localizedBackupText(SOURCE_TRANSLATOR.t, noun);
}

/**
 * A wallet backup (seed or keys) that is not in the page until asked for. It is shown on request, again as often as
 * needed while the wallet is loaded, and hides itself after {@link BACKUP_VISIBLE_MS}, as soon as the page is hidden
 * and on the app lock. There is deliberately no copy path (SEC-13 / OD-02): the secret is never written to the
 * clipboard, so nothing has to be cleared from it either.
 * @param props.reveal Produces the backup text; called only when the user asks to see it.
 */
export function SecretBackup(props: { readonly reveal: () => string; readonly text: SecretBackupText }): ReactNode {
  const { text } = props;
  const [shown, setShown] = useState<string | undefined>(undefined);

  const hide = useCallback((): void => {
    setShown(undefined);
  }, []);

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
      <button type="button" className="btn" onClick={hide}>{text.hide}</button>
    </Notice>
  );
}
