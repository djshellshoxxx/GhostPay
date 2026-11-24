import type { ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { DestinationNotice } from '../lib/destinationReuse';
import { Notice } from './Common';

export function DestinationReuseNotice({ notice }: { readonly notice: DestinationNotice | undefined }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <div aria-live="polite">
      {notice !== undefined && <Notice kind={notice === 'same-invoice' ? 'info' : 'warn'}>{
        notice === 'same-invoice' ? t('reuse.sameInvoice') :
        notice === 'different-invoice' ? t('reuse.differentInvoice') :
        notice === 'repeat-sweep' ? t('reuse.sweep') : t('reuse.unavailable')
      }</Notice>}
    </div>
  );
}
