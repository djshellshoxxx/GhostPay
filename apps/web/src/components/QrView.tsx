import { useMemo, type ReactNode } from 'react';
import { makeQr, qrPath, qrSvgText, qrViewSize } from '../lib/qr';
import { UserFacingError } from '../lib/errors';
import { Notice, downloadText } from './Common';

/** Locally generated QR (no network). Rendered as an SVG built from React elements, not from markup strings. */
export function QrView(props: { readonly text: string; readonly caption: string }): ReactNode {
  const result = useMemo(() => {
    try {
      const m = makeQr(props.text);
      return { ok: true as const, m };
    } catch (e) {
      return { ok: false as const, message: e instanceof UserFacingError ? e.message : 'QR code unavailable.' };
    }
  }, [props.text]);
  if (!result.ok) return <Notice kind="info" title="No QR code">{result.message}</Notice>;
  const n = qrViewSize(result.m);
  return (
    <figure className="qr">
      <svg viewBox={`0 0 ${String(n)} ${String(n)}`} role="img" aria-label={props.caption} shapeRendering="crispEdges" className="qr-svg">
        <title>{props.caption}</title>
        <rect width={n} height={n} className="qr-bg" />
        <path d={qrPath(result.m)} className="qr-fg" />
      </svg>
      <figcaption>{props.caption}</figcaption>
      <button
        type="button"
        className="btn"
        onClick={() => {
          downloadText('ghostpay-invoice-qr.svg', qrSvgText(result.m), 'image/svg+xml');
        }}
      >
        Download QR (SVG)
      </button>
    </figure>
  );
}
