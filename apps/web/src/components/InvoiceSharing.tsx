import { useId, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { downloadText, Notice } from './Common';

export function InvoiceMetadataChoice(props: { readonly minimal: boolean; readonly onChange: (minimal: boolean) => void }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const id = useId();
  return (
    <div>
      <div className="check">
        <input id={id} type="checkbox" checked={props.minimal} aria-describedby={`${id}-details ${id}-required`}
          onChange={(event) => { props.onChange(event.currentTarget.checked); }} />
        <label htmlFor={id}>{t('create.metadata.minimal')}</label>
      </div>
      <p className="hint" id={`${id}-details`}>{props.minimal ? t('create.metadata.omitted') : t('create.metadata.itemized')}</p>
      <p className="hint" id={`${id}-required`}>{t('create.metadata.required')}</p>
    </div>
  );
}

/** Export the issued link verbatim so its signature and envelope travel together. */
export function DownloadInvoiceLink({ link }: { readonly link: string }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => {
        try {
          downloadText('ghostpay-invoice.txt', link, 'text/plain;charset=utf-8');
          setFailed(false);
        } catch {
          setFailed(true);
        }
      }}>{t('create.metadata.download')}</button>
      {failed && <Notice kind="error">{t('create.metadata.downloadFailed')}</Notice>}
    </>
  );
}
