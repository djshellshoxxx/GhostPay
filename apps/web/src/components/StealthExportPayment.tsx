import { ControlTip } from './ControlTips';
import { findChain } from '@ghostpay/chain-adapters';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { captureUserMessage, displayMessage, type DisplayMessage } from '../lib/errors';
import type { SecretExportCredential } from '../lib/keyVault';
import { exportEncryptedPayment, exportPublicRecord, exportRawPrivateKey, type ExportRpc, type StealthExportFile } from '../lib/paymentKeyExport';
import type { ScanMatch } from '../lib/scanClient';
import { Mono, Notice, downloadText } from './Common';
import { StealthExportVerification } from './StealthExportVerification';
import {
  CredentialFields,
  EMPTY_CREDENTIAL,
  EMPTY_PASSPHRASE,
  NewPassphraseFields,
  credentialReady,
  exportSelectionIdentity,
  newPassphraseProblem,
  readCredential,
  useExportOperation,
  useExportT,
  useLatestExportT,
  type CredentialInput,
  type ExportMessage,
  type ExportT,
  type NewPassphrase,
} from './StealthExportCommon';

export function chainLabel(chainId: number, t: ExportT): string {
  const name = findChain(chainId)?.name;
  return name === undefined ? t('stealthExport.chainUnknown', { id: String(chainId) }) : t('stealthExport.details.chainValue', { name, id: String(chainId) });
}

/**
 * Starts a browser download of an export; a blocked download produced no file, so it is reported and the form stays usable.
 * @returns Whether the download was started.
 */
export function startDownload(file: StealthExportFile, fail: (text: DisplayMessage) => void): boolean {
  try {
    downloadText(file.filename, file.text, file.type);
    return true;
  } catch {
    fail({ key: 'stealthExport.downloadBlocked' });
    return false;
  }
}

/**
 * "Payment details" of one scan match (spec 18 flow 1): chain, address and key ownership (labelled apart from receipt
 * status), with a public record, an encrypted keypair and a gated raw-key download. Nothing is derived, downloaded or
 * revealed until the user asks; closing the panel, a chain change, the idle lock or a key change cancels a running export.
 */
export function StealthExportPayment(props: { readonly match: ScanMatch; readonly chainId: number; readonly rpc: ExportRpc | undefined; readonly announce: (message: string) => void }): ReactNode {
  const t = useExportT();
  const latestT = useLatestExportT(t);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [generated, setGenerated] = useState<StealthExportFile | undefined>(undefined);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [message, setMessage] = useState<ExportMessage | undefined>(undefined);
  const [busy, setBusy] = useState<'encrypted' | 'raw' | undefined>(undefined);
  const [credential, setCredential] = useState<CredentialInput>(EMPTY_CREDENTIAL);
  const [newPass, setNewPass] = useState<NewPassphrase>(EMPTY_PASSPHRASE);
  const [rawStep, setRawStep] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const clearTyped = (): void => {
    setCredential(EMPTY_CREDENTIAL); setNewPass(EMPTY_PASSPHRASE); setRawStep(false);
  };
  const reset = (): void => { setGenerated(undefined); setDownloadStarted(false); clearTyped(); setBusy(undefined); setMessage(undefined); };
  const identity = exportSelectionIdentity([props.match]);
  const op = useExportOperation(reset, [props.chainId, identity, props.rpc]);

  // Consent and pending results belong to this exact payment and the RPC selected for it.
  const shownInput = useRef({ chainId: props.chainId, identity, rpc: props.rpc });
  useEffect(() => {
    const previous = shownInput.current;
    if (previous.chainId === props.chainId && previous.identity === identity && previous.rpc === props.rpc) return;
    shownInput.current = { chainId: props.chainId, identity, rpc: props.rpc };
    op.stop(); reset(); setMessage(undefined);
  }, [props.chainId, identity, props.rpc]);
  useEffect(() => { if (rawStep) confirmRef.current?.focus(); }, [rawStep]);

  const fail = (text: DisplayMessage): void => { setMessage({ kind: 'error', text }); };
  const done = (text: DisplayMessage): void => {
    setMessage({ kind: 'ok', text });
    props.announce(displayMessage(text, latestT.current));
  };
  const retryDownload = (): void => {
    if (generated !== undefined && startDownload(generated, fail)) {
      setDownloadStarted(true); done({ key: 'stealthExport.details.encrypted.done' });
    }
  };
  const close = (): void => { op.stop(); reset(); setMessage(undefined); setOpen(false); };

  const onPublic = (): void => {
    try {
      const file = exportPublicRecord(props.match);
      if (startDownload(file, fail)) done({ key: 'stealthExport.details.public.done' });
    } catch (error) {
      fail(captureUserMessage(error));
    }
  };

  const run = (kind: 'encrypted' | 'raw', exportFile: (credential: SecretExportCredential, signal: AbortSignal) => Promise<StealthExportFile>, success: DisplayMessage): void => {
    const controller = op.start();
    const input = credential;
    if (kind === 'encrypted') { setGenerated(undefined); setDownloadStarted(false); }
    setBusy(kind);
    setMessage({ kind: 'ok', text: { key: 'stealthExport.status.working' } });
    void (async () => {
      try {
        const proof = await readCredential(input);
        if (!op.current(controller)) return;
        const file = await exportFile(proof, controller.signal);
        if (!op.current(controller)) return;
        clearTyped(); setBusy(undefined);
        if (kind === 'encrypted') setGenerated(file);
        if (startDownload(file, fail)) {
          if (kind === 'encrypted') setDownloadStarted(true);
          done(success);
        }
      } catch (error) {
        if (!op.current(controller)) return;
        clearTyped(); setBusy(undefined);
        fail(captureUserMessage(error));
      }
    })();
  };

  const onEncrypted = (e: FormEvent): void => {
    e.preventDefault();
    const problem = newPassphraseProblem(newPass);
    if (problem !== undefined) { fail(problem); return; }
    const match = props.match; const rpc = props.rpc; const passphrase = newPass.pass;
    run('encrypted', (proof, signal) => exportEncryptedPayment(match, proof, passphrase, { rpc, signal }), { key: 'stealthExport.details.encrypted.done' });
  };

  const onRaw = (): void => {
    const match = props.match; const rpc = props.rpc;
    run('raw', (proof, signal) => exportRawPrivateKey(match, proof, true, { rpc, signal }), { key: 'stealthExport.raw.done' });
  };

  const m = props.match;
  return (
    <div className="stealth-export" data-testid="payment-details">
      <ControlTip message="stealthExport.details.ownership.body"><button type="button" className="btn" aria-expanded={open} aria-controls={panelId} onClick={() => { if (open) close(); else setOpen(true); }}>
        {t('stealthExport.details.toggle')}
      </button></ControlTip>
      {open && (
        <section id={panelId} className="panel stack" aria-label={t('stealthExport.details.toggle')}>
          {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
          <dl>
            <dt>{t('stealthExport.details.chain')}</dt>
            <dd>{chainLabel(m.chainId, t)}</dd>
            <dt>{t('stealthExport.details.address')}</dt>
            <dd><Mono>{m.stealthAddress}</Mono></dd>
          </dl>
          <Notice kind="info" title={t('stealthExport.details.ownership.title')}>
            <p>{t('stealthExport.details.ownership.body')}</p>
            <p>{t('stealthExport.details.futureDeposits')}</p>
          </Notice>

          <h4>{t('stealthExport.details.public.heading')}</h4>
          <p className="hint">{t('stealthExport.details.public.hint')}</p>
          <p><ControlTip message="stealthExport.details.public.hint"><button type="button" className="btn" data-testid="stealth-export-public" onClick={onPublic}>{t('stealthExport.details.public.download')}</button></ControlTip></p>

          <Notice kind="warn">{t('stealthExport.details.rpcPrivacy')}</Notice>
          <CredentialFields value={credential} onChange={(next) => { setCredential(next); setRawStep(false); }} disabled={busy !== undefined} />

          <h4>{t('stealthExport.details.encrypted.heading')}</h4>
          <p className="hint">{t('stealthExport.details.encrypted.hint')}</p>
          <form onSubmit={onEncrypted} className="stack" autoComplete="off">
            <NewPassphraseFields value={newPass} onChange={setNewPass} disabled={busy !== undefined} />
            <ControlTip message="stealthExport.details.encrypted.hint"><button type="submit" className="btn" data-testid="stealth-export-encrypted" disabled={busy !== undefined || !credentialReady(credential)}>{t('stealthExport.details.encrypted.download')}</button></ControlTip>
          </form>

          {generated !== undefined && <StealthExportVerification file={generated} downloadStarted={downloadStarted} onRetryDownload={retryDownload} announce={props.announce} />}

          <h4>{t('stealthExport.details.raw.heading')}</h4>
          <p className="hint">{t('stealthExport.details.raw.hint')}</p>
          {!rawStep ? (
            <p><ControlTip message="stealthExport.details.raw.hint"><button type="button" className="btn" data-testid="stealth-export-raw" disabled={busy !== undefined || !credentialReady(credential)} onClick={() => { setMessage(undefined); setRawStep(true); }}>{t('stealthExport.details.raw.start')}</button></ControlTip></p>
          ) : (
            <div ref={confirmRef} tabIndex={-1} role="group" aria-label={t('stealthExport.raw.confirm.title')}>
              <Notice kind="warn" title={t('stealthExport.raw.confirm.title')}>{t('stealthExport.raw.confirm.body')}</Notice>
              <ControlTip message="tips.rawKey"><button type="button" className="btn btn-danger" data-testid="stealth-export-raw-confirm" disabled={busy !== undefined} onClick={onRaw}>{t('stealthExport.raw.confirm.download')}</button></ControlTip>{' '}
              <ControlTip message="tips.cancel"><button type="button" className="btn" onClick={() => { op.stop(); reset(); }}>{t('stealthExport.cancel')}</button></ControlTip>
            </div>
          )}
          {busy !== undefined && !rawStep && <p><ControlTip message="tips.cancel"><button type="button" className="btn" onClick={() => { op.stop(); reset(); setMessage(undefined); }}>{t('stealthExport.cancel')}</button></ControlTip></p>}
        </section>
      )}
    </div>
  );
}

// i18n-use: stealthExport.downloadBlocked stealthExport.details.chainValue stealthExport.chainUnknown stealthExport.details.public.done stealthExport.details.encrypted.done stealthExport.raw.done stealthExport.status.working
