import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CameraImporter } from '../components/CameraImporter';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { QrFrame } from '../components/QrFrame';
import { MAX_SELLER_PAIRING_BYTES, isSupportedPairingChain, compareToLoaded, exportSellerPairing, parseSellerPairing, type SellerPairingConfig } from '../lib/sellerPairing';
import type { MessageKey } from '../i18n/catalog';
import type { SessionPublic } from '../lib/session';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

/** Enabled testnet chain ids with a configured RPC. Only the ids, never the URLs. */
export function pairingChainIds(rpcUrls: Readonly<Record<string, string>>): readonly number[] {
  return Object.keys(rpcUrls).filter((key) => rpcUrls[key]?.trim() !== '').map(Number).filter(isSupportedPairingChain).sort((a, b) => a - b).slice(0, 16);
}

// i18n-use: sellerKeys.pairing.refused sellerKeys.pairing.fileTooBig
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
  const [error, setError] = useState<MessageKey | undefined>();
  const [inputEpoch, setInputEpoch] = useState(0);
  const importScope = useMemo(() => ({ session, inputEpoch }), [session, inputEpoch]);
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
    return () => { generation.current += 1; };
  }, [session]);

  const clear = (): void => {
    generation.current += 1;
    setInputEpoch((epoch) => epoch + 1);
    setPreview(undefined); setError(undefined);
    if (fileInput.current !== null) fileInput.current.value = '';
  };

  const accept = (text: string): boolean => {
    generation.current += 1;
    try { setPreview(parseSellerPairing(text)); setError(undefined); return true; }
    catch { setPreview(undefined); setError('sellerKeys.pairing.refused'); return false; }
  };
  const onFile = (file: File | undefined): void => {
    const id = ++generation.current;
    // A file choice replaces any pending camera/paste action, including a permission request.
    setInputEpoch((epoch) => epoch + 1);
    setPreview(undefined); setError(undefined);
    if (file === undefined) return;
    if (file.size > MAX_SELLER_PAIRING_BYTES) { setError('sellerKeys.pairing.fileTooBig'); return; }
    const current = (): boolean => generation.current === id;
    void file.text().then(
      (text) => { if (current()) accept(text); },
      () => { if (current()) setError('sellerKeys.pairing.fileTooBig'); },
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
        {(id) => <input id={id} ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; onFile(file); }} />}
      </Field>
      <CameraImporter label={t('sellerKeys.pairing.importLabel')} scopeKey={importScope} onInputChange={() => { generation.current += 1; setPreview(undefined); setError(undefined); }} onText={(text, signal) => (signal.aborted ? false : accept(text))} />
      <button type="button" className="btn" onClick={clear}>{t('sellerKeys.pairing.clear')}</button>
      {error !== undefined && <Notice kind="error">{t(error)}</Notice>}
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
            <CopyButton text={preview.metaAddress} label={t('sellerKeys.pairing.copyMeta')} />
          </p>
        </section>
      )}
      <Notice kind="warn" title={t('sellerKeys.pairing.secrets.title')}>{t('sellerKeys.pairing.secrets.body')}</Notice>
    </section>
  );
}
