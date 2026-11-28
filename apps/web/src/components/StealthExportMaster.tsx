import { ControlTip } from './ControlTips';
import { useState, type FormEvent, type ReactNode } from 'react';
import { captureUserMessage, displayMessage, type DisplayMessage } from '../lib/errors';
import { exportMasterBackup } from '../lib/paymentKeyExport';
import type { StealthExportFile } from '../lib/paymentKeyExport';
import { Notice } from './Common';
import { StealthExportVerification } from './StealthExportVerification';
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
  type CredentialInput,
  type ExportMessage,
  type NewPassphrase,
} from './StealthExportCommon';
import { startDownload } from './StealthExportPayment';

/**
 * "Master stealth key backup (encrypted)" (spec 18 flow 3): the loaded spending and viewing keys as an encrypted
 * `ghostpay-stealth-master-v1` file, after re-authentication. Separate from payment-key archives and from the legacy
 * keystore; the invoice-signing key is never included.
 */
export function StealthExportMaster(props: { readonly announce: (message: string) => void }): ReactNode {
  const t = useExportT();
  const latestT = useLatestExportT(t);
  const [generated, setGenerated] = useState<StealthExportFile | undefined>(undefined);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [message, setMessage] = useState<ExportMessage | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<CredentialInput>(EMPTY_CREDENTIAL);
  const [newPass, setNewPass] = useState<NewPassphrase>(EMPTY_PASSPHRASE);
  // Main convention (07722292): every outcome clears the whole credential, including a selected keystore file.
  const clearTyped = (): void => { setCredential(EMPTY_CREDENTIAL); setNewPass(EMPTY_PASSPHRASE); };
  const reset = (): void => { setGenerated(undefined); setDownloadStarted(false); clearTyped(); setBusy(false); setMessage(undefined); };
  const op = useExportOperation(reset);

  const fail = (text: DisplayMessage): void => { setMessage({ kind: 'error', text }); };
  const done = (text: DisplayMessage): void => {
    setMessage({ kind: 'ok', text });
    props.announce(displayMessage(text, latestT.current));
  };
  const download = (file: StealthExportFile): void => {
    if (startDownload(file, fail)) { setDownloadStarted(true); done({ key: 'stealthExport.master.done' }); }
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const problem = newPassphraseProblem(newPass);
    if (problem !== undefined) { fail(problem); return; }
    const controller = op.start();
    const passphrase = newPass.pass; const input = credential;
    setGenerated(undefined); setDownloadStarted(false); setBusy(true);
    setMessage({ kind: 'ok', text: { key: 'stealthExport.status.working' } });
    void (async () => {
      try {
        const proof = await readCredential(input);
        if (!op.current(controller)) return;
        const file = await exportMasterBackup(proof, passphrase, { signal: controller.signal });
        if (!op.current(controller)) return;
        reset();
        setGenerated(file); download(file);
      } catch (error) {
        if (!op.current(controller)) return;
        reset();
        fail(captureUserMessage(error));
      }
    })();
  };

  return (
    <section className="panel" aria-labelledby="stealth-master-h" data-testid="stealth-master-backup">
      <h3 id="stealth-master-h">{t('stealthExport.master.heading')}</h3>
      <p>{t('stealthExport.master.body')}</p>
      {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
      <form onSubmit={onSubmit} className="stack" autoComplete="off">
        <CredentialFields value={credential} onChange={setCredential} disabled={busy} />
        <NewPassphraseFields value={newPass} onChange={setNewPass} disabled={busy} />
        <ControlTip message="stealthExport.verify.masterScope"><button type="submit" className="btn" data-testid="stealth-master-download" disabled={busy || !credentialReady(credential)}>{t('stealthExport.master.download')}</button></ControlTip>
        {busy && <ControlTip message="tips.cancel"><button type="button" className="btn" onClick={() => { op.stop(); reset(); setMessage(undefined); }}>{t('stealthExport.cancel')}</button></ControlTip>}
      </form>
      {generated !== undefined && <StealthExportVerification file={generated} downloadStarted={downloadStarted} onRetryDownload={() => { download(generated); }} announce={props.announce} />}
    </section>
  );
}

// i18n-use: stealthExport.master.done stealthExport.status.working
