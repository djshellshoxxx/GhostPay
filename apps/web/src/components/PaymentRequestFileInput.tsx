import { ControlTip } from './ControlTips';
import { MAX_PAYMENT_REQUEST_FILE_BYTES, parsePaymentRequestFile } from '@ghostpay/invoice-schema';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { MessageKey } from '../i18n/catalog';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { subscribeAppLock } from '../lib/appLock';
import { captureSessionVersionGuard } from '../lib/session';
import { Field, Notice } from './Common';

export interface PaymentRequestFileInputProps {
  /** The fragment is still untrusted: the caller must open and review it with the canonical invoice parser. */
  readonly onText: (fragment: string, signal: AbortSignal) => boolean | void | Promise<boolean | void>;
  /** Identity of the owning invoice, profile, pins and session. A change discards pending reads. */
  readonly scopeKey?: unknown;
  /**
   * Clear the previous preview before inspecting a replacement. The optional returned guard binds this
   * read to the parent's input revision, so another source (such as QR) can supersede a slow file read.
   */
  readonly onInputChange?: (reason: InputChangeReason) => void | (() => boolean);
  /** Bump to discard this input's pending read and status when another import source supersedes it. */
  readonly supersededEpoch?: number;
}

/** 'select' starts a new file read; 'invalidate' is a lock, hide or disclosure close with no file involved. */
export type InputChangeReason = 'select' | 'invalidate';

interface ImportRequest {
  readonly controller: AbortController;
  readonly scope: unknown;
  readonly parentCurrent: (() => boolean) | undefined;
  readonly assertSession: () => void;
}

type FileMessage = { readonly key: MessageKey; readonly error: boolean };

/** Selected files stay in memory and enter the same explicit preview as QR input. No URL is followed. */
export function PaymentRequestFileInput({ onText, scopeKey, onInputChange, supersededEpoch }: PaymentRequestFileInputProps): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const root = useRef<HTMLDivElement | null>(null);
  const live = useRef(false);
  const pending = useRef<ImportRequest | undefined>(undefined);
  const observer = useRef<MutationObserver | undefined>(undefined);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
  const callback = useRef(onText); callback.current = onText;
  const inputChanged = useRef(onInputChange); inputChanged.current = onInputChange;
  const [message, setMessage] = useState<FileMessage | undefined>(undefined);

  const discard = useCallback((): void => {
    pending.current?.controller.abort();
    pending.current = undefined;
    if (live.current) setMessage(undefined);
  }, []);
  const closed = (records: readonly MutationRecord[]): boolean => records.some((record) => record.attributeName === 'open' && record.oldValue !== null);
  const visible = (): boolean => {
    if (!live.current || document.visibilityState === 'hidden') return false;
    let element: HTMLElement | null = root.current;
    while (element !== null) {
      if (element instanceof HTMLDetailsElement && !element.open) return false;
      element = element.parentElement;
    }
    return root.current !== null;
  };
  const current = (request: ImportRequest): boolean => {
    // Closing and immediately reopening a disclosure must not revive the old read before toggle fires.
    if (closed(observer.current?.takeRecords() ?? [])) {
      discard();
      inputChanged.current?.('invalidate');
      return false;
    }
    if (pending.current !== request || request.controller.signal.aborted || request.scope !== currentScope.current || !visible()) return false;
    try {
      request.assertSession();
      return request.parentCurrent === undefined || request.parentCurrent();
    } catch { return false; }
  };

  useEffect(() => {
    live.current = true;
    const invalidate = (): void => { discard(); inputChanged.current?.('invalidate'); };
    // A payer or a session retaining its sole key copy can lock without changing session identity.
    const unsubscribeLock = subscribeAppLock(invalidate);
    const watch = new MutationObserver((records) => { if (closed(records)) invalidate(); });
    observer.current = watch;
    let element: HTMLElement | null = root.current;
    while (element !== null) {
      if (element instanceof HTMLDetailsElement) watch.observe(element, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });
      element = element.parentElement;
    }
    const visibilityChanged = (): void => { if (document.visibilityState === 'hidden') invalidate(); };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      live.current = false;
      discard();
      unsubscribeLock();
      watch.disconnect();
      if (observer.current === watch) observer.current = undefined;
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [discard]);
  useEffect(() => { discard(); }, [scopeKey, supersededEpoch, discard]);

  const choose = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    // Snapshot before resetting: same-file retries work and a late result cannot erase a newer selection.
    event.currentTarget.value = '';
    discard();
    const guard = inputChanged.current?.('select');
    const parentCurrent = typeof guard === 'function' ? guard : undefined;
    if (file === undefined || !visible()) return;
    if (!Number.isSafeInteger(file.size) || file.size < 1) {
      setMessage({ key: 'requestFile.invalid', error: true });
      return;
    }
    if (file.size > MAX_PAYMENT_REQUEST_FILE_BYTES) {
      setMessage({ key: 'requestFile.tooLarge', error: true });
      return;
    }
    const request: ImportRequest = {
      controller: new AbortController(),
      scope: currentScope.current,
      parentCurrent,
      assertSession: captureSessionVersionGuard(),
    };
    pending.current = request;
    setMessage({ key: 'requestFile.reading', error: false });
    void (async () => {
      try {
        const bytes = await file.arrayBuffer();
        if (!current(request)) return;
        if (bytes.byteLength > MAX_PAYMENT_REQUEST_FILE_BYTES) {
          setMessage({ key: 'requestFile.tooLarge', error: true });
          return;
        }
        if (bytes.byteLength !== file.size) {
          setMessage({ key: 'requestFile.invalid', error: true });
          return;
        }
        // Preserve BOMs so the strict JSON parser rejects them rather than silently repairing the file.
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        const decoded = parsePaymentRequestFile(text);
        if (!current(request)) return;
        const accepted = await callback.current(decoded.fragment, request.controller.signal);
        if (!current(request)) return;
        setMessage({ key: accepted === true ? 'requestFile.ready' : 'requestFile.rejected', error: accepted !== true });
      } catch {
        if (current(request)) setMessage({ key: 'requestFile.invalid', error: true });
      } finally {
        if (pending.current === request) {
          if (!current(request)) discard();
          else pending.current = undefined;
        }
      }
    })();
  };

  return (
    <div className="stack" ref={root}>
      <Field label={t('requestFile.label')} hint={t('requestFile.hint')}>
        {(id, describedBy) => <ControlTip message="requestFile.hint"><input id={id} aria-describedby={describedBy} type="file" accept="application/json,.gpr.json,.json" onChange={choose} /></ControlTip>}
      </Field>
      {message !== undefined && (message.error && message.key !== 'requestFile.rejected'
        ? <Notice kind="error">{t(message.key)}</Notice>
        // The owning view shows the single alert with the specific refusal reason; this stays a polite status.
        : <ControlTip message="tips.requestStatus"><p role="status">{t(message.key)}</p></ControlTip>)}
    </div>
  );
}

// i18n-use: requestFile.invalid requestFile.tooLarge requestFile.reading requestFile.ready requestFile.rejected
