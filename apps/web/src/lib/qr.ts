import qrcode from 'qrcode-generator';
import { UserFacingError } from './errors';

export interface QrMatrix {
  readonly size: number;
  readonly dark: readonly boolean[];
}

/** Version 40 at error correction L holds at most 2,953 bytes in byte mode. */
const MAX_QR_BYTES = 2953;

/** Generates a UTF-8 QR matrix locally, preserving the exact text without changing global encoder settings. */
export function makeQr(text: string): QrMatrix {
  if (typeof text !== 'string') throw new UserFacingError({ key: 'error.qr.invalidText' });
  // Bound both allocation and generator work. UTF-8 cannot need fewer bytes than UTF-16 code units.
  if (text.length > MAX_QR_BYTES) throw new UserFacingError({ key: 'error.qr.thisLinkIsTooLongForAQRCodeShare' });
  if (/\p{Cs}/u.test(text)) throw new UserFacingError({ key: 'error.qr.invalidText' });
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_QR_BYTES) throw new UserFacingError({ key: 'error.qr.thisLinkIsTooLongForAQRCodeShare' });
  try {
    const qr = qrcode(0, 'L');
    // The pinned generator's default converter takes each code unit's low byte. Give it UTF-8 bytes,
    // not Unicode text, and leave its shared stringToBytes converter untouched for other callers.
    qr.addData(String.fromCharCode(...bytes), 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const dark: boolean[] = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark.push(qr.isDark(r, c));
    return { size, dark };
  } catch {
    throw new UserFacingError({ key: 'error.qr.thisLinkIsTooLongForAQRCodeShare' });
  }
}

const QUIET = 4;

/** SVG path data for the dark modules (one `M x y h1 v1 h-1 z` per module), including the quiet zone offset. */
/** Validate externally supplied matrices before constructing a downloadable SVG. */
function assertQrMatrix(m: QrMatrix): void {
  if (!Number.isSafeInteger(m.size) || m.size < 1 || m.size > 177 || m.dark.length !== m.size * m.size) {
    throw new UserFacingError({ key: 'error.qr.invalidQRMatrix' });
  }
  for (const module of m.dark) {
    if (typeof module !== 'boolean') throw new UserFacingError({ key: 'error.qr.invalidQRMatrix' });
  }
}

export function qrPath(m: QrMatrix): string {
  assertQrMatrix(m);
  const parts: string[] = [];
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark[r * m.size + c] === true) parts.push(`M${String(c + QUIET)} ${String(r + QUIET)}h1v1h-1z`);
    }
  }
  return parts.join('');
}

/** Side length in modules including the quiet zone. */
export function qrViewSize(m: QrMatrix): number {
  return m.size + QUIET * 2;
}

/** Standalone SVG file text for download (built by string concatenation of numbers and a fixed path, no user text). */
export function qrSvgText(m: QrMatrix): string {
  const n = qrViewSize(m);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(n)} ${String(n)}" width="${String(n * 6)}" height="${String(n * 6)}" shape-rendering="crispEdges"><rect width="${String(n)}" height="${String(n)}" fill="#fff"/><path fill="#000" d="${qrPath(m)}"/></svg>`;
}

// i18n-use: error.qr.thisLinkIsTooLongForAQRCodeShare error.qr.invalidQRMatrix error.qr.invalidText
