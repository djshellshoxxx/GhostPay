import qrcode from 'qrcode-generator';
import { UserFacingError } from './errors';

export interface QrMatrix {
  readonly size: number;
  readonly dark: readonly boolean[];
}

/** Generates a QR matrix locally (no network, no third-party service). Throws `UserFacingError` if the text is too long. */
export function makeQr(text: string): QrMatrix {
  try {
    const qr = qrcode(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const dark: boolean[] = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark.push(qr.isDark(r, c));
    return { size, dark };
  } catch {
    throw new UserFacingError('This link is too long for a QR code. Share the link as text instead.');
  }
}

const QUIET = 4;

/** SVG path data for the dark modules (one `M x y h1 v1 h-1 z` per module), including the quiet zone offset. */
export function qrPath(m: QrMatrix): string {
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
