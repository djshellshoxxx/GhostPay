import { ControlTip } from './ControlTips';
import type { ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { DestinationNotice } from '../lib/destinationReuse';
import { Notice } from './Common';

/** Every advisory the checkout and sweep forms can show; none of them blocks or authorizes a wallet action. */
export type DestinationAdvice = DestinationNotice | 'wallet-changed' | 'own-payment';

export function DestinationReuseNotice({ notice }: { readonly notice: DestinationAdvice | undefined }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <ControlTip message="tips.reuse"><div aria-live="polite">
      {notice !== undefined && <Notice kind={notice === 'wallet-changed' ? 'info' : 'warn'}>{
        notice === 'same-invoice' ? t('reuse.sameInvoice') :
        notice === 'different-invoice' ? t('reuse.differentInvoice') :
        notice === 'wallet-changed' ? t('reuse.walletChanged') :
        notice === 'repeat-sweep' ? t('reuse.sweep') :
        notice === 'other-profile-sweep' ? t('reuse.sweepOtherProfile') :
        notice === 'own-payment' ? t('reuse.ownPayment') : t('reuse.unavailable')
      }</Notice>}
    </div></ControlTip>
  );
}
