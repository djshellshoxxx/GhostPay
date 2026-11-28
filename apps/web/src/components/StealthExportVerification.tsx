import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { UserFacingError, captureUserMessage, displayMessage, type DisplayMessage } from '../lib/errors';
import { verifyStealthExport, type StealthExportFile, type VerifiedStealthExport } from '../lib/paymentKeyExport';
import { STEALTH_EXPORT_LIMITS } from '../lib/stealthExport';
import { Field, Notice } from './Common';
import { useExportOperation, useExportT, useLatestExportT } from './StealthExportCommon';

/**
 * A download request does not prove retention. Verify the user's saved copy against the exact encrypted file generated
 * by this panel, then authenticate and validate every key without installing it. This never changes seller custody:
 * a payment file restores only its listed payment keys, and a master backup omits the invoice-signing key.
 */
export function StealthExportVerification(props: {
  readonly file: StealthExportFile;
  readonly downloadStarted: boolean;
  readonly onRetryDownload: () => void;
  readonly announce: (message: string) => void;
}): ReactNode {
  const t = useExportT();
  const latestT = useLatestExportT(t);
  const headingId = useId();
  const retainedId = useId();
  const [retained, setRetained] = useState(false);
  const [selected, setSelected] = useState<File | undefined>(undefined);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<VerifiedStealthExport | undefined>(undefined);
  const [error, setError] = useState<DisplayMessage | undefined>(undefined);
  const expected = useRef(props.file);

  const reset = (): void => {
    setRetained(false); setSelected(undefined); setPassphrase(''); setBusy(false); setVerified(undefined); setError(undefined);
  };
  const op = useExportOperation(reset, [props.file]);
  useEffect(() => {
    if (expected.current === props.file) return;
    expected.current = props.file;
    op.stop(); reset();
  }, [props.file]);

  const cancel = (): void => {
    op.stop(); setPassphrase(''); setBusy(false); setVerified(undefined); setError(undefined);
  };

  const onVerify = (event: FormEvent): void => {
    event.preventDefault();
    if (!retained || selected === undefined) return;
    const controller = op.start();
    const file = selected; const generated = props.file; const pass = passphrase;
    setBusy(true); setVerified(undefined); setError(undefined);
    void (async () => {
      try {
        if (file.size > STEALTH_EXPORT_LIMITS.keypairFileBytes) throw new UserFacingError({ key: 'error.stealthExport.tooLarge' });
        const text = await file.text();
        if (!op.current(controller)) return;
        // These exports are ASCII. File.text() strips a UTF-8 BOM, so compare byte length as well as decoded text.
        // A different valid backup cannot verify this download. Filenames and parsed public headers are insufficient.
        if (file.size !== generated.text.length || text !== generated.text) throw new UserFacingError({ key: 'stealthExport.verify.differentFile' });
        // The recovery path authenticates and validates every key (payment or master) and disposes them before returning.
        const result = await verifyStealthExport(text, pass, { signal: controller.signal });
        if (!op.current(controller) || expected.current !== generated) return;
        setVerified(result);
        props.announce(latestT.current('stealthExport.verify.savedSuccess'));
      } catch (failure) {
        if (op.current(controller)) setError(captureUserMessage(failure));
      } finally {
        if (op.current(controller)) { setBusy(false); setPassphrase(''); }
      }
    })();
  };

  const visibleVerified = expected.current === props.file ? verified : undefined;
  const visibleRetained = expected.current === props.file && retained;

  return (
    <section className="stack" aria-labelledby={headingId} data-testid="stealth-export-verification">
      <h4 id={headingId}>{t('stealthExport.verify.heading')}</h4>
      <p role="status" aria-live="polite" data-testid="stealth-export-backup-state">
        {visibleVerified !== undefined ? t('stealthExport.verify.savedSuccess') : visibleRetained ? t('stealthExport.verify.retained') : t(props.downloadStarted ? 'stealthExport.verify.downloadStarted' : 'stealthExport.verify.generated')}
      </p>
      {visibleVerified === undefined && <p><button type="button" className="btn" disabled={busy} onClick={props.onRetryDownload}>{t('stealthExport.verify.retryDownload')}</button></p>}
      <p className="hint">{t('stealthExport.verify.scope')}</p>
      <div className="check">
        <input id={retainedId} type="checkbox" checked={visibleRetained} onChange={(event) => { cancel(); setRetained(event.target.checked); }} />
        <label htmlFor={retainedId}>{t('stealthExport.verify.keep')}</label>
      </div>
      <form onSubmit={onVerify} className="stack" autoComplete="off">
        <Field label={t('stealthExport.verify.file')}>{(id) => <>
          <input id={id} type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
            if (file === undefined) return;
            cancel(); setSelected(file);
          }} />
          {selected !== undefined && <p className="hint">{t('upload.selectedFile')}</p>}
        </>}</Field>
        <Field label={t('stealthExport.verify.passphrase')}>
          {(id) => <input id={id} type="password" autoComplete="off" value={passphrase} disabled={busy} onChange={(event) => { setPassphrase(event.target.value); setVerified(undefined); setError(undefined); }} />}
        </Field>
        <button type="submit" className="btn" disabled={busy || !retained || selected === undefined || passphrase === ''}>{t('stealthExport.verify.submit')}</button>
        {busy && <button type="button" className="btn" onClick={cancel}>{t('stealthExport.cancel')}</button>}
      </form>
      {busy && <p role="status">{t('stealthExport.open.working')}</p>}
      {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
      {visibleVerified?.kind === 'master' && <p className="hint">{t('stealthExport.verify.masterScope')}</p>}
    </section>
  );
}

// i18n-use: stealthExport.verify.differentFile stealthExport.verify.savedSuccess stealthExport.verify.downloadStarted stealthExport.verify.generated
