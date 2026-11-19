import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { captureUserMessage, displayMessage, type DisplayMessage } from '../lib/errors';
import { describePaymentArchive, exportPaymentArchive, type ExportRpc } from '../lib/paymentKeyExport';
import type { ScanMatch } from '../lib/scanClient';
import { Notice } from './Common';
import {
  CredentialFields,
  EMPTY_CREDENTIAL,
  EMPTY_PASSPHRASE,
  NewPassphraseFields,
  credentialReady,
  newPassphraseProblem,
  readCredential,
  useExportOperation,
  useExportT,
  useLatestExportT,
  withoutPassphrase,
  type CredentialInput,
  type ExportMessage,
  type NewPassphrase,
} from './StealthExportCommon';
import { chainLabel, startDownload } from './StealthExportPayment';

/**
 * "Export all payment keys (encrypted)" for the scan results (spec 18 flow 2): every discovered distinct payment key of
 * the selected chain in one encrypted, bounded archive (scope `all-discovered`). The count and chain are shown before the
 * user confirms; there is no plaintext mode and master keys are never included.
 */
export function StealthExportArchive(props: { readonly matches: readonly ScanMatch[]; readonly chainId: number; readonly rpc: ExportRpc | undefined; readonly announce: (message: string) => void }): ReactNode {
  const t = useExportT();
  const latestT = useLatestExportT(t);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<ExportMessage | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<CredentialInput>(EMPTY_CREDENTIAL);
  const [newPass, setNewPass] = useState<NewPassphrase>(EMPTY_PASSPHRASE);
  const clearTyped = (): void => { setCredential(withoutPassphrase); setNewPass(EMPTY_PASSPHRASE); };
  const reset = (): void => { clearTyped(); setBusy(false); };
  const op = useExportOperation(reset);

  // A chain switch cancels the export and closes the panel: its count and chain would be stale.
  const shownChain = useRef(props.chainId);
  useEffect(() => {
    if (shownChain.current === props.chainId) return;
    shownChain.current = props.chainId;
    op.stop(); reset(); setMessage(undefined); setOpen(false);
  }, [props.chainId]);

  const fail = (text: DisplayMessage): void => { setMessage({ kind: 'error', text }); };
  const done = (text: DisplayMessage): void => {
    setMessage({ kind: 'ok', text });
    props.announce(displayMessage(text, latestT.current));
  };
  const close = (): void => { op.stop(); reset(); setMessage(undefined); setOpen(false); };

  let summary: { readonly chainId: number; readonly count: number } | undefined;
  let refusal: DisplayMessage | undefined;
  try { summary = describePaymentArchive(props.matches); } catch (error) { refusal = captureUserMessage(error); }

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const problem = newPassphraseProblem(newPass);
    if (problem !== undefined) { fail(problem); return; }
    const controller = op.start();
    const matches = props.matches; const rpc = props.rpc; const passphrase = newPass.pass; const input = credential;
    setBusy(true);
    setMessage({ kind: 'ok', text: { key: 'stealthExport.status.working' } });
    void (async () => {
      try {
        const proof = await readCredential(input);
        if (!op.current(controller)) return;
        const file = await exportPaymentArchive(matches, 'all-discovered', proof, passphrase, { rpc, signal: controller.signal });
        if (!op.current(controller)) return;
        reset();
        if (startDownload(file, fail)) done({ key: 'stealthExport.archive.done' });
      } catch (error) {
        if (!op.current(controller)) return;
        reset();
        fail(captureUserMessage(error));
      }
    })();
  };

  return (
    <div className="stealth-export" data-testid="payment-keys-archive">
      <p>
        <button type="button" className="btn" aria-expanded={open} aria-controls={panelId} onClick={() => { if (open) close(); else setOpen(true); }}>
          {t('stealthExport.archive.open')}
        </button>
      </p>
      {open && (
        <section id={panelId} className="panel stack" aria-labelledby={`${panelId}-h`}>
          <h4 id={`${panelId}-h`}>{t('stealthExport.archive.heading')}</h4>
          {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
          {summary === undefined ? (
            <Notice kind="error">{displayMessage(refusal ?? { key: 'error.paymentKeyExport.noPayments' }, t)}</Notice>
          ) : (
            <>
              <p data-testid="payment-keys-archive-summary"><strong>{t('stealthExport.archive.summary', { count: summary.count, chain: chainLabel(summary.chainId, t) })}</strong></p>
              <p className="hint">{t('stealthExport.archive.hint')}</p>
              <form onSubmit={onSubmit} className="stack" autoComplete="off">
                <CredentialFields value={credential} onChange={setCredential} disabled={busy} />
                <NewPassphraseFields value={newPass} onChange={setNewPass} />
                <button type="submit" className="btn" data-testid="payment-keys-archive-download" disabled={busy || !credentialReady(credential)}>{t('stealthExport.archive.download')}</button>
                {busy && <button type="button" className="btn" onClick={() => { op.stop(); reset(); setMessage(undefined); }}>{t('stealthExport.cancel')}</button>}
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// i18n-use: stealthExport.archive.done stealthExport.status.working
