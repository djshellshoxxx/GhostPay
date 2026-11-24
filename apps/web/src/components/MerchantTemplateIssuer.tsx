import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { MerchantProfile } from '@ghostpay/invoice-schema';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { formatUnits, fiatDecimals } from '../lib/format';
import { buildMerchantTemplateInvoice, merchantTemplateAmount, merchantTemplateAssets } from '../lib/merchantTemplate';
import { getSessionBackup, getSessionPublic, subscribeSession, subscribeSessionBackup, type SessionPublic } from '../lib/session';
import { useServices } from '../lib/services';
import { CopyButton, Field, Mono, Notice } from './Common';

/** A local merchant authoring action. A payer profile never grants access to the matching signing key. */
export function MerchantTemplateIssuer(props: { readonly profile: MerchantProfile; readonly templateId: string; readonly requestedAmount?: string }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const services = useServices();
  const session = useSyncExternalStore(subscribeSession, getSessionPublic);
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const assets = merchantTemplateAssets(props.profile);
  const [assetIndex, setAssetIndex] = useState('0');
  const [tokenAmount, setTokenAmount] = useState('');
  const [amountRequest, setAmountRequest] = useState(props.requestedAmount ?? '');
  const [feePolicy, setFeePolicy] = useState<'seller_pays' | 'payer_pays'>('seller_pays');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DisplayMessage | undefined>();
  const [created, setCreated] = useState<{ readonly link: string; readonly session: SessionPublic } | undefined>();
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => { generation.current += 1; setBusy(false); setCreated(undefined); setError(undefined); }, [session]);
  const template = props.profile.templates.find((value) => value.id === props.templateId);
  const effectiveAmount = merchantTemplateAmount(props.profile, props.templateId, amountRequest === '' ? undefined : amountRequest);
  const selected = assets[Number(assetIndex)];
  const authority = session !== undefined && session.signerPublicKey === props.profile.signer;
  const backedUp = backup?.verified === true || backup?.waived === true;
  const invalidate = (): void => { generation.current += 1; setCreated(undefined); setError(undefined); setBusy(false); };
  const issue = (): void => {
    if (!authority || session === undefined || selected === undefined || busy || !backedUp || effectiveAmount === undefined) return;
    const revision = ++generation.current;
    const captured = session;
    setBusy(true); setCreated(undefined); setError(undefined);
    void buildMerchantTemplateInvoice({
      profile: props.profile, templateId: props.templateId,
      ...(amountRequest === '' ? {} : { requestedAmount: amountRequest }),
      chainId: selected.chainId, token: selected.token, tokenAmount, feePolicy,
      baseUrl: services.baseUrl(), nowSeconds: () => Math.floor(services.nowMs() / 1000),
      isCurrent: () => generation.current === revision && getSessionPublic() === captured,
    }).then((result) => {
      if (generation.current !== revision || getSessionPublic() !== captured) return;
      setCreated({ link: result.link, session: captured }); setBusy(false);
    }, (failure: unknown) => {
      if (generation.current !== revision || getSessionPublic() !== captured) return;
      setError(captureUserMessage(failure)); setBusy(false);
    });
  };
  return (
    <details>
      <summary>{t('merchantProfile.issue.title')}</summary>
      <p>{t('merchantProfile.issue.authority')}</p>
      {authority && template !== undefined && <>
        {!backedUp && <Notice kind="warn">{t('merchantProfile.issue.backup')}</Notice>}
        <p>{t('merchantProfile.issue.fixed')}</p>
        {assets.length === 0 ? <Notice kind="warn">{t('merchantProfile.issue.none')}</Notice> : <>
          <Field label={t('merchantProfile.issue.token')}>
            {(id) => <select id={id} value={assetIndex} onChange={(event) => { invalidate(); setAssetIndex(event.target.value); }}>
              {assets.map((asset, index) => <option key={`${String(asset.chainId)}:${asset.token}`} value={String(index)}>{asset.chainName} / {asset.symbol} / {asset.token}</option>)}
            </select>}
          </Field>
          <dl className="details"><dt>{t('merchantProfile.issue.chain')}</dt><dd>{selected?.chainName}</dd><dt>{t('merchantProfile.issue.expiry')}</dt><dd><Mono>{String(template.expires)}</Mono></dd></dl>
          {props.profile.allowAmount === true && <Field label={t('merchantProfile.issue.amountOverride')} hint={t('merchantProfile.issue.request')}>
            {(id, describedBy) => <input id={id} aria-describedby={describedBy} inputMode="decimal" maxLength={67} placeholder={formatUnits(BigInt(template.amountMinor), fiatDecimals(template.currency))} value={amountRequest} onChange={(event) => { invalidate(); setAmountRequest(event.target.value); }} />}
          </Field>}
          {effectiveAmount === undefined ? <Notice kind="warn">{t('merchantProfile.issue.requestRejected')}</Notice> : <dl className="details"><dt>{t('merchantProfile.templates.amount')}</dt><dd><Mono>{effectiveAmount}</Mono></dd><dt>{t('merchantProfile.templates.currency')}</dt><dd><Mono>{template.currency}</Mono></dd></dl>}
          <Field label={t('merchantProfile.issue.tokenAmount')}>
            {(id) => <input id={id} inputMode="decimal" maxLength={67} value={tokenAmount} onChange={(event) => { invalidate(); setTokenAmount(event.target.value); }} />}
          </Field>
          <Field label={t('merchantProfile.issue.feePolicy')}>
            {(id) => <select id={id} value={feePolicy} onChange={(event) => { invalidate(); setFeePolicy(event.target.value === 'payer_pays' ? 'payer_pays' : 'seller_pays'); }}>
              <option value="seller_pays">{t('create.feePolicy.seller')}</option><option value="payer_pays">{t('create.feePolicy.payer')}</option>
            </select>}
          </Field>
          <button type="button" className="btn" disabled={busy || !backedUp || effectiveAmount === undefined || tokenAmount === ''} onClick={issue}>{t('merchantProfile.issue.action')}</button>
        </>}
        {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
        {created !== undefined && created.session === session && <>
          <Field label={t('merchantProfile.issue.link')}>{(id) => <textarea id={id} readOnly value={created.link} />}</Field>
          <CopyButton text={created.link} label={t('merchantProfile.issue.copy')} />
        </>}
      </>}
    </details>
  );
}
