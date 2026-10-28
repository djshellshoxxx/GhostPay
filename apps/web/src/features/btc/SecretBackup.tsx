import { useEffect, useState, type ReactNode } from 'react';
import { Mono, Notice } from '../../components/Common';

/** A shown backup hides itself after this many milliseconds (the texts say "a minute"), and as soon as the tab is hidden. */
export const BACKUP_VISIBLE_MS = 60_000;

/** Set while a backup copied by {@link SecretBackup} may still be on the clipboard. */
let backupOnClipboard = false;

/**
 * Best-effort: empties the clipboard if a wallet backup was copied there since the last clear. Call it inside a click
 * handler (Hide, Lock): browsers allow clipboard writes only during user activation. Copies the system already made
 * (clipboard history, sync to other devices) are out of reach.
 */
export function clearCopiedBackup(): void {
  if (!backupOnClipboard) return;
  backupOnClipboard = false;
  try {
    navigator.clipboard.writeText('').catch(() => undefined);
  } catch {
    // No clipboard API in this context: nothing to clear.
  }
}

/** Every text {@link SecretBackup} shows (the Bitcoin view passes translations; Solana and TRON use English). */
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

const HIDDEN_HINT = 'It is hidden. Show it only where nobody can see your screen; it hides again after a minute, or as soon as this tab is hidden.';
const COPY_WARNING =
  'Other apps and web pages can read the clipboard, and it may be kept in a clipboard history or synced to your other devices. Copy only to paste it straight into a password manager. Hide and Lock empty the clipboard again (best effort).';

/** English texts for the views without translations (Solana: `seed`, TRON: `keys`). */
export function englishBackupText(noun: 'seed' | 'keys'): SecretBackupText {
  return {
    title: `Backup ${noun}`,
    warning: noun === 'seed' ? 'Anyone with this seed controls the wallet. It is not stored anywhere.' : 'Anyone with these keys controls the wallet. They are not stored anywhere.',
    hiddenHint: HIDDEN_HINT,
    show: `Show backup ${noun}`,
    hide: `Hide ${noun}`,
    copy: `Copy ${noun}`,
    copyWarning: COPY_WARNING,
    copyConfirm: 'Copy anyway',
    copyCancel: 'Do not copy',
    copied: 'Copied. Paste it now: Hide and Lock empty the clipboard again.',
    copyFailed: 'Copy failed: select the text manually.',
  };
}

/**
 * A wallet backup (seed or keys) that is not in the page until asked for. It is shown on request, again as often as
 * needed while the wallet is loaded, and hides itself after {@link BACKUP_VISIBLE_MS} or as soon as the page is hidden.
 * Copying takes a second, warned click; Hide empties the clipboard again, and so does each view's Lock.
 * @param props.reveal Produces the backup text; called only when the user asks to see it.
 */
export function SecretBackup(props: { readonly reveal: () => string; readonly text: SecretBackupText }): ReactNode {
  const { text } = props;
  const [shown, setShown] = useState<string | undefined>(undefined);
  const [copy, setCopy] = useState<'idle' | 'confirm' | 'copied' | 'failed'>('idle');

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
    // Marked before the write, so a Hide or Lock clicked while it is pending still clears it.
    backupOnClipboard = true;
    void (async () => {
      try {
        await navigator.clipboard.writeText(value);
        setCopy('copied');
      } catch {
        backupOnClipboard = false;
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
