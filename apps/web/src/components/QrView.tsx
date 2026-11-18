import { useMemo, type ReactNode } from 'react';
import { makeQr, qrPath, qrSvgText, qrViewSize } from '../lib/qr';
import { UserFacingError, captureUserMessage, displayMessage, type DisplayMessage } from '../lib/errors';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { Notice, downloadText } from './Common';

/**
 * Locally generated QR (no network). Rendered as an SVG built from React elements, not from markup strings.
 * @deprecated Use `QrFrame` (components/QrFrame.tsx) with an explicit `kind`; a bare QrView has no sensitivity cue.
 * `bare` renders only the QR image (used by QrFrame, which supplies caption and actions).
 */
export function QrView(props: { readonly text: string; readonly caption: string; readonly bare?: boolean }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const result = useMemo(() => {
    try {
      const m = makeQr(props.text);
      return { ok: true as const, m };
    } catch (e) {
      const message: DisplayMessage = e instanceof UserFacingError ? captureUserMessage(e) : { key: 'qrView.unavailable' };
      return { ok: false as const, message };
    }
  }, [props.text]);
  if (!result.ok) return <Notice kind="info" title={t('qrView.none')}>{displayMessage(result.message, t)}</Notice>;
  const n = qrViewSize(result.m);
  return (
    <figure className="qr">
      <svg viewBox={`0 0 ${String(n)} ${String(n)}`} role="img" aria-label={props.caption} shapeRendering="crispEdges" className="qr-svg">
        <title>{props.caption}</title>
        <rect width={n} height={n} className="qr-bg" />
        <path d={qrPath(result.m)} className="qr-fg" />
      </svg>
      {props.bare === true ? null : <figcaption>{props.caption}</figcaption>}
      {props.bare === true ? null : (
      <button
        type="button"
        className="btn"
        onClick={() => {
          downloadText('ghostpay-invoice-qr.svg', qrSvgText(result.m), 'image/svg+xml');
        }}
      >
        {t('qrView.download')}
      </button>
      )}
    </figure>
  );
}

// i18n-use: qrView.unavailable
