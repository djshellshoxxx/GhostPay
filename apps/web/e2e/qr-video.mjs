// Playwright-only fixture: renders QR codes into a Y4M file for Chromium's fake camera
// (--use-file-for-fake-video-capture). Not imported by the application or the release build.
// A virtual camera proves the scanning pipeline and lifecycle in a real browser engine; it is NOT physical-device
// acceptance (no autofocus, glare, motion blur, low light or real permission UI).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import qrcode from 'qrcode-generator';

const W = 640;
const H = 480;

function lumaFrame(text) {
  const qr = qrcode(0, 'M');
  qr.addData(new TextEncoder().encode(text).reduce((s, b) => s + String.fromCharCode(b), ''), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const scale = Math.max(1, Math.floor((H - 40) / (n + quiet * 2)));
  const side = (n + quiet * 2) * scale;
  const ox = Math.floor((W - side) / 2);
  const oy = Math.floor((H - side) / 2);
  const y = new Uint8Array(W * H).fill(235);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      const px = ox + (c + quiet) * scale;
      const py = oy + (r + quiet) * scale;
      for (let dy = 0; dy < scale; dy++) y.fill(16, (py + dy) * W + px, (py + dy) * W + px + scale);
    }
  }
  return y;
}

function y4m(texts, { framesPerCode = 10, blankFrames = 2 } = {}) {
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 64) throw new Error('1..64 QR texts expected.');
  const chroma = new Uint8Array((W / 2) * (H / 2)).fill(128);
  const blank = new Uint8Array(W * H).fill(235);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`, 'ascii')];
  const frame = (luma) => { parts.push(Buffer.from('FRAME\n', 'ascii'), luma, chroma, chroma); };
  for (const text of texts) {
    const luma = lumaFrame(text);
    for (let i = 0; i < framesPerCode; i++) frame(luma);
    for (let i = 0; i < blankFrames; i++) frame(blank);
  }
  return Buffer.concat(parts);
}

/**
 * Writes a looping Y4M video that shows each text for `framesPerCode` frames (10 fps) and returns its path.
 * `texts` with several entries simulates an animated multipart QR; a blank frame between codes forces re-detection.
 */
export function writeQrVideo(texts, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ghostpay-e2e-camera-'));
  const file = join(dir, 'qr.y4m');
  writeFileSync(file, y4m(texts, options), { flag: 'wx', mode: 0o600 });
  return file;
}

/**
 * Replaces the video at `file` (created by writeQrVideo). Chromium opens the fake-capture file when a capture
 * starts, so a test can render codes produced in the app itself before the scanning page starts its camera.
 */
export function rewriteQrVideo(file, texts, options = {}) {
  writeFileSync(file, y4m(texts, options), { flag: 'w', mode: 0o600 });
}
