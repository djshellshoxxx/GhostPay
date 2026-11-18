import type { MerchantProfile } from '@ghostpay/invoice-schema';
import type { ReactNode } from 'react';
import { Notice, Mono, SafeText } from './Common';
import { signerFingerprint } from '../lib/embedHost';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

/** Shows signed merchant profile fields without treating a self-signed key as an identity credential. */
export function MerchantProfileNotice(props: { readonly profile: MerchantProfile }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <Notice kind="warn" title={t('merchantProfile.identityUnverified.title')}>
      <p>{t('merchantProfile.identityUnverified.body')}</p>
      <dl className="details">
        <dt>{t('merchantProfile.name')}</dt>
        <dd><SafeText value={props.profile.name} /></dd>
        <dt>{t('merchantProfile.signerFingerprint')}</dt>
        <dd><Mono>{signerFingerprint(props.profile.signer)}</Mono></dd>
      </dl>
    </Notice>
  );
}
