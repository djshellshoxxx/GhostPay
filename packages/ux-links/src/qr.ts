import { fail } from './errors.js';
import { buildPaymentUri, type PaymentUri } from './uri.js';

/** QR error-correction level. */
export type QrEcc = 'L' | 'M' | 'Q' | 'H';

// Byte-mode data capacity (bytes) per version 1..40 (ISO/IEC 18004).
const CAPACITY: Readonly<Record<QrEcc, readonly number[]>> = {
  L: [
    17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858, 929, 1003,
    1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809,
    2953,
  ],
  M: [
    14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779,
    857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331,
  ],
  Q: [
    11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322, 364, 394, 442, 482, 509, 565,
    611, 661, 715, 751, 805, 868, 908, 982, 1030, 1112, 1168, 1228, 1283, 1351, 1423, 1499, 1579, 1663,
  ],
  H: [
    7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280, 310, 338, 382, 403, 439, 461,
    511, 535, 593, 625, 658, 698, 742, 790, 842, 898, 958, 983, 1051, 1093, 1139, 1219, 1273,
  ],
};

/** Result of {@link checkQrCapacity}. */
export interface QrCapacity {
  /** Payload size in UTF-8 bytes. */
  readonly bytes: number;
  readonly ecc: QrEcc;
  /** Smallest QR version (1..40) holding the payload in byte mode, or null if none. */
  readonly minVersion: number | null;
  /** True when it fits version 40 at this ECC level. */
  readonly fits: boolean;
  /** Heuristic scan quality: version <=10 good, <=25 dense, else very-dense; none if it does not fit. */
  readonly density: 'good' | 'dense' | 'very-dense' | 'none';
}

/**
 * Computes whether a payload fits a QR code (byte mode, conservative) and the
 * minimum version. Does not render anything.
 *
 * @remarks Byte mode is assumed even for alphanumeric-eligible text, so the
 * result is a safe upper bound. The `density` thresholds are a heuristic for
 * phone-camera scanning, not a standard.
 * @param payload Text to encode.
 * @param ecc Error-correction level (default `M`).
 * @throws {LinkError} `QR` for non-string payload, empty payload or unknown level.
 */
export function checkQrCapacity(payload: string, ecc: QrEcc = 'M'): QrCapacity {
  if (typeof payload !== 'string' || payload.length === 0) return fail('QR', 'payload');
  const table = Object.prototype.hasOwnProperty.call(CAPACITY, ecc) ? CAPACITY[ecc] : undefined;
  if (table === undefined) return fail('QR', 'ecc');
  const bytes = new TextEncoder().encode(payload).length;
  const idx = table.findIndex((c) => bytes <= c);
  if (idx < 0) return { bytes, ecc, minVersion: null, fits: false, density: 'none' };
  const minVersion = idx + 1;
  const density = minVersion <= 10 ? 'good' : minVersion <= 25 ? 'dense' : 'very-dense';
  return { bytes, ecc, minVersion, fits: true, density };
}

/**
 * Builds the QR payload for a payment link and verifies it is scannable.
 *
 * @param p Link fields.
 * @param opts `ecc` (default M) and `maxVersion` (default 25, max 40).
 * @throws {LinkError} `QR` if the payload would need a version above `maxVersion`.
 * @security The payload includes the fragment secret, if any: show the QR only
 * to the intended payer and never upload it.
 */
export function buildQrPayload(
  p: PaymentUri,
  opts: { ecc?: QrEcc; maxVersion?: number } = {},
): { payload: string; capacity: QrCapacity } {
  const maxVersion = opts.maxVersion ?? 25;
  if (!Number.isInteger(maxVersion) || maxVersion < 1 || maxVersion > 40) return fail('QR', 'maxVersion');
  const payload = buildPaymentUri(p);
  const capacity = checkQrCapacity(payload, opts.ecc ?? 'M');
  if (capacity.minVersion === null || capacity.minVersion > maxVersion) return fail('QR', 'payload');
  return { payload, capacity };
}
