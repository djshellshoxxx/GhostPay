import qrcode from 'qrcode-generator';
import { QrExchangeError } from './errors.js';

export interface QrMatrix {
  readonly size: number;
  /** QR version 1..40. */
  readonly version: number;
  /** Row-major, size*size. */
  readonly dark: readonly boolean[];
}

/** Version 40 byte-mode capacities for the supported error-correction levels. */
const MAX_BYTES = { L: 2953, M: 2331 } as const;

/**
 * Local, offline QR generation in UTF-8 byte mode.
 * Do not modify qrcode-generator's process-global stringToBytes setting: other clients
 * may be creating QR images concurrently. The pinned default converter uses low bytes,
 * so pass a bounded binary string containing the exact UTF-8 bytes instead.
 */
export function qrMatrix(text: string, ecc: 'L' | 'M' = 'L'): QrMatrix {
  if (typeof text !== 'string' || text.length === 0 || (ecc !== 'L' && ecc !== 'M')) {
    throw new QrExchangeError('BAD_INPUT');
  }
  // Disallow silent TextEncoder replacement of malformed surrogate sequences.
  if (/\p{Cs}/u.test(text)) throw new QrExchangeError('BAD_INPUT');
  // A UTF-8 encoding cannot have fewer bytes than its UTF-16 code-unit count.
  if (text.length > MAX_BYTES[ecc]) throw new QrExchangeError('QR_TOO_LONG');
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_BYTES[ecc]) throw new QrExchangeError('QR_TOO_LONG');

  try {
    const qr = qrcode(0, ecc);
    qr.addData(String.fromCharCode(...bytes), 'Byte');
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
  if (
    typeof m !== 'object' || m === null ||
    !Number.isSafeInteger(m.size) || m.size < 21 || m.size > 177 ||
    (m.size - 17) % 4 !== 0 || m.version !== (m.size - 17) / 4 ||
    !Array.isArray(m.dark) || m.dark.length !== m.size * m.size ||
    !m.dark.every((cell) => typeof cell === 'boolean')
  ) {
    throw new QrExchangeError('BAD_INPUT');
  }
  const parts: string[] = [];
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark[r * m.size + c] === true) parts.push(`M${String(c + 4)} ${String(r + 4)}h1v1h-1z`);
    }
  }
  return parts.join('');
}
