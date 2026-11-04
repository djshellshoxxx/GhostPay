import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CameraImporter } from '../components/CameraImporter';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { QrFrame } from '../components/QrFrame';
import { MAX_SELLER_PAIRING_BYTES, compareToLoaded, exportSellerPairing, parseSellerPairing, type SellerPairingConfig } from '../lib/sellerPairing';
import type { SessionPublic } from '../lib/session';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

/** Chain ids the user has configured an RPC for. Only the ids, never the URLs. */
export function pairingChainIds(rpcUrls: Readonly<Record<string, string>>): readonly number[] {
  return Object.keys(rpcUrls).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).sort((a, b) => a - b).slice(0, 16);
}

/**
 * Device pairing for the PUBLIC seller config (meta-address, signing public key, chain ids): QR, text, copy and file.
 * Importing only previews; nothing is applied to this device. The encrypted keystore is not handled here: it contains
 * secrets and keeps its own passphrase-encrypted export and import elsewhere on this page.
 */
export function SellerPairing(props: { readonly session: SessionPublic | undefined; readonly chainIds: readonly number[] }): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const { session } = props;
  const [preview, setPreview] = useState<SellerPairingConfig | undefined>();
  const [error, setError] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Every new input (file, paste, camera, clear) and every key change starts a new generation; a late read must match it.
  const generation = useRef(0);
  const exported = useMemo((): { readonly text?: string; readonly failed: boolean } => {
    if (session === undefined) return { failed: false };
    try { return { text: exportSellerPairing(session, props.chainIds), failed: false }; } catch { return { failed: true }; }
  }, [session, props.chainIds]);

  // New keys invalidate any earlier preview, its comparison and any file read still pending.
  useEffect(() => {
    generation.current += 1;
    setPreview(undefined); setError(undefined);
    if (fileInput.current !== null) fileInput.current.value = '';
  }, [session]);

  const accept = (text: string): boolean => {
    generation.current += 1;
    try { setPreview(parseSellerPairing(text)); setError(undefined); return true; }
    catch { setPreview(undefined); setError(t('sellerKeys.pairing.refused')); return false; }
  };
  const onFile = (file: File | undefined): void => {
    const id = ++generation.current;
    setPreview(undefined); setError(undefined);
    if (file === undefined) return;
    if (file.size > MAX_SELLER_PAIRING_BYTES) { setError(t('sellerKeys.pairing.fileTooBig')); return; }
    const current = (): boolean => generation.current === id;
    void file.text().then(
      (text) => { if (current()) accept(text); },
      () => { if (current()) setError(t('sellerKeys.pairing.fileTooBig')); },
    );
  };
  const exportText = exported.text;
  const verdict = preview === undefined ? undefined : compareToLoaded(preview, session);

  return (
    <section className="panel" aria-labelledby="pairing-h">
      <h3 id="pairing-h">{t('sellerKeys.pairing.title')}</h3>
      <p>{t('sellerKeys.pairing.intro')}</p>
      {exported.failed && <Notice kind="error">{t('sellerKeys.pairing.exportFailed')}</Notice>}
      {exportText !== undefined && (
        <>
          <h4>{t('sellerKeys.pairing.exportHeading')}</h4>
          <QrFrame kind="device" text={exportText} caption={t('sellerKeys.pairing.caption')} />
          <Field label={t('sellerKeys.pairing.textLabel')}>{(id) => <textarea id={id} readOnly rows={4} spellCheck={false} value={exportText} />}</Field>
          <p>
            <CopyButton text={exportText} label={t('sellerKeys.pairing.copy')} />{' '}
            <button type="button" className="btn" onClick={() => { downloadText('ghostpay-seller-public.json', exportText, 'application/json'); }}>{t('sellerKeys.pairing.download')}</button>
          </p>
        </>
      )}
      <h4>{t('sellerKeys.pairing.importHeading')}</h4>
      <Field label={t('sellerKeys.pairing.fileLabel')}>
        {(id) => <input id={id} ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => { onFile(e.currentTarget.files?.[0]); }} />}
      </Field>
      <CameraImporter label={t('sellerKeys.pairing.importLabel')} scopeKey={session} onInputChange={() => { generation.current += 1; setPreview(undefined); setError(undefined); }} onText={(text, signal) => (signal.aborted ? false : accept(text))} />
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {preview !== undefined && verdict !== undefined && (
        <section aria-label={t('sellerKeys.pairing.previewHeading')}>
          <h4>{t('sellerKeys.pairing.previewHeading')}</h4>
          <Notice kind={verdict === 'same' ? 'info' : 'warn'}>{t(`sellerKeys.pairing.compare.${verdict}`)}</Notice>
          <dl className="kv">
            <dt>{t('sellerKeys.pairing.preview.meta')}</dt>
            <dd><Mono>{preview.metaAddress}</Mono></dd>
            <dt>{t('sellerKeys.pairing.preview.signer')}</dt>
            <dd><Mono>{preview.signerPublicKey}</Mono></dd>
            <dt>{t('sellerKeys.pairing.preview.chains')}</dt>
            <dd>{preview.chainIds.length === 0 ? t('sellerKeys.pairing.preview.noChains') : preview.chainIds.join(', ')}</dd>
          </dl>
          <p>
            <CopyButton text={preview.metaAddress} label={t('sellerKeys.pairing.copyMeta')} />{' '}
            <button type="button" className="btn" onClick={() => { generation.current += 1; setPreview(undefined); setError(undefined); }}>{t('sellerKeys.pairing.clear')}</button>
          </p>
        </section>
      )}
      <Notice kind="warn" title={t('sellerKeys.pairing.secrets.title')}>{t('sellerKeys.pairing.secrets.body')}</Notice>
    </section>
  );
}
