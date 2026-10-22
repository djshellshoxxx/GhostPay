import qrcode from 'qrcode-generator';
import { QrExchangeError } from './errors.js';

export interface QrMatrix {
  readonly size: number;
  /** QR version 1..40. */
  readonly version: number;
  /** Row-major, size*size. */
  readonly dark: readonly boolean[];
}

/** Local, offline QR generation in byte mode. ECC 'L' (default) or 'M'. Throws QR_TOO_LONG past version 40. */
export function qrMatrix(text: string, ecc: 'L' | 'M' = 'L'): QrMatrix {
  if (typeof text !== 'string' || text.length === 0 || (ecc !== 'L' && ecc !== 'M')) throw new QrExchangeError('BAD_INPUT');
  try {
    const qr = qrcode(0, ecc);
    qr.addData(text, 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const dark: boolean[] = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark.push(qr.isDark(r, c));
    return { size, version: (size - 17) / 4, dark };
  } catch {
    throw new QrExchangeError('QR_TOO_LONG');
  }
}

/** SVG path data (one square per dark module) offset by a 4-module quiet zone; viewBox side = size + 8. */
export function qrSvgPath(m: QrMatrix): string {
  const parts: string[] = [];
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark[r * m.size + c] === true) parts.push(`M${String(c + 4)} ${String(r + 4)}h1v1h-1z`);
    }
  }
  return parts.join('');
}
