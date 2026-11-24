// Match the API of the pinned jsQR 1.4.0 distribution; this import is types only.
import type { Options, QRCode } from 'jsqr';
declare function jsQR(data: Uint8ClampedArray, width: number, height: number, providedOptions?: Options): QRCode | null;
export default jsQR;
