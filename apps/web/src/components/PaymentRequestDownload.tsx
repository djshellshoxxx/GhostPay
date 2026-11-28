import { ControlTip } from './ControlTips';
import { PAYMENT_REQUEST_FILE_NAME, serializePaymentRequestFile } from '@ghostpay/invoice-schema';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { downloadText, Notice } from './Common';

/** Download the exact original envelope; never re-create, decrypt or re-sign an invoice for export. */
export function PaymentRequestDownload({ fragment }: { readonly fragment: string }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const hintId = useId();
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [fragment]);
  const download = (): void => {
    setFailed(false);
    try { downloadText(PAYMENT_REQUEST_FILE_NAME, serializePaymentRequestFile(fragment), 'application/json'); }
    catch { setFailed(true); }
  };
  return (
    <div className="stack">
      <p><ControlTip message="requestFile.downloadHint"><button type="button" className="btn" aria-describedby={hintId} onClick={download}>{t('requestFile.download')}</button></ControlTip></p>
      <p className="hint" id={hintId}>{t('requestFile.downloadHint')}</p>
      {failed && <Notice kind="error">{t('requestFile.downloadFailed')}</Notice>}
    </div>
  );
}
