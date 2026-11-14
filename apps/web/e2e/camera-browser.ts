// Browser launch options for the virtual-camera specs (qr-camera*.spec.ts).
//
// Chromium's fake capture device needs the full Chromium build. Playwright's default headless binary is
// chrome-headless-shell, which has no usable getUserMedia: the app then (correctly) reports "Camera scanning is
// unavailable here" and every camera assertion fails (CI run 42963699947, e2e lean/full). So when no local executable
// is configured, request the full build in new-headless mode via channel 'chromium' (installed by
// `playwright install chromium`, as ci.yml does).
//
// GHOSTPAY_CHROMIUM=<path> selects an executable; GHOSTPAY_CHROMIUM=bundled skips the local candidates and uses the
// Playwright-managed build exactly as CI does.
import { existsSync } from 'node:fs';
import type { LaunchOptions } from '@playwright/test';

const LOCAL_CANDIDATES = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'];

function localExecutable(): string | undefined {
  const configured = process.env['GHOSTPAY_CHROMIUM'];
  if (configured === 'bundled') return undefined;
  return [configured, ...LOCAL_CANDIDATES].find((p): p is string => typeof p === 'string' && existsSync(p));
}

/** Launch options with a fake camera that plays `videoFile` (a .y4m/.mjpeg written by qr-video.mjs). */
export function cameraLaunchOptions(videoFile: string): LaunchOptions {
  const executablePath = localExecutable();
  return {
    ...(executablePath === undefined ? { channel: 'chromium' } : { executablePath }),
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${videoFile}`],
  };
}
