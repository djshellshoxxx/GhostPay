export interface QrVideoOptions { readonly framesPerCode?: number; readonly blankFrames?: number }
export function writeQrVideo(texts: readonly string[], options?: QrVideoOptions): string;
export function rewriteQrVideo(file: string, texts: readonly string[], options?: QrVideoOptions): void;
