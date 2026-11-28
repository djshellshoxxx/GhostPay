import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { displayMessage, type DisplayMessage } from '../lib/errors';

export function useSettingsValidation() {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const form = useRef<HTMLFormElement>(null);
  const [issue, setIssue] = useState<{ field: string; text: DisplayMessage }>();
  useLayoutEffect(() => {
    const control = issue && form.current?.elements.namedItem(issue.field);
    if (control instanceof HTMLElement) control.focus();
  }, [issue]);
  const clear = useCallback(() => setIssue(undefined), []);
  return {
    form,
    reject: (field: string, text: DisplayMessage) => setIssue({ field, text }),
    clear,
    fieldError: (field: string) => issue?.field === field ? displayMessage(issue.text, t) : undefined,
    control: (name: string) => ({ name, 'aria-invalid': issue?.field === name || undefined }),
  };
}

interface Navigation { readonly proceed: () => void; readonly cancel: () => void }

/** The shell dispatches a cancelable request before changing view or restoring browser history. */
export function SettingsLeaveGuard({ dirty, save }: { readonly dirty: boolean; readonly save: () => boolean }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [request, setRequest] = useState<Navigation>();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (!dirty) return;
    const onNavigate = (event: Event): void => {
      const navigation = (event as CustomEvent<Navigation>).detail;
      if (!navigation || typeof navigation.proceed !== 'function' || typeof navigation.cancel !== 'function') return;
      event.preventDefault();
      setRequest(navigation);
    };
    const onUnload = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener('ghostpay:settings-navigation', onNavigate);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('ghostpay:settings-navigation', onNavigate);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty]);
  useEffect(() => {
    if (request && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [request]);
  if (!request) return null;
  const finish = (action: 'stay' | 'discard' | 'save'): void => {
    dialog.current?.close();
    setRequest(undefined);
    if (action === 'stay' || (action === 'save' && !save())) request.cancel();
    else request.proceed();
  };
  // This prompt contains no setting values and must stay operable when the draft is masked.
  return createPortal(
    <dialog ref={dialog} className="panel settings-leave-dialog" aria-labelledby="settings-leave-title"
      onCancel={(event) => { event.preventDefault(); finish('stay'); }}>
      <h3 id="settings-leave-title">{t('settings.leave.title')}</h3>
      <p>{t('settings.leave.body')}</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => finish('stay')}>{t('settings.leave.stay')}</button>
        <button type="button" className="btn" onClick={() => finish('discard')}>{t('settings.leave.discard')}</button>
        <button type="button" className="btn btn-primary" onClick={() => finish('save')}>{t('settings.leave.save')}</button>
      </div>
    </dialog>, document.body,
  );
}
