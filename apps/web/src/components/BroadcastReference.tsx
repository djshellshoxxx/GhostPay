import { useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { Mono } from './Common';

/** Keep a possibly submitted transaction recoverable without putting its identifier in the alert. */
export function BroadcastReference({ reference }: { readonly reference: string }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => { setOpen(event.currentTarget.open); }}>
      <summary>{t('chainView.broadcast.reference')}</summary>
      {open && <Mono>{reference}</Mono>}
    </details>
  );
}
