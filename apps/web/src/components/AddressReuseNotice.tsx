import type { ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { AddressReuseStatus } from '../lib/addressReuse';
import { Notice } from './Common';

/** No address or invoice identifier is repeated in this privacy warning. */
export function AddressReuseNotice({ status }: { readonly status: AddressReuseStatus }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <Notice kind={status === 'reused' || status === 'limited-history' ? 'warn' : 'info'} title={t('address.reuse.title')}>
      {status === 'reused' && <p>{t('address.reuse.detected')}</p>}
      {status === 'same-payment' && <p>{t('address.reuse.retry')}</p>}
      {status === 'deliberate-repeat' && <p>{t('address.reuse.deliberate')}</p>}
      {status === 'limited-history' && <p>{t('address.reuse.limit')}</p>}
      {status === 'unavailable' && <p>{t('address.reuse.unavailable')}</p>}
      <p>{t('address.reuse.scope')}</p>
    </Notice>
  );
}
